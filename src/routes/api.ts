import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { launcherRoutes } from "./launcher.ts";
import { projectRoutes } from "./projects.ts";
import { sessionRoutes } from "./sessions.ts";

export function createApiRoutes(config: AppConfig): Hono {
  const api = new Hono();

  api.route("/", dashboardRoutes(config));
  api.route("/", projectRoutes(config));
  api.route("/", sessionRoutes(config));
  api.route("/", launcherRoutes(config));

  return api;
}
