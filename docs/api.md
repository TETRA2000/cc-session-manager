# API Reference

All endpoints are served at `http://127.0.0.1:3456/api/`.

## GET /api/dashboard

Returns aggregate statistics and the 10 most recent sessions with content.

**Response:**

```json
{
  "stats": {
    "projects": 89,
    "sessions": 507,
    "active7d": 53,
    "tokens30d": 0
  },
  "recentSessions": [
    {
      "id": "c0855413-6e78-489f-abee-d755d354fdf0",
      "projectId": "-Users-takahiko-repo-cc-kanban",
      "summary": "Fix authentication bug in login flow",
      "messageCount": 42,
      "toolCallCount": 15,
      "firstTimestamp": "2026-03-27T14:08:58.896Z",
      "lastTimestamp": "2026-03-27T15:30:00.000Z",
      "gitBranch": "main",
      "model": "claude-opus-4-6",
      "totalTokens": 98700,
      "subAgentCount": 3
    }
  ]
}
```

## GET /api/projects

Returns all discovered projects sorted by last activity.

**Response:**

```json
{
  "projects": [
    {
      "id": "-Users-takahiko-repo-my-app",
      "path": "/Users/takahiko/repo/my-app",
      "displayName": "my-app",
      "sessionCount": 12,
      "lastActivity": "2026-03-29T10:00:00.000Z",
      "isWorktree": false
    }
  ]
}
```

## GET /api/projects/:projectId

Returns a single project with all its sessions.

**Parameters:**
- `projectId` — Encoded directory name (e.g., `-Users-takahiko-repo-my-app`)

**Response:**

```json
{
  "project": { /* ProjectSummary */ },
  "sessions": [ /* SessionSummary[] */ ]
}
```

## GET /api/sessions/:sessionId/transcript

Returns the full parsed transcript for a session. Searches across all projects to find the session.

**Parameters:**
- `sessionId` — UUID (e.g., `c0855413-6e78-489f-abee-d755d354fdf0`)

**Response:**

```json
{
  "meta": { /* SessionSummary */ },
  "entries": [
    {
      "uuid": "8e8d4d0c-831e-4b5f-997e-c2aa1ce877af",
      "type": "user",
      "text": "Fix the login bug",
      "toolCalls": [],
      "model": null,
      "timestamp": "2026-03-27T14:08:58.896Z",
      "tokens": null
    },
    {
      "uuid": "a1b2c3d4-...",
      "type": "assistant",
      "text": "I'll investigate the login flow.",
      "toolCalls": [
        {
          "id": "toolu_01KsLAje88yGeqHw3DpUW84q",
          "name": "Read",
          "input": { "file_path": "/src/auth.ts" },
          "result": "file contents...",
          "isError": false
        }
      ],
      "model": "claude-opus-4-6",
      "timestamp": "2026-03-27T14:09:02.879Z",
      "tokens": { "input": 1500, "output": 800 }
    }
  ]
}
```

## POST /api/launch

Launch a Claude Code session in Terminal or browser.

**Request body:**

```json
{
  "mode": "resume",
  "projectId": "-Users-takahiko-repo-my-app",
  "sessionId": "c0855413-6e78-489f-abee-d755d354fdf0",
  "target": "terminal",
  "webUrl": "https://claude.ai/code/session_01X7qWxEnMVNeoTvhehACRWZ"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `"resume"` \| `"continue"` \| `"new"` | Yes | Launch mode |
| `projectId` | string | Yes | Encoded project directory name |
| `sessionId` | string | For resume | Session UUID to resume |
| `target` | `"terminal"` \| `"web"` | No (default: `"terminal"`) | Where to launch |
| `prompt` | string | No | Initial prompt for "new" mode |
| `webUrl` | string | No | Web session URL for "web" target |

**Response:**

```json
{ "ok": true }
```

**Error response:**

```json
{ "ok": false, "error": "Project path not found: /invalid/path" }
```

**Target behavior:**
- `terminal`: Opens Terminal.app via osascript with `cd <path> && claude --resume <id>`
- `web`: Opens `webUrl` in default browser (falls back to `https://claude.ai/code` if no URL provided)

---

## Type Definitions

### ProjectSummary

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Encoded directory name |
| `path` | string | Decoded absolute filesystem path |
| `displayName` | string | Last path segment |
| `sessionCount` | number | Number of JSONL session files |
| `lastActivity` | string | ISO timestamp of most recent file modification |
| `isWorktree` | boolean | Whether this is a Claude worktree |

### SessionSummary

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session UUID |
| `projectId` | string | Parent project encoded ID |
| `summary` | string | First user message text (truncated to 120 chars) |
| `messageCount` | number | Count of displayable messages |
| `toolCallCount` | number | Count of tool_use blocks |
| `firstTimestamp` | string | ISO timestamp of first message |
| `lastTimestamp` | string | ISO timestamp of last message |
| `gitBranch` | string \| null | Git branch name |
| `model` | string \| null | Primary model used |
| `totalTokens` | number | Sum of output tokens |
| `subAgentCount` | number | Number of sub-agent sessions |
| `webUrl` | string \| null | Claude Code web session URL (from `/remote-control`) |

### TranscriptEntry

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | string | Message UUID |
| `type` | `"user"` \| `"assistant"` \| `"system"` | Message type |
| `text` | string \| null | Text content |
| `toolCalls` | ToolCallEntry[] | Tool invocations (assistant only) |
| `model` | string \| null | Model used (assistant only) |
| `timestamp` | string | ISO timestamp |
| `tokens` | `{ input, output }` \| null | Token usage (assistant only) |
