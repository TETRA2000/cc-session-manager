import type {
  LaunchCommand,
  SandboxConfig,
  SandboxInstance,
  SandboxResult,
  SandboxStrategy,
  StrategyAvailability,
} from "../types.ts";
import { DependencyChecker } from "./dependency-checker.ts";
import { SbxBackend } from "./sbx-backend.ts";
import { NativeBackend } from "./native-backend.ts";
import {
  loadHintCache,
  reconcileHintCache,
  sandboxNameForProject,
  saveHintCache,
} from "./sandbox-naming.ts";

export class SandboxManager {
  private depChecker: DependencyChecker;
  private sbxBackend: SbxBackend;
  private nativeBackend: NativeBackend;
  private projectsRoot: string;

  constructor(projectsRoot: string, sbxCommand = "sbx") {
    this.projectsRoot = projectsRoot;
    this.depChecker = new DependencyChecker(sbxCommand);
    this.sbxBackend = new SbxBackend(projectsRoot, sbxCommand);
    this.nativeBackend = new NativeBackend();
  }

  async getAvailableStrategies(): Promise<StrategyAvailability[]> {
    return await this.depChecker.checkAll();
  }

  async ensureSandbox(
    projectId: string,
    projectPath: string,
    config: SandboxConfig,
  ): Promise<SandboxResult<SandboxInstance>> {
    const dep = await this.depChecker.check(config.strategy);
    if (!dep.available) {
      return {
        ok: false,
        error: dep.error ?? `Strategy "${config.strategy}" is not available`,
        errorCode: "DEPENDENCY_MISSING",
      };
    }

    if (config.strategy === "sbx") {
      const existing = await this.getSandbox(projectId);
      if (existing && existing.status === "running") {
        return { ok: true, data: existing };
      }
      return await this.sbxBackend.create(projectId, projectPath, config);
    }

    if (config.strategy === "native") {
      return await this.nativeBackend.create(
        projectId,
        projectPath,
        config,
        this.projectsRoot,
      );
    }

    return {
      ok: false,
      error: `Unknown strategy: ${config.strategy}`,
      errorCode: "BACKEND_ERROR",
    };
  }

  async getSandbox(projectId: string): Promise<SandboxInstance | null> {
    const name = await sandboxNameForProject(projectId);
    const instances = await this.sbxBackend.list();
    return instances.find((i) => i.name === name) ?? null;
  }

  async listSandboxes(): Promise<SandboxInstance[]> {
    return await this.sbxBackend.list();
  }

  async stopSandbox(sandboxName: string): Promise<SandboxResult> {
    return await this.sbxBackend.stop(sandboxName);
  }

  async removeSandbox(sandboxName: string): Promise<SandboxResult> {
    return await this.sbxBackend.remove(sandboxName);
  }

  async execInSandbox(
    sandboxName: string,
    command: string[],
  ): Promise<SandboxResult<string>> {
    return await this.sbxBackend.exec(sandboxName, command);
  }

  streamFromSandbox(
    sandboxName: string,
    command: string[],
  ): ReadableStream<Uint8Array> {
    return this.sbxBackend.stream(sandboxName, command);
  }

  getLaunchCommand(
    instance: SandboxInstance,
    claudeArgs: string[],
  ): LaunchCommand {
    if (instance.strategy === "sbx") {
      return this.sbxBackend.getLaunchCommand(instance.name, claudeArgs);
    }
    return this.nativeBackend.getLaunchCommand(
      instance.projectId,
      this.projectsRoot,
      claudeArgs,
    );
  }

  async reconcileOnStartup(): Promise<void> {
    const instances = await this.sbxBackend.list();
    const liveNames = instances.map((i) => i.name);
    const cache = await loadHintCache(this.projectsRoot);
    const reconciled = reconcileHintCache(cache, liveNames);
    await saveHintCache(this.projectsRoot, reconciled);
  }
}
