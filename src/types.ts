// ─── Raw JSONL line types (on disk in ~/.claude/projects/) ───

export interface BaseMessage {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
  userType?: string;
  entrypoint?: string;
}

export interface UserMessage extends BaseMessage {
  type: "user";
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
}

export interface AssistantMessage extends BaseMessage {
  type: "assistant";
  message: {
    model: string;
    id: string;
    role: "assistant";
    content: ContentBlock[];
    stop_reason?: string | null;
    usage?: TokenUsage;
  };
}

export interface SystemMessage extends BaseMessage {
  type: "system";
  subtype?: string;
  content?: string;
  level?: string;
}

export interface FileHistorySnapshot extends BaseMessage {
  type: "file-history-snapshot";
  messageId: string;
  snapshot: { messageId: string; timestamp: string };
  isSnapshotUpdate: boolean;
}

export interface ProgressMessage extends BaseMessage {
  type: "progress";
  data: { type: string; hookEvent?: string; hookName?: string };
}

export interface QueueOperation extends BaseMessage {
  type: "queue-operation";
  operation: unknown;
}

export type JournalLine =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | FileHistorySnapshot
  | ProgressMessage
  | QueueOperation;

// ─── Content blocks inside messages ───

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  content: string;
  tool_use_id: string;
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// ─── API response types (what the frontend receives) ───

export interface ProjectSummary {
  id: string;
  path: string;
  displayName: string;
  sessionCount: number;
  lastActivity: string;
  isWorktree: boolean;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  summary: string;
  messageCount: number;
  toolCallCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  gitBranch: string | null;
  model: string | null;
  totalTokens: number;
  subAgentCount: number;
  webUrl: string | null;
  isActive: boolean;
  isRemoteConnected: boolean;
  entrypoint: string | null;
  aiSummary: string | null;
}

export interface TranscriptEntry {
  uuid: string;
  type: "user" | "assistant" | "system";
  text: string | null;
  toolCalls: ToolCallEntry[];
  model: string | null;
  timestamp: string;
  tokens: { input: number; output: number } | null;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface SubAgentInfo {
  agentId: string;
  agentType: string;
  description: string;
}

export interface DashboardStats {
  projects: number;
  sessions: number;
  active7d: number;
  tokens30d: number;
}

export interface SessionFileInfo {
  id: string;
  jsonlPath: string;
  dirPath: string | null;
  fileSizeBytes: number;
  mtimeMs: number;
}

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: DailyActivity[];
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface AppConfig {
  claudeHome: string;
  port: number;
  projectsRoot: string;
}

// ─── Project wizard types ───

export interface CreateProjectRequest {
  name: string;
  gitInit: boolean;
  gitRemote?: string;
  claudeMd: boolean;
  mcpJson: boolean;
  launchAfter: boolean;
}

export interface CreateProjectResult {
  ok: boolean;
  path?: string;
  error?: string;
}

export interface ProjectSettings {
  displayName?: string;
  tags?: string[];
  preferredModel?: string;
  customLaunchFlags?: string[];
}

// ─── Summary cache types ───

export interface SummaryCacheEntry {
  aiSummary: string;
  messageCount: number;
  generatedAt: string;
}

// ─── Launcher types ───

export type LaunchTarget = "terminal" | "web";

export interface LaunchRequest {
  mode: "resume" | "continue" | "new";
  projectId: string;
  projectPath: string;
  sessionId?: string;
  prompt?: string;
  target: LaunchTarget;
  webUrl?: string;
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
}
