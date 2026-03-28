# Orchid

Read PLAN.md

## Infrastructure

Two DigitalOcean droplets, both Ubuntu 24.04. Same SSH key for both.

| Instance          | Role                                               | IP             | Specs                      | SSH                                            |
| ----------------- | -------------------------------------------------- | -------------- | -------------------------- | ---------------------------------------------- |
| **orchid-deploy** | Hosts the web app. The agent deploys here via SSH. | `24.144.97.81` | 4 vCPU, 8GB RAM, 160GB SSD | `ssh -i ~/.ssh/orchid-agent root@24.144.97.81` |

**Pre-installed on both**: Node.js 22, pnpm, uv (Python), Docker, GitHub CLI, Claude Code, Codex CLI, Caddy.

### For the agent

When deploying to the deploy instance, SSH from the agent box:

```bash
ssh root@24.144.97.81   # from the agent instance, key is already there
```

Caddy is installed on orchid-deploy for auto-HTTPS reverse proxy. To expose a Next.js app on port 3000:

```bash
# On orchid-deploy, write a Caddyfile:
echo "orchid.example.com { reverse_proxy localhost:3000 }" > /etc/caddy/Caddyfile
systemctl reload caddy
```

### For humans

All credentials (SSH private key, API keys) are in the `.secrets` file at the repo root.

```bash
# 1. Get the private key from .secrets and save it
cp orchid-agent ~/.ssh/orchid-agent
chmod 600 ~/.ssh/orchid-agent

# 2. SSH into either instance
ssh -i ~/.ssh/orchid-agent root@204.48.31.85   # agent
ssh -i ~/.ssh/orchid-agent root@24.144.97.81   # deploy
```

## Documents

PLAN.md

## Using Ralph (Autonomous Agent)

Ralph is an autonomous agent loop that implements user stories from a `prd.json` spec.

**Setup (one-time):**

1. Generate a `prd.json` from your specs (ask Claude Code to convert your PRD)
2. Review and iterate on `prd.json` until satisfied

**Run:**

```bash
./scripts/ralph/ralph.sh --tool claude
```

Ralph picks the highest-priority unfinished story, implements it, commits, and repeats until all stories pass.

---
