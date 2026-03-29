import { assertEquals } from "@std/assert";

// Import the format functions - they're ES modules in static/lib/
// We import them directly since they're pure functions with no DOM deps
const { formatTokens, shortenPath, truncate } = await import("../static/lib/format.js");

// ─── formatTokens ───

Deno.test("formatTokens formats millions", () => {
  assertEquals(formatTokens(1_500_000), "1.5M");
  assertEquals(formatTokens(1_000_000), "1M");
  assertEquals(formatTokens(2_345_678), "2.3M");
});

Deno.test("formatTokens formats thousands", () => {
  assertEquals(formatTokens(1_500), "1.5K");
  assertEquals(formatTokens(1_000), "1K");
  assertEquals(formatTokens(98_700), "98.7K");
  assertEquals(formatTokens(500), "500");
});

Deno.test("formatTokens handles edge cases", () => {
  assertEquals(formatTokens(0), "0");
  assertEquals(formatTokens(null), "0");
  assertEquals(formatTokens(undefined), "0");
  assertEquals(formatTokens(999), "999");
  assertEquals(formatTokens(1000), "1K");
});

// ─── shortenPath ───

Deno.test("shortenPath replaces home directory with ~", () => {
  assertEquals(shortenPath("/Users/takahiko/repo/my-app"), "~/repo/my-app");
  assertEquals(shortenPath("/Users/john/Documents/project"), "~/Documents/project");
});

Deno.test("shortenPath handles home-only path", () => {
  assertEquals(shortenPath("/Users/takahiko"), "~");
});

Deno.test("shortenPath preserves non-home paths", () => {
  assertEquals(shortenPath("/tmp/test"), "/tmp/test");
  assertEquals(shortenPath("/var/log/app"), "/var/log/app");
});

Deno.test("shortenPath handles empty/null input", () => {
  assertEquals(shortenPath(""), "");
  assertEquals(shortenPath(null), "");
  assertEquals(shortenPath(undefined), "");
});

// ─── truncate ───

Deno.test("truncate shortens long strings", () => {
  assertEquals(truncate("hello world", 5), "hello...");
  assertEquals(truncate("abcdefgh", 3), "abc...");
});

Deno.test("truncate preserves short strings", () => {
  assertEquals(truncate("hello", 10), "hello");
  assertEquals(truncate("hi", 2), "hi");
});

Deno.test("truncate handles empty/null input", () => {
  assertEquals(truncate("", 5), "");
  assertEquals(truncate(null, 5), "");
  assertEquals(truncate(undefined, 5), "");
});
