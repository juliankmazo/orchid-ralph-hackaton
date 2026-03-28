import { runClaude } from "./commands/claude";
import { runData } from "./commands/data";

const VERSION = "0.1.0";

const HELP = `orchid - capture and query AI coding sessions

Usage:
  orchid <command> [options]

Commands:
  claude    Launch Claude Code and sync the conversation
  data      Query stored sessions (list, show, search)

Options:
  --help      Show this help message
  --version   Show version

Environment:
  ORCHID_API_URL   Server URL (required)
  ORCHID_API_KEY   API key for authentication (required)
`;

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
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
    case "data":
      runData(subArgs);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "orchid --help" for usage.');
      process.exit(1);
  }
}

main();
