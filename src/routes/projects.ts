import { Hono } from "hono";
import { join } from "@std/path";
import type { AppConfig, ProjectSummary } from "../types.ts";
import { discoverProjects, getProjectSessions } from "../services/project-discovery.ts";

/**
 * Scan $PROJECTS_ROOT for directories not yet in the discovered projects list.
 * These are projects created by the wizard that haven't had a Claude session yet.
 */
async function discoverNewProjects(
  projectsRoot: string,
  existingPaths: Set<string>,
): Promise<ProjectSummary[]> {
  const newProjects: ProjectSummary[] = [];
  try {
    for await (const entry of Deno.readDir(projectsRoot)) {
      if (!entry.isDirectory || entry.name.startsWith(".")) continue;
      const fullPath = join(projectsRoot, entry.name);
      if (existingPaths.has(fullPath)) continue;
      try {
        const stat = await Deno.stat(fullPath);
        newProjects.push({
          id: `local:${entry.name}`,
          path: fullPath,
          displayName: entry.name,
          sessionCount: 0,
          lastActivity: stat.mtime ? stat.mtime.toISOString() : "",
          isWorktree: false,
        });
      } catch { /* skip */ }
    }
  } catch { /* projectsRoot doesn't exist or not readable */ }
  return newProjects;
}

export function projectRoutes(config: AppConfig): Hono {
  const app = new Hono();

  // GET /projects -> list all projects (discovered + new from PROJECTS_ROOT)
  app.get("/projects", async (c) => {
    const projects = await discoverProjects(config.claudeHome);
    const existingPaths = new Set(projects.map((p) => p.path));
    const newProjects = await discoverNewProjects(config.projectsRoot, existingPaths);
    return c.json({ projects: [...projects, ...newProjects] });
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
