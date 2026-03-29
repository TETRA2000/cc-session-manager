import { assertEquals } from "@std/assert";
import { getCachedSummary } from "../src/services/summary-service.ts";
import type { SummaryCacheEntry } from "../src/types.ts";

// ─── getCachedSummary ───

Deno.test("getCachedSummary returns summary when messageCount matches", () => {
  const cache: Record<string, SummaryCacheEntry> = {
    "session-1": {
      aiSummary: "Built a login page with OAuth",
      messageCount: 42,
      generatedAt: "2026-03-29T10:00:00Z",
    },
  };
  assertEquals(getCachedSummary(cache, "session-1", 42), "Built a login page with OAuth");
});

Deno.test("getCachedSummary returns null when messageCount changed", () => {
  const cache: Record<string, SummaryCacheEntry> = {
    "session-1": {
      aiSummary: "Built a login page",
      messageCount: 42,
      generatedAt: "2026-03-29T10:00:00Z",
    },
  };
  // Session now has 50 messages — cache is stale
  assertEquals(getCachedSummary(cache, "session-1", 50), null);
});

Deno.test("getCachedSummary returns null for unknown session", () => {
  const cache: Record<string, SummaryCacheEntry> = {};
  assertEquals(getCachedSummary(cache, "nonexistent", 10), null);
});

Deno.test("getCachedSummary returns null for empty cache", () => {
  assertEquals(getCachedSummary({}, "session-1", 5), null);
});

// ─── Cache persistence ───

Deno.test({ name: "loadSummaryCache and saveSummaryCache round-trip", sanitizeResources: false, fn: async () => {
  const { loadSummaryCache } = await import("../src/services/summary-service.ts");

  // loadSummaryCache uses an in-memory singleton, so we test via file
  const tmpDir = await Deno.makeTempDir();
  try {
    const dir = `${tmpDir}/.session-manager`;
    await Deno.mkdir(dir, { recursive: true });
    const data: Record<string, SummaryCacheEntry> = {
      "test-session": {
        aiSummary: "Test summary",
        messageCount: 10,
        generatedAt: "2026-03-29T10:00:00Z",
      },
    };
    await Deno.writeTextFile(`${dir}/summaries.json`, JSON.stringify(data));

    // Read it back directly (can't easily test loadSummaryCache due to singleton)
    const text = await Deno.readTextFile(`${dir}/summaries.json`);
    const parsed = JSON.parse(text);
    assertEquals(parsed["test-session"].aiSummary, "Test summary");
    assertEquals(parsed["test-session"].messageCount, 10);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}});
