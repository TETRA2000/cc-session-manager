import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { SandboxManager } from "../services/sandbox-manager.ts";

export function sandboxRoutes(config: AppConfig, sbxCommand?: string): Hono {
  const app = new Hono();
  const manager = new SandboxManager(config.projectsRoot, sbxCommand);

  // GET /strategies — available sandbox strategies with dependency status
  app.get("/strategies", async (c) => {
    const strategies = await manager.getAvailableStrategies();
    return c.json({
      strategies,
      defaultStrategy: config.defaultSandboxStrategy,
      insideContainer: config.insideContainer,
    });
  });

  // GET /instances — list all ccsm sandboxes
  app.get("/instances", async (c) => {
    const instances = await manager.listSandboxes();
    return c.json({ instances });
  });

  // GET /instances/:projectId — get sandbox for a specific project
  app.get("/instances/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const instance = await manager.getSandbox(projectId);
    return c.json({ instance });
  });

  // POST /instances — create a sandbox for a project
  app.post("/instances", async (c) => {
    const body = await c.req.json();
    const { projectId, projectPath, strategy, config: sandboxConfig } = body;

    if (!projectId || typeof projectId !== "string") {
      return c.json({ ok: false, error: "projectId is required" }, 400);
    }
    if (!projectPath || typeof projectPath !== "string") {
      return c.json({ ok: false, error: "projectPath is required" }, 400);
    }

    const sbxConfig = {
      strategy: strategy ?? config.defaultSandboxStrategy,
      networkPolicy: sandboxConfig?.networkPolicy ?? "balanced",
      extraMounts: sandboxConfig?.extraMounts ?? [],
      ephemeral: sandboxConfig?.ephemeral ?? false,
    };

    const result = await manager.ensureSandbox(projectId, projectPath, sbxConfig);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error, errorCode: result.errorCode }, 500);
    }
    return c.json({ ok: true, instance: result.data });
  });

  // POST /instances/:name/stop — stop a running sandbox
  app.post("/instances/:name/stop", async (c) => {
    const name = c.req.param("name");
    const result = await manager.stopSandbox(name);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 500);
    }
    return c.json({ ok: true });
  });

  // DELETE /instances/:name — remove a sandbox
  app.delete("/instances/:name", async (c) => {
    const name = c.req.param("name");
    const result = await manager.removeSandbox(name);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 500);
    }
    return c.json({ ok: true });
  });

  // POST /instances/:name/exec — execute command inside sandbox
  app.post("/instances/:name/exec", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.json();
    const command = body.command;

    if (!Array.isArray(command) || command.length === 0) {
      return c.json({ ok: false, error: "command must be a non-empty array" }, 400);
    }

    const result = await manager.execInSandbox(name, command);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error, errorCode: result.errorCode }, 500);
    }
    return c.json({ ok: true, output: result.data });
  });

  return app;
}
