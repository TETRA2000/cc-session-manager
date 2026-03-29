# Claude Code Session Manager

A local GUI for browsing Claude Code session history, managing projects, and launching sessions.

Built with Deno — reads your `~/.claude/` data read-only and serves a web UI at `127.0.0.1:3456`.

## Quick Start

```bash
# Requires Deno 2.x
deno task dev
```

Opens http://127.0.0.1:3456 with three views:

- **Dashboard** — Stats overview + 10 most recent sessions
- **Projects** — Filterable list of all projects with expandable session groups
- **Transcript** — Chat-style session viewer with collapsible tool calls

## Features

- Discovers all projects from `~/.claude/projects/` automatically
- Streams large JSONL session files without loading fully into memory
- Pairs tool calls with their results for clean transcript display
- **Launch sessions** from the GUI — Resume or Continue in Terminal.app
- **Open in Web** — sessions with active remote-control link directly to `claude.ai/code`
- **New Project Wizard** — create directory, git init, CLAUDE.md/.mcp.json templates
- **Per-project settings** — display name, tags, preferred model, custom launch flags
- **AI-generated summaries** — Haiku generates descriptive titles, cached and refreshed in background
- ACTIVE / REMOTE badges on running and remote-controlled sessions
- Dark/light mode via system preference
- Responsive layout
- Read-only — enforced by Deno's `--deny-write=$HOME/.claude` permission

## Commands

| Command | Description |
|---------|-------------|
| `deno task dev` | Dev server with auto-reload (port 3456) |
| `deno task start` | Production server |
| `deno task test` | Run unit tests |
| `deno task check` | TypeScript type check |

## Tech Stack

- **Runtime**: Deno 2.x
- **Backend**: Hono (JSR)
- **Frontend**: Preact + HTM via CDN (no build step)
- **Styling**: Custom CSS with variables, dark mode, responsive

## Docs

- [Architecture](docs/architecture.md) — System design, data flow, directory structure
- [API Reference](docs/api.md) — REST endpoint documentation

## Roadmap

- [x] Phase 1: Core reader — session parser, project discovery, web GUI
- [x] Phase 2: Session launcher — terminal + web launch, remote-control URL detection
- [x] Phase 3: Project wizard + settings — create projects, per-project metadata
- [ ] Phase 4: Live updates — activity heatmap, file watching (SSE)
- [ ] Phase 5: Polish — keyboard shortcuts, theme toggle, HTML export
