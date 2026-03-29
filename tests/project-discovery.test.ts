import { assertEquals } from "@std/assert";
import { decodeDirName, isWorktree } from "../src/services/project-discovery.ts";

Deno.test("decodeDirName decodes encoded path correctly", () => {
  assertEquals(decodeDirName("-Users-takahiko-repo-my-app"), "/Users/takahiko/repo/my/app");
});

Deno.test("decodeDirName handles simple paths", () => {
  assertEquals(decodeDirName("-tmp-test"), "/tmp/test");
});

Deno.test("decodeDirName handles deeply nested paths", () => {
  assertEquals(
    decodeDirName("-Users-takahiko-repo-org-project-src"),
    "/Users/takahiko/repo/org/project/src",
  );
});

Deno.test("isWorktree returns true for worktree paths", () => {
  assertEquals(isWorktree("-Users-takahiko-repo--claude-worktrees-my-app-feat-login"), true);
});

Deno.test("isWorktree returns false for regular paths", () => {
  assertEquals(isWorktree("-Users-takahiko-repo-my-app"), false);
});

Deno.test("isWorktree returns false for paths with single hyphens", () => {
  assertEquals(isWorktree("-Users-takahiko-repo-my-worktree-app"), false);
});
