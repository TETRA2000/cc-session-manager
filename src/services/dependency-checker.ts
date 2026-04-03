import type { SandboxStrategy, StrategyAvailability } from "../types.ts";

export interface DependencyStatus {
  available: boolean;
  version: string | null;
  error: string | null;
  installHint: string | null;
}

async function runCommand(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const command = new Deno.Command(cmd, {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    return {
      ok: output.success,
      stdout: new TextDecoder().decode(output.stdout).trim(),
    };
  } catch {
    return { ok: false, stdout: "" };
  }
}

async function checkSbx(sbxCommand: string): Promise<DependencyStatus> {
  const result = await runCommand(sbxCommand, ["--version"]);
  if (result.ok && result.stdout) {
    const version = result.stdout.split(/\s+/).pop() ?? result.stdout;
    return { available: true, version, error: null, installHint: null };
  }
  return {
    available: false,
    version: null,
    error: "sbx CLI not found",
    installHint: "Install Docker Desktop (https://www.docker.com/products/docker-desktop/)",
  };
}

async function checkNative(): Promise<DependencyStatus> {
  const os = Deno.build.os;
  if (os === "darwin") {
    const result = await runCommand("which", ["sandbox-exec"]);
    if (result.ok && result.stdout) {
      return { available: true, version: "macOS Seatbelt", error: null, installHint: null };
    }
    return {
      available: false,
      version: null,
      error: "sandbox-exec not found",
      installHint: "sandbox-exec should be available on macOS by default",
    };
  }
  if (os === "linux") {
    const result = await runCommand("which", ["bwrap"]);
    if (result.ok && result.stdout) {
      return { available: true, version: "bubblewrap", error: null, installHint: null };
    }
    return {
      available: false,
      version: null,
      error: "bwrap not found",
      installHint: "Install bubblewrap: apt install bubblewrap",
    };
  }
  return {
    available: false,
    version: null,
    error: `Unsupported OS: ${os}`,
    installHint: null,
  };
}

export class DependencyChecker {
  private cache: Map<SandboxStrategy, DependencyStatus> = new Map();
  private sbxCommand: string;

  constructor(sbxCommand = "sbx") {
    this.sbxCommand = sbxCommand;
  }

  async check(strategy: SandboxStrategy): Promise<DependencyStatus> {
    if (strategy === "none") {
      return { available: true, version: null, error: null, installHint: null };
    }
    const cached = this.cache.get(strategy);
    if (cached) return cached;

    let result: DependencyStatus;
    switch (strategy) {
      case "sbx":
        result = await checkSbx(this.sbxCommand);
        break;
      case "native":
        result = await checkNative();
        break;
      default:
        result = {
          available: false,
          version: null,
          error: `Unknown strategy: ${strategy}`,
          installHint: null,
        };
    }
    this.cache.set(strategy, result);
    return result;
  }

  async checkAll(): Promise<StrategyAvailability[]> {
    const strategies: SandboxStrategy[] = ["none", "native", "sbx"];
    const results: StrategyAvailability[] = [];
    for (const strategy of strategies) {
      const status = await this.check(strategy);
      results.push({
        strategy,
        available: status.available,
        version: status.version,
        installHint: status.installHint,
      });
    }
    return results;
  }
}
