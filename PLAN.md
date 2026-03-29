# Claude Code Session Manager - Implementation Plan

## Context

A Deno-based local desktop application that provides a browser GUI for managing Claude Code sessions. The user has a comprehensive PRD (`claude-session-manager-prd.md`) and 3 HTML UI prototypes (`mock/01-dashboard.html`, `mock/02-projects.html`, `mock/03-transcript.html`). The repo currently contains no source code - only these design artifacts. Deno 2.7.7 is installed.

The app reads session data from `~/.claude/` (read-only), serves a web UI on `127.0.0.1:3456`, and enforces strict permissions via Deno's sandbox.

---

## Phase 1 - MVP (Core Reader + Web GUI)

### Architecture Overview

```
Browser (Preact+HTM)  <-->  Deno HTTP Server (Hono)  <-->  ~/.claude/ (read-only)
     static/                    src/                        JSONL files
```

### Project Structure

```
cc-session-manager/
├── deno.json
├── main.ts
├── CLAUDE.md
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── server.ts
│   ├── routes/
│   │   ├── api.ts
│   │   ├── projects.ts
│   │   ├── sessions.ts
│   │   └── dashboard.ts
│   └── services/
│       ├── project-discovery.ts
│       └── session-parser.ts
├── static/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── lib/
│   │   ├── api.js
│   │   ├── router.js
│   │   └── format.js
│   └── components/
│       ├── header.js
│       ├── stat-card.js
│       ├── session-row.js
│       ├── dashboard.js
│       ├── projects.js
│       ├── tool-call.js
│       └── transcript.js
└── tests/
    ├── fixtures/sample-session.jsonl
    ├── session-parser.test.ts
    └── project-discovery.test.ts
```

### Real Data Structures (verified from ~/.claude/)

**JSONL message types**: `user`, `assistant`, `file-history-snapshot`, `progress`, `queue-operation`, `system`
- Skip non-display types: `file-history-snapshot`, `progress`, `queue-operation`
- Skip `isMeta: true` messages (system-generated slash commands)
- Assistant content blocks: `text`, `thinking`, `tool_use`
- Tool results appear as `tool_result` blocks in subsequent user messages

**Directory encoding**: `/Users/takahiko/repo/my-app` -> `-Users-takahiko-repo-my-app`
- Worktree dirs contain `--claude-worktrees-` (double hyphen)
- Session files: `{uuid}.jsonl` at project dir root
- Session dirs: `{uuid}/subagents/agent-{id}.jsonl` + `agent-{id}.meta.json`
- `sessions-index.json` exists in some projects but is usually empty - cannot rely on it
- `history.jsonl`: `{display, timestamp, project, sessionId}` per prompt
- `stats-cache.json`: `{dailyActivity: [{date, messageCount, sessionCount, toolCallCount}]}`

### Tech Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| HTTP framework | **Hono** (JSR) | Built-in `serveStatic`, TypeScript-first, zero transitive deps, well-maintained |
| Frontend | **Preact + HTM** (CDN importmap) | No build step, ~4KB runtime, HTM tagged templates replace JSX |
| Styling | **Custom CSS** (from mocks) | Mocks already define complete design system with variables, dark mode, responsive. Tailwind CDN adds 100KB+ JIT runtime for no benefit |
| Routing | **Hash-based** (`#/`, `#/projects`, `#/transcript/:id`) | No server-side fallback needed, works with static file serving |
| State | **Preact Signals** | Reactive, no boilerplate, no prop drilling |
| JSONL parsing | **Streaming** (`TextDecoderStream` + line splitting) | Files up to 19MB/3800 lines observed; cannot load fully into memory |

### Implementation Order

#### Step 1: Scaffolding
- **`deno.json`** - Tasks (`dev`, `start`, `test`, `check`), imports (Hono from JSR, @std/path, @std/streams, @std/cli), compiler options
- **`src/types.ts`** - All interfaces: `JournalLine` union (`UserMessage | AssistantMessage | SystemMessage | ...`), `ContentBlock` union (`TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock`), `ProjectSummary`, `SessionSummary`, `TranscriptEntry`, `ToolCallEntry`, `AppConfig`

#### Step 2: Core Parsing
- **`src/services/session-parser.ts`**
  - `readJsonlStream(filePath): AsyncGenerator<JournalLine>` - Stream JSONL line by line, skip malformed lines
  - `extractSessionMetadata(filePath, sessionId, projectId): Promise<SessionSummary>` - Read first ~20 lines for summary/branch/model, stream-count the rest
  - `parseTranscript(filePath): Promise<TranscriptEntry[]>` - Full parse, pair tool_use with tool_result by ID, filter non-display types
- **`tests/fixtures/sample-session.jsonl`** + **`tests/session-parser.test.ts`**

#### Step 3: Project Discovery
- **`src/services/project-discovery.ts`**
  - `discoverProjects(claudeHome): Promise<ProjectSummary[]>` - Scan `projects/` dir, decode names, count sessions, get latest mtime
  - `decodeDirName(encoded): string` - Replace leading `-` with `/`, then `-` with `/`; handle `--` for literal hyphens
  - `listSessionFiles(projectDir): Promise<SessionFileInfo[]>` - Enumerate `*.jsonl` files (top-level only, not in subdirs)
  - `listSubagents(sessionDir): Promise<SubagentInfo[]>` - Read `subagents/` dir and `.meta.json` files
  - In-memory cache with mtime-based invalidation for parsed metadata
- **`tests/project-discovery.test.ts`**

#### Step 4: Config + Server + Routes
- **`src/config.ts`** - Load defaults (claudeHome, port 3456), merge CLI args, optional config file
- **`src/routes/dashboard.ts`** - `GET /api/dashboard` -> stats + 10 most recent sessions across all projects
- **`src/routes/projects.ts`** - `GET /api/projects` (list all), `GET /api/projects/:id` (project detail + sessions)
- **`src/routes/sessions.ts`** - `GET /api/sessions/:id/transcript` (full parsed transcript)
- **`src/routes/api.ts`** - Aggregate route registration
- **`src/server.ts`** - Hono app: register `/api/*` routes + `serveStatic` for `./static/`
- **`main.ts`** - CLI arg parsing, config load, verify `~/.claude/projects/` exists, start `Deno.serve`, open browser

#### Step 5: Frontend
- **`static/index.html`** - SPA shell with `<script type="importmap">` for Preact/HTM/Signals from esm.sh, link to style.css, `<div id="app">`
- **`static/style.css`** - Unified CSS extracted from all 3 mocks (shared variables + component styles, dark mode, responsive)
- **`static/lib/router.js`** - Hash router: listen `hashchange`, parse path + params, expose `navigate()` and `route` signal
- **`static/lib/api.js`** - `fetch()` wrappers: `getDashboard()`, `getProjects()`, `getProject(id)`, `getTranscript(sessionId)`
- **`static/lib/format.js`** - `timeAgo()`, `formatTokens()`, `shortenPath()`, `truncate()`
- **`static/components/header.js`** - Logo + nav links + "New Project" button
- **`static/components/stat-card.js`** - Label + large number card
- **`static/components/session-row.js`** - **Shared component** used in Dashboard and Projects: status dot, summary, branch badge, project name (toggleable), msg count, time ago, resume button
- **`static/components/dashboard.js`** - Stat grid (4 cards) + recent sessions list
- **`static/components/projects.js`** - Search box + collapsible project groups with nested session rows
- **`static/components/tool-call.js`** - Collapsible tool call block with syntax highlighting
- **`static/components/transcript.js`** - Session bar + meta bar + chat message list (user/assistant avatars, tool calls, thinking blocks)
- **`static/app.js`** - Root component: init router, render Header + route-switched view

#### Step 6: Documentation
- **`CLAUDE.md`** - Tech stack, commands, architecture, JSONL format notes, security constraints

### API Endpoints (Phase 1)

```
GET  /api/dashboard
  -> { stats: { projects, sessions, active7d, tokens30d }, recentSessions: SessionSummary[] }

GET  /api/projects
  -> { projects: ProjectSummary[] }

GET  /api/projects/:projectId
  -> { project: ProjectSummary, sessions: SessionSummary[] }

GET  /api/sessions/:sessionId/transcript
  -> { meta: SessionSummary, entries: TranscriptEntry[] }
```

### Key Type Definitions

```typescript
// Core JSONL line (discriminated union on type field)
type JournalLine = UserMessage | AssistantMessage | SystemMessage
  | FileHistorySnapshot | ProgressMessage | QueueOperation;

// What the frontend receives
interface ProjectSummary {
  id: string;           // encoded dir name
  path: string;         // decoded absolute path
  displayName: string;  // last path segment
  sessionCount: number;
  lastActivity: string; // ISO timestamp
  isWorktree: boolean;
}

interface SessionSummary {
  id: string;              // UUID
  projectId: string;
  summary: string;         // first user message text, truncated
  messageCount: number;
  toolCallCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  gitBranch: string | null;
  model: string | null;
  totalTokens: number;
  subAgentCount: number;
}

interface TranscriptEntry {
  uuid: string;
  type: "user" | "assistant" | "system";
  text: string | null;
  toolCalls: ToolCallEntry[];
  model: string | null;
  timestamp: string;
  tokens: { input: number; output: number } | null;
}

interface ToolCallEntry {
  id: string;
  name: string;         // "Read", "Edit", "Bash", etc.
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}
```

---

## Phase 2 - Session Launcher

New files:
- `src/services/session-launcher.ts` - `Deno.Command` wrapper for `claude` subprocess
- `src/routes/launcher.ts` - `POST /api/launch` endpoint

Launch modes:
- Resume: `osascript -e 'tell app "Terminal" to do script "cd {cwd} && claude --resume {id}"'`
- Continue: `claude --continue`
- New: `claude` or `claude "{prompt}"`

Modified: `src/routes/api.ts`, session-row Resume button, projects Continue button

---

## Phase 3 - Project Management

New files:
- `src/services/project-manager.ts` - Git init, dir scaffolding, template writing
- `src/routes/wizard.ts` - `POST /api/projects` create endpoint
- `templates/CLAUDE.md.tmpl`, `templates/mcp.json.tmpl`
- `static/components/wizard.js` - Multi-step new project form

Requires `--allow-write=$PROJECTS_ROOT` and `--allow-run=git`

---

## Phase 4 - Dashboard & Live

New files:
- `src/services/stats-reader.ts` - Parse `stats-cache.json` + `history.jsonl`
- `src/services/file-watcher.ts` - `Deno.watchFs` with debouncing (500ms)
- SSE endpoint `GET /api/events` for live updates
- `static/components/heatmap.js` - Activity calendar visualization
- `static/hooks/useEvents.js` - `EventSource` connection hook

SSE events: `session-updated`, `session-created`, `stats-changed`

---

## Phase 5 - Polish

- Keyboard shortcuts (`static/lib/shortcuts.js`)
- Theme toggle (light/dark override beyond system preference)
- HTML export endpoint
- CLI subcommands: `projects`, `sessions`, `stats`, `launch`

---

## Verification Plan

### After Phase 1 implementation:

1. **Unit tests**: `deno task test` - parser correctness, path decoding, metadata extraction
2. **Dev server**: `deno task dev` - start server, verify http://127.0.0.1:3456 loads
3. **API smoke test**:
   - `curl http://127.0.0.1:3456/api/dashboard` - should return stats + recent sessions
   - `curl http://127.0.0.1:3456/api/projects` - should list all projects from `~/.claude/projects/`
   - Pick a project ID and `curl /api/projects/{id}` - should return sessions
   - Pick a session ID and `curl /api/sessions/{id}/transcript` - should return parsed messages
4. **UI verification**: Open browser, check:
   - Dashboard shows stat cards and recent sessions
   - Click "Projects" -> see expandable project groups with session counts
   - Click a session -> transcript view with chat messages and collapsible tool calls
   - Dark mode works (toggle system preference)
   - Mobile responsive (resize to <768px)
5. **Permission verification**: Confirm the app cannot write to `~/.claude/` (enforced by `--deny-write`)

### Critical files to modify:
- `deno.json` (new)
- `main.ts` (new)
- `src/types.ts` (new)
- `src/config.ts` (new)
- `src/server.ts` (new)
- `src/routes/api.ts` (new)
- `src/routes/dashboard.ts` (new)
- `src/routes/projects.ts` (new)
- `src/routes/sessions.ts` (new)
- `src/services/project-discovery.ts` (new)
- `src/services/session-parser.ts` (new)
- `static/index.html` (new)
- `static/style.css` (new)
- `static/app.js` (new)
- `static/lib/router.js` (new)
- `static/lib/api.js` (new)
- `static/lib/format.js` (new)
- `static/components/header.js` (new)
- `static/components/stat-card.js` (new)
- `static/components/session-row.js` (new)
- `static/components/dashboard.js` (new)
- `static/components/projects.js` (new)
- `static/components/tool-call.js` (new)
- `static/components/transcript.js` (new)
- `CLAUDE.md` (new)
- `tests/fixtures/sample-session.jsonl` (new)
- `tests/session-parser.test.ts` (new)
- `tests/project-discovery.test.ts` (new)

### Existing files to reference (design artifacts):
- `mock/01-dashboard.html` - CSS variables, stat grid, session row layout
- `mock/02-projects.html` - Project group, search, collapsible pattern
- `mock/03-transcript.html` - Message rendering, tool calls, code highlighting, extra CSS vars
- `claude-session-manager-prd.md` - Full requirements spec
