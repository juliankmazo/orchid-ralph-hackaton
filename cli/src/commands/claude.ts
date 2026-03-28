import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export interface GitMetadata {
  user_name: string;
  user_email: string;
  branch: string;
  git_remotes: string[];
  working_dir: string;
}

function execGit(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function isGitRepo(dir: string): boolean {
  return execGit("rev-parse --git-dir", dir) !== "";
}

function collectRemotes(workingDir: string): string[] {
  const remotes: string[] = [];

  // Collect origin URL from the working directory itself
  if (isGitRepo(workingDir)) {
    const origin = execGit("remote get-url origin", workingDir);
    if (origin) {
      remotes.push(origin);
    }
  }

  // Check immediate subdirectories for git repos
  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const subDir = path.join(workingDir, entry.name);
      if (isGitRepo(subDir)) {
        const origin = execGit("remote get-url origin", subDir);
        if (origin && !remotes.includes(origin)) {
          remotes.push(origin);
        }
      }
    }
  } catch {
    // Directory not readable — skip
  }

  return remotes;
}

export function collectGitMetadata(): GitMetadata {
  const workingDir = process.cwd();

  const user_name = execGit("config user.name") || "unknown";
  const user_email = execGit("config user.email") || "unknown";

  let branch = execGit("rev-parse --abbrev-ref HEAD", workingDir);
  if (!branch || branch === "HEAD") {
    branch = "detached";
  }

  const git_remotes = collectRemotes(workingDir);

  return {
    user_name,
    user_email,
    branch,
    git_remotes,
    working_dir: workingDir,
  };
}

export function runClaude(_args: string[]): void {
  const metadata = collectGitMetadata();

  process.stderr.write(`[orchid] user: ${metadata.user_name} <${metadata.user_email}>\n`);
  process.stderr.write(`[orchid] branch: ${metadata.branch}\n`);
  process.stderr.write(`[orchid] working_dir: ${metadata.working_dir}\n`);
  process.stderr.write(`[orchid] git_remotes: ${metadata.git_remotes.length > 0 ? metadata.git_remotes.join(", ") : "(none)"}\n`);

  // Future stories will spawn claude and sync transcripts here
  console.log("orchid claude: metadata collected, launch not yet implemented");
}
