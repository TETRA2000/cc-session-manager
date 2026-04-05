import { assertEquals } from "@std/assert";
import type { TranscriptEntry } from "../src/types.ts";
import {
  classifyImportance,
  extractTimelineEntries,
} from "../src/services/session-parser.ts";

const FIXTURE_PATH = new URL("./fixtures/sample-session.jsonl", import.meta.url).pathname;

// ─── classifyImportance tests ───

function makeEntry(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    uuid: "test-uuid",
    type: "assistant",
    text: "Some response text",
    toolCalls: [],
    model: "claude-sonnet-4",
    timestamp: "2026-03-28T10:00:00.000Z",
    tokens: null,
    ...overrides,
  };
}

Deno.test("classifyImportance: assistant question (ends with ?) is high + attention when last in active session", () => {
  const entry = makeEntry({ text: "Should I proceed with the changes?" });
  const result = classifyImportance(entry, true);
  assertEquals(result.importance, "high");
  assertEquals(result.isAttention, true);
});

Deno.test("classifyImportance: assistant question is normal when not last in active session (already answered)", () => {
  const entry = makeEntry({ text: "Should I proceed with the changes?" });
  const result = classifyImportance(entry, false);
  assertEquals(result.importance, "normal");
  assertEquals(result.isAttention, false);
});

Deno.test("classifyImportance: AskUserQuestion tool use is high + attention when last in active session", () => {
  const entry = makeEntry({
    text: "I have a question for you.",
    toolCalls: [{ id: "tu-1", name: "AskUserQuestion", input: {} }],
  });
  const result = classifyImportance(entry, true);
  assertEquals(result.importance, "high");
  assertEquals(result.isAttention, true);
});

Deno.test("classifyImportance: error tool result is high", () => {
  const entry = makeEntry({
    text: "The command failed",
    toolCalls: [{ id: "tu-1", name: "Bash", input: {}, isError: true }],
  });
  const result = classifyImportance(entry, false);
  assertEquals(result.importance, "high");
  assertEquals(result.isAttention, false);
});

Deno.test("classifyImportance: error tool result is high + attention when last in active", () => {
  const entry = makeEntry({
    text: "The command failed",
    toolCalls: [{ id: "tu-1", name: "Bash", input: {}, isError: true }],
  });
  const result = classifyImportance(entry, true);
  assertEquals(result.importance, "high");
  assertEquals(result.isAttention, true);
});

Deno.test("classifyImportance: user message is always normal", () => {
  const entry = makeEntry({ type: "user", text: "Fix the bug" });
  const result = classifyImportance(entry, true);
  assertEquals(result.importance, "normal");
  assertEquals(result.isAttention, false);
});

Deno.test("classifyImportance: tool-only assistant message (no text) is low", () => {
  const entry = makeEntry({
    text: null,
    toolCalls: [{ id: "tu-1", name: "Read", input: {} }],
  });
  const result = classifyImportance(entry, false);
  assertEquals(result.importance, "low");
  assertEquals(result.isAttention, false);
});

Deno.test("classifyImportance: normal assistant text response", () => {
  const entry = makeEntry({ text: "I've updated the file." });
  const result = classifyImportance(entry, false);
  assertEquals(result.importance, "normal");
  assertEquals(result.isAttention, false);
});

Deno.test("classifyImportance: system message is high", () => {
  const entry = makeEntry({ type: "system", text: "Session paused" });
  const result = classifyImportance(entry, false);
  assertEquals(result.importance, "high");
  assertEquals(result.isAttention, false);
});

// ─── extractTimelineEntries tests ───

Deno.test("extractTimelineEntries: extracts displayable entries from JSONL", async () => {
  const result = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project");
  const entries = result.entries;

  const types = entries.map((e) => e.type);
  assertEquals(types.includes("user"), true);
  assertEquals(types.includes("assistant"), true);

  for (const e of entries) {
    assertEquals(e.sessionId, "session-abc-123");
    assertEquals(e.projectId, "test-project");
  }
});

Deno.test("extractTimelineEntries: returns session metadata in single pass", async () => {
  const result = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project");

  // Summary from first user message
  assertEquals(result.summary, "Add a login page with email and password fields");
  // Remote was connected then disconnected in fixture
  assertEquals(result.isRemoteConnected, false);
});

Deno.test("extractTimelineEntries: entries are sorted by timestamp descending", async () => {
  const { entries } = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project");

  for (let i = 1; i < entries.length; i++) {
    assertEquals(entries[i - 1].timestamp >= entries[i].timestamp, true);
  }
});

Deno.test("extractTimelineEntries: limit parameter caps entries", async () => {
  const { entries } = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project", {
    limit: 2,
  });
  assertEquals(entries.length, 2);
});

Deno.test("extractTimelineEntries: before parameter filters by timestamp", async () => {
  const { entries } = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project", {
    before: "2026-03-28T10:00:06.000Z",
  });

  for (const e of entries) {
    assertEquals(e.timestamp < "2026-03-28T10:00:06.000Z", true);
  }
});

Deno.test("extractTimelineEntries: text is truncated to 200 chars", async () => {
  const { entries } = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project");

  for (const e of entries) {
    if (e.text) {
      assertEquals(e.text.length <= 203, true); // 200 + "..."
    }
  }
});

Deno.test("extractTimelineEntries: extracts tool names from assistant messages", async () => {
  const { entries } = await extractTimelineEntries(FIXTURE_PATH, "session-abc-123", "test-project");

  const assistantWithTool = entries.find(
    (e) => e.type === "assistant" && e.toolNames.length > 0,
  );
  assertEquals(assistantWithTool !== undefined, true);
  assertEquals(assistantWithTool!.toolNames.includes("write_file"), true);
});
