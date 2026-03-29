import { join } from "@std/path";
import type { SessionSummary, SummaryCacheEntry, TranscriptEntry } from "../types.ts";
import { parseTranscript } from "./session-parser.ts";
import { findSessionFile } from "./project-discovery.ts";

function log(...args: unknown[]) {
  console.log("[summary]", ...args);
}

// ─── Cache management ───

let cacheInMemory: Record<string, SummaryCacheEntry> | null = null;

export async function loadSummaryCache(
  projectsRoot: string,
): Promise<Record<string, SummaryCacheEntry>> {
  if (cacheInMemory) return cacheInMemory;
  try {
    const path = join(projectsRoot, ".session-manager", "summaries.json");
    const text = await Deno.readTextFile(path);
    cacheInMemory = JSON.parse(text);
    log(`Cache loaded: ${Object.keys(cacheInMemory!).length} entries`);
    return cacheInMemory!;
  } catch {
    log("No cache file found, starting fresh");
    cacheInMemory = {};
    return cacheInMemory;
  }
}

async function saveSummaryCache(
  projectsRoot: string,
  cache: Record<string, SummaryCacheEntry>,
): Promise<void> {
  cacheInMemory = cache;
  try {
    const dir = join(projectsRoot, ".session-manager");
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(
      join(dir, "summaries.json"),
      JSON.stringify(cache, null, 2) + "\n",
    );
    log(`Cache saved: ${Object.keys(cache).length} entries`);
  } catch (err) {
    log("ERROR saving cache:", err);
  }
}

export function getCachedSummary(
  cache: Record<string, SummaryCacheEntry>,
  sessionId: string,
  currentMessageCount: number,
): string | null {
  const entry = cache[sessionId];
  if (!entry) return null;
  if (entry.messageCount === currentMessageCount) return entry.aiSummary;
  return null;
}

// ─── Summary generation ───

function formatMessagesForPrompt(entries: TranscriptEntry[]): string {
  const relevant = entries
    .filter((e) => e.type === "user" || e.type === "assistant")
    .slice(0, 10);

  return relevant
    .map((e) => {
      const role = e.type === "user" ? "User" : "Assistant";
      const text = e.text?.slice(0, 300) || "";
      const tools = e.toolCalls.length > 0
        ? ` [used tools: ${e.toolCalls.map((t) => t.name).join(", ")}]`
        : "";
      return `${role}: ${text}${tools}`;
    })
    .join("\n");
}

export async function generateSummary(
  entries: TranscriptEntry[],
): Promise<string> {
  const conversation = formatMessagesForPrompt(entries);
  const prompt = `Summarize this Claude Code session in one short sentence (max 80 chars). Focus on what was built, fixed, or discussed. Be specific and concise. No quotes.\n\n${conversation}`;

  log(`Calling claude -p (${conversation.length} chars context, ${entries.length} entries)`);
  const startMs = Date.now();

  const cmd = new Deno.Command("claude", {
    args: ["-p", prompt, "--model", "haiku", "--no-session-persistence", "--tools", ""],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  const elapsed = Date.now() - startMs;

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    log(`ERROR claude -p failed (${elapsed}ms):`, stderr.slice(0, 200));
    throw new Error(`claude -p failed: ${stderr}`);
  }

  const text = new TextDecoder().decode(output.stdout).trim();
  const result = text.slice(0, 100);
  log(`Generated (${elapsed}ms): "${result}"`);
  return result;
}

// ─── Background refresh ───

let refreshInProgress = false;

export async function refreshSummaries(
  projectsRoot: string,
  claudeHome: string,
  sessions: SessionSummary[],
): Promise<void> {
  if (refreshInProgress) {
    log("Refresh already in progress, skipping");
    return;
  }

  refreshInProgress = true;
  try {
    const cache = await loadSummaryCache(projectsRoot);
    const stale = sessions.filter(
      (s) => getCachedSummary(cache, s.id, s.messageCount) === null && s.messageCount > 0,
    );

    if (stale.length === 0) {
      log("All summaries up to date");
      return;
    }

    log(`${stale.length} sessions need summaries, processing up to 5`);
    const batch = stale.slice(0, 5);
    for (const session of batch) {
      try {
        log(`Processing ${session.id.slice(0, 8)}... (${session.messageCount} msgs, "${session.summary.slice(0, 40)}")`);
        const found = await findSessionFile(claudeHome, session.id);
        if (!found) {
          log(`  Session file not found, skipping`);
          continue;
        }

        const entries = await parseTranscript(found.filePath);
        if (entries.length === 0) {
          log(`  No transcript entries, skipping`);
          continue;
        }

        log(`  Parsed ${entries.length} transcript entries, generating summary...`);
        const aiSummary = await generateSummary(entries);
        if (aiSummary) {
          cache[session.id] = {
            aiSummary,
            messageCount: session.messageCount,
            generatedAt: new Date().toISOString(),
          };
          log(`  Cached: "${aiSummary}"`);
        }
      } catch (err) {
        log(`  ERROR for ${session.id.slice(0, 8)}:`, err);
      }
    }

    await saveSummaryCache(projectsRoot, cache);
  } finally {
    refreshInProgress = false;
  }
}

// ─── Attach cached summaries to sessions ───

export async function attachSummaries(
  projectsRoot: string,
  sessions: SessionSummary[],
): Promise<void> {
  const cache = await loadSummaryCache(projectsRoot);
  let attached = 0;
  for (const session of sessions) {
    const cached = getCachedSummary(cache, session.id, session.messageCount);
    if (cached) {
      session.aiSummary = cached;
      attached++;
    }
  }
  log(`Attached ${attached}/${sessions.length} cached summaries`);
}
