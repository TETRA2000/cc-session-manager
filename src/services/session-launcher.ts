import type { LaunchRequest, LaunchResult } from "../types.ts";

export function escapeForShell(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function launchInTerminal(
  projectPath: string,
  claudeArgs: string[],
): Promise<LaunchResult> {
  // Build the shell command: cd '<path>' && claude <args>
  const cdCmd = `cd ${escapeForShell(projectPath)}`;
  const claudeCmd = ["claude", ...claudeArgs].join(" ");
  const fullCmd = `${cdCmd} && ${claudeCmd}`;

  // Wrap in AppleScript to open Terminal.app
  const script = `tell application "Terminal"
  activate
  do script "${escapeForAppleScript(fullCmd)}"
end tell`;

  try {
    const cmd = new Deno.Command("osascript", {
      args: ["-e", script],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();

    if (!output.success) {
      const stderr = new TextDecoder().decode(output.stderr);
      return { ok: false, error: `Terminal launch failed: ${stderr}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to run osascript: ${err}` };
  }
}

export async function launchInBrowser(url: string): Promise<LaunchResult> {
  try {
    const cmd = new Deno.Command("open", {
      args: [url],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();

    if (!output.success) {
      const stderr = new TextDecoder().decode(output.stderr);
      return { ok: false, error: `Browser launch failed: ${stderr}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to open browser: ${err}` };
  }
}

export async function launchSession(req: LaunchRequest): Promise<LaunchResult> {
  if (req.target === "web") {
    const url = req.webUrl || "https://claude.ai/code";
    return launchInBrowser(url);
  }

  // Terminal launch
  // Validate project path exists
  try {
    await Deno.stat(req.projectPath);
  } catch {
    return { ok: false, error: `Project path not found: ${req.projectPath}` };
  }

  // Build claude args based on mode
  let claudeArgs: string[];
  switch (req.mode) {
    case "resume":
      if (!req.sessionId) {
        return { ok: false, error: "sessionId required for resume mode" };
      }
      claudeArgs = ["--resume", escapeForShell(req.sessionId)];
      break;
    case "continue":
      claudeArgs = ["--continue"];
      break;
    case "new":
      claudeArgs = req.prompt ? [escapeForShell(req.prompt)] : [];
      break;
    default:
      return { ok: false, error: `Unknown mode: ${req.mode}` };
  }

  return launchInTerminal(req.projectPath, claudeArgs);
}
