import { assertEquals, assertExists } from "@std/assert";
import { createApp } from "../src/server.ts";

const config = {
  claudeHome: Deno.env.get("HOME") + "/.claude",
  port: 0,
  projectsRoot: Deno.env.get("HOME") + "/Projects",
  host: "127.0.0.1",
  token: null,
  authEnabled: false,
};

const app = createApp(config);

// Background summary refresh leaks async ops across tests, so relax sanitizers
const opts = { sanitizeOps: false, sanitizeResources: false };

// ─── Dashboard ───

Deno.test({ name: "GET /api/dashboard returns stats and recentSessions", ...opts, fn: async () => {
  const res = await app.request("/api/dashboard");
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.stats);
  assertEquals(typeof data.stats.projects, "number");
  assertEquals(typeof data.stats.sessions, "number");
  assertEquals(typeof data.stats.active7d, "number");
  assertExists(data.recentSessions);
  assertEquals(Array.isArray(data.recentSessions), true);
}});

Deno.test({ name: "GET /api/dashboard recentSessions have required fields", ...opts, fn: async () => {
  const res = await app.request("/api/dashboard");
  const data = await res.json();

  for (const s of data.recentSessions) {
    assertExists(s.id);
    assertExists(s.projectId);
    assertExists(s.summary);
    assertEquals(typeof s.messageCount, "number");
    assertEquals(typeof s.toolCallCount, "number");
    assertExists(s.firstTimestamp);
    assertExists(s.lastTimestamp);
    assertEquals(typeof s.isActive, "boolean");
    assertEquals(typeof s.isRemoteConnected, "boolean");
    assertEquals(["string", "object"].includes(typeof s.webUrl), true);
  }
}});

// ─── Projects ───

Deno.test({ name: "GET /api/projects returns projects array", ...opts, fn: async () => {
  const res = await app.request("/api/projects");
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.projects);
  assertEquals(Array.isArray(data.projects), true);
}});

Deno.test({ name: "GET /api/projects items have required fields", ...opts, fn: async () => {
  const res = await app.request("/api/projects");
  const data = await res.json();

  if (data.projects.length === 0) return; // no projects in CI
  const p = data.projects[0];
  assertExists(p.id);
  assertExists(p.path);
  assertExists(p.displayName);
  assertEquals(typeof p.sessionCount, "number");
  assertEquals(typeof p.isWorktree, "boolean");
}});

Deno.test({ name: "GET /api/projects/:id returns project with sessions", ...opts, fn: async () => {
  const listRes = await app.request("/api/projects");
  const listData = await listRes.json();
  const projectWithSessions = listData.projects.find((p: { sessionCount: number }) => p.sessionCount > 0);

  if (!projectWithSessions) return;

  const res = await app.request(`/api/projects/${projectWithSessions.id}`);
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.project);
  assertExists(data.sessions);
  assertEquals(Array.isArray(data.sessions), true);
  assertEquals(data.project.id, projectWithSessions.id);
}});

Deno.test({ name: "GET /api/projects/:id returns 404 for unknown project", ...opts, fn: async () => {
  const res = await app.request("/api/projects/nonexistent-project-id");
  assertEquals(res.status, 404);
}});

// ─── Sessions / Transcript ───

Deno.test({ name: "GET /api/sessions/:id/transcript returns meta and entries", ...opts, fn: async () => {
  const dashRes = await app.request("/api/dashboard");
  const dashData = await dashRes.json();
  if (dashData.recentSessions.length === 0) return;

  const sessionId = dashData.recentSessions[0].id;
  const res = await app.request(`/api/sessions/${sessionId}/transcript`);
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.meta);
  assertExists(data.entries);
  assertEquals(Array.isArray(data.entries), true);
  assertEquals(data.meta.id, sessionId);
}});

Deno.test({ name: "GET /api/sessions/:id/transcript entries have correct shape", ...opts, fn: async () => {
  const dashRes = await app.request("/api/dashboard");
  const dashData = await dashRes.json();
  if (dashData.recentSessions.length === 0) return;

  const sessionId = dashData.recentSessions[0].id;
  const res = await app.request(`/api/sessions/${sessionId}/transcript`);
  const data = await res.json();

  for (const entry of data.entries.slice(0, 5)) {
    assertExists(entry.uuid);
    assertEquals(["user", "assistant", "system"].includes(entry.type), true);
    assertExists(entry.timestamp);
    assertEquals(Array.isArray(entry.toolCalls), true);
  }
}});

Deno.test({ name: "GET /api/sessions/nonexistent/transcript returns 404", ...opts, fn: async () => {
  const res = await app.request("/api/sessions/00000000-0000-0000-0000-000000000000/transcript");
  assertEquals(res.status, 404);
}});

// ─── Launch ───

Deno.test({ name: "POST /api/launch rejects invalid mode", ...opts, fn: async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "invalid", projectId: "test", target: "terminal" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
}});

Deno.test({ name: "POST /api/launch rejects missing projectId", ...opts, fn: async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "resume", target: "terminal" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
}});

Deno.test({ name: "POST /api/launch rejects invalid target", ...opts, fn: async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "resume", projectId: "test", target: "invalid" }),
  });
  assertEquals(res.status, 400);
}});

// ─── Static files ───

Deno.test({ name: "GET / returns HTML", ...opts, fn: async () => {
  const res = await app.request("/");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("text/html"), true);
}});

Deno.test({ name: "GET /style.css returns CSS", ...opts, fn: async () => {
  const res = await app.request("/style.css");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("text/css"), true);
}});

Deno.test({ name: "GET /app.js returns JavaScript", ...opts, fn: async () => {
  const res = await app.request("/app.js");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("javascript"), true);
}});
