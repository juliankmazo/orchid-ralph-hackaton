/**
 * End-to-end smoke test for the Orchid capture→store→query flow.
 *
 * Requires ORCHID_API_URL and ORCHID_API_KEY env vars pointing at a running server.
 * Run with: npm run test:e2e
 */

const API_URL = process.env.ORCHID_API_URL;
const API_KEY = process.env.ORCHID_API_KEY;

if (!API_URL || !API_KEY) {
  console.error("Error: ORCHID_API_URL and ORCHID_API_KEY must be set");
  process.exit(1);
}

const BASE = API_URL.replace(/\/$/, "");
const HEADERS = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

const TEST_SESSION_ID = `e2e-test-${Date.now()}`;
const SEARCH_TERM = "orchid_e2e_unique_marker";

const FAKE_TRANSCRIPT = [
  JSON.stringify({ type: "human", content: `Hello, this is an ${SEARCH_TERM} test message` }),
  JSON.stringify({ type: "assistant", content: "I received your test message. How can I help?" }),
  JSON.stringify({ type: "human", content: "Just verifying the E2E flow works correctly." }),
  JSON.stringify({ type: "assistant", content: "The flow is working as expected!" }),
].join("\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function run(): Promise<void> {
  console.log(`\nOrchid E2E Smoke Test`);
  console.log(`Server: ${BASE}`);
  console.log(`Session ID: ${TEST_SESSION_ID}\n`);

  // Step 1: PUT /sessions/:id — create session with fake transcript
  console.log("1. PUT /sessions/:id — create session");
  const putRes = await fetch(`${BASE}/sessions/${TEST_SESSION_ID}`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({
      user_name: "e2e-tester",
      user_email: "e2e@test.orchid",
      working_dir: "/tmp/orchid-e2e",
      git_remotes: ["https://github.com/test/orchid-e2e.git"],
      branch: "main",
      tool: "test",
      transcript: FAKE_TRANSCRIPT,
      status: "done",
    }),
  });
  assert(putRes.status === 200, `PUT returns 200 (got ${putRes.status})`);
  const putBody = (await putRes.json()) as { id: string };
  assert(putBody.id === TEST_SESSION_ID, "PUT response contains correct session ID");

  // Step 2: GET /sessions — list sessions and verify ours appears
  console.log("\n2. GET /sessions — verify session appears in list");
  const listRes = await fetch(`${BASE}/sessions`, { headers: HEADERS });
  assert(listRes.status === 200, `GET /sessions returns 200 (got ${listRes.status})`);
  const sessions = (await listRes.json()) as Array<{ id: string; transcript?: string }>;
  const found = sessions.find((s) => s.id === TEST_SESSION_ID);
  assert(!!found, "Session appears in list");
  assert(!found?.transcript, "List endpoint does not include transcript");

  // Step 3: GET /sessions/:id — retrieve full session
  console.log("\n3. GET /sessions/:id — verify full session with transcript");
  const getRes = await fetch(`${BASE}/sessions/${TEST_SESSION_ID}`, { headers: HEADERS });
  assert(getRes.status === 200, `GET /sessions/:id returns 200 (got ${getRes.status})`);
  const session = (await getRes.json()) as { id: string; transcript: string; user_name: string; status: string };
  assert(session.id === TEST_SESSION_ID, "Session ID matches");
  assert(session.transcript === FAKE_TRANSCRIPT, "Transcript matches what was sent");
  assert(session.user_name === "e2e-tester", "User name matches");
  assert(session.status === "done", "Status is done");

  // Step 4: GET /sessions?q=<term> — search for session
  console.log("\n4. GET /sessions?q=<term> — search for session");
  const searchRes = await fetch(`${BASE}/sessions?q=${encodeURIComponent(SEARCH_TERM)}`, {
    headers: HEADERS,
  });
  assert(searchRes.status === 200, `GET /sessions?q= returns 200 (got ${searchRes.status})`);
  const searchResults = (await searchRes.json()) as Array<{ id: string }>;
  const searchFound = searchResults.find((s) => s.id === TEST_SESSION_ID);
  assert(!!searchFound, `Search for "${SEARCH_TERM}" finds the session`);

  // Step 5: Verify 404 for non-existent session
  console.log("\n5. GET /sessions/:id — verify 404 for missing session");
  const missingRes = await fetch(`${BASE}/sessions/nonexistent-session-id`, { headers: HEADERS });
  assert(missingRes.status === 404, `GET non-existent session returns 404 (got ${missingRes.status})`);

  // Summary
  console.log(`\n---\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("E2E test crashed:", err);
  process.exit(1);
});
