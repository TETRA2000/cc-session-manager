import { join } from "@std/path";
import type { ProjectSummary, SessionFileInfo, SessionSummary } from "../types.ts";
import { extractSessionMetadata, extractCwd } from "./session-parser.ts";

// ─── Path encoding/decoding ───

/**
 * Decode an encoded directory name back to a filesystem path.
 * Claude encodes paths by replacing "/" with "-", so:
 *   "-Users-takahiko-repo-my-app" -> "/Users/takahiko/repo/my-app"
 * Note: naive decode is lossy for paths containing literal hyphens.
 */
export function decodeDirName(encoded: string): string {
  return encoded.replace(/-/g, "/");
}

/**
 * Cache of projectId -> resolved real path (from JSONL cwd fields).
 * Populated as sessions are parsed. Falls back to naive decode.
 */
const resolvedPathCache = new Map<string, string>();

export function setResolvedPath(projectId: string, realPath: string): void {
  resolvedPathCache.set(projectId, realPath);
}

export function getResolvedPath(projectId: string): string {
  return resolvedPathCache.get(projectId) ?? decodeDirName(projectId);
}

/**
 * Check if an encoded directory name represents a git worktree path.
 */
export function isWorktree(encoded: string): boolean {
  return encoded.includes("--claude-worktrees-");
}

// ─── Project discovery ───

export async function discoverProjects(claudeHome: string): Promise<ProjectSummary[]> {
  const projectsDir = join(claudeHome, "projects");
  const projects: ProjectSummary[] = [];

  try {
    for await (const entry of Deno.readDir(projectsDir)) {
      if (!entry.isDirectory) continue;

      const dirPath = join(projectsDir, entry.name);
      let sessionCount = 0;
      let latestMtime = 0;

      try {
        for await (const file of Deno.readDir(dirPath)) {
          if (!file.isFile || !file.name.endsWith(".jsonl")) continue;
          sessionCount++;
          try {
            const stat = await Deno.stat(join(dirPath, file.name));
            if (stat.mtime) {
              const mt = stat.mtime.getTime();
              if (mt > latestMtime) latestMtime = mt;
            }
          } catch {
            // stat failed, skip
          }
        }
      } catch {
        // readDir failed, skip this project
        continue;
      }

      // Try to get real path from the most recent session's cwd field
      let decoded = getResolvedPath(entry.name);
      if (decoded === decodeDirName(entry.name) && sessionCount > 0) {
        // Read cwd from first JSONL to get real path
        try {
          const firstJsonl = await findFirstJsonl(dirPath);
          if (firstJsonl) {
            const cwd = await extractCwd(firstJsonl);
            if (cwd) {
              decoded = cwd;
              setResolvedPath(entry.name, cwd);
            }
          }
        } catch {
          // fall back to naive decode
        }
      }
      const displayName = decoded.split("/").filter(Boolean).pop() ?? decoded;

      projects.push({
        id: entry.name,
        path: decoded,
        displayName,
        sessionCount,
        lastActivity: latestMtime > 0 ? new Date(latestMtime).toISOString() : "",
        isWorktree: isWorktree(entry.name),
      });
    }
  } catch {
    // projects directory doesn't exist or is inaccessible
    return [];
  }

  // Sort by lastActivity descending
  projects.sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  return projects;
}

async function findFirstJsonl(dirPath: string): Promise<string | null> {
  try {
    for await (const file of Deno.readDir(dirPath)) {
      if (file.isFile && file.name.endsWith(".jsonl")) {
        return join(dirPath, file.name);
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Session file listing ───

export async function listSessionFiles(projectDir: string): Promise<SessionFileInfo[]> {
  const files: SessionFileInfo[] = [];

  try {
    for await (const entry of Deno.readDir(projectDir)) {
      if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;

      const filePath = join(projectDir, entry.name);
      // Extract UUID from filename (remove .jsonl extension)
      const id = entry.name.replace(/\.jsonl$/, "");

      try {
        const stat = await Deno.stat(filePath);
        files.push({
          id,
          jsonlPath: filePath,
          dirPath: null,
          fileSizeBytes: stat.size,
          mtimeMs: stat.mtime?.getTime() ?? 0,
        });
      } catch {
        // stat failed, skip
      }
    }
  } catch {
    // readDir failed
    return [];
  }

  // Check for session directories that may contain subagent data
  for (const file of files) {
    const sessionDir = join(projectDir, file.id);
    try {
      const stat = await Deno.stat(sessionDir);
      if (stat.isDirectory) {
        file.dirPath = sessionDir;
      }
    } catch {
      // no directory for this session
    }
  }

  // Sort by mtime descending
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files;
}

// ─── Active session detection from ~/.claude/sessions/ ───

export async function getActiveSessionIds(claudeHome: string): Promise<Set<string>> {
  const sessionsDir = join(claudeHome, "sessions");
  const activeIds = new Set<string>();

  try {
    for await (const entry of Deno.readDir(sessionsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      try {
        const text = await Deno.readTextFile(join(sessionsDir, entry.name));
        const data = JSON.parse(text);
        if (data.sessionId) {
          activeIds.add(data.sessionId);
        }
      } catch { /* skip */ }
    }
  } catch { /* sessions dir doesn't exist */ }

  return activeIds;
}

// ─── Get all sessions for a project ───

export async function getProjectSessions(
  claudeHome: string,
  projectId: string,
): Promise<SessionSummary[]> {
  const projectDir = join(claudeHome, "projects", projectId);
  const sessionFiles = await listSessionFiles(projectDir);
  const activeIds = await getActiveSessionIds(claudeHome);

  const sessions: SessionSummary[] = [];

  for (const sf of sessionFiles) {
    try {
      const meta = await extractSessionMetadata(sf.jsonlPath, sf.id, projectId);
      meta.isActive = activeIds.has(sf.id);

      // Check for subagents
      if (sf.dirPath) {
        const subagentDir = join(sf.dirPath, "subagents");
        try {
          let count = 0;
          for await (const entry of Deno.readDir(subagentDir)) {
            if (entry.isDirectory) count++;
          }
          meta.subAgentCount = count;
        } catch {
          // no subagents directory
        }
      }

      sessions.push(meta);
    } catch {
      // Failed to parse session, skip
      console.warn(`Failed to parse session ${sf.id} in ${projectId}`);
    }
  }

  return sessions;
}

// ─── Find a session file across all projects ───

export async function findSessionFile(
  claudeHome: string,
  sessionId: string,
): Promise<{ filePath: string; projectId: string } | null> {
  const projectsDir = join(claudeHome, "projects");

  try {
    for await (const entry of Deno.readDir(projectsDir)) {
      if (!entry.isDirectory) continue;

      const candidatePath = join(projectsDir, entry.name, `${sessionId}.jsonl`);
      try {
        await Deno.stat(candidatePath);
        return { filePath: candidatePath, projectId: entry.name };
      } catch {
        // not in this project
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  return null;
}
