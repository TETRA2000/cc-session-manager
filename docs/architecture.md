# Architecture

## Overview

Claude Code Session Manager is a local Deno web application that reads Claude Code session data from `~/.claude/` and presents it through a browser GUI at `127.0.0.1:3456`.

```
Browser (Preact+HTM)  <──HTTP──>  Deno Server (Hono)  <──read──>  ~/.claude/ (read-only)
     static/                          src/                         JSONL files
                                       │
                                       ├──sbx exec──>  Docker Sandbox VM (per project)
                                       └──claude --settings──>  Native Seatbelt sandbox
```

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Deno 2.x | Granular permissions, TypeScript-first, single binary |
| Backend | Hono (JSR) | Built-in serveStatic, zero transitive deps |
| Frontend | Preact + HTM (CDN) | No build step, ~4KB runtime |
| Styling | Custom CSS variables | Dark/light mode, responsive, extracted from UI mocks |
| JSONL parsing | Streaming (TextDecoderStream) | Handles files up to 19MB without full memory load |

## Directory Structure

```
cc-session-manager/
├── main.ts                    # Entry point: CLI args, Deno.serve
├── src/
│   ├── types.ts               # All TypeScript interfaces
│   ├── config.ts              # Configuration loading
│   ├── server.ts              # Hono app: routes + static serving
│   ├── routes/
│   │   ├── api.ts             # Route aggregation
│   │   ├── dashboard.ts       # GET /api/dashboard
│   │   ├── projects.ts        # GET /api/projects[/:id]
│   │   ├── sessions.ts        # GET /api/sessions/:id/transcript
│   │   ├── launcher.ts        # POST /api/launch (sandbox-aware)
│   │   ├── wizard.ts          # POST /api/projects/create, GET/PUT settings
│   │   └── sandbox.ts         # GET/POST/DELETE /api/sandbox/* (lifecycle, strategies, exec)
│   └── services/
│       ├── session-parser.ts  # Streaming JSONL parser (host + sandboxed via subprocess pipe)
│       ├── project-discovery.ts # Project scanning + path decoding
│       ├── session-launcher.ts  # Terminal + browser launch via osascript/open
│       ├── project-manager.ts   # Project creation, settings management
│       ├── sandbox-manager.ts   # Sandbox lifecycle orchestration, strategy delegation
│       ├── sbx-backend.ts       # Docker Sandbox (sbx CLI) wrapper: create/ls/stop/rm/exec/stream
│       ├── native-backend.ts    # Claude Code native Seatbelt sandbox via --settings
│       ├── dependency-checker.ts # Runtime detection of sbx, sandbox-exec, bwrap
│       └── sandbox-naming.ts    # Deterministic ccsm-<sha256> naming + hint cache persistence
├── static/
│   ├── index.html             # SPA shell with importmap
│   ├── style.css              # Unified CSS from UI mocks
│   ├── app.js                 # Root component + router switch
│   ├── lib/
│   │   ├── router.js          # Hash-based client-side router
│   │   ├── api.js             # fetch() wrappers
│   │   └── format.js          # timeAgo, formatTokens, shortenPath
│   └── components/
│       ├── header.js          # Navigation bar
│       ├── stat-card.js       # Dashboard stat card
│       ├── session-row.js     # Shared session row (Dashboard + Projects)
│       ├── dashboard.js       # Dashboard view
│       ├── projects.js        # Projects list view
│       ├── tool-call.js       # Collapsible tool call block
│       ├── transcript.js      # Session transcript view
│       ├── toast.js           # Auto-dismissing toast notifications
│       └── wizard.js          # New project wizard form
├── Dockerfile.sandbox         # Whole-app sandboxing container image
└── tests/
    ├── fixtures/
    │   ├── sample-session.jsonl
    │   ├── command-session.jsonl
    │   └── mock-sbx           # Mock sbx CLI (bash script with file-based state)
    ├── sandbox-naming.test.ts
    ├── sbx-backend.test.ts
    ├── sbx-e2e.test.ts        # Backend E2E tests via mock-sbx
    ├── sandbox-routes-e2e.test.ts # Route E2E tests via mock-sbx
    ├── session-parser.test.ts
    └── project-discovery.test.ts
```

## Data Flow

### Session Discovery

1. Scan `~/.claude/projects/` for subdirectories
2. Decode directory names (e.g., `-Users-takahiko-repo-my-app` → `/Users/takahiko/repo/my-app`)
3. Use `cwd` field from first JSONL message for accurate path resolution
4. Count `*.jsonl` files and latest mtime per project

### JSONL Parsing

Session files contain one JSON object per line with a `type` discriminator:

| Type | Display | Purpose |
|------|---------|---------|
| `user` | Yes | User messages (plain string or ContentBlock array) |
| `assistant` | Yes | Assistant responses (text, thinking, tool_use blocks) |
| `system` | Yes | System messages |
| `file-history-snapshot` | No | Internal file tracking |
| `progress` | No | Hook progress events |
| `queue-operation` | No | Queue management |

Messages with `isMeta: true` are system-generated (slash commands) and filtered from display.

Tool results appear in subsequent `user` messages as `tool_result` content blocks, linked to the originating `tool_use` by `tool_use_id`.

### API Endpoints

```
GET  /api/dashboard                  → { stats, recentSessions[] }
GET  /api/projects                   → { projects[] }
GET  /api/projects/:id               → { project, sessions[] }
GET  /api/projects/:id/settings      → ProjectSettings
PUT  /api/projects/:id/settings      → { ok }
GET  /api/sessions/:id/transcript    → { meta, entries[] }
POST /api/launch                     → { ok, error?, launchCommand? }
POST /api/projects/create            → { ok, path?, error? }

GET  /api/sandbox/strategies         → { strategies[], defaultStrategy, insideContainer }
GET  /api/sandbox/instances          → { instances[] }
GET  /api/sandbox/instances/:id      → { instance }
POST /api/sandbox/instances          → { ok, instance }
POST /api/sandbox/instances/:n/stop  → { ok }
DELETE /api/sandbox/instances/:n     → { ok }
POST /api/sandbox/instances/:n/exec  → { ok, output }
```

### Session Launcher

The `POST /api/launch` endpoint supports two targets:

| Target | Method | Use case |
|--------|--------|----------|
| `terminal` | osascript → Terminal.app | Local macOS: `cd <path> && claude --resume <id>` |
| `web` | `open <url>` → browser | Remote/mobile: opens `claude.ai/code/session_...` |

Web session URLs are extracted from `bridge_status` system messages in JSONL files. These appear when a session has used `/remote-control`. The `webUrl` field in `SessionSummary` is `null` for sessions that have never been remote-controlled.

## Security Model

Enforced via Deno's permission flags at runtime:

| Permission | Scope | Purpose |
|-----------|-------|---------|
| `--allow-read` | `~/.claude`, `.` | Read session data and serve static files |
| `--deny-write` | `~/.claude` | Prevent modification of Claude's state |
| `--allow-net` | `127.0.0.1:3456` | Local-only HTTP server |
| `--allow-env` | `HOME`, `CCSM_INSIDE_CONTAINER` | Resolve home directory, detect container mode |
| `--allow-run` | `osascript`, `open`, `git` | Launch Terminal, open browser, git init |
| `--allow-run` | `sbx` (sandbox tasks only) | Docker Sandbox lifecycle management |
| `--allow-write` | `$PROJECTS_ROOT` | Create new projects, sandbox hint cache |

### Sandbox Security

- **Docker Sandbox (`sbx`)**: Each project runs in an isolated VM. Credentials handled by the host-side proxy (`sbx secret`) — the session manager has zero credential code.
- **Native sandbox**: Claude Code's built-in Seatbelt (macOS) or bubblewrap (Linux) restricts filesystem access to the project directory.
- **Whole-app sandbox**: `Dockerfile.sandbox` runs the entire application in a container with `~/.claude` mounted read-only.

## Phased Development

- **Phase 1**: Core reader — session parser, project discovery, web GUI
- **Phase 2**: Session launcher — terminal + web launch, remote-control URL detection
- **Phase 3**: Project wizard + settings — create projects, per-project metadata
- **Phase 3.5**: Sandboxing — per-project Docker Sandbox/native isolation, credential delegation, lifecycle management API
- **Phase 4**: Dashboard enhancements — activity heatmap, live file watching (SSE)
- **Phase 5**: Polish — keyboard shortcuts, theme toggle, HTML export, CLI
