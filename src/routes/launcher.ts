import { Hono } from "hono";
import type { AppConfig, LaunchRequest } from "../types.ts";
import { getResolvedPath } from "../services/project-discovery.ts";
import { launchSession } from "../services/session-launcher.ts";

export function launcherRoutes(config: AppConfig): Hono {
  const _config = config;
  const app = new Hono();

  app.post("/launch", async (c) => {
    const body = await c.req.json();

    const mode = body.mode;
    if (!["resume", "continue", "new"].includes(mode)) {
      return c.json({ ok: false, error: `Invalid mode: ${mode}` }, 400);
    }

    const projectId = body.projectId;
    if (!projectId || typeof projectId !== "string") {
      return c.json({ ok: false, error: "projectId is required" }, 400);
    }

    const target = body.target || "terminal";
    if (!["terminal", "web"].includes(target)) {
      return c.json({ ok: false, error: `Invalid target: ${target}` }, 400);
    }

    // Resolve the real filesystem path:
    // - If projectPath is provided directly (from wizard), use it
    // - Otherwise resolve from encoded projectId (from session data)
    let projectPath = body.projectPath;
    if (!projectPath) {
      projectPath = getResolvedPath(projectId);
    }

    const req: LaunchRequest = {
      mode,
      projectId,
      projectPath,
      sessionId: body.sessionId,
      prompt: body.prompt,
      target,
      webUrl: body.webUrl,
    };

    const result = await launchSession(req);
    return c.json(result, result.ok ? 200 : 500);
  });

  return app;
}
