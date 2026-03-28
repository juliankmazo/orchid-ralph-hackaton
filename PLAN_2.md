# Plan v2: Wrapper CLI + Periodic Sync

> **Note**: This is a spec for a **proof of concept**. The goal is to validate the core idea with the simplest possible implementation, not to build a production system. Cut corners where it makes sense — we can harden later.

## Core Idea

Replace the hooks-based capture approach with a **command wrapper** inspired by [jai](https://jai.scs.stanford.edu/):

```
orchid claude
```

This launches Claude Code (or any AI tool) and periodically syncs the conversation transcript to the cloud in near-realtime.

## Why This Is Better Than Plan v1

- **Simpler UX**: No hook configuration, no `orchid init` — just prefix your command
- **Explicit opt-in**: You choose which sessions are tracked
- **Generalizable**: `orchid claude`, `orchid codex`, `orchid cursor`
- **No local DB needed**: Cloud is the source of truth from the start
- **Crash-safe**: Periodic sync means no data loss if the session dies unexpectedly

## How It Works

1. User runs `orchid claude` in a git repo
2. Orchid launches Claude Code as a child process
3. A background watcher monitors the JSONL transcript file in `~/.claude/projects/`
4. Every few seconds (or on new messages), new transcript chunks are pushed to the Orchid server
5. Orchid detects commits made during the session and links them to the session
6. On exit, a final sync ensures everything is captured

## Live Session Viewing

Because transcripts sync periodically, we get **live viewing for free**:

- A teammate opens the Orchid web UI and sees your session updating in realtime
- Useful for pair programming, mentoring, or just staying aware of what AI is doing
- No screen sharing needed — the conversation is the artifact

## Server Architecture

A dedicated **Node.js server** with **Postgres**, hosted on a single DigitalOcean droplet (or EC2).

### Why Own Server vs. Supabase

- **Simpler**: One process, one DB — no vendor abstractions in the way
- **Full control**: Custom WebSocket logic for live streaming, custom auth, custom query layer
- **Cheaper**: A $12/mo droplet handles the hackathon and beyond
- **Fewer moving parts**: No Supabase client SDK, no row-level security policies to debug

### API Shape

```
POST   /api/sessions                    — Create a new session (returns session_id)
POST   /api/sessions/:id/chunks         — CLI pushes new transcript chunks
PATCH  /api/sessions/:id                — Update session metadata (status, end time)
POST   /api/sessions/:id/commits        — Link a commit SHA to the session

GET    /api/sessions/:id                — Full session with transcript
GET    /api/repos/:owner/:repo/sessions — Sessions for a repo
GET    /api/repos/:owner/:repo/pulls/:pr — Sessions linked to a PR
WS     /api/sessions/:id/live           — WebSocket for live session viewing
```

### Database Schema (Postgres)

```sql
repos (id, owner, name, remote_url, created_at)
sessions (id, repo_id, user_id, tool, status, started_at, ended_at)
chunks (id, session_id, seq, data, received_at)
commits (sha, repo_id, session_id, committed_at)
users (id, github_id, github_username, token, created_at)
```

Transcripts are stored as ordered chunks — the server appends, the web UI reassembles. This makes streaming writes cheap and live viewing simple.

## Phases

### Phase 1: CLI + Server

**Server**
- Node.js + Express/Fastify + Postgres
- REST endpoints for session/chunk/commit CRUD
- WebSocket endpoint for live session streaming
- GitHub OAuth for auth
- Deploy on DigitalOcean (single droplet: Node.js + Postgres)

**CLI: `orchid login`**
- GitHub OAuth via browser (server handles the flow)
- Store token locally

**CLI: `orchid claude`** (and `orchid codex`, etc.)
- Detect current git repo and remote URL
- Create session on server (`POST /api/sessions`)
- Launch the wrapped tool
- Watch for JSONL transcript file
- Periodic sync to server (every ~5s or on new messages)
- Detect `git commit` events and link commit SHAs to the session
- Final sync on exit

**CLI: `orchid sync <session>`** (fallback)
- Manually push a past session that wasn't captured via wrapper
- For "I forgot to use `orchid`" situations

### Phase 2: Web UI

Served from the same Node.js server (or a separate Next.js app if needed).

**Core Views:**

1. **Dashboard** (`/`) — Repos with recent AI activity
2. **Repo View** (`/:repo`) — Commit timeline with session indicators
3. **PR View** (`/:repo/pulls/:number`) — All conversations behind a PR
4. **Session View** (`/:repo/sessions/:id`) — Full conversation replay
   - Live-updating via WebSocket if session is still active
5. **Commit View** (`/:repo/commits/:sha`) — Diff + conversation side-by-side

**The Killer Feature: "Ask about this PR"**
- Reviewer types a question about the PR
- Claude answers using the actual AI conversations as context
- Cited responses pointing to specific messages in the transcript

### Phase 3: GitHub Integration + Polish

- GitHub Action that auto-comments conversation summaries on PRs
- Browser extension to embed conversation context in GitHub PR pages
- Team features (shared repos, access controls)
- Conversation search across all sessions
- Analytics (AI usage, session duration, cost estimates)

## Tech Stack

```
CLI:        TypeScript (wrapper + file watcher + HTTP/WS sync client)
Server:     Node.js + Express or Fastify
Database:   Postgres
Realtime:   WebSockets (native, via ws or built-in Fastify support)
Frontend:   Next.js App Router + Tailwind (or served from same server)
Hosting:    DigitalOcean droplet (Node.js + Postgres on same box)
```

## Open Questions

- What's the right sync interval? 5s? On every new message? Debounced?
- How to handle multiple simultaneous sessions?
- Should `orchid` also capture terminal output, or just the JSONL transcript?
- How to link commits to sessions reliably when multiple tools are running?
