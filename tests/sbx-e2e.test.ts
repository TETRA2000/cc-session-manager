import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { SbxBackend } from "../src/services/sbx-backend.ts";
import { DependencyChecker } from "../src/services/dependency-checker.ts";
import { SandboxManager } from "../src/services/sandbox-manager.ts";
import { loadHintCache } from "../src/services/sandbox-naming.ts";
import type { SandboxConfig } from "../src/types.ts";

const MOCK_SBX = new URL("./fixtures/mock-sbx", import.meta.url).pathname;

const opts = { sanitizeOps: false, sanitizeResources: false };

function defaultConfig(): SandboxConfig {
  return {
    strategy: "sbx",
    networkPolicy: "balanced",
    extraMounts: [],
    ephemeral: false,
  };
}

interface TestContext {
  stateDir: string;
  projectsRoot: string;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<TestContext> {
  const stateDir = await Deno.makeTempDir({ prefix: "mock-sbx-state-" });
  const projectsRoot = await Deno.makeTempDir({ prefix: "ccsm-projects-" });
  Deno.env.set("MOCK_SBX_STATE_DIR", stateDir);
  return {
    stateDir,
    projectsRoot,
    cleanup: async () => {
      Deno.env.delete("MOCK_SBX_STATE_DIR");
      await Deno.remove(stateDir, { recursive: true }).catch(() => {});
      await Deno.remove(projectsRoot, { recursive: true }).catch(() => {});
    },
  };
}

// ─── DependencyChecker ───

Deno.test({
  name: "E2E: DependencyChecker detects mock sbx as available",
  ...opts,
  fn: async () => {
    const checker = new DependencyChecker(MOCK_SBX);
    const ctx = await setup();
    try {
      const status = await checker.check("sbx");
      assertEquals(status.available, true);
      assertEquals(status.version, "0.23.0");
      assertEquals(status.error, null);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: DependencyChecker reports unavailable when sbx path is invalid",
  ...opts,
  fn: async () => {
    const checker = new DependencyChecker("/nonexistent/sbx");
    const status = await checker.check("sbx");
    assertEquals(status.available, false);
    assertExists(status.error);
  },
});

// ─── SbxBackend lifecycle ───

Deno.test({
  name: "E2E: SbxBackend.create creates sandbox via mock",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const result = await backend.create("test-project", "/home/user/project", defaultConfig());
      assertEquals(result.ok, true);
      assertExists(result.data);
      assertEquals(result.data!.status, "running");
      assertEquals(result.data!.strategy, "sbx");
      assertEquals(result.data!.name.startsWith("ccsm-"), true);

      // Verify hint cache was written
      const cache = await loadHintCache(ctx.projectsRoot);
      const entry = cache[result.data!.name];
      assertExists(entry);
      assertEquals(entry.projectId, "test-project");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.list returns created sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      await backend.create("test-project", "/home/user/project", defaultConfig());
      const instances = await backend.list();
      assertEquals(instances.length, 1);
      assertEquals(instances[0].status, "running");
      assertEquals(instances[0].projectId, "test-project");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.stop transitions sandbox to stopped",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const created = await backend.create("test-project", "/home/user/project", defaultConfig());
      const name = created.data!.name;

      const stopResult = await backend.stop(name);
      assertEquals(stopResult.ok, true);

      const instances = await backend.list();
      assertEquals(instances.length, 1);
      assertEquals(instances[0].status, "stopped");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.remove deletes sandbox and cleans hint cache",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const created = await backend.create("test-project", "/home/user/project", defaultConfig());
      const name = created.data!.name;

      const removeResult = await backend.remove(name);
      assertEquals(removeResult.ok, true);

      const instances = await backend.list();
      assertEquals(instances.length, 0);

      // Hint cache should be cleaned
      const cache = await loadHintCache(ctx.projectsRoot);
      assertEquals(cache[name], undefined);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.exec runs command in sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const created = await backend.create("test-project", "/home/user/project", defaultConfig());
      const name = created.data!.name;

      const result = await backend.exec(name, ["echo", "hello from sandbox"]);
      assertEquals(result.ok, true);
      assertEquals(result.data?.trim(), "hello from sandbox");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.exec fails for stopped sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const created = await backend.create("test-project", "/home/user/project", defaultConfig());
      const name = created.data!.name;
      await backend.stop(name);

      const result = await backend.exec(name, ["echo", "test"]);
      assertEquals(result.ok, false);
      assertStringIncludes(result.error ?? "", "not running");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.exec fails for nonexistent sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const result = await backend.exec("ccsm-nonexistent", ["echo", "test"]);
      assertEquals(result.ok, false);
      assertStringIncludes(result.error ?? "", "No such sandbox");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.stop fails for nonexistent sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const result = await backend.stop("ccsm-nonexistent");
      assertEquals(result.ok, false);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SbxBackend.remove fails for nonexistent sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const backend = new SbxBackend(ctx.projectsRoot, MOCK_SBX);
      const result = await backend.remove("ccsm-nonexistent");
      assertEquals(result.ok, false);
    } finally {
      await ctx.cleanup();
    }
  },
});

// ─── SandboxManager orchestration ───

Deno.test({
  name: "E2E: SandboxManager.ensureSandbox creates new sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const manager = new SandboxManager(ctx.projectsRoot, MOCK_SBX);
      const result = await manager.ensureSandbox("proj-1", "/home/user/proj", defaultConfig());
      assertEquals(result.ok, true);
      assertExists(result.data);
      assertEquals(result.data!.status, "running");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SandboxManager.ensureSandbox reuses existing running sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const manager = new SandboxManager(ctx.projectsRoot, MOCK_SBX);
      const first = await manager.ensureSandbox("proj-1", "/home/user/proj", defaultConfig());
      const second = await manager.ensureSandbox("proj-1", "/home/user/proj", defaultConfig());

      assertEquals(first.ok, true);
      assertEquals(second.ok, true);
      assertEquals(first.data!.name, second.data!.name);

      // Should still only be one sandbox
      const instances = await manager.listSandboxes();
      assertEquals(instances.length, 1);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SandboxManager.ensureSandbox rejects unavailable strategy",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const manager = new SandboxManager(ctx.projectsRoot, "/nonexistent/sbx");
      const result = await manager.ensureSandbox("proj-1", "/path", defaultConfig());
      assertEquals(result.ok, false);
      assertEquals(result.errorCode, "DEPENDENCY_MISSING");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SandboxManager full lifecycle: create → list → stop → remove",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const manager = new SandboxManager(ctx.projectsRoot, MOCK_SBX);

      // Create
      const created = await manager.ensureSandbox("proj-1", "/home/user/proj", defaultConfig());
      assertEquals(created.ok, true);
      const name = created.data!.name;

      // List
      let instances = await manager.listSandboxes();
      assertEquals(instances.length, 1);
      assertEquals(instances[0].status, "running");

      // Stop
      const stopped = await manager.stopSandbox(name);
      assertEquals(stopped.ok, true);
      instances = await manager.listSandboxes();
      assertEquals(instances[0].status, "stopped");

      // Remove
      const removed = await manager.removeSandbox(name);
      assertEquals(removed.ok, true);
      instances = await manager.listSandboxes();
      assertEquals(instances.length, 0);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "E2E: SandboxManager.reconcileOnStartup cleans stale hint cache",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const manager = new SandboxManager(ctx.projectsRoot, MOCK_SBX);

      // Create two sandboxes
      await manager.ensureSandbox("proj-1", "/path/1", defaultConfig());
      const second = await manager.ensureSandbox("proj-2", "/path/2", defaultConfig());

      // Verify both in cache
      let cache = await loadHintCache(ctx.projectsRoot);
      assertEquals(Object.keys(cache).length, 2);

      // Remove one sandbox externally (delete state file directly)
      const secondName = second.data!.name;
      await Deno.remove(`${ctx.stateDir}/${secondName}`);

      // Reconcile — should clean the stale entry
      await manager.reconcileOnStartup();
      cache = await loadHintCache(ctx.projectsRoot);
      assertEquals(Object.keys(cache).length, 1);
      assertEquals(cache[secondName], undefined);
    } finally {
      await ctx.cleanup();
    }
  },
});
