import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { discoverProjects, getProjectSessions } from "../services/project-discovery.ts";

export function projectRoutes(config: AppConfig): Hono {
  const app = new Hono();

  // GET /projects -> list all projects
  app.get("/projects", async (c) => {
    const projects = await discoverProjects(config.claudeHome);
    return c.json({ projects });
  });

  // GET /projects/:projectId -> project detail with sessions
  app.get("/projects/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const projects = await discoverProjects(config.claudeHome);
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const sessions = await getProjectSessions(config.claudeHome, projectId);

    return c.json({ project, sessions });
  });

  return app;
}
