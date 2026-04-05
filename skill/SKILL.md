---
name: orchid-context
description: Query AI coding conversation history captured by Orchid. Use when the user wants to understand why code was written, review a PR with conversation context, explain a commit, search past AI sessions, list recent coding sessions, view architectural decisions, or ask questions about a session. Triggers on requests like "find the conversation behind this code", "why was this done", "review with context", "search past sessions", "explain this commit", "what decisions were made", "ask about this session", or any reference to Orchid or AI conversation history.
allowed-tools: Bash(orchid *)
---

# Orchid — AI Conversation History for Code

Orchid captures AI coding conversations and makes them queryable. Use the `orchid` CLI to search, view, and analyze past sessions.

## When to Use

- User asks **why** code was written a certain way
- User wants to **review a PR** with the conversation context behind it
- User wants to **explain a commit** — what motivated the changes
- User wants to **search** past AI conversations for a topic
- User wants to **list** recent coding sessions
- User wants to **understand** decisions, tradeoffs, or reasoning from past sessions
- User wants to see **architectural decisions** extracted from conversations
- User wants to **ask questions** about a specific session
- An agent needs context from **previous sessions** to continue work

## Commands

### List sessions

```bash
orchid data list
```

Shows all stored sessions: who started them, when, how many messages, and whether they're active or done.

### Show a session

```bash
# Raw JSONL transcript (best for agent processing)
orchid data show <session-id>

# Human-readable conversation turns
orchid data show <session-id> --turns

# Metadata + first/last messages
orchid data show <session-id> --summary
```

Session IDs can be partial — the first 8-12 characters are enough.

### Search conversations

```bash
orchid data search "<query>"
```

Full-text search across all stored sessions. Returns matching sessions with context snippets.

### AI summary of a session

```bash
orchid data summary <session-id>
```

Generates an AI-powered summary of a session: what was the goal, what decisions were made, what was built. Requires OPENAI_API_KEY on the server.

### Architectural decisions

```bash
# Extract decisions from all recent sessions
orchid data decisions

# Filter by repo
orchid data decisions <repo-name>
```

AI-extracted architectural decision log. Shows each decision with its rationale, alternatives considered, and a deep-link to the exact conversation turn where it was made.

### Ask questions about a session

```bash
# Single question
orchid data ask <session-id> "why did we choose WebSockets?"

# Interactive chat mode
orchid data ask <session-id>
```

Ask natural-language questions about a session's conversation. In interactive mode, supports multi-turn follow-up questions. Requires OPENAI_API_KEY on the server.

### Review with conversation context

```bash
# With AI summary (default)
orchid review <branch-or-topic>

# Without AI, just raw excerpts
orchid review <branch-or-topic> --no-ai
```

Finds conversations related to a branch or topic and summarizes the key decisions and context for code review. Shows up to 3 related sessions with key conversation points.

### Explain a commit

```bash
orchid explain <commit-sha>
orchid explain HEAD~1
```

Finds conversations that happened around the time of a commit and explains the motivation behind the changes. Shows the commit info, related sessions, and an AI explanation.

## Workflow Patterns

### Understanding unfamiliar code

When the user asks "why was X done this way?" or wants to understand code they didn't write:

1. Run `orchid data search "<relevant terms>"` to find related sessions
2. Use `orchid data show <session-id> --turns` to read the conversation
3. Or use `orchid data ask <session-id> "why was X done this way?"` for a direct answer

### Reviewing a PR

When reviewing code changes with full context:

1. Run `orchid review <branch-name>` for an automated summary
2. If more detail is needed, use `orchid data ask <session-id> "what tradeoffs were discussed?"` on specific sessions
3. Combine the conversation context with the code diff for a thorough review

### Understanding architectural decisions

When the user wants to know what decisions were made and why:

1. Run `orchid data decisions` to see all extracted decisions
2. Each decision includes a deep-link to the conversation turn where it was made
3. Follow up with `orchid data ask <session-id>` to dig deeper

### Explaining commits

When the user wants to understand why a commit was made:

1. Run `orchid explain <sha>` for an automated explanation
2. Follow up with `orchid data show <session-id>` if deeper context is needed

### Continuing previous work

When an agent needs to pick up where a previous session left off:

1. Run `orchid data list` to find recent sessions
2. Run `orchid data show <session-id> --turns` to read the full conversation
3. Or use `orchid data ask <session-id> "what was left unfinished?"` for a quick summary
4. Use that context to understand what was tried, what worked, and what the user wanted

### Searching for decisions

When looking for past decisions or discussions on a topic:

1. Run `orchid data search "<topic>"` to find matching sessions
2. Read the relevant sessions to find the specific discussion
3. Present the findings with links to the original conversations

## Tips

- Session IDs are UUIDs — partial matches work (first 8+ chars)
- Raw output (`orchid data show` without flags) is best for agent processing — pipe it to a file if it's long
- `--turns` format is best for human reading
- `--summary` is good for a quick overview before diving deeper
- Search is full-text across transcripts, branch names, and user names
- `orchid review` is the fastest way to get PR context — it combines search + display + AI analysis
- `orchid data ask` is the fastest way to get answers about a specific session without reading the whole transcript
- `orchid data decisions` gives a high-level view of all architectural choices made across sessions
