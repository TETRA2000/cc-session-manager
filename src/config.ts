import type { AppConfig, SandboxStrategy } from "./types.ts";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const VALID_SANDBOX_STRATEGIES: SandboxStrategy[] = ["none", "native", "sbx"];

export function loadConfig(args: {
  port?: number;
  claudeHome?: string;
  projectsRoot?: string;
  host?: string;
  token?: string;
  sandboxStrategy?: string;
}): AppConfig {
  const home = Deno.env.get("HOME") ?? "";
  const host = args.host ?? "127.0.0.1";
  const isLocalhost = host === "127.0.0.1" || host === "localhost";
  const authEnabled = !isLocalhost;
  const insideContainer = Deno.env.get("CCSM_INSIDE_CONTAINER") === "1";

  let defaultSandboxStrategy: SandboxStrategy = "none";
  if (
    args.sandboxStrategy &&
    VALID_SANDBOX_STRATEGIES.includes(args.sandboxStrategy as SandboxStrategy)
  ) {
    defaultSandboxStrategy = args.sandboxStrategy as SandboxStrategy;
  }

  return {
    claudeHome: args.claudeHome ?? `${home}/.claude`,
    port: args.port ?? 3456,
    projectsRoot: args.projectsRoot ?? Deno.env.get("PROJECTS_ROOT") ?? `${home}/Projects`,
    host,
    token: authEnabled ? (args.token ?? generateToken()) : null,
    authEnabled,
    defaultSandboxStrategy,
    insideContainer,
  };
}
