import type {
  AssistantMessage,
  ContentBlock,
  ImportanceLevel,
  JournalLine,
  SessionSummary,
  SystemMessage,
  TextBlock,
  TimelineEntry,
  ToolCallEntry,
  ToolResultBlock,
  ToolUseBlock,
  TranscriptEntry,
  UserMessage,
} from "../types.ts";

// ─── Streaming JSONL reader ───

export async function* readJsonlStream(filePath: string): AsyncGenerator<JournalLine> {
  const file = await Deno.open(filePath, { read: true });
  const readable = file.readable.pipeThrough(new TextDecoderStream());

  let buffer = "";
  for await (const chunk of readable) {
    buffer += chunk;
    const lines = buffer.split("\n");
    // Keep last (possibly incomplete) segment in buffer
    buffer = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        yield JSON.parse(trimmed) as JournalLine;
      } catch {
        console.warn("Skipping malformed JSONL line:", trimmed.slice(0, 80));
      }
    }
  }
  // Process remaining buffer
  const trimmed = buffer.trim();
  if (trimmed.length > 0) {
    try {
      yield JSON.parse(trimmed) as JournalLine;
    } catch {
      console.warn("Skipping malformed JSONL line:", trimmed.slice(0, 80));
    }
  }
}

// ─── Non-display types ───

const NON_DISPLAY_TYPES = new Set(["file-history-snapshot", "progress", "queue-operation"]);

function isDisplayable(line: JournalLine): boolean {
  return !NON_DISPLAY_TYPES.has(line.type);
}

// ─── Extract metadata from a session JSONL file ───

export async function extractSessionMetadata(
  filePath: string,
  sessionId: string,
  projectId: string,
): Promise<SessionSummary> {
  let summary = "";
  let gitBranch: string | null = null;
  let model: string | null = null;
  let cwd: string | null = null;
  let webUrl: string | null = null;
  let isRemoteConnected = false;
  let entrypoint: string | null = null;
  let messageCount = 0;
  let toolCallCount = 0;
  let firstTimestamp = "";
  let lastTimestamp = "";
  let totalOutputTokens = 0;
  let foundFirstUserContent = false;
  let lastUserMessage = "";

  for await (const line of readJsonlStream(filePath)) {
    // Track timestamps
    if (line.timestamp) {
      if (!firstTimestamp) firstTimestamp = line.timestamp;
      lastTimestamp = line.timestamp;
    }

    // Extract gitBranch and cwd from any line that has them
    if (!gitBranch && line.gitBranch) {
      gitBranch = line.gitBranch;
    }
    if (!cwd && line.cwd) {
      cwd = line.cwd;
    }

    // Extract entrypoint from first message that has it
    if (!entrypoint && line.entrypoint) {
      entrypoint = line.entrypoint;
    }

    // Track remote control state:
    // - Connect: system message with subtype "bridge_status" and url field
    // - Disconnect: system message with subtype "local_command" containing "Remote Control disconnected"
    if (line.type === "system") {
      const sMsg = line as SystemMessage;
      if (sMsg.subtype === "bridge_status") {
        const rawLine = line as unknown as Record<string, unknown>;
        if (typeof rawLine.url === "string") {
          webUrl = rawLine.url;
          isRemoteConnected = true;
        }
      } else if (sMsg.subtype === "local_command" && sMsg.content?.includes("Remote Control disconnected")) {
        isRemoteConnected = false;
      }
    }

    // Extract model from first assistant message
    if (!model && line.type === "assistant") {
      const aMsg = line as AssistantMessage;
      model = aMsg.message.model ?? null;
    }

    // Count displayable, non-meta messages
    if (isDisplayable(line) && !line.isMeta) {
      if (line.type === "user" || line.type === "assistant" || line.type === "system") {
        messageCount++;
      }
    }

    // Count tool_use blocks in assistant messages
    if (line.type === "assistant") {
      const aMsg = line as AssistantMessage;
      for (const block of aMsg.message.content) {
        if (block.type === "tool_use") {
          toolCallCount++;
        }
      }
      if (aMsg.message.usage?.output_tokens) {
        totalOutputTokens += aMsg.message.usage.output_tokens;
      }
    }

    // Extract summary from first non-meta user message, and track last user message
    if (line.type === "user" && !line.isMeta) {
      const uMsg = line as UserMessage;
      const text = extractTextFromContent(uMsg.message.content);
      if (text) {
        if (!foundFirstUserContent) {
          summary = text.length > 120 ? text.slice(0, 120) + "..." : text;
          foundFirstUserContent = true;
        }
        lastUserMessage = text.length > 120 ? text.slice(0, 120) + "..." : text;
      }
    }
  }

  return {
    id: sessionId,
    projectId,
    summary: summary || "(no content)",
    messageCount,
    toolCallCount,
    firstTimestamp: firstTimestamp || new Date().toISOString(),
    lastTimestamp: lastTimestamp || new Date().toISOString(),
    gitBranch,
    model,
    totalTokens: totalOutputTokens,
    subAgentCount: 0,
    webUrl,
    lastMessage: lastUserMessage || null,
    isActive: false, // set by caller from ~/.claude/sessions/
    isRemoteConnected,
    entrypoint,
    aiSummary: null, // populated by summary-service
  };
}

// ─── Full transcript parser ───

export async function parseTranscript(filePath: string): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = [];
  // Map tool_use id -> index in entries array + index in toolCalls array
  const pendingToolCalls = new Map<string, { entryIndex: number; toolIndex: number }>();

  for await (const line of readJsonlStream(filePath)) {
    // Filter out non-display types and isMeta
    if (!isDisplayable(line) || line.isMeta) continue;

    if (line.type === "user") {
      const uMsg = line as UserMessage;
      const content = uMsg.message.content;

      // Check if this user message contains tool_result blocks
      if (Array.isArray(content)) {
        const toolResults: ToolResultBlock[] = [];
        let textParts: string[] = [];

        for (const block of content) {
          if (block.type === "tool_result") {
            toolResults.push(block as ToolResultBlock);
          } else if (block.type === "text") {
            textParts.push((block as TextBlock).text);
          }
        }

        // Attach tool results to their corresponding tool_use entries
        for (const result of toolResults) {
          const ref = pendingToolCalls.get(result.tool_use_id);
          if (ref) {
            const entry = entries[ref.entryIndex];
            entry.toolCalls[ref.toolIndex].result = result.content;
            entry.toolCalls[ref.toolIndex].isError = result.is_error ?? false;
            pendingToolCalls.delete(result.tool_use_id);
          }
        }

        // If this user message is ONLY tool_results, skip creating an entry
        if (textParts.length === 0 && toolResults.length > 0) {
          continue;
        }

        // Otherwise create entry with the text parts
        entries.push({
          uuid: uMsg.uuid ?? crypto.randomUUID(),
          type: "user",
          text: textParts.join("\n") || null,
          toolCalls: [],
          model: null,
          timestamp: uMsg.timestamp ?? "",
          tokens: null,
        });
      } else {
        // Plain string content
        entries.push({
          uuid: uMsg.uuid ?? crypto.randomUUID(),
          type: "user",
          text: content || null,
          toolCalls: [],
          model: null,
          timestamp: uMsg.timestamp ?? "",
          tokens: null,
        });
      }
    } else if (line.type === "assistant") {
      const aMsg = line as AssistantMessage;
      const textParts: string[] = [];
      const toolCalls: ToolCallEntry[] = [];

      for (const block of aMsg.message.content) {
        if (block.type === "text") {
          textParts.push((block as TextBlock).text);
        } else if (block.type === "tool_use") {
          const tu = block as ToolUseBlock;
          toolCalls.push({
            id: tu.id,
            name: tu.name,
            input: tu.input,
          });
        }
        // Skip thinking blocks for display
      }

      const entryIndex = entries.length;
      entries.push({
        uuid: aMsg.uuid ?? crypto.randomUUID(),
        type: "assistant",
        text: textParts.join("\n") || null,
        toolCalls,
        model: aMsg.message.model ?? null,
        timestamp: aMsg.timestamp ?? "",
        tokens: aMsg.message.usage
          ? {
            input: aMsg.message.usage.input_tokens,
            output: aMsg.message.usage.output_tokens,
          }
          : null,
      });

      // Register pending tool calls for result matching
      for (let i = 0; i < toolCalls.length; i++) {
        pendingToolCalls.set(toolCalls[i].id, { entryIndex, toolIndex: i });
      }
    } else if (line.type === "system") {
      entries.push({
        uuid: line.uuid ?? crypto.randomUUID(),
        type: "system",
        text: line.content ?? null,
        toolCalls: [],
        model: null,
        timestamp: line.timestamp ?? "",
        tokens: null,
      });
    }
  }

  return entries;
}

// ─── Quick cwd extraction (reads only first few lines) ───

export async function extractCwd(filePath: string): Promise<string | null> {
  // Read just the first few lines to find cwd quickly
  const file = await Deno.open(filePath, { read: true });
  try {
    const buf = new Uint8Array(4096); // first 4KB is enough
    const n = await file.read(buf);
    if (!n) return null;
    const text = new TextDecoder().decode(buf.subarray(0, n));
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.cwd) return obj.cwd;
      } catch { /* skip */ }
    }
  } finally {
    file.close();
  }
  return null;
}

// ─── Importance classification ───

export function classifyImportance(
  entry: TranscriptEntry,
  isLastInActiveSession: boolean,
): { importance: ImportanceLevel; isAttention: boolean } {
  // Tool-only messages (no text) are low importance
  if (entry.type === "assistant" && !entry.text && entry.toolCalls.length > 0) {
    return { importance: "low", isAttention: false };
  }

  // System error messages
  if (entry.type === "system") {
    return { importance: "high", isAttention: isLastInActiveSession };
  }

  // Check for error tool results
  const hasError = entry.toolCalls.some((tc) => tc.isError);
  if (hasError) {
    return { importance: "high", isAttention: isLastInActiveSession };
  }

  // Assistant messages with questions or AskUserQuestion tool
  // Only high when it's the last message in an active session (still unanswered)
  if (entry.type === "assistant" && isLastInActiveSession) {
    const hasQuestion = entry.text?.trimEnd().endsWith("?") ?? false;
    const hasAskUser = entry.toolCalls.some((tc) => tc.name === "AskUserQuestion");
    if (hasQuestion || hasAskUser) {
      return { importance: "high", isAttention: true };
    }
  }

  // User messages are always normal
  if (entry.type === "user") {
    return { importance: "normal", isAttention: false };
  }

  // Default assistant text responses are normal
  return { importance: "normal", isAttention: false };
}

// ─── Lightweight timeline entry extraction ───

type RawTimelineEntry = Omit<TimelineEntry, "importance" | "isAttention" | "projectName" | "sessionSummary" | "isRemoteConnected">;

export interface TimelineExtractionResult {
  entries: RawTimelineEntry[];
  summary: string;
  isRemoteConnected: boolean;
}

export async function extractTimelineEntries(
  filePath: string,
  sessionId: string,
  projectId: string,
  options?: { limit?: number; before?: string },
): Promise<TimelineExtractionResult> {
  const entries: RawTimelineEntry[] = [];
  let firstUserText = "";
  let isRemoteConnected = false;

  for await (const line of readJsonlStream(filePath)) {
    // Track remote control state (same logic as extractSessionMetadata)
    if (line.type === "system") {
      const sMsg = line as SystemMessage;
      if (sMsg.subtype === "bridge_status") {
        const rawLine = line as unknown as Record<string, unknown>;
        if (typeof rawLine.url === "string") {
          isRemoteConnected = true;
        }
      } else if (sMsg.subtype === "local_command" && sMsg.content?.includes("Remote Control disconnected")) {
        isRemoteConnected = false;
      }
    }

    if (!isDisplayable(line) || line.isMeta) continue;

    // Extract first user text for summary
    if (!firstUserText && line.type === "user") {
      const uMsg = line as UserMessage;
      const text = extractTextFromContent(uMsg.message.content);
      if (text) {
        firstUserText = text.length > 120 ? text.slice(0, 120) + "..." : text;
      }
    }

    const timestamp = line.timestamp ?? "";

    // Apply before filter
    if (options?.before && timestamp >= options.before) continue;

    if (line.type === "user") {
      const uMsg = line as UserMessage;
      const text = extractTextFromContent(uMsg.message.content);

      // Skip user messages that are only tool results
      if (Array.isArray(uMsg.message.content)) {
        const hasText = uMsg.message.content.some((b) => b.type === "text");
        const hasToolResult = uMsg.message.content.some((b) => b.type === "tool_result");
        if (!hasText && hasToolResult) continue;
      }

      entries.push({
        uuid: uMsg.uuid ?? crypto.randomUUID(),
        sessionId,
        projectId,
        type: "user",
        text: text ? (text.length > 200 ? text.slice(0, 200) + "..." : text) : null,
        timestamp,
        model: null,
        toolNames: [],
      });
    } else if (line.type === "assistant") {
      const aMsg = line as AssistantMessage;
      const textParts: string[] = [];
      const toolNames: string[] = [];

      for (const block of aMsg.message.content) {
        if (block.type === "text") {
          textParts.push((block as TextBlock).text);
        } else if (block.type === "tool_use") {
          toolNames.push((block as ToolUseBlock).name);
        }
      }

      const text = textParts.join("\n");
      entries.push({
        uuid: aMsg.uuid ?? crypto.randomUUID(),
        sessionId,
        projectId,
        type: "assistant",
        text: text ? (text.length > 200 ? text.slice(0, 200) + "..." : text) : null,
        timestamp,
        model: aMsg.message.model ?? null,
        toolNames,
      });
    } else if (line.type === "system") {
      entries.push({
        uuid: line.uuid ?? crypto.randomUUID(),
        sessionId,
        projectId,
        type: "system",
        text: (line as SystemMessage).content ?? null,
        timestamp,
        model: null,
        toolNames: [],
      });
    }
  }

  // Sort by timestamp descending (newest first)
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply limit
  const limited = (options?.limit && entries.length > options.limit)
    ? entries.slice(0, options.limit)
    : entries;

  return {
    entries: limited,
    summary: firstUserText || "(no content)",
    isRemoteConnected,
  };
}

// ─── Helpers ───

function extractTextFromContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return stripCommandTags(content);
  const textBlocks = content.filter((b): b is TextBlock => b.type === "text");
  return stripCommandTags(textBlocks.map((b) => b.text).join("\n"));
}

/**
 * Strip Claude Code command XML tags from text.
 * e.g. "<command-message>foo</command-message>\n<command-name>/foo</command-name>..."
 * becomes just the display text or the command name.
 */
function stripCommandTags(text: string): string {
  // If text contains command tags, extract the useful content
  if (text.includes("<command-message>") || text.includes("<command-name>")) {
    // Try to extract display text from command-message
    const cmdMatch = text.match(/<command-message>([\s\S]*?)<\/command-message>/);
    if (cmdMatch) return cmdMatch[1].trim();
    // Fallback: extract from command-name
    const nameMatch = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
    if (nameMatch) return nameMatch[1].trim();
  }
  return text;
}
