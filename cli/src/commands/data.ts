import * as path from "path";
import { getConfig } from "../config";

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
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function truncateDir(dir: string): string {
  return path.basename(dir);
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

async function fetchSessions(): Promise<Session[]> {
  const { apiUrl, apiKey } = getConfig();
  const url = `${apiUrl.replace(/\/$/, "")}/sessions`;
  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} returned ${res.status}: ${text}`);
  }
  return (await res.json()) as Session[];
}

function printTable(sessions: Session[]): void {
  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  const header = [
    padRight("ID", 14),
    padRight("USER", 16),
    padRight("DIR", 20),
    padRight("TIME", 10),
    padRight("MESSAGES", 10),
    padRight("STATUS", 8),
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const s of sessions) {
    const msgCount = s.transcript
      ? `${s.transcript.split("\n").filter((l) => l.trim()).length} messages`
      : "? messages";

    const row = [
      padRight(shortId(s.id), 14),
      padRight(s.user_name || "unknown", 16),
      padRight(truncateDir(s.working_dir || ""), 20),
      padRight(timeAgo(s.updated_at || s.started_at), 10),
      padRight(msgCount, 10),
      padRight(s.status || "unknown", 8),
    ].join("  ");

    console.log(row);
  }
}

async function fetchSession(sessionId: string): Promise<Session> {
  const { apiUrl, apiKey } = getConfig();
  const url = `${apiUrl.replace(/\/$/, "")}/sessions/${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey },
  });
  if (res.status === 404) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} returned ${res.status}: ${text}`);
  }
  return (await res.json()) as Session;
}

interface JsonlMessage {
  type?: string;
  role?: string;
  message?: { role?: string; content?: unknown };
  content?: unknown;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: string }) => {
        if (typeof block === "string") return block;
        if (block && block.type === "text" && typeof block.text === "string") return block.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

interface Turn {
  role: string;
  text: string;
}

function parseTranscriptTurns(transcript: string): Turn[] {
  const turns: Turn[] = [];
  const lines = transcript.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as JsonlMessage;

      // Claude Code JSONL format: messages have a type and role, or a message object
      let role: string | undefined;
      let text = "";

      if (obj.type === "human" || obj.role === "human" || obj.role === "user") {
        role = "user";
        text = extractTextContent(obj.content || (obj.message && obj.message.content));
      } else if (obj.type === "assistant" || obj.role === "assistant") {
        role = "assistant";
        text = extractTextContent(obj.content || (obj.message && obj.message.content));
      } else if (obj.message) {
        role = obj.message.role || "unknown";
        text = extractTextContent(obj.message.content);
      }

      if (role && text) {
        turns.push({ role, text });
      }
    } catch {
      // skip non-JSON lines
    }
  }

  return turns;
}

async function dataList(): Promise<void> {
  const sessions = await fetchSessions();
  printTable(sessions);
}

async function dataShow(args: string[]): Promise<void> {
  const sessionId = args.find((a) => !a.startsWith("-"));
  if (!sessionId) {
    console.error("Usage: orchid data show <session_id> [--turns|--summary]");
    process.exit(1);
  }

  const flags = args.filter((a) => a.startsWith("-"));
  const showTurns = flags.includes("--turns");
  const showSummary = flags.includes("--summary");

  const session = await fetchSession(sessionId);

  if (showSummary) {
    // Print metadata header
    console.log(`Session: ${session.id}`);
    console.log(`User: ${session.user_name || "unknown"} <${session.user_email || "unknown"}>`);
    console.log(`Branch: ${session.branch || "unknown"}`);
    console.log(`Dir: ${session.working_dir || "unknown"}`);
    console.log(`Status: ${session.status || "unknown"}`);
    console.log(`Started: ${session.started_at || "unknown"}`);
    console.log(`Updated: ${session.updated_at || "unknown"}`);
    console.log("");

    if (session.transcript) {
      const turns = parseTranscriptTurns(session.transcript);
      const firstUser = turns.find((t) => t.role === "user");
      const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");

      if (firstUser) {
        console.log("--- First user message ---");
        console.log(firstUser.text);
        console.log("");
      }
      if (lastAssistant) {
        console.log("--- Last assistant message ---");
        console.log(lastAssistant.text);
      }
      if (!firstUser && !lastAssistant) {
        console.log("(no parseable messages in transcript)");
      }
    } else {
      console.log("(no transcript available)");
    }
    return;
  }

  if (showTurns) {
    if (!session.transcript) {
      console.log("(no transcript available)");
      return;
    }
    const turns = parseTranscriptTurns(session.transcript);
    if (turns.length === 0) {
      console.log("(no parseable messages in transcript)");
      return;
    }
    for (const turn of turns) {
      console.log(`[${turn.role}]`);
      console.log(turn.text);
      console.log("");
    }
    return;
  }

  // Default: raw transcript
  if (session.transcript) {
    process.stdout.write(session.transcript);
  } else {
    console.log("(no transcript available)");
  }
}

export function runData(args: string[]): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(`orchid data - query stored sessions

Usage:
  orchid data <command>

Commands:
  list      List all stored sessions
  show      Show a session transcript
  search    Search across sessions`);
    return;
  }

  switch (subcommand) {
    case "list":
      dataList().catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      break;
    case "show":
      dataShow(args.slice(1)).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      break;
    default:
      console.error(`Unknown data command: ${subcommand}`);
      console.error('Run "orchid data --help" for usage.');
      process.exit(1);
  }
}
