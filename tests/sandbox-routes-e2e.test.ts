import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";
import { sandboxRoutes } from "../src/routes/sandbox.ts";
import type { AppConfig } from "../src/types.ts";

const MOCK_SBX = new URL("./fixtures/mock-sbx", import.meta.url).pathname;

const opts = { sanitizeOps: false, sanitizeResources: false };

interface TestContext {
  stateDir: string;
  projectsRoot: string;
  app: Hono;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<TestContext> {
  const stateDir = await Deno.makeTempDir({ prefix: "mock-sbx-route-" });
  const projectsRoot = await Deno.makeTempDir({ prefix: "ccsm-route-proj-" });
  Deno.env.set("MOCK_SBX_STATE_DIR", stateDir);

  const config: AppConfig = {
    claudeHome: "/tmp/.claude",
    port: 0,
    projectsRoot,
    host: "127.0.0.1",
    token: null,
    authEnabled: false,
    defaultSandboxStrategy: "sbx",
    insideContainer: false,
  };

  const app = new Hono();
  app.route("/api/sandbox", sandboxRoutes(config, MOCK_SBX));

  return {
    stateDir,
    projectsRoot,
    app,
    cleanup: async () => {
      Deno.env.delete("MOCK_SBX_STATE_DIR");
      await Deno.remove(stateDir, { recursive: true }).catch(() => {});
      await Deno.remove(projectsRoot, { recursive: true }).catch(() => {});
    },
  };
}

function post(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(app: Hono, path: string) {
  return app.request(path, { method: "DELETE" });
}

// ─── Strategy detection ───

Deno.test({
  name: "Route E2E: GET /strategies returns sbx as available",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await ctx.app.request("/api/sandbox/strategies");
      assertEquals(res.status, 200);
      const data = await res.json();
      assertExists(data.strategies);
      const sbx = data.strategies.find((s: { strategy: string }) => s.strategy === "sbx");
      assertExists(sbx);
      assertEquals(sbx.available, true);
      assertEquals(sbx.version, "0.23.0");
    } finally {
      await ctx.cleanup();
    }
  },
});

// ─── CRUD lifecycle ───

Deno.test({
  name: "Route E2E: POST /instances creates sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
        strategy: "sbx",
      });
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.ok, true);
      assertExists(data.instance);
      assertEquals(data.instance.status, "running");
      assertEquals(data.instance.strategy, "sbx");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: GET /instances lists created sandboxes",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      // Create a sandbox first
      await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });

      const res = await ctx.app.request("/api/sandbox/instances");
      assertEquals(res.status, 200);
      const data = await res.json();
      assertExists(data.instances);
      assertEquals(data.instances.length >= 1, true);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: GET /instances/:projectId returns sandbox for project",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });

      const res = await ctx.app.request("/api/sandbox/instances/proj-1");
      assertEquals(res.status, 200);
      const data = await res.json();
      assertExists(data.instance);
      assertEquals(data.instance.status, "running");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: POST /instances/:name/stop stops sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const createRes = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });
      const { instance } = await createRes.json();

      const stopRes = await post(ctx.app, `/api/sandbox/instances/${instance.name}/stop`, {});
      assertEquals(stopRes.status, 200);
      const stopData = await stopRes.json();
      assertEquals(stopData.ok, true);

      // Verify status changed
      const listRes = await ctx.app.request("/api/sandbox/instances");
      const listData = await listRes.json();
      const stopped = listData.instances.find((i: { name: string }) => i.name === instance.name);
      assertEquals(stopped?.status, "stopped");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: DELETE /instances/:name removes sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const createRes = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });
      const { instance } = await createRes.json();

      const delRes = await del(ctx.app, `/api/sandbox/instances/${instance.name}`);
      assertEquals(delRes.status, 200);
      const delData = await delRes.json();
      assertEquals(delData.ok, true);

      // Verify removed
      const listRes = await ctx.app.request("/api/sandbox/instances");
      const listData = await listRes.json();
      const found = listData.instances.find((i: { name: string }) => i.name === instance.name);
      assertEquals(found, undefined);
    } finally {
      await ctx.cleanup();
    }
  },
});

// ─── Exec ───

Deno.test({
  name: "Route E2E: POST /instances/:name/exec executes command",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const createRes = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });
      const { instance } = await createRes.json();

      const execRes = await post(ctx.app, `/api/sandbox/instances/${instance.name}/exec`, {
        command: ["echo", "hello world"],
      });
      assertEquals(execRes.status, 200);
      const data = await execRes.json();
      assertEquals(data.ok, true);
      assertStringIncludes(data.output, "hello world");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: POST /instances/:name/exec fails for stopped sandbox",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const createRes = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });
      const { instance } = await createRes.json();
      await post(ctx.app, `/api/sandbox/instances/${instance.name}/stop`, {});

      const execRes = await post(ctx.app, `/api/sandbox/instances/${instance.name}/exec`, {
        command: ["echo", "test"],
      });
      assertEquals(execRes.status, 500);
      const data = await execRes.json();
      assertEquals(data.ok, false);
      assertStringIncludes(data.error, "not running");
    } finally {
      await ctx.cleanup();
    }
  },
});

// ─── Validation errors ───

Deno.test({
  name: "Route E2E: POST /instances rejects missing projectId",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await post(ctx.app, "/api/sandbox/instances", {
        projectPath: "/home/user/proj",
      });
      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.ok, false);
      assertStringIncludes(data.error, "projectId");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: POST /instances rejects missing projectPath",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
      });
      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.ok, false);
      assertStringIncludes(data.error, "projectPath");
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: POST /instances/:name/exec rejects empty command",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const createRes = await post(ctx.app, "/api/sandbox/instances", {
        projectId: "proj-1",
        projectPath: "/home/user/proj",
      });
      const { instance } = await createRes.json();

      const execRes = await post(ctx.app, `/api/sandbox/instances/${instance.name}/exec`, {
        command: [],
      });
      assertEquals(execRes.status, 400);
      const data = await execRes.json();
      assertEquals(data.ok, false);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: POST /instances/:name/stop returns error for nonexistent",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await post(ctx.app, "/api/sandbox/instances/ccsm-nonexistent/stop", {});
      assertEquals(res.status, 500);
      const data = await res.json();
      assertEquals(data.ok, false);
    } finally {
      await ctx.cleanup();
    }
  },
});

Deno.test({
  name: "Route E2E: DELETE /instances/:name returns error for nonexistent",
  ...opts,
  fn: async () => {
    const ctx = await setup();
    try {
      const res = await del(ctx.app, "/api/sandbox/instances/ccsm-nonexistent");
      assertEquals(res.status, 500);
      const data = await res.json();
      assertEquals(data.ok, false);
    } finally {
      await ctx.cleanup();
    }
  },
});
