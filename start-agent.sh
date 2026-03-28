#!/bin/bash
# Watchdog loop for Orchid Agent
# Restarts Claude Code automatically when it exits (context full, crash, or completion).
# Each new session reads goals.md + worklog.md to pick up where it left off.
#
# STOP: Ctrl+C (kills current claude + exits loop)
#       Or from another terminal: kill $(cat /tmp/orchid-agent.pid)

set -uo pipefail

# ── Escape hatch: Ctrl+C kills claude and exits cleanly ──
cleanup() {
    echo ""
    echo "[watchdog] Caught SIGINT/SIGTERM — shutting down..."
    rm -f /tmp/orchid-agent.pid
    echo "[watchdog] Done. Exited cleanly."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Write our PID so we can be killed from another terminal
echo $$ > /tmp/orchid-agent.pid

# ── Config ──
REPODIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$HOME/agent-logs"
mkdir -p "$LOGDIR"

# Load .env if present
if [ -f "$REPODIR/.env" ]; then
    set -a
    source "$REPODIR/.env"
    set +a
fi

PROMPT='Read AGENT.md, goals.md, and the last 50 lines of worklog.md. You are running autonomously. Work through the phases in goals.md in order. NEVER STOP. NEVER ask for human input. If stuck on one task for more than 30 minutes, move to the next. Commit and push after every meaningful work unit.

CRITICAL — PROTECT YOUR CONTEXT WINDOW:
You are the orchestrator. NEVER run queries or read large files directly. ALWAYS delegate to background agents:
- Use Sonnet 4.6 background agents for: SQL queries, file reads, code searches, CSV generation, writing reports. Launch many in parallel.
- Use Opus 4.6 background agents for: complex reasoning, root cause analysis, investigation reports, designing test cases.
- Redirect all command output to files (> /tmp/result.txt), then have agents summarize them.
- Keep your own messages SHORT. Summarize, dont paste. Reference files by path.
- When launching agents, give them EVERYTHING they need in the prompt (file paths, queries, date ranges, output format) so they work independently.
- Save progress to worklog.md frequently. When context feels heavy, commit, push, and exit. The watchdog restarts you with fresh context in 10 seconds.'

SESSION=0

echo "[watchdog] Starting Orchid Agent watchdog (PID $$)"
echo "[watchdog] Repo: $REPODIR"
echo "[watchdog] Logs: $LOGDIR"
echo "[watchdog] Press Ctrl+C to stop"
echo ""

while true; do
    SESSION=$((SESSION + 1))
    LOGFILE="$LOGDIR/session-${SESSION}-$(date +%Y%m%d-%H%M%S).log"

    echo "============================================"
    echo "  AGENT SESSION #${SESSION} — $(date)"
    echo "  Log: $LOGFILE"
    echo "============================================"
    echo ""

    # Unset env vars so nested launch works from within Claude Code sessions
    unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_PARENT_SESSION_ID 2>/dev/null || true

    echo "[watchdog] Launching claude from $REPODIR ..."
    echo "[watchdog] Live output: tail -f $LOGFILE"

    # Use `script` to provide a PTY so claude doesn't hang.
    # claude -p (--print) hangs when stdout is not a TTY during tool use.
    # `script -q -c CMD FILE` allocates a PTY, runs CMD, logs to FILE.
    cd "$REPODIR"
    PROMPT_FILE=$(mktemp /tmp/orchid-prompt-XXXXXX.txt)
    printf '%s' "$PROMPT" > "$PROMPT_FILE"
    script -q -e -f -c "claude --model opus --permission-mode bypassPermissions -p \"\$(cat $PROMPT_FILE)\"" "$LOGFILE"
    EXIT_CODE=$?
    rm -f "$PROMPT_FILE"

    echo ""
    echo "[watchdog] Claude exited with code ${EXIT_CODE} at $(date)"
    echo "[watchdog] Session log saved to: $LOGFILE"

    if [ $EXIT_CODE -eq 130 ] || [ $EXIT_CODE -eq 143 ]; then
        echo "[watchdog] Claude was killed by signal — exiting watchdog."
        break
    fi

    echo "[watchdog] Restarting in 10 seconds... (Ctrl+C to stop)"

    # Interruptible sleep (sleep in background + wait)
    sleep 10 &
    wait $!
done

rm -f /tmp/orchid-agent.pid
echo "[watchdog] Watchdog stopped."
