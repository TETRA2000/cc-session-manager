# Architecture

## Overview

Claude Code Session Manager is a local Deno web application that reads Claude Code session data from `~/.claude/` and presents it through a browser GUI at `127.0.0.1:3456`.

```
Browser (Preact+HTM)  <──HTTP──>  Deno Server (Hono)  <──read──>  ~/.claude/ (read-only)
     static/                          src/                         JSONL files
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
│   │   ├── launcher.ts        # POST /api/launch
│   │   ├── timeline.ts        # GET /api/timeline
│   │   ├── terminal.ts        # WebSocket /api/terminal/ws (network mode)
│   │   └── wizard.ts          # POST /api/projects/create, GET/PUT settings
│   └── services/
│       ├── session-parser.ts  # Streaming JSONL parser + timeline extraction
│       ├── project-discovery.ts # Project scanning + path decoding
│       ├── session-launcher.ts  # Terminal + browser launch via osascript/open
│       ├── project-manager.ts   # Project creation, settings management
│       ├── summary-service.ts   # AI summary generation + caching
│       ├── auth.ts              # Bearer token auth middleware
│       └── pty-manager.ts       # FFI-based PTY session management
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
│       ├── timeline.js        # Timeline feed view
│       ├── tool-call.js       # Collapsible tool call block
│       ├── transcript.js      # Session transcript view
│       ├── toast.js           # Auto-dismissing toast notifications
│       └── wizard.js          # New project wizard form
├── swift/                     # iOS companion app (Swift Package)
│   ├── Sources/CCSessionAPI/  # REST/WebSocket API client
│   ├── Sources/CCSessionCLI/  # CLI tool
│   └── Tests/                 # Swift tests
├── ios/                       # SwiftUI iOS app
│   └── CCSessionManager/      # Timeline views, active sessions sidebar
├── .github/workflows/ci.yml  # CI: Deno tests, Swift Linux/macOS
└── tests/
    ├── fixtures/              # Test JSONL data
    ├── session-parser.test.ts
    ├── project-discovery.test.ts
    ├── session-launcher.test.ts
    ├── project-manager.test.ts
    ├── summary-service.test.ts
    ├── timeline.test.ts
    ├── auth.test.ts
    ├── config.test.ts
    ├── pty-manager.test.ts
    ├── api.test.ts
    └── format.test.ts
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
GET  /api/timeline                   → { entries[], activeSessions[], hasMore, oldestTimestamp }
POST /api/launch                     → { ok, error? }
POST /api/projects/create            → { ok, path?, error? }
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
| `--allow-env` | `HOME` | Resolve home directory |
| `--allow-run` | `osascript`, `open`, `git` | Launch Terminal, open browser, git init |
| `--allow-write` | `$PROJECTS_ROOT` | Create new projects (default: `~/Projects`) |

## Phased Development

- **Phase 1** ✅: Core reader — session parser, project discovery, web GUI
- **Phase 2** ✅: Session launcher — terminal + web launch, remote-control URL detection
- **Phase 3** ✅: Project wizard + settings — create projects, per-project metadata
- **Phase 3.5** ✅: Network mode, auth, web terminal (PTY), iOS companion, timeline feed
- **Phase 4**: Dashboard enhancements — activity heatmap, live file watching (SSE)
- **Phase 5**: Polish — keyboard shortcuts, theme toggle, HTML export, CLI
