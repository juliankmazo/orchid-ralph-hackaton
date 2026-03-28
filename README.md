# Orchid

**A code review product where you can ask questions about the AI conversations behind any PR.**

The core insight: code review is incomplete when AI writes the code. Reviewers don't just need to see *what* changed — they need to ask "why was Supabase chosen over PostgreSQL?" and get an answer with citations from the actual development conversations.

**Dumb write, smart read.**
- **Write**: Record all AI conversations (Claude, Codex, Cursor) to a database. Full transcripts, no processing.
- **Read**: AI-powered query layer lets reviewers ask questions about the conversations and get answers with citations to specific messages.

## Documents

- [Research](./research/) - Deep research on approaches, existing tools, and UI
- [Architecture](./architecture.md) - Chosen architecture and technical decisions
- [MVP Plan](./mvp-plan.md) - What to build first

## Using Ralph (Autonomous Agent)

Ralph is an AI agent loop that implements user stories autonomously from spec files.

**Setup (one-time):**
1. Drop your spec markdown files into `specs/`
2. Ask Claude Code to generate `prd.json` from the specs
3. Review and iterate on `prd.json` until satisfied

**Run:**
```bash
./scripts/ralph/ralph.sh --tool claude
```

Ralph will pick up the highest-priority unfinished story, implement it, commit, and repeat until all stories pass.

---

## Key Decisions

- **Write path**: Simple. Dump full transcripts to Supabase Storage on session end. No slicing, no processing.
- **Read path**: Smart. Claude API answers reviewer questions about conversations with citations.
- **Capture**: Claude Code hooks + Codex filesystem watching (zero manual effort)
- **UI**: Diff view + "Ask about this PR" — the killer feature
- **Stack**: Next.js + Supabase + Claude API
