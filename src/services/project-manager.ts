import { join } from "@std/path";
import type { CreateProjectRequest, CreateProjectResult, ProjectSettings } from "../types.ts";

const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const CLAUDE_MD_TEMPLATE = `# {name}

## Commands

## Architecture

## Key Patterns
`;

const MCP_JSON_TEMPLATE = `{}\n`;

export function validateProjectName(name: string): string | null {
  if (!name) return "Project name is required";
  if (name.length > 100) return "Project name too long (max 100 chars)";
  if (!PROJECT_NAME_RE.test(name))
    return "Project name must start with alphanumeric and contain only letters, numbers, dots, hyphens, underscores";
  return null;
}

export async function createProject(
  projectsRoot: string,
  req: CreateProjectRequest,
): Promise<CreateProjectResult> {
  // Validate name
  const nameError = validateProjectName(req.name);
  if (nameError) return { ok: false, error: nameError };

  const projectDir = join(projectsRoot, req.name);

  // Check if directory already exists
  try {
    await Deno.stat(projectDir);
    return { ok: false, error: `Directory already exists: ${projectDir}` };
  } catch {
    // Good — doesn't exist yet
  }

  // Create directory
  try {
    await Deno.mkdir(projectDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Failed to create directory: ${err}` };
  }

  // Git init
  if (req.gitInit) {
    try {
      const cmd = new Deno.Command("git", {
        args: ["init"],
        cwd: projectDir,
        stdout: "piped",
        stderr: "piped",
      });
      const output = await cmd.output();
      if (!output.success) {
        const stderr = new TextDecoder().decode(output.stderr);
        return { ok: false, error: `git init failed: ${stderr}` };
      }

      // Add remote if provided
      if (req.gitRemote) {
        const remoteCmd = new Deno.Command("git", {
          args: ["remote", "add", "origin", req.gitRemote],
          cwd: projectDir,
          stdout: "piped",
          stderr: "piped",
        });
        const remoteOutput = await remoteCmd.output();
        if (!remoteOutput.success) {
          // Non-fatal: project was created, just remote failed
          console.warn(
            "Failed to add git remote:",
            new TextDecoder().decode(remoteOutput.stderr),
          );
        }
      }
    } catch (err) {
      return { ok: false, error: `git init failed: ${err}` };
    }
  }

  // Write CLAUDE.md
  if (req.claudeMd) {
    try {
      const content = CLAUDE_MD_TEMPLATE.replace(/\{name\}/g, req.name);
      await Deno.writeTextFile(join(projectDir, "CLAUDE.md"), content);
    } catch (err) {
      console.warn("Failed to write CLAUDE.md:", err);
    }
  }

  // Write .mcp.json
  if (req.mcpJson) {
    try {
      await Deno.writeTextFile(join(projectDir, ".mcp.json"), MCP_JSON_TEMPLATE);
    } catch (err) {
      console.warn("Failed to write .mcp.json:", err);
    }
  }

  return { ok: true, path: projectDir };
}

// ─── Project settings (stored in $PROJECTS_ROOT/.session-manager/projects.json) ───

async function settingsPath(projectsRoot: string): Promise<string> {
  const dir = join(projectsRoot, ".session-manager");
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch { /* already exists */ }
  return join(dir, "projects.json");
}

export async function loadAllProjectSettings(
  projectsRoot: string,
): Promise<Record<string, ProjectSettings>> {
  try {
    const path = await settingsPath(projectsRoot);
    const text = await Deno.readTextFile(path);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function getProjectSettings(
  projectsRoot: string,
  projectId: string,
): Promise<ProjectSettings | null> {
  const all = await loadAllProjectSettings(projectsRoot);
  return all[projectId] ?? null;
}

export async function saveProjectSettings(
  projectsRoot: string,
  projectId: string,
  settings: ProjectSettings,
): Promise<void> {
  const all = await loadAllProjectSettings(projectsRoot);
  all[projectId] = settings;
  const path = await settingsPath(projectsRoot);
  await Deno.writeTextFile(path, JSON.stringify(all, null, 2) + "\n");
}
