import { join } from "@std/path";
import type { SandboxHintCacheEntry } from "../types.ts";

const SANDBOX_PREFIX = "ccsm-";

export async function sandboxNameForProject(projectId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(projectId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${SANDBOX_PREFIX}${hex}`;
}

export function isCcsmSandbox(name: string): boolean {
  return name.startsWith(SANDBOX_PREFIX);
}

// ─── Hint cache persistence ───

export type HintCache = Record<string, SandboxHintCacheEntry>;

export async function loadHintCache(projectsRoot: string): Promise<HintCache> {
  const path = hintCachePath(projectsRoot);
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text) as HintCache;
  } catch {
    return {};
  }
}

export async function saveHintCache(
  projectsRoot: string,
  cache: HintCache,
): Promise<void> {
  const dir = join(projectsRoot, ".session-manager");
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch { /* already exists */ }
  const path = hintCachePath(projectsRoot);
  await Deno.writeTextFile(path, JSON.stringify(cache, null, 2) + "\n");
}

export function addToHintCache(
  cache: HintCache,
  sandboxName: string,
  projectId: string,
  projectPath: string,
): HintCache {
  return {
    ...cache,
    [sandboxName]: {
      projectId,
      projectPath,
      createdAt: new Date().toISOString(),
    },
  };
}

export function removeFromHintCache(
  cache: HintCache,
  sandboxName: string,
): HintCache {
  const copy = { ...cache };
  delete copy[sandboxName];
  return copy;
}

export function reconcileHintCache(
  cache: HintCache,
  liveSandboxNames: string[],
): HintCache {
  const liveSet = new Set(liveSandboxNames);
  const reconciled: HintCache = {};
  for (const [name, entry] of Object.entries(cache)) {
    if (liveSet.has(name)) {
      reconciled[name] = entry;
    }
  }
  return reconciled;
}

function hintCachePath(projectsRoot: string): string {
  return join(projectsRoot, ".session-manager", "sandboxes.json");
}
