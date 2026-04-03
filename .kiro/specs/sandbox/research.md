# Research & Design Decisions: Sandbox

## Summary
- **Feature**: sandbox
- **Discovery Scope**: Complex Integration (new feature + Docker Sandbox CLI integration)
- **Key Findings**:
  - Docker Sandbox CLI is `sbx` (not `docker sandbox`) — `sbx run claude`, `sbx exec`, `sbx create`, `sbx ls`, `sbx stop`, `sbx rm`
  - Credentials handled via host-side HTTP proxy — `sbx secret set -g anthropic` stores in OS keychain; proxy injects auth headers without credentials entering the sandbox VM
  - Sandboxes don't inherit `~/.claude` from host — each sandbox has its own Claude Code home directory
  - Sandboxes persist after agent exits — re-running the same workspace reconnects to the existing sandbox
  - Workspace directories are mounted from host automatically — only workspace files survive sandbox removal

## Research Log

### Docker Sandbox (`sbx`) CLI
- **Context**: Primary sandbox backend for per-project isolation
- **Sources Consulted**: https://docs.docker.com/ai/sandboxes/usage/, https://docs.docker.com/ai/sandboxes/agents/claude-code/
- **Findings**:
  - **Launch**: `sbx run claude ~/my-project` or `sbx run claude --name my-sandbox ~/my-project`
  - **Create without attach**: `sbx create claude <path>` / `sbx create --name <name> claude <path>`
  - **Exec into running sandbox**: `sbx exec -it <name> bash`
  - **List**: `sbx ls` (shows status, CPU, memory, ports)
  - **Stop**: `sbx stop <name>`
  - **Remove**: `sbx rm <name>`
  - **Port forwarding**: `sbx ports <name> --publish 8080:3000`
  - **Git branch**: `sbx run claude --branch my-feature ~/project`
  - **Multiple workspaces**: `sbx run claude ~/project-a ~/shared:ro`
  - **Interactive dashboard**: `sbx` (no args) opens TUI
  - **Persistence**: Sandboxes persist by default; same workspace path reconnects
  - **Cleanup**: `sbx rm` deletes everything inside; workspace files remain on host
- **Implications**:
  - Use `sbx create --name ccsm-<projectId> claude <projectPath>` for per-project sandboxes
  - Use `sbx exec -it ccsm-<projectId> <command>` for PTY terminal sessions
  - Sandbox persistence means no need for explicit state tracking — `sbx ls` is the source of truth

### Docker Sandbox Credential Management
- **Context**: How Claude Code authenticates inside a sandbox (Req 4, 5, 6)
- **Sources Consulted**: https://docs.docker.com/ai/sandboxes/security/credentials/
- **Findings**:
  - **Proxy-based injection**: Host-side HTTP/HTTPS proxy intercepts outbound API requests from sandbox and injects auth headers — credentials never enter the sandbox VM
  - **Secure storage**: `sbx secret set -g anthropic` stores API key in OS keychain (encrypted at rest)
  - **Non-interactive**: `echo "$API_KEY" | sbx secret set -g anthropic`
  - **Sandbox-scoped**: `sbx secret set <sandbox-name> anthropic` for per-sandbox credentials
  - **Environment fallback**: `export ANTHROPIC_API_KEY=value && sbx run claude` also works (less secure — visible to other processes)
  - **Supported services**: Anthropic, AWS, GitHub, Google, Groq, Mistral, OpenAI, xAI
  - **OAuth**: If no API key set, Claude Code prompts for OAuth inside sandbox; proxy handles the flow
  - **Recommendation**: `sbx secret` preferred over env vars for security
- **Implications**:
  - Session manager does NOT need to handle or pass ANTHROPIC_API_KEY
  - Credential setup is a one-time `sbx secret set -g anthropic` by the user
  - No credential-related code in the session manager — Docker Sandbox handles it entirely

### Claude Code Home Directory in Sandboxes
- **Context**: Design review identified this as a critical gap
- **Sources Consulted**: Docker Sandbox docs
- **Findings**:
  - "Sandboxes don't pick up user-level configuration from your host, such as ~/.claude"
  - Each sandbox has its own `~/.claude/` with separate session data, settings, history
  - Claude Code inside sandbox writes session JSONL to the sandbox's internal `~/.claude/projects/`
  - This data is NOT visible to the host's `~/.claude/projects/`
  - Data is deleted when sandbox is removed (only workspace files survive)
- **Implications**:
  - Session manager on host cannot directly read sandboxed session data via filesystem
  - Two approaches: (a) use `sbx exec` to read session data from inside sandbox, (b) accept that sandboxed sessions are only visible via `sbx exec`
  - Selected approach: use `sbx exec` to proxy session data reads for sandboxed projects

### Claude Code Native Sandbox (Seatbelt)
- **Context**: Lightweight alternative to Docker Sandbox (Req 4)
- **Sources Consulted**: Claude Code docs, binary analysis
- **Findings**:
  - No `--sandbox` CLI flag — controlled via settings.json: `{ "sandbox": { "enabled": true } }`
  - Programmatic: `claude --settings '{"sandbox":{"enabled":true}}'`
  - macOS: `sandbox-exec -p <dynamic-profile>` with runtime-generated Seatbelt profile
  - Filesystem scoping: `sandbox.filesystem.allowWrite: ["."]`, `sandbox.filesystem.denyWrite: ["~/"]`
  - Detection: child processes have `SANDBOX_RUNTIME=1` env var
  - Orthogonal to `--permission-mode auto`
- **Implications**:
  - Simplest sandbox option — no Docker required, runs on host
  - Session data stays in host's `~/.claude/projects/` (no visibility issue)
  - Limited isolation compared to Docker Sandbox (process-level, not VM-level)

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| sbx-first with Backend Adapters | Docker Sandbox as primary, SandboxBackend interface for extensibility | Best isolation + credential handling, clean CLI | Docker Desktop required | **Selected** |
| Multi-backend equal weight | All backends treated equally | Maximum flexibility | Over-engineering — sbx covers most use cases | Previous design |
| sbx-only, no abstraction | Only Docker Sandbox, no backend interface | Simplest | No fallback if Docker Desktop unavailable | Too restrictive |

## Design Decisions

### Decision: Docker Sandbox as Primary Backend
- **Context**: Multiple sandbox options researched; need to choose a primary recommendation
- **Alternatives Considered**:
  1. All backends equal weight — complex, over-engineered
  2. sbx-only — too restrictive for users without Docker Desktop
- **Selected Approach**: Docker Sandbox (`sbx`) as the primary and recommended backend. Native sandbox as lightweight fallback. Other backends (docker, lima, devcontainer) remain in the interface but are secondary.
- **Rationale**: `sbx` provides the best security model (credential proxy, VM isolation, managed network policies) with the simplest UX (`sbx run claude`). Native sandbox provides zero-setup fallback.
- **Trade-offs**: Requires Docker Desktop; not available on all systems

### Decision: Credential Handling Delegated to Docker Sandbox
- **Context**: How does Claude Code authenticate inside a sandbox?
- **Alternatives Considered**:
  1. Session manager passes ANTHROPIC_API_KEY via env var
  2. Mount host's `~/.claude/` into sandbox
  3. Let Docker Sandbox's proxy handle credentials
- **Selected Approach**: Docker Sandbox's host-side proxy handles all credential injection. Session manager has no credential-related code. User runs `sbx secret set -g anthropic` once.
- **Rationale**: Credentials never enter the sandbox VM; stored in OS keychain; proxy automatically injects auth headers. Most secure option with zero code in session manager.
- **Trade-offs**: Requires user to set up `sbx secret` before first use

### Decision: Session Data via sbx exec
- **Context**: Session JSONL is inside sandbox's `~/.claude/projects/`, not visible to host
- **Alternatives Considered**:
  1. Mount host's `~/.claude/projects/` into sandbox — breaks isolation
  2. Use `sbx exec` to read session data — clean, preserves isolation
  3. Accept that sandboxed sessions aren't browsable — poor UX
- **Selected Approach**: When a project has an active sandbox, the session manager uses `sbx exec -it <name> cat <path>` to read session data from inside the sandbox. For stopped/removed sandboxes, session data is unavailable.
- **Rationale**: Preserves full sandbox isolation. Session data is transient within the sandbox (deleted on `sbx rm`) which is acceptable — the workspace files (actual code) persist on host.
- **Trade-offs**: Slower reads (subprocess per file); data lost on sandbox removal

### Decision: Use { ok, error } Pattern (not Result<T, E>)
- **Context**: Previous design used algebraic Result type, inconsistent with existing codebase
- **Selected Approach**: Use existing `{ ok: boolean; error?: string }` pattern with optional data and errorCode fields
- **Rationale**: Consistency with `LaunchResult`, `CreateProjectResult`, and all existing service/route patterns

### Decision: Deno Server Stays on Host
- **Context**: Should the Deno server run on host or inside a sandbox?
- **Selected Approach**: Deno server runs on host with existing limited permissions. Only adds `--allow-run=sbx` for sandbox management.
- **Rationale**: Server needs to read `~/.claude/projects/` for session browsing (existing core feature). Running inside sandbox would add unnecessary indirection and break the read-only session browsing flow.

## Risks & Mitigations
- **Docker Desktop required for primary backend** — Mitigation: native sandbox as zero-setup fallback
- **sbx CLI surface evolving** — Mitigation: wrap in adapter with version detection; fail gracefully
- **Session data lost on sbx rm** — Mitigation: warn user before removal; offer export
- **sbx exec latency for session reads** — Mitigation: cache session metadata; only fetch on demand

## References
- Docker Sandbox overview: https://docs.docker.com/ai/sandboxes/
- Docker Sandbox usage: https://docs.docker.com/ai/sandboxes/usage/
- Docker Sandbox Claude Code: https://docs.docker.com/ai/sandboxes/agents/claude-code/
- Docker Sandbox credentials: https://docs.docker.com/ai/sandboxes/security/credentials/
- Claude Code sandboxing: https://code.claude.com/docs/en/sandboxing
- Claude Code permissions: https://code.claude.com/docs/en/permissions
