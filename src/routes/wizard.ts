import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import {
  createProject,
  getProjectSettings,
  saveProjectSettings,
  validateProjectName,
} from "../services/project-manager.ts";

export function wizardRoutes(config: AppConfig): Hono {
  const app = new Hono();

  // Create a new project
  app.post("/projects/create", async (c) => {
    const body = await c.req.json();

    const nameError = validateProjectName(body.name);
    if (nameError) {
      return c.json({ ok: false, error: nameError }, 400);
    }

    const result = await createProject(config.projectsRoot, {
      name: body.name,
      gitInit: !!body.gitInit,
      gitRemote: body.gitRemote || undefined,
      claudeMd: body.claudeMd !== false, // default true
      mcpJson: !!body.mcpJson,
      launchAfter: !!body.launchAfter,
    });

    return c.json(result, result.ok ? 200 : 500);
  });

  // Get project settings
  app.get("/projects/:id/settings", async (c) => {
    const projectId = c.req.param("id");
    const settings = await getProjectSettings(config.projectsRoot, projectId);
    return c.json(settings ?? {});
  });

  // Update project settings
  app.put("/projects/:id/settings", async (c) => {
    const projectId = c.req.param("id");
    const body = await c.req.json();

    const settings = {
      displayName: body.displayName,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      preferredModel: body.preferredModel,
      customLaunchFlags: Array.isArray(body.customLaunchFlags) ? body.customLaunchFlags : undefined,
    };

    try {
      await saveProjectSettings(config.projectsRoot, projectId, settings);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: `Failed to save settings: ${err}` }, 500);
    }
  });

  return app;
}
