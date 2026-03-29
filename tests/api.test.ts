import { assertEquals, assertExists } from "@std/assert";
import { createApp } from "../src/server.ts";

const config = {
  claudeHome: Deno.env.get("HOME") + "/.claude",
  port: 0,
  projectsRoot: Deno.env.get("HOME") + "/Projects",
};

const app = createApp(config);

// ─── Dashboard ───

Deno.test("GET /api/dashboard returns stats and recentSessions", async () => {
  const res = await app.request("/api/dashboard");
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.stats);
  assertEquals(typeof data.stats.projects, "number");
  assertEquals(typeof data.stats.sessions, "number");
  assertEquals(typeof data.stats.active7d, "number");
  assertExists(data.recentSessions);
  assertEquals(Array.isArray(data.recentSessions), true);
});

Deno.test("GET /api/dashboard recentSessions have required fields", async () => {
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
    // webUrl can be string or null
    assertEquals(["string", "object"].includes(typeof s.webUrl), true);
  }
});

// ─── Projects ───

Deno.test("GET /api/projects returns projects array", async () => {
  const res = await app.request("/api/projects");
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.projects);
  assertEquals(Array.isArray(data.projects), true);
  assertEquals(data.projects.length > 0, true);
});

Deno.test("GET /api/projects items have required fields", async () => {
  const res = await app.request("/api/projects");
  const data = await res.json();

  const p = data.projects[0];
  assertExists(p.id);
  assertExists(p.path);
  assertExists(p.displayName);
  assertEquals(typeof p.sessionCount, "number");
  assertEquals(typeof p.isWorktree, "boolean");
});

Deno.test("GET /api/projects/:id returns project with sessions", async () => {
  // Get a project ID from the listing first
  const listRes = await app.request("/api/projects");
  const listData = await listRes.json();
  const projectWithSessions = listData.projects.find((p: { sessionCount: number }) => p.sessionCount > 0);

  if (!projectWithSessions) return; // skip if no projects have sessions

  const res = await app.request(`/api/projects/${projectWithSessions.id}`);
  assertEquals(res.status, 200);
  const data = await res.json();

  assertExists(data.project);
  assertExists(data.sessions);
  assertEquals(Array.isArray(data.sessions), true);
  assertEquals(data.project.id, projectWithSessions.id);
});

Deno.test("GET /api/projects/:id returns 404 for unknown project", async () => {
  const res = await app.request("/api/projects/nonexistent-project-id");
  assertEquals(res.status, 404);
});

// ─── Sessions / Transcript ───

Deno.test("GET /api/sessions/:id/transcript returns meta and entries", async () => {
  // Find a real session ID
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
});

Deno.test("GET /api/sessions/:id/transcript entries have correct shape", async () => {
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
});

Deno.test("GET /api/sessions/nonexistent/transcript returns 404", async () => {
  const res = await app.request("/api/sessions/00000000-0000-0000-0000-000000000000/transcript");
  assertEquals(res.status, 404);
});

// ─── Launch ───

Deno.test("POST /api/launch rejects invalid mode", async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "invalid", projectId: "test", target: "terminal" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
});

Deno.test("POST /api/launch rejects missing projectId", async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "resume", target: "terminal" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
});

Deno.test("POST /api/launch rejects invalid target", async () => {
  const res = await app.request("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "resume", projectId: "test", target: "invalid" }),
  });
  assertEquals(res.status, 400);
});

// ─── Static files ───

Deno.test({ name: "GET / returns HTML", sanitizeResources: false, fn: async () => {
  const res = await app.request("/");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("text/html"), true);
}});

Deno.test({ name: "GET /style.css returns CSS", sanitizeResources: false, fn: async () => {
  const res = await app.request("/style.css");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("text/css"), true);
}});

Deno.test({ name: "GET /app.js returns JavaScript", sanitizeResources: false, fn: async () => {
  const res = await app.request("/app.js");
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") || "";
  assertEquals(ct.includes("javascript"), true);
}});
