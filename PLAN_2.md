# Plan v2: Wrapper CLI + Periodic Sync

> **Note**: This is a spec for a **proof of concept**. The goal is to validate the core idea with the simplest possible implementation, not to build a production system. Cut corners where it makes sense — we can harden later.

## Problem

When AI writes code, the conversations behind it are invisible. A reviewer sees a PR diff but has no idea *why* the AI made certain decisions — what the developer asked for, what alternatives were discussed, what tradeoffs were made. The context is lost.

## Goal

Make AI conversations a first-class artifact of code review. Any developer should be able to look at a commit or PR and see the conversations *related to it* — and eventually ask questions about them.

## Key Principles

- **Dumb write, smart read**: The capture path just stores raw conversation data — no processing, no parsing. It's an immutable, append-only log. All intelligence (linking to commits, surfacing in PRs, answering questions) happens at read time.
- **Multi-repo by default**: A single conversation can span multiple repos and PRs. A developer working on a feature might touch backend and frontend in one session. The data model supports this from day one.
- **Periodic sync, not post-hoc**: Conversations stream to the server as they happen, not after the session ends. This makes the data crash-safe and enables live viewing.
- **Zero friction capture**: Just prefix your command with `orchid`. No config, no hooks, no setup.

## Core Idea

Replace the hooks-based capture approach with a **command wrapper** inspired by [jai](https://jai.scs.stanford.edu/):

```
orchid claude
```

This launches Claude Code (or any AI tool) and periodically syncs the conversation transcript to the cloud in near-realtime.

## How It Works

1. User runs `orchid claude` in a **feature folder** (which may contain multiple repos as subfolders)
2. Orchid launches Claude Code as a child process
3. A background watcher monitors the JSONL transcript file in `~/.claude/projects/`
4. Every few seconds (or on new messages), new transcript chunks are pushed to the Orchid server
5. Orchid watches for commits across **all git repos** under the working directory and links them to the session
6. On exit, a final sync ensures everything is captured

### Multi-Repo Sessions

A common workflow: a developer creates a feature folder, clones the server and frontend repos into it, and runs `orchid claude` from the feature folder. That single conversation may produce commits in both repos, across multiple PRs.

```
feature-new-auth/
├── backend/      ← git repo, PR #42
├── frontend/     ← git repo, PR #18
└── notes.md
```

```
orchid claude      ← one session, two repos, two PRs
```

This means:
- **Sessions link to multiple repos** — not just one
- **Sessions link to multiple commits across repos** — timestamps help correlate which parts of the conversation relate to which commits
- **PR views aggregate** — when viewing PR #42 on the backend, you see the full conversation that also touched the frontend, with the relevant parts highlighted

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
sessions (id, tool, status, working_dir, started_at, ended_at)
session_repos (session_id, repo_id)              -- many-to-many
chunks (id, session_id, seq, data, received_at)
commits (sha, repo_id, session_id, committed_at)
```

- A session can span **multiple repos** (via `session_repos`)
- Commits link back to both their repo and the session
- Timestamps on chunks and commits allow correlating conversation turns with specific commits
- Transcripts are stored as ordered chunks — the server appends, the web UI reassembles

### Dumb Write, Smart Read

The write path does **nothing clever** — it just appends timestamped transcript chunks to the database. No processing, no linking, no parsing. The raw conversation is immutable data.

All intelligence happens at **read time**: linking conversations to commits (via timestamps + git history), correlating with PRs, highlighting relevant sections, answering reviewer questions. This means we can keep building new read-time features without ever changing how data is captured.

## Phases

### Phase 1: CLI + Server

**Server**
- Node.js + Express/Fastify + Postgres
- REST endpoints for session/chunk/commit CRUD
- WebSocket endpoint for live session streaming
- No auth for POC — server is open / uses a simple API key
- Deploy on DigitalOcean (single droplet: Node.js + Postgres)

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
