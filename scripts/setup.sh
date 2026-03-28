#!/bin/bash
# Bootstrap script for running Ralph on a fresh DigitalOcean droplet (Ubuntu 22.04+)
# Usage: bash scripts/setup.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Orchid / Ralph Setup ==="
echo ""

# ── 1. Load .env ─────────────────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "Error: .env not found. Copy .env.example and fill in values:"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

set -a
source "$REPO_ROOT/.env"
set +a

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is not set in .env}"
: "${GIT_USER_NAME:?GIT_USER_NAME is not set in .env}"
: "${GIT_USER_EMAIL:?GIT_USER_EMAIL is not set in .env}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set in .env}"
: "${GITHUB_REPO:?GITHUB_REPO is not set in .env}"

echo "✓ .env loaded"

# ── 2. System dependencies ────────────────────────────────────────────────────
echo ""
echo "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq git jq curl
echo "✓ git, jq, curl installed"

# ── 3. Node.js 18+ via nvm ───────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>/dev/null; echo $?) == "1" ]]; then
  echo ""
  echo "Installing Node.js 18 via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 18
  nvm use 18
  nvm alias default 18
  echo "✓ Node.js $(node -v) installed"
else
  echo "✓ Node.js $(node -v) already installed"
fi

# Ensure nvm is loaded if already installed
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# ── 4. Claude Code CLI ────────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  echo ""
  echo "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  echo "✓ Claude Code installed"
else
  echo "✓ Claude Code already installed ($(claude --version 2>/dev/null || echo 'unknown version'))"
fi

# ── 5. Git identity ───────────────────────────────────────────────────────────
echo ""
git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"
echo "✓ Git identity: $GIT_USER_NAME <$GIT_USER_EMAIL>"

# ── 6. Git remote with token auth ────────────────────────────────────────────
git -C "$REPO_ROOT" remote set-url origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
echo "✓ Git remote configured with token auth"

# ── 7. Make scripts executable ───────────────────────────────────────────────
chmod +x "$REPO_ROOT/scripts/ralph/ralph.sh"
echo "✓ scripts/ralph/ralph.sh is executable"

# ── 8. Verify prd.json exists ────────────────────────────────────────────────
echo ""
if [ ! -f "$REPO_ROOT/scripts/ralph/prd.json" ]; then
  echo "⚠  scripts/ralph/prd.json not found."
  echo "   Add spec files to specs/ and generate prd.json before running Ralph."
else
  STORY_COUNT=$(jq '.userStories | length' "$REPO_ROOT/scripts/ralph/prd.json")
  PENDING=$(jq '[.userStories[] | select(.passes == false)] | length' "$REPO_ROOT/scripts/ralph/prd.json")
  echo "✓ prd.json found: $STORY_COUNT stories, $PENDING pending"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start Ralph:"
echo "  tmux new -s ralph"
echo "  ./scripts/ralph/ralph.sh --tool claude"
echo ""
