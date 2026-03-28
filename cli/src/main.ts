import { runClaude } from "./commands/claude";
import { runData } from "./commands/data";
import { runReview } from "./commands/review";
import { runExplain } from "./commands/explain";

const VERSION = "0.1.0";

const HELP = `orchid - capture and query AI coding sessions

Usage:
  orchid <command> [options]

Commands:
  claude    Launch Claude Code and sync the conversation
  data      Query stored sessions (list, show, search, summary)
  review    Conversation-aware code review
  explain   Explain why a commit was made

Options:
  --help      Show this help message
  --version   Show version

Environment:
  ORCHID_API_URL   Server URL (required)
  ORCHID_API_KEY   API key for authentication (required)
  OPENAI_API_KEY   For AI-powered review summaries (optional)
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
