import { assertEquals, assertExists } from "@std/assert";
import {
  extractSessionMetadata,
  parseTranscript,
  readJsonlStream,
} from "../src/services/session-parser.ts";

const FIXTURE_PATH = new URL("./fixtures/sample-session.jsonl", import.meta.url).pathname;

Deno.test("readJsonlStream yields parsed lines and skips malformed", async () => {
  const lines = [];
  for await (const line of readJsonlStream(FIXTURE_PATH)) {
    lines.push(line);
  }
  // Fixture has 8 valid JSON lines + 1 malformed line
  assertEquals(lines.length, 8);
  assertEquals(lines[0].type, "file-history-snapshot");
  assertEquals(lines[1].type, "user");
  assertEquals(lines[7].type, "progress");
});

Deno.test("extractSessionMetadata returns correct summary", async () => {
  const meta = await extractSessionMetadata(FIXTURE_PATH, "session-abc-123", "test-project");

  assertEquals(meta.id, "session-abc-123");
  assertEquals(meta.projectId, "test-project");
  assertEquals(meta.summary, "Add a login page with email and password fields");
  assertEquals(meta.gitBranch, "feat/login");
  assertEquals(meta.model, "claude-sonnet-4-20250514");
});

Deno.test("extractSessionMetadata counts messages correctly (excludes meta and non-display)", async () => {
  const meta = await extractSessionMetadata(FIXTURE_PATH, "session-abc-123", "test-project");

  // Displayable non-meta messages:
  // - usr-0002 (user, not meta) -> 1
  // - ast-0001 (assistant) -> 2
  // - usr-0003 (user, tool_result content) -> 3
  // - ast-0002 (assistant) -> 4
  // - sys-0001 (system) -> 5
  // Excluded: file-history-snapshot, usr-0001 (isMeta), progress
  assertEquals(meta.messageCount, 5);
});

Deno.test("extractSessionMetadata counts tool calls and tokens", async () => {
  const meta = await extractSessionMetadata(FIXTURE_PATH, "session-abc-123", "test-project");

  // One tool_use block in ast-0001
  assertEquals(meta.toolCallCount, 1);
  // Output tokens: 150 (ast-0001) + 80 (ast-0002) = 230
  assertEquals(meta.totalTokens, 230);
});

Deno.test("extractSessionMetadata tracks timestamps", async () => {
  const meta = await extractSessionMetadata(FIXTURE_PATH, "session-abc-123", "test-project");

  assertEquals(meta.firstTimestamp, "2026-03-28T10:00:00.000Z");
  assertEquals(meta.lastTimestamp, "2026-03-28T10:00:12.000Z");
});

Deno.test("parseTranscript filters non-display types and isMeta", async () => {
  const entries = await parseTranscript(FIXTURE_PATH);

  // Should not include: file-history-snapshot, isMeta user, progress
  const types = entries.map((e) => e.type);
  assertEquals(types.includes("user"), true);
  assertEquals(types.includes("assistant"), true);
  assertEquals(types.includes("system"), true);

  // No entry should have uuid starting with "fhs-" or "prg-"
  for (const entry of entries) {
    assertEquals(entry.uuid.startsWith("fhs-"), false);
    assertEquals(entry.uuid.startsWith("prg-"), false);
  }

  // The isMeta user message (usr-0001) should not appear
  const userUuids = entries.filter((e) => e.type === "user").map((e) => e.uuid);
  assertEquals(userUuids.includes("usr-0001"), false);
});

Deno.test("parseTranscript pairs tool_use with tool_result", async () => {
  const entries = await parseTranscript(FIXTURE_PATH);

  // Find the assistant entry with tool calls
  const assistantWithTools = entries.find(
    (e) => e.type === "assistant" && e.toolCalls.length > 0,
  );
  assertExists(assistantWithTools);
  assertEquals(assistantWithTools!.toolCalls.length, 1);

  const toolCall = assistantWithTools!.toolCalls[0];
  assertEquals(toolCall.name, "write_file");
  assertEquals(toolCall.id, "tu-0001");
  assertEquals(toolCall.result, "File written successfully");
  assertEquals(toolCall.isError, false);
});

Deno.test("parseTranscript extracts text from assistant messages", async () => {
  const entries = await parseTranscript(FIXTURE_PATH);

  const assistants = entries.filter((e) => e.type === "assistant");
  assertEquals(assistants.length, 2);

  assertEquals(assistants[0].text, "I'll create a login page for you.");
  assertEquals(assistants[0].model, "claude-sonnet-4-20250514");
  assertExists(assistants[0].tokens);
  assertEquals(assistants[0].tokens!.output, 150);

  assertEquals(
    assistants[1].text,
    "I've created the login page with email and password fields. The component is at src/login.tsx.",
  );
});

Deno.test("parseTranscript skips pure tool_result user messages", async () => {
  const entries = await parseTranscript(FIXTURE_PATH);

  // usr-0003 is a pure tool_result message - should not appear as a user entry
  const userEntries = entries.filter((e) => e.type === "user");
  const hasToolResultOnly = userEntries.some((e) => e.uuid === "usr-0003");
  assertEquals(hasToolResultOnly, false);
});

Deno.test("parseTranscript handles system messages", async () => {
  const entries = await parseTranscript(FIXTURE_PATH);

  const systemEntries = entries.filter((e) => e.type === "system");
  assertEquals(systemEntries.length, 1);
  assertEquals(systemEntries[0].text, "Session paused");
});
