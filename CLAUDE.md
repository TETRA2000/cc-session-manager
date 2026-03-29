# Claude Code Session Manager

A Deno-based local web app for browsing and managing Claude Code session history.

## Tech Stack

- **Runtime**: Deno 2.x (NOT Node.js - no package.json or node_modules)
- **Backend**: Hono (JSR) HTTP framework
- **Frontend**: Preact + HTM via CDN importmap (no build step)
- **Styling**: Custom CSS with CSS variables, dark/light mode
- **Data**: Reads JSONL session files from `~/.claude/projects/` (read-only)

## Commands

```bash
deno task dev    # Dev server with --watch (port 3456)
deno task start  # Production server
deno task test   # Run unit tests
deno task check  # TypeScript type check
```

## Architecture

- `main.ts` — Entry point, CLI arg parsing, Deno.serve
- `src/routes/` — Hono route handlers (dashboard, projects, sessions, launcher)
- `src/services/` — Business logic (session-parser, project-discovery, session-launcher)
- `src/types.ts` — All TypeScript interfaces
- `static/` — Frontend SPA (Preact+HTM, served as static files)
- `static/components/` — Preact components (htm tagged templates)
- `static/lib/` — Client-side utilities (router, api, format)

## Key Patterns

- Frontend uses `html` tagged templates from htm/preact (NOT JSX)
- JSONL parsing is streaming (TextDecoderStream + line splitting) for large files
- Session data is read-only; `--deny-write=$HOME/.claude` enforced at runtime
- Path decoding from encoded dir names uses `cwd` from JSONL messages for accuracy
- JSONL types: skip `file-history-snapshot`, `progress`, `queue-operation`; skip `isMeta: true`
- Assistant message content is an array of `text`, `thinking`, `tool_use` blocks
- Tool results appear in subsequent user messages as `tool_result` blocks
- `bridge_status` system messages contain web session URLs from `/remote-control`
- Active sessions detected from PID files in `~/.claude/sessions/*.json`

## Testing Requirements

**Always write tests when adding or modifying features.** Run `deno task test` before committing.

Tests live in `tests/` and use `@std/assert`. Test files:

| File | Covers |
|------|--------|
| `session-parser.test.ts` | JSONL streaming, metadata extraction, transcript parsing, bridge_status, command tag stripping |
| `project-discovery.test.ts` | Path decoding, worktree detection |
| `session-launcher.test.ts` | Shell/AppleScript escaping, launch validation |
| `api.test.ts` | HTTP route integration (dashboard, projects, sessions, launch, static files) |
| `format.test.ts` | Frontend format utilities (tokens, paths, truncation) |

When adding a new feature, add tests for:
- **Services**: Unit tests for pure functions and data extraction logic
- **Routes**: Integration tests using Hono's `app.request()` (no real HTTP server needed)
- **Validation**: Error cases, edge cases, malformed input
- **Fixtures**: Add test data to `tests/fixtures/` when testing JSONL parsing

Use `sanitizeResources: false` for tests that involve Hono's `serveStatic` (file handle leak).

## Documentation Requirements

**Keep docs and README up to date when adding features.**

- `README.md` — Update features list and roadmap checkboxes
- `docs/architecture.md` — Update directory structure, API endpoints, and phase status
- `docs/api.md` — Add new endpoints with request/response examples and type definitions
- `CLAUDE.md` — Update this file when adding new patterns, services, or conventions
