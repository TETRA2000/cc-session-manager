import { Hono } from "hono";
import type { AppConfig, LaunchRequest, SandboxStrategy } from "../types.ts";
import { getResolvedPath } from "../services/project-discovery.ts";
import { launchSession } from "../services/session-launcher.ts";
import { SandboxManager } from "../services/sandbox-manager.ts";

export function launcherRoutes(config: AppConfig, sbxCommand?: string): Hono {
  const app = new Hono();
  const sandboxManager = new SandboxManager(config.projectsRoot, sbxCommand);

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

    let projectPath = body.projectPath;
    if (!projectPath) {
      projectPath = getResolvedPath(projectId);
    }

    if (body.sessionId && !/^[a-f0-9-]+$/i.test(body.sessionId)) {
      return c.json({ ok: false, error: "Invalid sessionId format" }, 400);
    }

    // Handle sandbox launch: return the launch command for PTY use
    const sandbox: SandboxStrategy | undefined = body.sandbox;
    if (sandbox && sandbox !== "none") {
      const sbxConfig = {
        strategy: sandbox,
        networkPolicy: body.networkPolicy ?? "balanced" as const,
        extraMounts: [] as string[],
        ephemeral: false,
      };
      const sbxResult = await sandboxManager.ensureSandbox(projectId, projectPath, sbxConfig);
      if (!sbxResult.ok) {
        return c.json({ ok: false, error: sbxResult.error }, 500);
      }

      const claudeArgs: string[] = [];
      switch (mode) {
        case "resume":
          if (body.sessionId) claudeArgs.push("--resume", body.sessionId);
          break;
        case "continue":
          claudeArgs.push("--continue");
          break;
        case "new":
          if (body.prompt) claudeArgs.push(body.prompt);
          break;
      }

      const launchCmd = sandboxManager.getLaunchCommand(sbxResult.data!, claudeArgs);
      return c.json({ ok: true, sandbox: true, launchCommand: launchCmd });
    }

    // Standard (non-sandbox) launch
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
