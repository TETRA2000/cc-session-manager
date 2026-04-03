import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { findSessionFile } from "../services/project-discovery.ts";
import {
  extractSessionMetadata,
  parseTranscript,
  parseTranscriptFromStream,
} from "../services/session-parser.ts";
import { SandboxManager } from "../services/sandbox-manager.ts";

export function sessionRoutes(config: AppConfig, sbxCommand?: string): Hono {
  const app = new Hono();
  const sandboxManager = new SandboxManager(config.projectsRoot, sbxCommand);

  // GET /sessions/:sessionId/transcript -> full transcript with metadata
  app.get("/sessions/:sessionId/transcript", async (c) => {
    const sessionId = c.req.param("sessionId");

    if (!/^[a-f0-9-]+$/i.test(sessionId)) {
      return c.json({ error: "Invalid session ID format" }, 400);
    }

    // Try host filesystem first (works for non-sandboxed and native sandbox)
    const found = await findSessionFile(config.claudeHome, sessionId);
    if (found) {
      const [meta, entries] = await Promise.all([
        extractSessionMetadata(found.filePath, sessionId, found.projectId),
        parseTranscript(found.filePath),
      ]);
      return c.json({ meta, entries });
    }

    // If not found on host, check active sandboxes for the session
    const sandboxes = await sandboxManager.listSandboxes();
    for (const sandbox of sandboxes) {
      if (sandbox.status !== "running") continue;
      // Search inside sandbox for this session
      const findResult = await sandboxManager.execInSandbox(
        sandbox.name,
        ["find", "/root/.claude/projects", "-name", `${sessionId}.jsonl`, "-type", "f"],
      );
      if (findResult.ok && findResult.data?.trim()) {
        const sandboxPath = findResult.data.trim().split("\n")[0];
        const stream = sandboxManager.streamFromSandbox(sandbox.name, ["cat", sandboxPath]);
        const entries = await parseTranscriptFromStream(stream);
        return c.json({ meta: null, entries });
      }
    }

    return c.json({ error: "Session not found" }, 404);
  });

  return app;
}
