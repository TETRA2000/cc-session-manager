# Product Overview

A local web GUI for browsing, searching, and managing Claude Code session history. It reads `~/.claude/projects/` data **read-only**, renders a rich transcript viewer, and provides session launch/resume capabilities — all from a single Deno process serving at `127.0.0.1:3456`.

## Core Capabilities

1. **Session browsing** — Discover all projects and sessions from `~/.claude/projects/`, stream-parse large JSONL files, display transcripts with tool call pairing and AI-generated summaries.
2. **Session launching** — Resume or continue sessions in Terminal.app; open remote sessions via web URL detected from `bridge_status` messages.
3. **Project management** — Create new projects with git init, CLAUDE.md, and .mcp.json templates; manage per-project display names, tags, model preferences, and launch flags.
4. **Live status** — Detect active sessions from PID files, show ACTIVE/REMOTE badges, surface web session URLs from `/remote-control`.
5. **Web terminal** — WebSocket-based PTY sessions via FFI (`@sigma/pty-ffi`), enabling in-browser terminal access when running in network mode.
6. **Network access & auth** — Configurable `--host 0.0.0.0` mode for LAN/Tailscale access with auto-generated Bearer token authentication; localhost remains unauthenticated.
7. **iOS companion app** — Native Swift client (`swift/`) using SwiftTerm for terminal rendering and the same REST/WebSocket API.

## Target Use Cases

- **Session review** — Developers reviewing past Claude Code conversations to recall decisions, find tool outputs, or audit changes.
- **Multi-project navigation** — Switching between projects and quickly finding relevant sessions by time, branch, or summary.
- **Session continuity** — Resuming interrupted work or launching fresh sessions from a central hub instead of the CLI.

## Value Proposition

Claude Code stores rich session data in local JSONL files, but provides no built-in GUI for browsing history across projects. This tool fills that gap with a zero-install (Deno), read-only, local-first web interface that respects the user's privacy (no data leaves the machine, enforced by Deno permissions).

## Roadmap Context

- Phases 1-3 (core reader, launcher, wizard) are complete.
- Network mode, auth, PTY/terminal, and iOS companion app have shipped.
- Phase 4 (live updates, SSE, activity heatmap) and Phase 5 (keyboard shortcuts, theme toggle, HTML export) are planned but not started.
