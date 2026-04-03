import { join } from "@std/path";
import type {
  LaunchCommand,
  SandboxConfig,
  SandboxInstance,
  SandboxResult,
  SandboxStatus,
} from "../types.ts";

export class NativeBackend {
  readonly strategy = "native" as const;

  async create(
    projectId: string,
    projectPath: string,
    _config: SandboxConfig,
    projectsRoot: string,
  ): Promise<SandboxResult<SandboxInstance>> {
    const settingsPath = await this.writeSettingsFile(projectId, projectPath, projectsRoot);
    if (!settingsPath) {
      return {
        ok: false,
        error: "Failed to write sandbox settings file",
        errorCode: "BACKEND_ERROR",
      };
    }
    return {
      ok: true,
      data: {
        name: `native-${projectId}`,
        projectId,
        strategy: "native",
        status: "running",
        info: settingsPath,
      },
    };
  }

  getStatus(_instance: SandboxInstance): SandboxStatus {
    return "running";
  }

  getLaunchCommand(
    projectId: string,
    projectsRoot: string,
    claudeArgs: string[],
  ): LaunchCommand {
    const settingsPath = this.settingsFilePath(projectId, projectsRoot);
    return {
      command: "claude",
      args: ["--settings", settingsPath, ...claudeArgs],
      cwd: null,
      env: {},
    };
  }

  private async writeSettingsFile(
    projectId: string,
    projectPath: string,
    projectsRoot: string,
  ): Promise<string | null> {
    const dir = join(projectsRoot, ".session-manager", "sandbox-settings");
    try {
      await Deno.mkdir(dir, { recursive: true });
    } catch { /* already exists */ }

    const settings = {
      sandbox: {
        enabled: true,
        filesystem: {
          denyWrite: ["~/"],
          denyRead: ["~/"],
          allowRead: [projectPath, "~/.gitconfig"],
          allowWrite: [projectPath],
        },
      },
    };

    const path = this.settingsFilePath(projectId, projectsRoot);
    try {
      await Deno.writeTextFile(path, JSON.stringify(settings, null, 2) + "\n");
      return path;
    } catch {
      return null;
    }
  }

  private settingsFilePath(projectId: string, projectsRoot: string): string {
    const safeId = projectId.replace(/[^a-zA-Z0-9-]/g, "_");
    return join(projectsRoot, ".session-manager", "sandbox-settings", `${safeId}.json`);
  }
}
