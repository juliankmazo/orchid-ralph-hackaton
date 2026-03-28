# SUBAGENT.md — Multi-Agent Autonomous Build System

A single orchestrator spawns specialized Claude Code agents that work in parallel on
pre-tagged story lanes. This extends Ralph's single-agent loop into a full
`idea → spec → build → test → deploy` pipeline.

---

## Pipeline Overview

```
[IDEA]
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  1. ARCHITECT                                               │
│  Input:  One-line idea (or specs/*.md if you wrote them)    │
│  Output: specs/*.md  +  prd.json  (stories tagged by lane)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ prd.json ready
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ORCHESTRATOR  (master loop)                             │
│  Reads prd.json, dispatches workers by lane, tracks status  │
└─────┬──────────────────┬─────────────────────┬─────────────┘
      │                  │                     │
      ▼                  ▼                     ▼
  [backend]          [frontend]            [infra]
  Ralph worker       Ralph worker          Infra agent
  picks backend      picks frontend        provisions DO
  stories            stories               Droplet + Docker
      │                  │                     │
      └──────────────────┴──────────────────┬──┘
                                            │ all lanes complete
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. QA AGENT                                                │
│  Runs full test suite, writes missing tests, fixes failures │
└──────────────────────────┬──────────────────────────────────┘
                           │ all tests green
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. DEPLOY AGENT                                            │
│  Builds Docker image, pushes to registry, deploys to DO     │
│  Runs health checks, writes deploy report                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Shared State

All agents read and write to a shared directory (`scripts/ralph/`):

| File | Owner | Access |
|------|-------|--------|
| `prd.json` | Architect writes, Orchestrator reads, workers update `passes` | Serialized by Orchestrator |
| `progress.txt` | All agents append | Append-only |
| `agent-status.json` | Each agent writes its lane's status | Overwrite own key only |
| `specs/*.md` | Architect writes | Read-only after Architect |
| `deploy-report.txt` | Deploy agent writes | Write-once |

### `prd.json` Story Schema (extended)

Each story must have a `lane` field so workers self-select:

```json
{
  "projectName": "my-app",
  "branchName": "ralph/my-app",
  "description": "...",
  "stories": [
    {
      "id": "S001",
      "title": "Set up Express API skeleton",
      "description": "...",
      "priority": 1,
      "lane": "backend",
      "passes": false
    },
    {
      "id": "S002",
      "title": "Scaffold Next.js app",
      "description": "...",
      "priority": 1,
      "lane": "frontend",
      "passes": false
    },
    {
      "id": "S003",
      "title": "Create Droplet and Dockerfile",
      "description": "...",
      "priority": 1,
      "lane": "infra",
      "passes": false
    }
  ]
}
```

**Valid lanes:** `backend` | `frontend` | `infra` | `shared`

> `shared` lane: only one worker runs these, sequentially, at the start (e.g., DB schema, env config).

### `agent-status.json` Schema

```json
{
  "backend":  { "status": "running", "currentStory": "S001", "updatedAt": "..." },
  "frontend": { "status": "waiting", "currentStory": null,   "updatedAt": "..." },
  "infra":    { "status": "done",    "currentStory": null,   "updatedAt": "..." },
  "qa":       { "status": "idle",    "currentStory": null,   "updatedAt": "..." },
  "deploy":   { "status": "idle",    "currentStory": null,   "updatedAt": "..." }
}
```

---

## Agent Role Definitions

### 1. Architect

**Trigger:** Manual — run once to kick off the pipeline.

**System prompt file:** `scripts/ralph/agents/ARCHITECT.md`

**Responsibilities:**
- Read the idea from `IDEA.md` (or `specs/*.md` if already written)
- Research the domain (web search, read existing code)
- Write `specs/01-overview.md`, `specs/02-tech-stack.md`, `specs/03-data-model.md`, `specs/04-api.md`, `specs/05-ui.md`
- Convert specs to `prd.json` using the ralph-skills:prd + ralph-skills:ralph format
- Assign a `lane` to every story (`backend` / `frontend` / `infra` / `shared`)
- Write `IDEA.md` summary for the deploy agent's health check context

**Stop condition:** `prd.json` exists and all stories have a `lane` assigned.

**Output signal:**
```
<promise>SPECS_READY</promise>
```

---

### 2. Orchestrator

**Trigger:** Runs after Architect signals `SPECS_READY`.

**Script:** `scripts/ralph/orchestrate.sh`

**Responsibilities:**
- Read `prd.json`, group stories by lane
- Spawn parallel `ralph.sh` subprocesses, one per active lane:
  ```bash
  ./ralph.sh --tool claude --lane backend  &
  ./ralph.sh --tool claude --lane frontend &
  ./ralph.sh --tool claude --lane infra    &
  wait
  ```
- After all lanes complete, trigger QA agent
- After QA passes, trigger Deploy agent
- If any lane fails (exits non-zero), re-run that lane up to 2 times before stopping

**Polling:** Check `agent-status.json` every 30s to print live status.

**Environment variables passed to each worker:**
```bash
RALPH_LANE=backend        # worker only picks stories where lane == this
RALPH_MAX_ITERATIONS=20   # per-lane cap
```

---

### 3. Ralph Workers (Backend / Frontend / Infra)

**System prompt file:** `scripts/ralph/CLAUDE.md` (existing, extended)

**Extension for lane-awareness** — add to CLAUDE.md:

```
## Lane Filter

You are a Ralph worker assigned to lane: $RALPH_LANE

When picking the next story, ONLY pick stories where:
- `lane` == "$RALPH_LANE" OR `lane` == "shared" (only if no other worker has claimed it)
- `passes` == false

Skip stories belonging to other lanes — they will be handled by another worker.
```

**Story claiming** (prevents double-pick): Before starting a story, the worker does:
```bash
# Orchestrator pre-claims stories per lane before spawning workers
# Workers never claim — they only pick pre-assigned stories for their lane
```

The Orchestrator assigns lanes before spawning, so no runtime locking is needed.

---

### 4. QA Agent

**Trigger:** Spawned by Orchestrator after all lanes are `done`.

**System prompt file:** `scripts/ralph/agents/QA.md`

**Responsibilities:**
- Run `npm test` / `pytest` / equivalent — whatever the project uses
- For each failing test: attempt a fix (max 2 attempts per test)
- Check test coverage; if below 60%, write missing tests for critical paths
- Run typecheck + lint
- Write summary to `progress.txt`:
  ```
  ## QA Report
  - Tests: 47 passed, 2 failed, 0 skipped
  - Coverage: 73%
  - Fixed: [list of auto-fixed failures]
  - Manual review needed: [list of unfixed failures]
  ```

**Stop condition:**
- All tests pass → signal `<promise>QA_PASS</promise>`
- Tests fail after 2 fix attempts → signal `<promise>QA_FAIL</promise>` (Orchestrator stops pipeline)

---

### 5. Deploy Agent

**Trigger:** Spawned by Orchestrator after QA signals `QA_PASS`.

**System prompt file:** `scripts/ralph/agents/DEPLOY.md`

**Responsibilities:**

1. **Dockerfile** — generate or verify `Dockerfile` at repo root
   ```dockerfile
   # Example: Node.js app
   FROM node:20-alpine
   WORKDIR /app
   COPY . .
   RUN npm ci && npm run build
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

2. **Provision Droplet** (if `DO_DROPLET_ID` not set in env):
   ```bash
   doctl compute droplet create ralph-app \
     --size s-1vcpu-1gb \
     --image ubuntu-22-04-x64 \
     --region nyc3 \
     --ssh-keys $DO_SSH_KEY_ID
   ```

3. **Build + push Docker image:**
   ```bash
   docker build -t registry.digitalocean.com/$DO_REGISTRY/app:$GIT_SHA .
   docker push registry.digitalocean.com/$DO_REGISTRY/app:$GIT_SHA
   ```

4. **Deploy via SSH:**
   ```bash
   ssh root@$DROPLET_IP "
     docker pull registry.digitalocean.com/$DO_REGISTRY/app:$GIT_SHA
     docker stop app || true
     docker run -d --name app -p 80:3000 \
       --env-file /root/.env \
       registry.digitalocean.com/$DO_REGISTRY/app:$GIT_SHA
   "
   ```

5. **Health check:**
   ```bash
   curl -f http://$DROPLET_IP/health || exit 1
   ```

6. **Write `deploy-report.txt`:**
   ```
   Deployed: 2024-xx-xx HH:MM
   Image: registry.digitalocean.com/.../app:abc1234
   Droplet: 123.45.67.89
   URL: http://123.45.67.89
   Health: PASS
   ```

**Required environment variables** (set before running pipeline):
```bash
DO_TOKEN=...           # DigitalOcean API token
DO_SSH_KEY_ID=...      # SSH key fingerprint registered in DO
DO_REGISTRY=...        # Container registry name
DO_DROPLET_ID=...      # Optional: skip provisioning if already exists
```

**Stop condition:** Health check passes → `<promise>DEPLOY_COMPLETE</promise>`

---

### 6. Observer (Optional — for long runs)

**When to use:** Builds expected to run >30 minutes or overnight.

**System prompt file:** `scripts/ralph/agents/OBSERVER.md`

**Responsibilities:**
- Monitor `agent-status.json` + `progress.txt` every 5 minutes
- Detect stalled workers (no progress.txt update in >10 min) → restart them
- Send a Slack/webhook notification on completion or failure
- Generate a final run summary: stories completed, time per lane, total cost estimate

**Run:** Spawned by Orchestrator as a background process, killed when Orchestrator exits.

---

## Orchestrator Script: `scripts/ralph/orchestrate.sh`

```bash
#!/bin/bash
# Full pipeline: Architect → Workers → QA → Deploy

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Architect
echo "=== Phase 1: Architect ==="
OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/ARCHITECT.md" 2>&1 | tee /dev/stderr)
if ! echo "$OUTPUT" | grep -q "<promise>SPECS_READY</promise>"; then
  echo "Architect failed to produce SPECS_READY signal. Check output above."
  exit 1
fi

# Step 2: Parallel workers
echo "=== Phase 2: Build (parallel) ==="
RALPH="$SCRIPT_DIR/ralph.sh"

BACKEND_STORIES=$(jq '[.stories[] | select(.lane=="backend" and .passes==false)] | length' "$SCRIPT_DIR/prd.json")
FRONTEND_STORIES=$(jq '[.stories[] | select(.lane=="frontend" and .passes==false)] | length' "$SCRIPT_DIR/prd.json")
INFRA_STORIES=$(jq '[.stories[] | select(.lane=="infra" and .passes==false)] | length' "$SCRIPT_DIR/prd.json")

[ "$BACKEND_STORIES"  -gt 0 ] && RALPH_LANE=backend  "$RALPH" --tool claude 20 &
[ "$FRONTEND_STORIES" -gt 0 ] && RALPH_LANE=frontend "$RALPH" --tool claude 20 &
[ "$INFRA_STORIES"    -gt 0 ] && RALPH_LANE=infra    "$RALPH" --tool claude 10 &
wait

echo "=== Phase 3: QA ==="
OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/QA.md" 2>&1 | tee /dev/stderr)
if echo "$OUTPUT" | grep -q "<promise>QA_FAIL</promise>"; then
  echo "QA failed. See progress.txt for details."
  exit 1
fi

echo "=== Phase 4: Deploy ==="
OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/DEPLOY.md" 2>&1 | tee /dev/stderr)
if ! echo "$OUTPUT" | grep -q "<promise>DEPLOY_COMPLETE</promise>"; then
  echo "Deploy failed. See deploy-report.txt for details."
  exit 1
fi

echo ""
echo "Pipeline complete! See deploy-report.txt for the live URL."
```

---

## How to Run

### First time

```bash
# 1. Write your idea
echo "A task management app with real-time collaboration, built with Next.js + Supabase" > IDEA.md

# 2. Set DO credentials
export DO_TOKEN=your_token
export DO_SSH_KEY_ID=your_key_fingerprint
export DO_REGISTRY=your_registry_name

# 3. Launch the full pipeline
./scripts/ralph/orchestrate.sh
```

### Resume after failure

```bash
# Fix the issue, then re-run — completed stories have passes:true and are skipped
./scripts/ralph/orchestrate.sh
```

### Run a single phase manually

```bash
# Just the Architect
claude --dangerously-skip-permissions --print < scripts/ralph/agents/ARCHITECT.md

# Just one lane
RALPH_LANE=backend ./scripts/ralph/ralph.sh --tool claude 20

# Just deploy
claude --dangerously-skip-permissions --print < scripts/ralph/agents/DEPLOY.md
```

---

## File Structure

```
scripts/ralph/
├── orchestrate.sh        ← master pipeline runner (new)
├── ralph.sh              ← existing single-agent loop (extended with RALPH_LANE)
├── CLAUDE.md             ← existing Ralph prompt (extended for lane awareness)
├── prd.json              ← generated by Architect, updated by workers
├── progress.txt          ← append-only log from all agents
├── agent-status.json     ← live status per agent (new)
├── deploy-report.txt     ← written by Deploy agent (new)
└── agents/
    ├── ARCHITECT.md      ← Architect system prompt (new)
    ├── QA.md             ← QA agent system prompt (new)
    ├── DEPLOY.md         ← Deploy agent system prompt (new)
    └── OBSERVER.md       ← Observer system prompt (new, optional)
```

`specs/` at repo root — written by Architect, read by workers via prd.json.

---

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Parallelism model | Orchestrator spawns subprocesses | Simple, no extra infra, Claude Code's `--print` mode is composable |
| Story assignment | Pre-tagged lanes in prd.json, no runtime locking | Eliminates race conditions entirely |
| State sharing | Files (prd.json, progress.txt) | Works on any VPS, human-readable, git-trackable |
| Deployment | Docker + Droplet | Full control, reproducible, no vendor lock-in |
| Agent prompts | Separate `.md` files per agent | Easy to tune each role without affecting others |
| Failure handling | 2 retries per lane, QA gate before deploy | Prevents deploying broken code |

---

## Cost Estimate (rough)

Per one-shot build (~10 stories, 3 lanes):
- Architect: ~$0.10 (one-shot research + spec generation)
- Workers: ~$0.05–0.15 per story × 10 = ~$0.50–1.50
- QA: ~$0.20
- Deploy: ~$0.05
- **Total: ~$1–2 per project build**

DigitalOcean:
- s-1vcpu-1gb Droplet: $6/month ($0.009/hour)
- Container Registry: $5/month for 5 repos
