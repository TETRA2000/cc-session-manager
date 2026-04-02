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
| Hono | JSR | HTTP routing, static file serving, middleware, WebSocket upgrade |
| `@std/path` | JSR | Path joining/resolution |
| `@std/streams` | JSR | Streaming JSONL line-by-line |
| `@std/cli` | JSR | CLI argument parsing |
| `@std/assert` | JSR | Test assertions |
| `@sigma/pty-ffi` | JSR | FFI-based PTY for web terminal sessions |
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
deno task dev          # Dev server with --watch (localhost:3456)
deno task dev:network  # Dev server accessible over LAN (0.0.0.0, with auth + FFI)
deno task start        # Production server (localhost)
deno task start:network # Production server over LAN (0.0.0.0, with auth + FFI)
deno task test         # Run unit tests (excludes PTY tests)
deno task test:pty     # Run PTY-specific tests (requires --allow-all)
deno task test:all     # Run all tests
deno task check        # TypeScript type check
```

## Key Technical Decisions

1. **Deno over Node** — Eliminates build tooling; native TypeScript, built-in permissions model enforces read-only access to `~/.claude`.
2. **No build step for frontend** — Preact + HTM loaded via CDN importmap; components are plain `.js` files using `html` tagged templates instead of JSX.
3. **Streaming JSONL parsing** — Session files can be large; parsed line-by-line via `TextDecoderStream` to avoid loading entire files into memory.
4. **`--deny-write=$HOME/.claude`** — Runtime permission flag ensures session data is never modified, even accidentally.
5. **AI summaries via Haiku** — Summarizes sessions using Anthropic SDK with Haiku model; gracefully degrades when `ANTHROPIC_API_KEY` is not set.
6. **Hash-based SPA routing** — Frontend uses `window.location.hash` for routing; no server-side routing needed beyond the SPA fallback.
7. **Network mode with auto-auth** — `--host 0.0.0.0` enables LAN/Tailscale access; auth is auto-enabled (Bearer token) for non-localhost, disabled for localhost. Timing-safe token comparison.
8. **FFI-based PTY** — `@sigma/pty-ffi` provides native PTY support for web terminal; dynamically imported only in network mode to avoid FFI permission requirements in localhost mode.
9. **iOS companion via Swift** — Native SwiftUI + SwiftTerm app consumes the same REST API and WebSocket terminal endpoint.
