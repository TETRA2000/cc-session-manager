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
- `src/routes/` — Hono route handlers (dashboard, projects, sessions)
- `src/services/` — Business logic (session-parser, project-discovery)
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
