#!/bin/bash
# orchestrate.sh — Full pipeline: Critic → Workers
# Usage: ./orchestrate.sh [--skip-critic] [--skip-deploy]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH="$SCRIPT_DIR/ralph.sh"

# Load .env if present
if [ -f "$REPO_ROOT/.env" ]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

SKIP_CRITIC=false
SKIP_DEPLOY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-critic)  SKIP_CRITIC=true;  shift ;;
    --skip-deploy)  SKIP_DEPLOY=true;  shift ;;
    *) shift ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ralph Multi-Agent Pipeline                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Preflight ───────────────────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/PLAN.md" ]; then
  echo "ERROR: PLAN.md not found at repo root."
  echo "Create PLAN.md with the product goal before running the pipeline."
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/prd.json" ]; then
  echo "ERROR: prd.json not found."
  echo "Generate prd.json from PLAN.md first (ask Claude Code to do this)."
  exit 1
fi

# ── Phase 1: Critic ─────────────────────────────────────────────────────────
if [ "$SKIP_CRITIC" = false ]; then
  echo "=== Phase 1: Critic (validating prd.json against PLAN.md) ==="

  MAX_CRITIC_ATTEMPTS=2
  CRITIC_ATTEMPT=0
  CRITIC_PASSED=false

  while [ $CRITIC_ATTEMPT -lt $MAX_CRITIC_ATTEMPTS ]; do
    CRITIC_ATTEMPT=$((CRITIC_ATTEMPT + 1))
    echo "Critic attempt $CRITIC_ATTEMPT of $MAX_CRITIC_ATTEMPTS..."

    OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/CRITIC.md" 2>&1 | tee /dev/stderr) || true

    if echo "$OUTPUT" | grep -q "<promise>CRITIQUE_PASS</promise>"; then
      CRITIC_PASSED=true
      break
    fi

    echo ""
    echo "Critic found gaps (see critique.txt). prd.json needs revision."

    if [ $CRITIC_ATTEMPT -lt $MAX_CRITIC_ATTEMPTS ]; then
      echo "Review critique.txt, update prd.json, then the critic will re-evaluate."
      echo "Press Enter to re-run the critic, or Ctrl+C to abort and fix manually."
      read -r
    fi
  done

  if [ "$CRITIC_PASSED" = false ]; then
    echo ""
    echo "ERROR: prd.json did not pass critique after $MAX_CRITIC_ATTEMPTS attempts."
    echo "Review scripts/ralph/critique.txt and fix prd.json manually, then re-run with --skip-critic."
    exit 1
  fi

  echo "Critic passed. prd.json covers the goal."
else
  echo "=== Phase 1: Critic (skipped) ==="
fi
echo ""

# ── Phase 2: Parallel Workers ───────────────────────────────────────────────
echo "=== Phase 2: Parallel build workers ==="

BACKEND_COUNT=$(jq '[.stories[] | select(.lane=="backend" and .passes==false)] | length' "$SCRIPT_DIR/prd.json" 2>/dev/null || echo 0)
FRONTEND_COUNT=$(jq '[.stories[] | select(.lane=="frontend" and .passes==false)] | length' "$SCRIPT_DIR/prd.json" 2>/dev/null || echo 0)
INFRA_COUNT=$(jq '[.stories[] | select(.lane=="infra" and .passes==false)] | length' "$SCRIPT_DIR/prd.json" 2>/dev/null || echo 0)
SHARED_COUNT=$(jq '[.stories[] | select(.lane=="shared" and .passes==false)] | length' "$SCRIPT_DIR/prd.json" 2>/dev/null || echo 0)

echo "Stories remaining: backend=$BACKEND_COUNT frontend=$FRONTEND_COUNT infra=$INFRA_COUNT shared=$SHARED_COUNT"
echo ""

# Shared lane runs first (sequentially — DB migrations, env setup, shared types)
if [ "$SHARED_COUNT" -gt 0 ]; then
  echo "--- Running shared lane first (sequential) ---"
  RALPH_LANE=shared "$RALPH" --tool claude 10 || {
    echo "ERROR: Shared lane failed."
    exit 1
  }
  echo ""
fi

# Spawn parallel workers for remaining lanes
PIDS=()
FAILED_LANES=()

if [ "$BACKEND_COUNT" -gt 0 ]; then
  echo "--- Spawning backend worker ---"
  RALPH_LANE=backend "$RALPH" --tool claude 20 &
  PIDS+=($!)
fi

if [ "$FRONTEND_COUNT" -gt 0 ]; then
  echo "--- Spawning frontend worker ---"
  RALPH_LANE=frontend "$RALPH" --tool claude 20 &
  PIDS+=($!)
fi

if [ "$INFRA_COUNT" -gt 0 ]; then
  echo "--- Spawning infra worker ---"
  RALPH_LANE=infra "$RALPH" --tool claude 10 &
  PIDS+=($!)
fi

# Wait for all workers
echo ""
echo "Workers running (PIDs: ${PIDS[*]:-none})..."
for pid in "${PIDS[@]}"; do
  wait "$pid" || FAILED_LANES+=("$pid")
done

if [ ${#FAILED_LANES[@]} -gt 0 ]; then
  echo "WARNING: ${#FAILED_LANES[@]} worker(s) exited non-zero."
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Pipeline complete!                              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
