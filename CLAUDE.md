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
deno task dev          # Dev server with --watch (port 3456)
deno task dev:sandbox  # Dev server with sandbox support (sbx CLI enabled)
deno task start        # Production server
deno task start:sandbox # Production server with sandbox support
deno task test         # Run unit and E2E tests
deno task check        # TypeScript type check
```

## Architecture

- `main.ts` — Entry point, CLI arg parsing, Deno.serve
- `src/routes/` — Hono route handlers (dashboard, projects, sessions, launcher, sandbox)
- `src/services/` — Business logic (session-parser, project-discovery, session-launcher, sandbox-manager, sbx-backend, native-backend, dependency-checker, sandbox-naming)
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
- AI summaries generated via Anthropic SDK (Haiku), cached in `$PROJECTS_ROOT/.session-manager/summaries.json`
- Summary cache keyed by sessionId + messageCount — regenerated only when session has new messages
- Gracefully degrades when `ANTHROPIC_API_KEY` is not set (shows basic first-message summary)
- Sandbox strategies: `none` (default), `sbx` (Docker Sandbox VM), `native` (Claude Code Seatbelt/bubblewrap)
- `SbxBackend` wraps `sbx` CLI (create/ls/stop/rm/exec) via `Deno.Command`; command path is configurable for testing
- Sandbox names are deterministic: `ccsm-<sha256-first12>` of projectId (fixed 17-char length)
- Hint cache at `$PROJECTS_ROOT/.session-manager/sandboxes.json` maps sandbox names to projectIds for reverse lookup
- `sbx ls` outputs tabular text (no JSON flag); parsed by column positions from header row
- Sandboxed session data read via `sbx exec <name> -- cat <path>` with piped stdout streamed into existing JSONL parser
- Credential management delegated to Docker Sandbox's host-side proxy (`sbx secret`); session manager has zero credential code
- `CCSM_INSIDE_CONTAINER=1` env var detected for whole-app sandbox mode indicator

## Testing Requirements

**Always write tests when adding or modifying features.** Run `deno task test` before committing.

Tests live in `tests/` and use `@std/assert`. Test files:

| File | Covers |
|------|--------|
| `session-parser.test.ts` | JSONL streaming, metadata extraction, transcript parsing, bridge_status, command tag stripping |
| `project-discovery.test.ts` | Path decoding, worktree detection |
| `session-launcher.test.ts` | Shell/AppleScript escaping, launch validation |
| `project-manager.test.ts` | Project name validation, creation (dir, git, templates), settings CRUD |
| `summary-service.test.ts` | Summary cache lookup, staleness detection, persistence |
| `api.test.ts` | HTTP route integration (dashboard, projects, sessions, launch, static files) |
| `format.test.ts` | Frontend format utilities (tokens, paths, truncation) |
| `sandbox-naming.test.ts` | Deterministic SHA-256 naming, hint cache CRUD, reconciliation |
| `sbx-backend.test.ts` | sbx ls tabular output parsing, launch command generation |
| `sbx-e2e.test.ts` | Backend E2E via mock-sbx: lifecycle, dependency checker, manager orchestration |
| `sandbox-routes-e2e.test.ts` | Route E2E via mock-sbx: CRUD endpoints, exec, validation, error cases |

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


# AI-DLC and Spec-Driven Development

Kiro-style Spec Driven Development implementation on AI-DLC (AI Development Life Cycle)

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `/kiro:spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in English. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).

## Minimal Workflow
- Phase 0 (optional): `/kiro:steering`, `/kiro:steering-custom`
- Phase 1 (Specification):
  - `/kiro:spec-init "description"`
  - `/kiro:spec-requirements {feature}`
  - `/kiro:validate-gap {feature}` (optional: for existing codebase)
  - `/kiro:spec-design {feature} [-y]`
  - `/kiro:validate-design {feature}` (optional: design review)
  - `/kiro:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/kiro:spec-impl {feature} [tasks]`
  - `/kiro:validate-impl {feature}` (optional: after implementation)
- Progress check: `/kiro:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/kiro:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `.kiro/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/kiro:steering-custom`)
