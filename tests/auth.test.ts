import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { authMiddleware } from "../src/services/auth.ts";
import type { AppConfig } from "../src/types.ts";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    claudeHome: "/tmp/.claude",
    port: 3456,
    projectsRoot: "/tmp/projects",
    host: "127.0.0.1",
    token: null,
    authEnabled: false,
    defaultSandboxStrategy: "none",
    insideContainer: false,
    ...overrides,
  };
}

function makeApp(config: AppConfig): Hono {
  const app = new Hono();
  app.use("/api/*", authMiddleware(config));
  app.get("/api/test", (c) => c.json({ ok: true }));
  return app;
}

// ─── Auth disabled (localhost) ───

Deno.test("auth disabled: requests pass through without token", async () => {
  const app = makeApp(makeConfig());
  const res = await app.request("/api/test");
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
});

// ─── Auth enabled ───

Deno.test("auth enabled: valid Bearer header passes through", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  const res = await app.request("/api/test", {
    headers: { Authorization: "Bearer secret123" },
  });
  assertEquals(res.status, 200);
});

Deno.test("auth enabled: valid query param token passes through", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  const res = await app.request("/api/test?token=secret123");
  assertEquals(res.status, 200);
});

Deno.test("auth enabled: missing token returns 401", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  const res = await app.request("/api/test");
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Unauthorized");
});

Deno.test("auth enabled: invalid Bearer token returns 401", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  const res = await app.request("/api/test", {
    headers: { Authorization: "Bearer wrong-token" },
  });
  assertEquals(res.status, 401);
});

Deno.test("auth enabled: invalid query param returns 401", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  const res = await app.request("/api/test?token=wrong-token");
  assertEquals(res.status, 401);
});

Deno.test("auth enabled: Bearer header takes precedence over query param", async () => {
  const app = makeApp(makeConfig({ host: "0.0.0.0", token: "secret123", authEnabled: true }));
  // Valid header, invalid query — should pass
  const res = await app.request("/api/test?token=wrong", {
    headers: { Authorization: "Bearer secret123" },
  });
  assertEquals(res.status, 200);
});
