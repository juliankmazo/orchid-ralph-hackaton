import React from "react";
import { render } from "ink";
import { runClaude } from "./commands/claude";
import { runData } from "./commands/data";
import { runReview } from "./commands/review";
import { runExplain } from "./commands/explain";
import { runConfig } from "./commands/config";
import { App } from "./tui/App";

const VERSION = "0.1.0";

function launchTUI() {
  const { waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: true,
  });
  waitUntilExit().then(() => process.exit(0)).catch(() => process.exit(1));
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // No args → launch interactive TUI
  if (!command) {
    launchTUI();
    return;
  }

  if (command === "--help" || command === "-h") {
    console.log(`orchid - capture and query AI coding sessions

Usage:
  orchid              Launch interactive TUI (recommended)
  orchid <command>    Run a specific command

Commands:
  claude    Launch Claude Code and sync the conversation
  config    Configure CLI (~/.orchid/config.json)
  data      Query stored sessions (list, show, search, decisions)
  review    Conversation-aware code review
  explain   Explain why a commit was made

Options:
  --help      Show this help
  --version   Show version

TUI slash commands (in interactive mode):
  /list                List all sessions
  /search <query>      Search sessions
  /show <id>           Show session detail
  /decisions [repo]    AI-extracted decision log
  /help                Show help
`);
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    process.exit(0);
  }

  const subArgs = args.slice(1);

  switch (command) {
    case "claude":
      runClaude(subArgs);
      break;
    case "config":
      runConfig(subArgs).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      break;
    case "data":
      runData(subArgs);
      break;
    case "review":
      runReview(subArgs).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      break;
    case "explain":
      runExplain(subArgs).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "orchid --help" for usage.');
      process.exit(1);
  }
}

main();
