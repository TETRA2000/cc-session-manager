import { parseArgs } from "@std/cli";
import { loadConfig } from "./src/config.ts";
import { createApp } from "./src/server.ts";

const args = parseArgs(Deno.args, {
  string: ["port", "claude-home"],
  boolean: ["no-open", "help"],
  default: {
    "no-open": false,
    help: false,
  },
});

if (args.help) {
  console.log(`
Claude Code Session Manager

Usage:
  deno run main.ts [options]

Options:
  --port <number>        Port to listen on (default: 3456)
  --claude-home <path>   Path to Claude home directory (default: ~/.claude)
  --no-open              Don't open browser automatically
  --help                 Show this help message
`);
  Deno.exit(0);
}

const config = loadConfig({
  port: args.port ? parseInt(args.port, 10) : undefined,
  claudeHome: args["claude-home"] ?? undefined,
});

// Verify projects directory exists
try {
  const projectsDir = `${config.claudeHome}/projects`;
  const stat = await Deno.stat(projectsDir);
  if (!stat.isDirectory) {
    console.error(`Error: ${projectsDir} is not a directory`);
    Deno.exit(1);
  }
} catch {
  console.error(`Error: ${config.claudeHome}/projects/ not found.`);
  console.error("Make sure Claude Code has been used at least once to generate session data.");
  Deno.exit(1);
}

const app = createApp(config);
const url = `http://127.0.0.1:${config.port}`;

console.log("");
console.log("  Claude Code Session Manager");
console.log("  ===========================");
console.log(`  Local:  ${url}`);
console.log(`  Data:   ${config.claudeHome}/projects/`);
console.log("");

// Open browser unless --no-open
if (!args["no-open"]) {
  try {
    const cmd = new Deno.Command("open", { args: [url] });
    cmd.spawn();
  } catch {
    // Silently ignore if open fails (e.g., headless environment)
  }
}

Deno.serve(
  {
    port: config.port,
    hostname: "127.0.0.1",
    onListen: () => {
      // Startup message already printed above
    },
  },
  app.fetch,
);
