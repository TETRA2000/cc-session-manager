import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import type { AppConfig } from "./types.ts";
import { createApiRoutes } from "./routes/api.ts";

export function createApp(config: AppConfig): Hono {
  const app = new Hono();

  // Mount API routes
  app.route("/api", createApiRoutes(config));

  // Serve static files from ./static/ at root /
  app.use("/*", serveStatic({ root: "./static" }));

  // SPA fallback: serve index.html for unmatched non-API routes
  app.use("/*", serveStatic({ root: "./static", path: "index.html" }));

  return app;
}
