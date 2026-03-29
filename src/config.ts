import type { AppConfig } from "./types.ts";

export function loadConfig(args: { port?: number; claudeHome?: string }): AppConfig {
  const home = Deno.env.get("HOME") ?? "";
  return {
    claudeHome: args.claudeHome ?? `${home}/.claude`,
    port: args.port ?? 3456,
  };
}
