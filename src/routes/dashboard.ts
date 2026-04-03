import { Hono } from "hono";
import { join } from "@std/path";
import type { AppConfig, DashboardStats, SessionFileInfo } from "../types.ts";
import { discoverProjects, listSessionFiles, getActiveSessionIds } from "../services/project-discovery.ts";
import { extractSessionMetadata } from "../services/session-parser.ts";
import { attachSummaries, refreshSummaries } from "../services/summary-service.ts";

export function dashboardRoutes(config: AppConfig): Hono {
  const app = new Hono();

  app.get("/dashboard", async (c) => {
    const projects = await discoverProjects(config.claudeHome);

    // Collect recent session FILES across all projects (fast: no JSONL parsing)
    const allFiles: (SessionFileInfo & { projectId: string })[] = [];
    for (const project of projects) {
      try {
        const files = await listSessionFiles(join(config.claudeHome, "projects", project.id));
        for (const f of files) {
          allFiles.push({ ...f, projectId: project.id });
        }
      } catch { /* skip */ }
    }

    // Sort by mtime descending, take top candidates
    allFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

    // Compute stats from file-level data
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const active7d = allFiles.filter((f) => f.mtimeMs >= sevenDaysAgo).length;

    // Get active session IDs
    const activeIds = await getActiveSessionIds(config.claudeHome);

    // Parse only the top ~30 most recent files to find 10 with actual content
    const recentSessions = [];
    const candidates = allFiles.slice(0, 20);
    for (const f of candidates) {
      if (recentSessions.length >= 10) break;
      try {
        const meta = await extractSessionMetadata(f.jsonlPath, f.id, f.projectId);
        meta.isActive = activeIds.has(f.id);
        if (meta.messageCount > 0) {
          recentSessions.push(meta);
        }
      } catch { /* skip */ }
    }

    // Attach cached AI summaries, then kick off background refresh for stale ones
    await attachSummaries(config.projectsRoot, recentSessions);
    refreshSummaries(config.projectsRoot, config.claudeHome, recentSessions).catch(() => {});

    // Read token usage from stats-cache.json
    let tokens30d = 0;
    try {
      const statsPath = join(config.claudeHome, "stats-cache.json");
      const statsText = await Deno.readTextFile(statsPath);
      const statsData = JSON.parse(statsText);
      if (Array.isArray(statsData.dailyModelTokens)) {
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        for (const day of statsData.dailyModelTokens) {
          if (day.date >= thirtyDaysAgo && day.tokensByModel) {
            for (const count of Object.values(day.tokensByModel)) {
              tokens30d += count as number;
            }
          }
        }
      }
    } catch { /* stats-cache.json not available */ }

    const stats: DashboardStats = {
      projects: projects.length,
      sessions: allFiles.length,
      active7d,
      tokens30d,
      activeSandboxes: 0,
    };

    return c.json({ stats, recentSessions });
  });

  return app;
}
