import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CONFIG_FILE = path.join(os.homedir(), ".orchid", "config.json");

function readConfigFile(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function getConfig() {
  const file = readConfigFile();

  const apiUrl = process.env.ORCHID_API_URL || file.api_url;
  const apiKey = process.env.ORCHID_API_KEY || file.api_key;

  if (!apiUrl) {
    console.error(
      'Error: ORCHID_API_URL not set. Run "orchid config" to set up.'
    );
    process.exit(1);
  }
  if (!apiKey) {
    console.error(
      'Error: ORCHID_API_KEY not set. Run "orchid config" to set up.'
    );
    process.exit(1);
  }

  const webUrl = process.env.ORCHID_WEB_URL || file.web_url || apiUrl.replace(/:3000$/, "");
  return { apiUrl, apiKey, webUrl };
}
