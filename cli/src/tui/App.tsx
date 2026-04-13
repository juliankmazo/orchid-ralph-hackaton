import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { getConfig } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  user_name: string;
  user_email: string;
  working_dir: string;
  git_remotes: string[];
  branch: string;
  tool: string;
  started_at: string;
  updated_at: string;
  status: string;
  transcript?: string;
  message_count?: number;
}

interface Decision {
  title: string;
  decision: string;
  alternatives: string[];
  reason: string;
  session_id: string;
  turn_index: number;
}

type View =
  | { type: "menu"; cursor: number }
  | { type: "list"; sessions: Session[]; cursor: number; scrollOffset: number }
  | { type: "show"; session: Session; scrollOffset: number }
  | { type: "search_input"; query: string }
  | { type: "search_results"; query: string; sessions: Session[]; cursor: number; scrollOffset: number }
  | { type: "decisions_input"; query: string }
  | { type: "decisions"; repo?: string; decisions: Decision[]; sessions_analyzed: number; cursor: number; scrollOffset: number };

type Status =
  | { type: "idle" }
  | { type: "loading"; msg: string }
  | { type: "error"; msg: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() || p;
}

async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const { apiUrl, apiKey } = getConfig();
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey }, signal });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function parseTranscriptTurns(transcript: string): Array<{ role: string; text: string }> {
  const turns: Array<{ role: string; text: string }> = [];
  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      let role = "";
      let text = "";
      const content = (obj.content ?? (obj.message as Record<string, unknown>)?.content) as unknown;
      const extractText = (c: unknown): string => {
        if (typeof c === "string") return c;
        if (Array.isArray(c))
          return c
            .map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : ""))
            .filter(Boolean)
            .join("\n");
        return "";
      };
      if (obj.type === "human" || obj.role === "user" || obj.role === "human") {
        role = "user";
        text = extractText(content);
      } else if (obj.type === "assistant" || obj.role === "assistant") {
        role = "assistant";
        text = extractText(content);
      } else if (obj.message) {
        const m = obj.message as Record<string, unknown>;
        role = (m.role as string) || "unknown";
        text = extractText(m.content);
      }
      if (role && text) turns.push({ role, text });
    } catch {
      // skip malformed JSONL lines
    }
  }
  return turns;
}

const VISIBLE_ROWS = Math.max(5, (process.stdout.rows || 24) - 12);

// ─── Menu ─────────────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { label: "Sessions", desc: "Browse all captured sessions" },
  { label: "Search", desc: "Search sessions by keyword" },
  { label: "Decision Log", desc: "AI-extracted architectural decisions" },
  { label: "Quit", desc: "Exit orchid" },
];

// ─── Sub-views ────────────────────────────────────────────────────────────────

function Header({ view }: { view: View }) {
  const breadcrumb =
    view.type === "menu" ? "home" :
    view.type === "list" ? "sessions" :
    view.type === "show" ? "sessions › detail" :
    view.type === "search_input" ? "search" :
    view.type === "search_results" ? `search › "${view.query}"` :
    view.type === "decisions_input" ? "decision log" :
    view.type === "decisions" ? "decision log" :
    "home";

  return (
    <Box flexDirection="row" gap={2} paddingX={1}>
      <Text bold color="magenta">orchid</Text>
      <Text color="gray">›</Text>
      <Text color="white">{breadcrumb}</Text>
    </Box>
  );
}

function StatusBar({ status }: { status: Status }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row" gap={1}>
      {status.type === "loading" ? (
        <>
          <Text color="magenta"><Spinner type="dots" /></Text>
          <Text color="gray">{status.msg}</Text>
          <Text color="gray" dimColor>  esc to cancel</Text>
        </>
      ) : status.type === "error" ? (
        <Text color="red">{status.msg}</Text>
      ) : (
        <Text color="gray" dimColor>orchid</Text>
      )}
    </Box>
  );
}

function MenuView({ cursor }: { cursor: number }) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={0}>
      <Box marginBottom={1}>
        <Text color="gray">Capture and query AI coding sessions.</Text>
      </Box>
      {MENU_ITEMS.map((item, i) => (
        <Box key={item.label} flexDirection="row" gap={2}>
          <Text
            color={i === cursor ? "black" : "white"}
            backgroundColor={i === cursor ? "magenta" : undefined}
            bold={i === cursor}
          >
            {"  "}{item.label.padEnd(16)}{"  "}
          </Text>
          <Text color="gray">{item.desc}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>j/k navigate · enter select · ctrl+c exit</Text>
      </Box>
    </Box>
  );
}

function TextInputView({ label, hint, query }: { label: string; hint: string; query: string }) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text color="gray">{label}</Text>
      <Box flexDirection="row" gap={1}>
        <Text color="magenta">›</Text>
        <Text color="white">{query}</Text>
        <Text color="magenta">█</Text>
      </Box>
      <Text color="gray" dimColor>{hint}</Text>
    </Box>
  );
}

function SessionRow({ session, selected }: { session: Session; selected: boolean }) {
  const active = session.status === "active";
  const msgCount = session.message_count ?? 0;
  const dir = truncate(basename(session.working_dir || ""), 20);
  const branch = truncate(session.branch || "", 18);
  const ago = timeAgo(session.updated_at || session.started_at);
  const id = session.id.slice(0, 12);

  return (
    <Box flexDirection="row" gap={2} paddingX={1}>
      <Text color={selected ? "black" : undefined} backgroundColor={selected ? "magenta" : undefined}>
        {" "}{id}{" "}
      </Text>
      <Text color={selected ? "magenta" : "white"} bold={selected}>
        {truncate(session.user_name || "unknown", 14)}
      </Text>
      <Text color="gray">{dir}</Text>
      <Text color={selected ? "cyan" : "gray"}>{branch}</Text>
      <Text color="gray" dimColor>{ago}</Text>
      <Text color="gray">{msgCount > 0 ? `${msgCount}msg` : ""}</Text>
      {active && <Text color="green">● live</Text>}
    </Box>
  );
}

function ListView({
  sessions,
  cursor,
  scrollOffset,
  header,
}: {
  sessions: Session[];
  cursor: number;
  scrollOffset: number;
  header?: React.ReactNode;
}) {
  if (sessions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">No sessions found. Run `orchid claude` to start one.</Text>
      </Box>
    );
  }

  const visible = sessions.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);

  return (
    <Box flexDirection="column">
      {header}
      <Box paddingX={1}>
        <Text color="gray" dimColor>{"  "}{"ID".padEnd(14)}{"USER".padEnd(16)}{"DIR".padEnd(22)}{"BRANCH".padEnd(20)}AGO</Text>
      </Box>
      {visible.map((s, i) => (
        <SessionRow key={s.id} session={s} selected={scrollOffset + i === cursor} />
      ))}
      <Box paddingX={1} marginTop={1} flexDirection="row" gap={2}>
        {sessions.length > VISIBLE_ROWS && (
          <Text color="gray" dimColor>{scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_ROWS, sessions.length)} of {sessions.length}</Text>
        )}
        <Text color="gray" dimColor>j/k navigate · enter open · esc back</Text>
      </Box>
    </Box>
  );
}

function SessionDetailView({ session, scrollOffset, webUrl }: { session: Session; scrollOffset: number; webUrl: string }) {
  const turns = session.transcript ? parseTranscriptTurns(session.transcript) : [];
  const link = `${webUrl.replace(/\/$/, "")}/sessions/${encodeURIComponent(session.id)}`;
  const visibleTurns = turns.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={0}>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text bold color="white">{session.id}</Text>
        {session.status === "active" && <Text color="green">● live</Text>}
      </Box>

      <Box flexDirection="column" gap={0} marginBottom={1}>
        <Text color="gray">user    <Text color="white">{session.user_name || "unknown"} &lt;{session.user_email || "unknown"}&gt;</Text></Text>
        <Text color="gray">branch  <Text color="cyan">{session.branch || "unknown"}</Text></Text>
        <Text color="gray">dir     <Text color="white">{session.working_dir || "unknown"}</Text></Text>
        <Text color="gray">turns   <Text color="white">{turns.length}</Text></Text>
        <Text color="gray">started <Text color="white">{session.started_at ? new Date(session.started_at).toLocaleString() : "unknown"}</Text></Text>
      </Box>

      <Text color="magenta" dimColor>─────────────────────────────</Text>

      {visibleTurns.map((t, i) => (
        <Box key={scrollOffset + i} flexDirection="column" marginTop={1}>
          <Text color={t.role === "user" ? "cyan" : "magenta"} bold>
            {t.role === "user" ? "▶ user" : "◀ claude"} #{scrollOffset + i + 1}
          </Text>
          <Box paddingLeft={2}>
            <Text color="white" wrap="wrap">{truncate(t.text, 200)}</Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1} flexDirection="row" gap={2}>
        {turns.length > VISIBLE_ROWS && (
          <Text color="gray" dimColor>turns {scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_ROWS, turns.length)} of {turns.length}</Text>
        )}
        <Text color="gray" dimColor>j/k scroll · esc back</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>open in browser:</Text>
        <Text color="blue" underline>{link}</Text>
      </Box>
    </Box>
  );
}

function DecisionRow({ d, selected }: { d: Decision; selected: boolean }) {
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Box flexDirection="row" gap={1}>
        <Text backgroundColor={selected ? "magenta" : undefined} color={selected ? "black" : "green"}>
          {" "}✓{" "}
        </Text>
        <Text bold color={selected ? "magenta" : "white"}>{d.title}</Text>
      </Box>
      <Box paddingLeft={4} flexDirection="column">
        <Text color="gray">{truncate(d.decision, 80)}</Text>
        {d.reason && <Text color="gray" dimColor>why: {truncate(d.reason, 70)}</Text>}
        {d.alternatives?.length > 0 && (
          <Text color="gray" dimColor>alt: {d.alternatives.slice(0, 3).join(", ")}</Text>
        )}
        <Text color="gray" dimColor>session {d.session_id.slice(0, 8)}… · turn {d.turn_index + 1}</Text>
      </Box>
    </Box>
  );
}

function DecisionsView({
  decisions,
  sessions_analyzed,
  repo,
  cursor,
  scrollOffset,
}: {
  decisions: Decision[];
  sessions_analyzed: number;
  repo?: string;
  cursor: number;
  scrollOffset: number;
}) {
  if (decisions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column" gap={1}>
        <Text color="gray">No decisions found{repo ? ` for "${repo}"` : ""}.</Text>
        <Text color="gray" dimColor>Try loading all sessions or filter by a different repo name.</Text>
      </Box>
    );
  }

  const visible = decisions.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);

  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={1}>
        <Text color="gray">
          <Text color="white" bold>{decisions.length}</Text> decisions · <Text color="white">{sessions_analyzed}</Text> sessions analyzed{repo ? ` · repo: ${repo}` : ""}
        </Text>
      </Box>
      {visible.map((d, i) => (
        <DecisionRow key={scrollOffset + i} d={d} selected={scrollOffset + i === cursor} />
      ))}
      <Box paddingX={1} flexDirection="row" gap={2}>
        {decisions.length > VISIBLE_ROWS && (
          <Text color="gray" dimColor>{scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_ROWS, decisions.length)} of {decisions.length}</Text>
        )}
        <Text color="gray" dimColor>j/k navigate · esc back</Text>
      </Box>
    </Box>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>({ type: "menu", cursor: 0 });
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const webUrlRef = useRef<string>(getConfig().webUrl);

  // Auto-clear errors after 3s
  useEffect(() => {
    if (status.type !== "error") return;
    const id = setTimeout(() => setStatus({ type: "idle" }), 3000);
    return () => clearTimeout(id);
  }, [status]);

  const fetchWithTimeout = useCallback(async (path: string): Promise<unknown> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      return await apiFetch(path, controller.signal);
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
    }
  }, []);

  const handleFetchError = useCallback((err: unknown) => {
    if ((err as Error).name === "AbortError") {
      setStatus({ type: "idle" });
    } else {
      setStatus({ type: "error", msg: (err as Error).message });
    }
  }, []);

  // ─── Navigation helpers ────────────────────────────────────────────────────

  const navigateSessionList = useCallback((delta: number) => {
    setView((v) => {
      if (v.type !== "list" && v.type !== "search_results") return v;
      const newCursor = Math.max(0, Math.min(v.cursor + delta, v.sessions.length - 1));
      const newScroll =
        newCursor < v.scrollOffset ? newCursor :
        newCursor >= v.scrollOffset + VISIBLE_ROWS ? newCursor - VISIBLE_ROWS + 1 :
        v.scrollOffset;
      return { ...v, cursor: newCursor, scrollOffset: newScroll };
    });
  }, []);

  const navigateDecisions = useCallback((delta: number) => {
    setView((v) => {
      if (v.type !== "decisions") return v;
      const newCursor = Math.max(0, Math.min(v.cursor + delta, v.decisions.length - 1));
      const newScroll =
        newCursor < v.scrollOffset ? newCursor :
        newCursor >= v.scrollOffset + VISIBLE_ROWS ? newCursor - VISIBLE_ROWS + 1 :
        v.scrollOffset;
      return { ...v, cursor: newCursor, scrollOffset: newScroll };
    });
  }, []);

  const navigateDetail = useCallback((delta: number) => {
    setView((v) => {
      if (v.type !== "show") return v;
      const turns = v.session.transcript ? parseTranscriptTurns(v.session.transcript) : [];
      const maxOffset = Math.max(0, turns.length - VISIBLE_ROWS);
      return { ...v, scrollOffset: Math.max(0, Math.min(v.scrollOffset + delta, maxOffset)) };
    });
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openSession = useCallback(async (sessions: Session[], cursor: number) => {
    const session = sessions[cursor];
    if (!session) return;
    setStatus({ type: "loading", msg: "Loading session…" });
    try {
      const full = await fetchWithTimeout(`/sessions/${encodeURIComponent(session.id)}`) as Session;
      setStatus({ type: "idle" });
      setView({ type: "show", session: full, scrollOffset: 0 });
    } catch (err) {
      handleFetchError(err);
    }
  }, [fetchWithTimeout, handleFetchError]);

  const selectMenuItem = useCallback(async (cursor: number) => {
    switch (cursor) {
      case 0: {
        setStatus({ type: "loading", msg: "Fetching sessions…" });
        try {
          const sessions = await fetchWithTimeout("/sessions") as Session[];
          setStatus({ type: "idle" });
          setView({ type: "list", sessions, cursor: 0, scrollOffset: 0 });
        } catch (err) {
          handleFetchError(err);
        }
        break;
      }
      case 1:
        setView({ type: "search_input", query: "" });
        break;
      case 2:
        setView({ type: "decisions_input", query: "" });
        break;
      case 3:
        exit();
        break;
    }
  }, [fetchWithTimeout, handleFetchError, exit]);

  const submitSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setView({ type: "menu", cursor: 1 });
      return;
    }
    setStatus({ type: "loading", msg: `Searching for "${query}"…` });
    try {
      const sessions = await fetchWithTimeout(`/sessions?q=${encodeURIComponent(query)}`) as Session[];
      setStatus({ type: "idle" });
      setView({ type: "search_results", query, sessions, cursor: 0, scrollOffset: 0 });
    } catch (err) {
      handleFetchError(err);
    }
  }, [fetchWithTimeout, handleFetchError]);

  const submitDecisions = useCallback(async (query: string) => {
    const repo = query.trim() || undefined;
    const path = repo ? `/decisions?repo=${encodeURIComponent(repo)}` : "/decisions";
    setStatus({ type: "loading", msg: `Extracting decisions${repo ? ` for "${repo}"` : ""}…` });
    try {
      const result = await fetchWithTimeout(path) as { decisions: Decision[]; sessions_analyzed: number };
      setStatus({ type: "idle" });
      setView({ type: "decisions", repo, decisions: result.decisions, sessions_analyzed: result.sessions_analyzed, cursor: 0, scrollOffset: 0 });
    } catch (err) {
      handleFetchError(err);
    }
  }, [fetchWithTimeout, handleFetchError]);

  // ─── Input handling ───────────────────────────────────────────────────────

  useInput((char, key) => {
    // Cancel loading with esc/q
    if (status.type === "loading") {
      if (key.escape || char === "q") {
        abortRef.current?.abort();
        setStatus({ type: "idle" });
      }
      return;
    }

    // Text input views
    if (view.type === "search_input" || view.type === "decisions_input") {
      if (key.escape) {
        setView({ type: "menu", cursor: view.type === "search_input" ? 1 : 2 });
        return;
      }
      if (key.return) {
        const { query } = view;
        if (view.type === "search_input") submitSearch(query);
        else submitDecisions(query);
        return;
      }
      if (key.backspace || key.delete) {
        setView({ ...view, query: view.query.slice(0, -1) });
        return;
      }
      if (char && !key.ctrl && !key.meta) {
        setView({ ...view, query: view.query + char });
      }
      return;
    }

    // Session list navigation
    if (view.type === "list" || view.type === "search_results") {
      if (char === "j" || key.downArrow) { navigateSessionList(1); return; }
      if (char === "k" || key.upArrow) { navigateSessionList(-1); return; }
      if (key.return) { openSession(view.sessions, view.cursor); return; }
    }

    // Decisions navigation
    if (view.type === "decisions") {
      if (char === "j" || key.downArrow) { navigateDecisions(1); return; }
      if (char === "k" || key.upArrow) { navigateDecisions(-1); return; }
    }

    // Session detail scroll
    if (view.type === "show") {
      if (char === "j" || key.downArrow) { navigateDetail(1); return; }
      if (char === "k" || key.upArrow) { navigateDetail(-1); return; }
    }

    // Menu navigation
    if (view.type === "menu") {
      if (char === "j" || key.downArrow) {
        setView({ ...view, cursor: Math.min(view.cursor + 1, MENU_ITEMS.length - 1) });
        return;
      }
      if (char === "k" || key.upArrow) {
        setView({ ...view, cursor: Math.max(0, view.cursor - 1) });
        return;
      }
      if (key.return) { selectMenuItem(view.cursor); return; }
    }

    // Back / quit
    if (key.escape || char === "q") {
      if (view.type === "menu") {
        exit();
      } else {
        setView({ type: "menu", cursor: 0 });
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta">
      <Header view={view} />
      <Box borderStyle="single" borderColor="gray" flexGrow={1} flexDirection="column">
        {view.type === "menu" && <MenuView cursor={view.cursor} />}
        {view.type === "list" && (
          <ListView sessions={view.sessions} cursor={view.cursor} scrollOffset={view.scrollOffset} />
        )}
        {view.type === "search_input" && (
          <TextInputView
            label="Search sessions"
            hint="type to search · enter to run · esc to cancel"
            query={view.query}
          />
        )}
        {view.type === "search_results" && (
          <ListView
            sessions={view.sessions}
            cursor={view.cursor}
            scrollOffset={view.scrollOffset}
            header={
              <Box paddingX={1} marginBottom={1}>
                <Text color="gray">results for <Text color="cyan">"{view.query}"</Text> · {view.sessions.length} found</Text>
              </Box>
            }
          />
        )}
        {view.type === "show" && (
          <SessionDetailView session={view.session} scrollOffset={view.scrollOffset} webUrl={webUrlRef.current} />
        )}
        {view.type === "decisions_input" && (
          <TextInputView
            label="Decision Log — filter by repo name (leave empty to load all)"
            hint="type repo name or press enter for all · esc to cancel"
            query={view.query}
          />
        )}
        {view.type === "decisions" && (
          <DecisionsView
            decisions={view.decisions}
            sessions_analyzed={view.sessions_analyzed}
            repo={view.repo}
            cursor={view.cursor}
            scrollOffset={view.scrollOffset}
          />
        )}
      </Box>
      <StatusBar status={status} />
    </Box>
  );
}
