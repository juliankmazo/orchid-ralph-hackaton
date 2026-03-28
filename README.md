# Orchid

**A code review product where you can ask questions about the AI conversations behind any PR.**

The core insight: code review is incomplete when AI writes the code. Reviewers don't just need to see *what* changed — they need to ask "why was Supabase chosen over PostgreSQL?" and get an answer with citations from the actual development conversations.

**Dumb write, smart read.**
- **Write**: Record all AI conversations (Claude, Codex, Cursor) to a database. Full transcripts, no processing.
- **Read**: AI-powered query layer lets reviewers ask questions about the conversations and get answers with citations to specific messages.

## Agent VPS Access

The AI agent runs 24/7 on a DigitalOcean droplet (8 vCPU, 16GB RAM, Ubuntu 24.04).

All credentials (SSH private key, API keys) are in the `.secrets` file at the repo root.

```bash
# 1. Copy the SSH key from .secrets to ~/.ssh/
#    (grab the private key block from .secrets and save it)
cp orchid-agent ~/.ssh/orchid-agent
chmod 600 ~/.ssh/orchid-agent

# 2. SSH in
ssh -i ~/.ssh/orchid-agent root@174.138.46.71
```

**Pre-installed**: Node.js 22, pnpm, uv (Python), Docker, GitHub CLI, Claude Code, Codex CLI, Caddy.

**Adding a new teammate**: Drop their `.pub` key in `infra/keys/<name>.pub` and run `pulumi up` from `infra/`.

**Infra management**: `cd infra && pulumi up` (requires `DIGITALOCEAN_TOKEN` or Pulumi config).

## Documents

- [Research](./research/) - Deep research on approaches, existing tools, and UI
- [Architecture](./architecture.md) - Chosen architecture and technical decisions
- [MVP Plan](./mvp-plan.md) - What to build first

## Using Ralph (Autonomous Agent)

Ralph is a multi-agent pipeline that builds a full project from a one-line idea: spec → build → test → deploy.

**Setup (one-time):**
1. Write your idea to `IDEA.md`
2. Set DigitalOcean credentials (`DO_TOKEN`, `DO_SSH_KEY_ID`, `DO_REGISTRY`)

**Run the full pipeline:**
```bash
./scripts/ralph/orchestrate.sh
```

This runs four phases automatically:
1. **Architect** — generates specs and `prd.json` from `IDEA.md`
2. **Workers** — parallel agents implement backend, frontend, and infra stories simultaneously
3. **QA** — runs tests, auto-fixes failures, blocks deploy if broken
4. **Deploy** — builds a Docker image and deploys to a DigitalOcean Droplet

**Run a single agent loop** (if you already have a `prd.json`):
```bash
./scripts/ralph/ralph.sh --tool claude
```

Ralph picks the highest-priority unfinished story, implements it, commits, and repeats until all stories pass.

---

## Key Decisions

- **Write path**: Simple. Dump full transcripts to Supabase Storage on session end. No slicing, no processing.
- **Read path**: Smart. Claude API answers reviewer questions about conversations with citations.
- **Capture**: Claude Code hooks + Codex filesystem watching (zero manual effort)
- **UI**: Diff view + "Ask about this PR" — the killer feature
- **Stack**: Next.js + Supabase + Claude API
