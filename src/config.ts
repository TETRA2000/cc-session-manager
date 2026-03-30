import type { AppConfig } from "./types.ts";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadConfig(args: {
  port?: number;
  claudeHome?: string;
  projectsRoot?: string;
  host?: string;
  token?: string;
}): AppConfig {
  const home = Deno.env.get("HOME") ?? "";
  const host = args.host ?? "127.0.0.1";
  const isLocalhost = host === "127.0.0.1" || host === "localhost";
  const authEnabled = !isLocalhost;
  return {
    claudeHome: args.claudeHome ?? `${home}/.claude`,
    port: args.port ?? 3456,
    projectsRoot: args.projectsRoot ?? Deno.env.get("PROJECTS_ROOT") ?? `${home}/Projects`,
    host,
    token: authEnabled ? (args.token ?? generateToken()) : null,
    authEnabled,
  };
}
