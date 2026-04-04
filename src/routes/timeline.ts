import { Hono } from "hono";
import { join } from "@std/path";
import type {
  ActiveSessionInfo,
  AppConfig,
  ImportanceLevel,
  SessionFileInfo,
  TimelineEntry,
  TimelineResponse,
  TranscriptEntry,
} from "../types.ts";
import {
  discoverProjects,
  getActiveSessionIds,
  listSessionFiles,
} from "../services/project-discovery.ts";
import {
  classifyImportance,
  extractSessionMetadata,
  extractTimelineEntries,
} from "../services/session-parser.ts";
import { attachSummaries } from "../services/summary-service.ts";

// ─── In-memory TTL cache ───

interface CachedResult {
  entries: TimelineEntry[];
  activeSessions: ActiveSessionInfo[];
  timestamp: number;
}

let cache: CachedResult | null = null;
const CACHE_TTL_MS = 10_000;

// Exported for testing
export function clearTimelineCache(): void {
  cache = null;
}

const VALID_IMPORTANCE = new Set(["all", "high", "normal"]);

export function timelineRoutes(config: AppConfig): Hono {
  const app = new Hono();

  app.get("/timeline", async (c) => {
    // ─── Validate query params ───
    const limitParam = c.req.query("limit");
    const beforeParam = c.req.query("before");
    const importanceParam = c.req.query("importance") ?? "all";

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    if (limitParam && (isNaN(limit) || limit < 1)) {
      return c.json({ error: "Invalid limit parameter" }, 400);
    }

    if (beforeParam && isNaN(Date.parse(beforeParam))) {
      return c.json({ error: "Invalid before parameter — must be ISO 8601" }, 400);
    }

    if (!VALID_IMPORTANCE.has(importanceParam)) {
      return c.json({ error: "Invalid importance parameter — must be all, high, or normal" }, 400);
    }

    // ─── Build or reuse cache ───
    const now = Date.now();
    if (!cache || (now - cache.timestamp) > CACHE_TTL_MS) {
      const result = await buildTimelineData(config);
      cache = { ...result, timestamp: now };
    }

    // ─── Apply post-cache filtering ───
    let filtered = cache.entries;

    // Importance filter
    if (importanceParam === "high") {
      filtered = filtered.filter((e) => e.importance === "high");
    } else if (importanceParam === "normal") {
      filtered = filtered.filter((e) => e.importance === "high" || e.importance === "normal");
    }

    // Before cursor
    if (beforeParam) {
      filtered = filtered.filter((e) => e.timestamp < beforeParam);
    }

    // Limit + hasMore
    const hasMore = filtered.length > limit;
    const entries = filtered.slice(0, limit);
    const oldestTimestamp = entries.length > 0 ? entries[entries.length - 1].timestamp : null;

    const response: TimelineResponse = {
      entries,
      activeSessions: cache.activeSessions,
      hasMore,
      oldestTimestamp,
    };

    return c.json(response);
  });

  return app;
}

// ─── Build full unfiltered timeline data ───

async function buildTimelineData(config: AppConfig): Promise<{
  entries: TimelineEntry[];
  activeSessions: ActiveSessionInfo[];
}> {
  const projects = await discoverProjects(config.claudeHome);

  // Collect all session files across projects
  const allFiles: (SessionFileInfo & { projectId: string })[] = [];
  for (const project of projects) {
    try {
      const files = await listSessionFiles(
        join(config.claudeHome, "projects", project.id),
      );
      for (const f of files) {
        allFiles.push({ ...f, projectId: project.id });
      }
    } catch { /* skip */ }
  }

  // Sort by mtime descending, take top 50
  allFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const recentFiles = allFiles.slice(0, 50);

  // Get active session IDs
  const activeIds = await getActiveSessionIds(config.claudeHome);

  // Build project display name lookup
  const projectNameMap = new Map<string, string>();
  for (const p of projects) {
    projectNameMap.set(p.id, p.displayName);
  }

  // Extract timeline entries from each session
  const allEntries: TimelineEntry[] = [];
  const sessionMetaMap = new Map<string, { summary: string | null; isRemoteConnected: boolean }>();

  for (const f of recentFiles) {
    try {
      // Extract lightweight entries
      const rawEntries = await extractTimelineEntries(f.jsonlPath, f.id, f.projectId, {
        limit: 20,
      });

      // Get session metadata for summary and remote status
      const meta = await extractSessionMetadata(f.jsonlPath, f.id, f.projectId);
      meta.isActive = activeIds.has(f.id);
      sessionMetaMap.set(f.id, {
        summary: meta.aiSummary ?? meta.summary,
        isRemoteConnected: meta.isRemoteConnected,
      });

      const isActive = activeIds.has(f.id);
      const projectName = projectNameMap.get(f.projectId) ?? f.projectId;

      // Classify importance and build full TimelineEntry objects
      for (let i = 0; i < rawEntries.length; i++) {
        const raw = rawEntries[i];
        const isLast = isActive && i === 0; // entries are sorted desc, so index 0 is latest

        // Build a TranscriptEntry-like object for classifyImportance
        const transcriptLike: TranscriptEntry = {
          uuid: raw.uuid,
          type: raw.type,
          text: raw.text,
          toolCalls: raw.toolNames.map((name) => ({
            id: "",
            name,
            input: {},
          })),
          model: raw.model,
          timestamp: raw.timestamp,
          tokens: null,
        };

        const { importance, isAttention } = classifyImportance(transcriptLike, isLast);

        allEntries.push({
          ...raw,
          projectName,
          sessionSummary: sessionMetaMap.get(f.id)?.summary ?? null,
          importance,
          isAttention,
          isRemoteConnected: sessionMetaMap.get(f.id)?.isRemoteConnected ?? false,
        });
      }
    } catch { /* skip failed sessions */ }
  }

  // Attach AI summaries to session metadata
  const sessionSummaries = Array.from(sessionMetaMap.entries()).map(([id, meta]) => ({
    id,
    projectId: "",
    summary: meta.summary ?? "",
    messageCount: 0,
    toolCallCount: 0,
    firstTimestamp: "",
    lastTimestamp: "",
    gitBranch: null,
    model: null,
    totalTokens: 0,
    subAgentCount: 0,
    lastMessage: null,
    webUrl: null,
    isActive: false,
    isRemoteConnected: meta.isRemoteConnected,
    entrypoint: null,
    aiSummary: null,
  }));
  await attachSummaries(config.projectsRoot, sessionSummaries);

  // Update entry summaries with AI summaries
  for (const entry of allEntries) {
    const s = sessionSummaries.find((ss) => ss.id === entry.sessionId);
    if (s?.aiSummary) {
      entry.sessionSummary = s.aiSummary;
    }
  }

  // Sort all entries by timestamp descending
  allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Build active sessions list
  const activeSessions: ActiveSessionInfo[] = [];
  const seenActiveIds = new Set<string>();
  for (const f of recentFiles) {
    if (!activeIds.has(f.id) || seenActiveIds.has(f.id)) continue;
    seenActiveIds.add(f.id);

    const meta = sessionMetaMap.get(f.id);
    const isRemote = meta?.isRemoteConnected ?? false;
    const hasAttention = allEntries.some(
      (e) => e.sessionId === f.id && e.isAttention,
    );

    activeSessions.push({
      sessionId: f.id,
      projectId: f.projectId,
      projectName: projectNameMap.get(f.projectId) ?? f.projectId,
      status: isRemote ? "remote" : "active",
      lastActivity: new Date(f.mtimeMs).toISOString(),
      hasAttention,
      isRemoteConnected: isRemote,
    });
  }

  return { entries: allEntries, activeSessions };
}
