import { assertEquals } from "@std/assert";
import {
  escapeForShell,
  escapeForAppleScript,
  launchSession,
} from "../src/services/session-launcher.ts";

// ─── Shell escaping ───

Deno.test("escapeForShell wraps string in single quotes", () => {
  assertEquals(escapeForShell("hello"), "'hello'");
});

Deno.test("escapeForShell escapes single quotes inside string", () => {
  assertEquals(escapeForShell("it's"), "'it'\\''s'");
});

Deno.test("escapeForShell handles empty string", () => {
  assertEquals(escapeForShell(""), "''");
});

Deno.test("escapeForShell handles paths with spaces", () => {
  assertEquals(escapeForShell("/Users/me/My Projects/app"), "'/Users/me/My Projects/app'");
});

Deno.test("escapeForShell handles paths with special chars", () => {
  const result = escapeForShell("/path/with $vars & pipes | etc");
  assertEquals(result, "'/path/with $vars & pipes | etc'");
});

// ─── AppleScript escaping ───

Deno.test("escapeForAppleScript escapes backslashes", () => {
  assertEquals(escapeForAppleScript("a\\b"), "a\\\\b");
});

Deno.test("escapeForAppleScript escapes double quotes", () => {
  assertEquals(escapeForAppleScript('say "hello"'), 'say \\"hello\\"');
});

Deno.test("escapeForAppleScript handles combined escapes", () => {
  assertEquals(escapeForAppleScript('path\\to\\"file"'), 'path\\\\to\\\\\\"file\\"');
});

Deno.test("escapeForAppleScript preserves safe characters", () => {
  assertEquals(escapeForAppleScript("cd '/path' && claude --resume abc"), "cd '/path' && claude --resume abc");
});

// ─── launchSession validation ───

Deno.test("launchSession returns error for resume without sessionId", async () => {
  // Use nonexistent path — but sessionId validation happens first in the code
  // Actually, path validation happens before sessionId check, so use a real path
  // The order in launchSession: 1) web check, 2) stat path, 3) build args (sessionId check)
  // So we need a path that exists but no sessionId
  const result = await launchSession({
    mode: "resume",
    projectId: "test",
    projectPath: Deno.cwd(), // exists
    target: "terminal",
  });
  assertEquals(result.ok, false);
  assertEquals(result.error, "sessionId required for resume mode");
});

Deno.test("launchSession returns error for invalid project path", async () => {
  const result = await launchSession({
    mode: "continue",
    projectId: "test",
    projectPath: "/nonexistent/path/that/does/not/exist",
    target: "terminal",
  });
  assertEquals(result.ok, false);
  assertEquals(result.error!.startsWith("Project path not found:"), true);
});

// NOTE: Tests that actually invoke osascript/open (terminal/web launch) are
// excluded because they require --allow-run and open real applications.
// Those are covered by manual verification via `deno task dev`.
