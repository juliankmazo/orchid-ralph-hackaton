#!/bin/bash
# orchestrate.sh — Full pipeline: Architect → Workers → QA → Deploy
# Usage: ./orchestrate.sh [--skip-architect] [--skip-deploy]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH="$SCRIPT_DIR/ralph.sh"

SKIP_ARCHITECT=false
SKIP_DEPLOY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-architect) SKIP_ARCHITECT=true; shift ;;
    --skip-deploy)    SKIP_DEPLOY=true;    shift ;;
    *) shift ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ralph Multi-Agent Pipeline                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Phase 1: Architect ──────────────────────────────────────────────────────
if [ "$SKIP_ARCHITECT" = false ]; then
  echo "=== Phase 1: Architect (spec generation) ==="
  OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/ARCHITECT.md" 2>&1 | tee /dev/stderr) || true
  if ! echo "$OUTPUT" | grep -q "<promise>SPECS_READY</promise>"; then
    echo ""
    echo "ERROR: Architect did not signal SPECS_READY. Check output above."
    exit 1
  fi
  echo "Architect complete. prd.json ready."
else
  echo "=== Phase 1: Architect (skipped) ==="
  if [ ! -f "$SCRIPT_DIR/prd.json" ]; then
    echo "ERROR: --skip-architect requires prd.json to already exist."
    exit 1
  fi
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

# Shared lane runs first (sequentially — DB migrations, env setup)
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
  echo "WARNING: ${#FAILED_LANES[@]} worker(s) exited non-zero. Continuing to QA anyway..."
fi

echo ""
echo "All workers finished."
echo ""

# ── Phase 3: QA ─────────────────────────────────────────────────────────────
echo "=== Phase 3: QA ==="
OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/QA.md" 2>&1 | tee /dev/stderr) || true

if echo "$OUTPUT" | grep -q "<promise>QA_FAIL</promise>"; then
  echo ""
  echo "ERROR: QA failed. See progress.txt for details."
  echo "Fix the issues and re-run with --skip-architect to resume from build phase."
  exit 1
fi

echo "QA passed."
echo ""

# ── Phase 4: Deploy ──────────────────────────────────────────────────────────
if [ "$SKIP_DEPLOY" = true ]; then
  echo "=== Phase 4: Deploy (skipped) ==="
  echo ""
  echo "Pipeline complete (no deploy). QA passed."
  exit 0
fi

echo "=== Phase 4: Deploy to DigitalOcean ==="

# Check required env vars
if [ -z "$DO_TOKEN" ]; then
  echo "ERROR: DO_TOKEN not set. Export it or run with --skip-deploy."
  exit 1
fi

OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/agents/DEPLOY.md" 2>&1 | tee /dev/stderr) || true

if ! echo "$OUTPUT" | grep -q "<promise>DEPLOY_COMPLETE</promise>"; then
  echo ""
  echo "ERROR: Deploy failed. See deploy-report.txt for details."
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Pipeline complete!                              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
cat "$REPO_ROOT/deploy-report.txt" 2>/dev/null || true
