#!/bin/bash
# Orchid Agent Loop — Claude on a loop, simple as it gets
# Usage: ./start-agent.sh [max_iterations]

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_ITERATIONS="${1:-50}"

# Load .env
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Error: .env not found. Copy .env.example and fill in values:"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

set -a
source "$REPO_ROOT/.env"
set +a

echo "=== Orchid Agent Loop ==="
echo "Max iterations: $MAX_ITERATIONS"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "======================================================="
  echo "  Iteration $i of $MAX_ITERATIONS — $(date)"
  echo "======================================================="

  OUTPUT=$(claude --dangerously-skip-permissions --print < "$REPO_ROOT/AGENT.md" 2>&1 | tee /dev/stderr) || true

  # Check if all tasks are done
  if echo "$OUTPUT" | grep -q "<done>ALL_TASKS_COMPLETE</done>"; then
    echo ""
    echo "All tasks complete! Finished at iteration $i."
    exit 0
  fi

  echo "Iteration $i done. Continuing in 5s..."
  sleep 5
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS)."
echo "Check worklog.md for status."
exit 1