import { assertEquals, assertNotEquals } from "@std/assert";
import {
  addToHintCache,
  reconcileHintCache,
  removeFromHintCache,
  sandboxNameForProject,
  isCcsmSandbox,
} from "../src/services/sandbox-naming.ts";

Deno.test("sandboxNameForProject returns deterministic ccsm- prefixed name", async () => {
  const name = await sandboxNameForProject("-Users-takahiko-repo-my-app");
  assertEquals(name.startsWith("ccsm-"), true);
  assertEquals(name.length, 17); // "ccsm-" + 12 hex chars

  // Deterministic: same input → same output
  const name2 = await sandboxNameForProject("-Users-takahiko-repo-my-app");
  assertEquals(name, name2);
});

Deno.test("sandboxNameForProject produces different names for different projects", async () => {
  const name1 = await sandboxNameForProject("-Users-takahiko-repo-app-a");
  const name2 = await sandboxNameForProject("-Users-takahiko-repo-app-b");
  assertNotEquals(name1, name2);
});

Deno.test("sandboxNameForProject handles very long project IDs", async () => {
  const longId = "-Users-" + "a".repeat(200) + "-very-deep-nested-project";
  const name = await sandboxNameForProject(longId);
  assertEquals(name.length, 17);
  assertEquals(name.startsWith("ccsm-"), true);
});

Deno.test("isCcsmSandbox identifies ccsm- prefixed names", () => {
  assertEquals(isCcsmSandbox("ccsm-a1b2c3d4e5f6"), true);
  assertEquals(isCcsmSandbox("other-sandbox"), false);
  assertEquals(isCcsmSandbox(""), false);
});

Deno.test("addToHintCache adds entry with projectId and projectPath", () => {
  const cache = addToHintCache({}, "ccsm-abc123", "proj-1", "/path/to/proj");
  assertEquals(cache["ccsm-abc123"].projectId, "proj-1");
  assertEquals(cache["ccsm-abc123"].projectPath, "/path/to/proj");
  assertEquals(typeof cache["ccsm-abc123"].createdAt, "string");
});

Deno.test("removeFromHintCache removes entry", () => {
  let cache = addToHintCache({}, "ccsm-abc123", "proj-1", "/path");
  cache = addToHintCache(cache, "ccsm-def456", "proj-2", "/path2");
  cache = removeFromHintCache(cache, "ccsm-abc123");
  assertEquals(cache["ccsm-abc123"], undefined);
  assertEquals(cache["ccsm-def456"].projectId, "proj-2");
});

Deno.test("reconcileHintCache removes entries not in live sandbox list", () => {
  let cache = addToHintCache({}, "ccsm-abc123", "proj-1", "/path");
  cache = addToHintCache(cache, "ccsm-def456", "proj-2", "/path2");
  cache = addToHintCache(cache, "ccsm-ghi789", "proj-3", "/path3");

  const reconciled = reconcileHintCache(cache, ["ccsm-abc123", "ccsm-ghi789"]);
  assertEquals(Object.keys(reconciled).length, 2);
  assertEquals(reconciled["ccsm-abc123"].projectId, "proj-1");
  assertEquals(reconciled["ccsm-ghi789"].projectId, "proj-3");
  assertEquals(reconciled["ccsm-def456"], undefined);
});

Deno.test("reconcileHintCache with empty live list clears all entries", () => {
  let cache = addToHintCache({}, "ccsm-abc123", "proj-1", "/path");
  cache = addToHintCache(cache, "ccsm-def456", "proj-2", "/path2");

  const reconciled = reconcileHintCache(cache, []);
  assertEquals(Object.keys(reconciled).length, 0);
});
