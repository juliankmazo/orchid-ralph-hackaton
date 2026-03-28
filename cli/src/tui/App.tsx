import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp, Newline } from "ink";
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
  | { type: "home" }
  | { type: "list"; sessions: Session[]; cursor: number }
  | { type: "show"; session: Session }
  | { type: "search"; query: string; sessions: Session[]; cursor: number }
  | { type: "decisions"; repo?: string; decisions: Decision[]; sessions_analyzed: number; cursor: number }
  | { type: "help" };

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

async function apiFetch<T>(path: string): Promise<T> {
  const { apiUrl, apiKey } = getConfig();
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
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
          return c.map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : "")).filter(Boolean).join("\n");
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
    } catch { /* skip */ }
  }
  return turns;
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function StatusBar({ input, status }: { input: string; status: Status }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row" gap={1}>
      {status.type === "loading" ? (
        <>
          <Text color="magenta"><Spinner type="dots" /></Text>
          <Text color="gray">{status.msg}</Text>
        </>
      ) : status.type === "error" ? (
        <Text color="red">{status.msg}</Text>
      ) : (
        <>
          <Text color="magenta">›</Text>
          <Text>{input || " "}</Text>
          <Text color="gray" dimColor> type /help for commands</Text>
        </>
      )}
    </Box>
  );
}

function Header({ view }: { view: View }) {
  const breadcrumb =
    view.type === "home" ? "home" :
    view.type === "list" ? "sessions" :
    view.type === "show" ? "sessions › detail" :
    view.type === "search" ? "search" :
    view.type === "decisions" ? "decision log" :
    "help";

  return (
    <Box flexDirection="row" gap={2} paddingX={1} paddingY={0}>
      <Text bold color="magenta">orchid</Text>
      <Text color="gray">›</Text>
      <Text color="white">{breadcrumb}</Text>
    </Box>
  );
}

function SessionRow({ session, selected }: { session: Session; selected: boolean }) {
  const status = session.status === "active";
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
      {status && <Text color="green">● live</Text>}
    </Box>
  );
}

function ListView({ sessions, cursor }: { sessions: Session[]; cursor: number }) {
  if (sessions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">No sessions found. Run `orchid claude` to start one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingY={0}>
        <Text color="gray" dimColor>  {"ID".padEnd(14)}{"USER".padEnd(16)}{"DIR".padEnd(22)}{"BRANCH".padEnd(20)}AGO</Text>
      </Box>
      {sessions.map((s, i) => (
        <SessionRow key={s.id} session={s} selected={i === cursor} />
      ))}
      <Box marginTop={1} paddingX={1}>
        <Text color="gray" dimColor>j/k navigate · enter open · q back</Text>
      </Box>
    </Box>
  );
}

function SessionDetailView({ session }: { session: Session }) {
  const turns = session.transcript ? parseTranscriptTurns(session.transcript) : [];
  const { webUrl, apiUrl } = getConfig();
  const base = (webUrl || apiUrl).replace(/\/$/, "").replace(/:3000$/, "");
  const link = `${base}/sessions/${encodeURIComponent(session.id)}`;

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

      {turns.slice(0, 6).map((t, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text color={t.role === "user" ? "cyan" : "magenta"} bold>
            {t.role === "user" ? "▶ user" : "◀ claude"} #{i + 1}
          </Text>
          <Box paddingLeft={2}>
            <Text color="white" wrap="wrap">{truncate(t.text, 200)}</Text>
          </Box>
        </Box>
      ))}

      {turns.length > 6 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>…and {turns.length - 6} more turns</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>open in browser:</Text>
        <Text color="blue" underline>{link}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>q back</Text>
      </Box>
    </Box>
  );
}

function DecisionRow({ d, selected, index }: { d: Decision; selected: boolean; index: number }) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} marginBottom={1}>
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

function DecisionsView({ decisions, sessions_analyzed, repo, cursor }: { decisions: Decision[]; sessions_analyzed: number; repo?: string; cursor: number }) {
  if (decisions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column" gap={1}>
        <Text color="gray">No decisions found{repo ? ` for "${repo}"` : ""}.</Text>
        <Text color="gray" dimColor>Try: /decisions or /decisions &lt;repo-name&gt;</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={1}>
        <Text color="gray">
          <Text color="white" bold>{decisions.length}</Text> decisions · <Text color="white">{sessions_analyzed}</Text> sessions analyzed{repo ? ` · repo: ${repo}` : ""}
        </Text>
      </Box>
      {decisions.map((d, i) => (
        <DecisionRow key={i} d={d} selected={i === cursor} index={i} />
      ))}
      <Box paddingX={1}>
        <Text color="gray" dimColor>j/k navigate · q back</Text>
      </Box>
    </Box>
  );
}

function HelpView() {
  const commands = [
    { cmd: "/list", desc: "List all sessions" },
    { cmd: "/search <query>", desc: "Search across sessions" },
    { cmd: "/show <id>", desc: "Show session detail (or press enter on /list)" },
    { cmd: "/decisions [repo]", desc: "AI-extracted architectural decision log" },
    { cmd: "/help", desc: "Show this help" },
    { cmd: "q / esc", desc: "Go back / quit" },
    { cmd: "j / k", desc: "Navigate up/down in lists" },
    { cmd: "enter", desc: "Open selected item" },
    { cmd: "ctrl+c", desc: "Exit orchid" },
  ];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="magenta">orchid slash commands</Text>
      <Text color="gray" dimColor>Type a command in the input bar below</Text>
      <Box flexDirection="column" gap={0} marginTop={1}>
        {commands.map(({ cmd, desc }) => (
          <Box key={cmd} flexDirection="row" gap={2}>
            <Text color="cyan">{cmd.padEnd(24)}</Text>
            <Text color="gray">{desc}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function HomeView() {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={2} gap={1}>
      <Text bold color="magenta">🌸 orchid</Text>
      <Text color="gray">Capture and query AI coding sessions.</Text>
      <Newline />
      <Text color="gray" dimColor>Quick start:</Text>
      <Box flexDirection="column" gap={0} marginLeft={2}>
        <Text color="cyan">/list</Text>
        <Text color="cyan">/search jwt</Text>
        <Text color="cyan">/decisions my-project</Text>
        <Text color="cyan">/help</Text>
      </Box>
      <Newline />
      <Text color="gray" dimColor>Start a session:  <Text color="white">orchid claude</Text></Text>
    </Box>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>({ type: "home" });
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith("/")) {
      setStatus({ type: "error", msg: `Unknown input. Commands start with /. Try /help` });
      setTimeout(() => setStatus({ type: "idle" }), 3000);
      return;
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const rest = parts.slice(1).join(" ");

    try {
      switch (command) {
        case "list": {
          setStatus({ type: "loading", msg: "Fetching sessions…" });
          const sessions = await apiFetch<Session[]>("/sessions");
          setStatus({ type: "idle" });
          setView({ type: "list", sessions, cursor: 0 });
          break;
        }
        case "search": {
          if (!rest) {
            setStatus({ type: "error", msg: "Usage: /search <query>" });
            setTimeout(() => setStatus({ type: "idle" }), 3000);
            break;
          }
          setStatus({ type: "loading", msg: `Searching for "${rest}"…` });
          const sessions = await apiFetch<Session[]>(`/sessions?q=${encodeURIComponent(rest)}`);
          setStatus({ type: "idle" });
          setView({ type: "search", query: rest, sessions, cursor: 0 });
          break;
        }
        case "show": {
          const id = rest;
          if (!id) {
            setStatus({ type: "error", msg: "Usage: /show <session_id>" });
            setTimeout(() => setStatus({ type: "idle" }), 3000);
            break;
          }
          setStatus({ type: "loading", msg: `Loading session ${id}…` });
          const session = await apiFetch<Session>(`/sessions/${encodeURIComponent(id)}`);
          setStatus({ type: "idle" });
          setView({ type: "show", session });
          break;
        }
        case "decisions": {
          const repo = rest || undefined;
          const path = repo ? `/decisions?repo=${encodeURIComponent(repo)}` : "/decisions";
          setStatus({ type: "loading", msg: `Extracting decisions${repo ? ` for "${repo}"` : ""}…` });
          const result = await apiFetch<{ decisions: Decision[]; sessions_analyzed: number }>(path);
          setStatus({ type: "idle" });
          setView({ type: "decisions", repo, decisions: result.decisions, sessions_analyzed: result.sessions_analyzed, cursor: 0 });
          break;
        }
        case "help": {
          setView({ type: "help" });
          setStatus({ type: "idle" });
          break;
        }
        default: {
          setStatus({ type: "error", msg: `Unknown command: /${command}. Try /help` });
          setTimeout(() => setStatus({ type: "idle" }), 3000);
        }
      }
    } catch (err) {
      setStatus({ type: "error", msg: (err as Error).message });
      setTimeout(() => setStatus({ type: "idle" }), 4000);
    }
  }, []);

  const openSelected = useCallback(async () => {
    if (view.type === "list" || view.type === "search") {
      const { sessions, cursor } = view;
      const session = sessions[cursor];
      if (!session) return;
      setStatus({ type: "loading", msg: `Loading session…` });
      try {
        const full = await apiFetch<Session>(`/sessions/${encodeURIComponent(session.id)}`);
        setStatus({ type: "idle" });
        setView({ type: "show", session: full });
      } catch (err) {
        setStatus({ type: "error", msg: (err as Error).message });
        setTimeout(() => setStatus({ type: "idle" }), 3000);
      }
    }
  }, [view]);

  useInput((char, key) => {
    if (status.type === "loading") return;

    // Navigation keys in list/decisions views
    const isList = view.type === "list" || view.type === "search";
    const isDecisions = view.type === "decisions";

    if (isList && !input) {
      if (char === "j" || key.downArrow) {
        if (view.type === "list") {
          setView({ ...view, cursor: Math.min(view.cursor + 1, view.sessions.length - 1) });
        } else if (view.type === "search") {
          setView({ ...view, cursor: Math.min(view.cursor + 1, view.sessions.length - 1) });
        }
        return;
      }
      if (char === "k" || key.upArrow) {
        if (view.type === "list") {
          setView({ ...view, cursor: Math.max(0, view.cursor - 1) });
        } else if (view.type === "search") {
          setView({ ...view, cursor: Math.max(0, view.cursor - 1) });
        }
        return;
      }
      if (key.return) {
        openSelected();
        return;
      }
    }

    if (isDecisions && !input) {
      if (char === "j" || key.downArrow) {
        const v = view as { type: "decisions"; decisions: Decision[]; cursor: number; repo?: string; sessions_analyzed: number };
        setView({ ...v, cursor: Math.min(v.cursor + 1, v.decisions.length - 1) });
        return;
      }
      if (char === "k" || key.upArrow) {
        const v = view as { type: "decisions"; decisions: Decision[]; cursor: number; repo?: string; sessions_analyzed: number };
        setView({ ...v, cursor: Math.max(0, v.cursor - 1) });
        return;
      }
    }

    // Backspace
    if (key.backspace || key.delete) {
      if (input.length > 0) {
        setInput((prev) => prev.slice(0, -1));
      } else if (view.type !== "home") {
        setView({ type: "home" });
        setStatus({ type: "idle" });
      }
      return;
    }

    // Submit on Enter
    if (key.return) {
      if (input.trim()) {
        const cmd = input;
        setInput("");
        runCommand(cmd);
      }
      return;
    }

    // Quit
    if ((char === "q" || key.escape) && !input) {
      if (view.type === "home") {
        exit();
      } else {
        setView({ type: "home" });
        setStatus({ type: "idle" });
      }
      return;
    }

    // ctrl+c handled by Ink natively

    // Type into input
    if (char && !key.ctrl && !key.meta) {
      setInput((prev) => prev + char);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta">
      <Header view={view} />
      <Box borderStyle="single" borderColor="gray" flexGrow={1} flexDirection="column" paddingY={0}>
        {view.type === "home" && <HomeView />}
        {view.type === "list" && <ListView sessions={view.sessions} cursor={view.cursor} />}
        {view.type === "search" && (
          <Box flexDirection="column">
            <Box paddingX={1} marginBottom={1}>
              <Text color="gray">results for <Text color="cyan">"{view.query}"</Text> · {view.sessions.length} found</Text>
            </Box>
            <ListView sessions={view.sessions} cursor={view.cursor} />
          </Box>
        )}
        {view.type === "show" && <SessionDetailView session={view.session} />}
        {view.type === "decisions" && (
          <DecisionsView
            decisions={view.decisions}
            sessions_analyzed={view.sessions_analyzed}
            repo={view.repo}
            cursor={view.cursor}
          />
        )}
        {view.type === "help" && <HelpView />}
      </Box>
      <StatusBar input={input} status={status} />
    </Box>
  );
}
