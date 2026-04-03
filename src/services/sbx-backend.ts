import type {
  LaunchCommand,
  NetworkPolicy,
  SandboxConfig,
  SandboxInstance,
  SandboxResult,
  SandboxStatus,
} from "../types.ts";
import {
  addToHintCache,
  type HintCache,
  isCcsmSandbox,
  loadHintCache,
  removeFromHintCache,
  sandboxNameForProject,
  saveHintCache,
} from "./sandbox-naming.ts";

// ─── sbx ls output parser ───

export interface SbxLsRow {
  sandbox: string;
  agent: string;
  status: string;
  ports: string;
  workspace: string;
}

export function parseSbxLsOutput(output: string): SbxLsRow[] {
  const lines = output.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0];
  const colStarts = {
    sandbox: header.indexOf("SANDBOX"),
    agent: header.indexOf("AGENT"),
    status: header.indexOf("STATUS"),
    ports: header.indexOf("PORTS"),
    workspace: header.indexOf("WORKSPACE"),
  };

  if (colStarts.sandbox < 0 || colStarts.status < 0) return [];

  return lines.slice(1).map((line) => {
    const get = (start: number, end: number) =>
      line.slice(start, end < 0 ? undefined : end).trim();
    return {
      sandbox: get(colStarts.sandbox, colStarts.agent),
      agent: get(colStarts.agent, colStarts.status),
      status: get(colStarts.status, colStarts.ports),
      ports: get(colStarts.ports, colStarts.workspace),
      workspace: get(colStarts.workspace, -1),
    };
  }).filter((row) => row.sandbox.length > 0);
}

function mapStatus(sbxStatus: string): SandboxStatus {
  const s = sbxStatus.toLowerCase();
  if (s.includes("running") || s.includes("active")) return "running";
  if (s.includes("stopped") || s.includes("exited")) return "stopped";
  return "stopped";
}

// ─── SbxBackend ───

export class SbxBackend {
  readonly strategy = "sbx" as const;

  private projectsRoot: string;
  private sbxCommand: string;

  constructor(projectsRoot: string, sbxCommand = "sbx") {
    this.projectsRoot = projectsRoot;
    this.sbxCommand = sbxCommand;
  }

  async create(
    projectId: string,
    projectPath: string,
    config: SandboxConfig,
  ): Promise<SandboxResult<SandboxInstance>> {
    const name = await sandboxNameForProject(projectId);
    const args = ["create", "--name", name, "claude", projectPath];

    for (const mount of config.extraMounts) {
      args.push(`${mount}:ro`);
    }

    const result = await this.runSbx(args);
    if (!result.ok) {
      return { ok: false, error: result.error, errorCode: "BACKEND_ERROR" };
    }

    let cache = await loadHintCache(this.projectsRoot);
    cache = addToHintCache(cache, name, projectId, projectPath);
    await saveHintCache(this.projectsRoot, cache);

    return {
      ok: true,
      data: {
        name,
        projectId,
        strategy: "sbx",
        status: "running",
        info: null,
      },
    };
  }

  async stop(sandboxName: string): Promise<SandboxResult> {
    const result = await this.runSbx(["stop", sandboxName]);
    if (!result.ok) {
      return { ok: false, error: result.error, errorCode: "BACKEND_ERROR" };
    }
    return { ok: true };
  }

  async remove(sandboxName: string): Promise<SandboxResult> {
    const result = await this.runSbx(["rm", sandboxName]);
    if (!result.ok) {
      return { ok: false, error: result.error, errorCode: "BACKEND_ERROR" };
    }

    let cache = await loadHintCache(this.projectsRoot);
    cache = removeFromHintCache(cache, sandboxName);
    await saveHintCache(this.projectsRoot, cache);

    return { ok: true };
  }

  async list(): Promise<SandboxInstance[]> {
    const result = await this.runSbx(["ls"]);
    if (!result.ok) return [];

    const rows = parseSbxLsOutput(result.stdout);
    const cache = await loadHintCache(this.projectsRoot);

    return rows
      .filter((row) => isCcsmSandbox(row.sandbox))
      .map((row) => ({
        name: row.sandbox,
        projectId: cache[row.sandbox]?.projectId ?? "",
        strategy: "sbx" as const,
        status: mapStatus(row.status),
        info: row.status,
      }));
  }

  async exec(
    sandboxName: string,
    command: string[],
  ): Promise<SandboxResult<string>> {
    const result = await this.runSbx(["exec", sandboxName, "--", ...command]);
    if (!result.ok) {
      return { ok: false, error: result.error, errorCode: "EXEC_FAILED" };
    }
    return { ok: true, data: result.stdout };
  }

  stream(
    sandboxName: string,
    command: string[],
  ): ReadableStream<Uint8Array> {
    const cmd = new Deno.Command(this.sbxCommand, {
      args: ["exec", sandboxName, "--", ...command],
      stdout: "piped",
      stderr: "piped",
    });
    const child = cmd.spawn();
    return child.stdout;
  }

  getLaunchCommand(
    sandboxName: string,
    claudeArgs: string[],
  ): LaunchCommand {
    return {
      command: this.sbxCommand,
      args: ["exec", "-it", sandboxName, "claude", ...claudeArgs],
      cwd: null,
      env: {},
    };
  }

  async getNameForProject(projectId: string): Promise<string> {
    return await sandboxNameForProject(projectId);
  }

  async getHintCache(): Promise<HintCache> {
    return await loadHintCache(this.projectsRoot);
  }

  private async runSbx(
    args: string[],
  ): Promise<{ ok: boolean; stdout: string; error?: string }> {
    try {
      const cmd = new Deno.Command(this.sbxCommand, {
        args,
        stdout: "piped",
        stderr: "piped",
      });
      const output = await cmd.output();
      const stdout = new TextDecoder().decode(output.stdout).trim();
      if (!output.success) {
        const stderr = new TextDecoder().decode(output.stderr).trim();
        return { ok: false, stdout, error: stderr || "sbx command failed" };
      }
      return { ok: true, stdout };
    } catch (err) {
      return { ok: false, stdout: "", error: `Failed to run sbx: ${err}` };
    }
  }
}
