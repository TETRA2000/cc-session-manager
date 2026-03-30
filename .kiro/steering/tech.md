# Technology Stack

## Architecture

Local client-server SPA. A Deno backend serves a REST API and static frontend files. The frontend is a Preact SPA loaded via CDN importmap — no build step, no bundler.

## Core Technologies

- **Language**: TypeScript (strict mode, `deno.ns` + `deno.window` libs)
- **Runtime**: Deno 2.x — NOT Node.js; no `package.json`, no `node_modules`
- **Backend framework**: Hono (via `jsr:@hono/hono@^4`)
- **Frontend framework**: Preact + HTM via CDN importmap (no JSX, no transpilation)
- **State management**: `@preact/signals` for reactive state
- **Styling**: Single `style.css` with CSS custom properties, `prefers-color-scheme` dark/light mode

## Key Libraries

| Library | Source | Purpose |
|---------|--------|---------|
| Hono | JSR | HTTP routing, static file serving, middleware |
| `@std/path` | JSR | Path joining/resolution |
| `@std/streams` | JSR | Streaming JSONL line-by-line |
| `@std/cli` | JSR | CLI argument parsing |
| `@std/assert` | JSR | Test assertions |
| Preact + HTM | CDN (esm.sh) | Frontend component rendering via tagged templates |
| `@preact/signals` | CDN (esm.sh) | Reactive state management |

## Development Standards

### Type Safety
- TypeScript strict mode enabled in `deno.json`
- All shared types centralized in `src/types.ts`
- Frontend `.js` files are untyped (plain JS with htm tagged templates)

### Code Quality
- Deno built-in linter with `recommended` rules
- Deno built-in formatter: 100-char line width, 2-space indent, double quotes

### Testing
- Test framework: Deno's built-in test runner (`Deno.test`)
- Assertions: `@std/assert` (`assertEquals`, `assertStringIncludes`, etc.)
- Route tests: Hono's `app.request()` for integration tests (no real HTTP server)
- Convention: `sanitizeResources: false` for tests involving `serveStatic`

## Development Environment

### Required Tools
- Deno 2.x

### Common Commands
```bash
deno task dev    # Dev server with --watch (port 3456)
deno task start  # Production server
deno task test   # Run unit tests
deno task check  # TypeScript type check
```

## Key Technical Decisions

1. **Deno over Node** — Eliminates build tooling; native TypeScript, built-in permissions model enforces read-only access to `~/.claude`.
2. **No build step for frontend** — Preact + HTM loaded via CDN importmap; components are plain `.js` files using `html` tagged templates instead of JSX.
3. **Streaming JSONL parsing** — Session files can be large; parsed line-by-line via `TextDecoderStream` to avoid loading entire files into memory.
4. **`--deny-write=$HOME/.claude`** — Runtime permission flag ensures session data is never modified, even accidentally.
5. **AI summaries via Haiku** — Summarizes sessions using Anthropic SDK with Haiku model; gracefully degrades when `ANTHROPIC_API_KEY` is not set.
6. **Hash-based SPA routing** — Frontend uses `window.location.hash` for routing; no server-side routing needed beyond the SPA fallback.
