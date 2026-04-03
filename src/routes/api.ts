import { Hono } from "hono";
import type { AppConfig } from "../types.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { launcherRoutes } from "./launcher.ts";
import { projectRoutes } from "./projects.ts";
import { sessionRoutes } from "./sessions.ts";
import { wizardRoutes } from "./wizard.ts";
import { sandboxRoutes } from "./sandbox.ts";
export function createApiRoutes(config: AppConfig): Hono {
  const api = new Hono();

  api.route("/", dashboardRoutes(config));
  api.route("/", projectRoutes(config));
  api.route("/", sessionRoutes(config));
  api.route("/", launcherRoutes(config));
  api.route("/", wizardRoutes(config));
  api.route("/sandbox", sandboxRoutes(config));

  return api;
}

export async function createApiRoutesWithTerminal(config: AppConfig): Promise<Hono> {
  const api = new Hono();

  api.route("/", dashboardRoutes(config));
  api.route("/", projectRoutes(config));
  api.route("/", sessionRoutes(config));
  api.route("/", launcherRoutes(config));
  api.route("/", wizardRoutes(config));
  api.route("/sandbox", sandboxRoutes(config));

  const { terminalRoutes } = await import("./terminal.ts");
  const { PTYManager } = await import("../services/pty-manager.ts");
  const ptyManager = new PTYManager();
  api.route("/terminal", terminalRoutes(config, ptyManager));

  return api;
}
