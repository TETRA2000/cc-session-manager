import { join } from "@std/path";
import Anthropic from "@anthropic-ai/sdk";
import type { SessionSummary, SummaryCacheEntry, TranscriptEntry } from "../types.ts";
import { parseTranscript } from "./session-parser.ts";
import { findSessionFile } from "./project-discovery.ts";

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
    return cacheInMemory!;
  } catch {
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
  } catch (err) {
    console.warn("Failed to save summary cache:", err);
  }
}

export function getCachedSummary(
  cache: Record<string, SummaryCacheEntry>,
  sessionId: string,
  currentMessageCount: number,
): string | null {
  const entry = cache[sessionId];
  if (!entry) return null;
  // Cache is valid if message count hasn't changed
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
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const conversation = formatMessagesForPrompt(entries);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Summarize this Claude Code session in one short sentence (max 80 chars). Focus on what was built, fixed, or discussed. Be specific and concise. No quotes.

${conversation}`,
      },
    ],
  });

  const text = response.content[0];
  if (text.type === "text") {
    return text.text.trim().slice(0, 100);
  }
  return "";
}

// ─── Background refresh ───

let refreshInProgress = false;

export async function refreshSummaries(
  projectsRoot: string,
  claudeHome: string,
  sessions: SessionSummary[],
): Promise<void> {
  if (refreshInProgress) return;
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return;

  refreshInProgress = true;
  try {
    const cache = await loadSummaryCache(projectsRoot);
    const stale = sessions.filter(
      (s) => getCachedSummary(cache, s.id, s.messageCount) === null && s.messageCount > 0,
    );

    if (stale.length === 0) return;

    // Process up to 5 at a time
    const batch = stale.slice(0, 5);
    for (const session of batch) {
      try {
        const found = await findSessionFile(claudeHome, session.id);
        if (!found) continue;

        const entries = await parseTranscript(found.filePath);
        if (entries.length === 0) continue;

        const aiSummary = await generateSummary(entries);
        if (aiSummary) {
          cache[session.id] = {
            aiSummary,
            messageCount: session.messageCount,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn(`Failed to generate summary for ${session.id}:`, err);
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
  for (const session of sessions) {
    const cached = getCachedSummary(cache, session.id, session.messageCount);
    if (cached) {
      session.aiSummary = cached;
    }
  }
}
