import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import type { AppConfig } from "./types.ts";
import { createApiRoutes, createApiRoutesWithTerminal } from "./routes/api.ts";
import { authMiddleware } from "./services/auth.ts";

export function createApp(config: AppConfig): Hono {
  const app = new Hono();

  // Auth middleware — protects all /api/* routes when auth is enabled
  app.use("/api/*", authMiddleware(config));

  // Mount API routes (without terminal — used for basic/test mode)
  app.route("/api", createApiRoutes(config));

  // Serve static files from ./static/ at root /
  app.use("/*", serveStatic({ root: "./static" }));

  // SPA fallback: serve index.html for unmatched non-API routes
  app.use("/*", serveStatic({ root: "./static", path: "index.html" }));

  return app;
}

export async function createAppWithTerminal(config: AppConfig): Promise<Hono> {
  const app = new Hono();

  // Auth middleware — protects all /api/* routes when auth is enabled
  app.use("/api/*", authMiddleware(config));

  // Mount API routes with terminal support (lazy-loads PTY FFI)
  const apiRoutes = await createApiRoutesWithTerminal(config);
  app.route("/api", apiRoutes);

  // Serve static files from ./static/ at root /
  app.use("/*", serveStatic({ root: "./static" }));

  // SPA fallback
  app.use("/*", serveStatic({ root: "./static", path: "index.html" }));

  return app;
}
