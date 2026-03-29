import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { findSessionFile } from "../services/project-discovery.ts";
import { extractSessionMetadata, parseTranscript } from "../services/session-parser.ts";

export function sessionRoutes(config: AppConfig): Hono {
  const app = new Hono();

  // GET /sessions/:sessionId/transcript -> full transcript with metadata
  app.get("/sessions/:sessionId/transcript", async (c) => {
    const sessionId = c.req.param("sessionId");

    // Find the session file across all projects
    const found = await findSessionFile(config.claudeHome, sessionId);
    if (!found) {
      return c.json({ error: "Session not found" }, 404);
    }

    const [meta, entries] = await Promise.all([
      extractSessionMetadata(found.filePath, sessionId, found.projectId),
      parseTranscript(found.filePath),
    ]);

    return c.json({ meta, entries });
  });

  return app;
}
