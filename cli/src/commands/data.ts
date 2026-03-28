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

async function dataList(): Promise<void> {
  const sessions = await fetchSessions();
  printTable(sessions);
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
    default:
      console.error(`Unknown data command: ${subcommand}`);
      console.error('Run "orchid data --help" for usage.');
      process.exit(1);
  }
}
