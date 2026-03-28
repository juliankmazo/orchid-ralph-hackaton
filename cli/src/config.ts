export function getConfig() {
  const apiUrl = process.env.ORCHID_API_URL;
  const apiKey = process.env.ORCHID_API_KEY;

  if (!apiUrl) {
    console.error("Error: ORCHID_API_URL environment variable is required");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Error: ORCHID_API_KEY environment variable is required");
    process.exit(1);
  }

  return { apiUrl, apiKey };
}
