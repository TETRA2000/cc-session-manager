# Gap Analysis: Sandbox Feature

## 1. Current State Investigation

### Existing Assets

| Asset | Location | Relevance to Sandbox |
|---|---|---|
| Session launcher | `src/services/session-launcher.ts` | **Primary integration point** — launches Claude Code via `Deno.Command("osascript")` → Terminal.app. Sandbox launch would need to wrap or replace this path. |
| PTY manager | `src/services/pty-manager.ts` | **Secondary integration point** — spawns shell processes via FFI PTY. Sandboxed sessions could be launched here instead of Terminal.app. |
| Terminal routes | `src/routes/terminal.ts` | WebSocket-based terminal already exists for network mode. Could serve as the UI for sandboxed sessions. |
| Launch route | `src/routes/launcher.ts` | POST `/api/launch` — validates input and delegates to `launchSession()`. Would need a `sandbox` strategy parameter. |
| Project settings | `src/services/project-manager.ts` | Per-project settings stored in `$PROJECTS_ROOT/.session-manager/projects.json`. Natural place to store sandbox config per project. |
| App config | `src/config.ts` | `AppConfig` type — global config with `host`, `token`, `authEnabled`. Would need sandbox-related fields. |
| Auth middleware | `src/services/auth.ts` | Token-based auth already exists for network mode. Relevant for sandboxed sessions that expose network ports. |
| Types | `src/types.ts` | All types centralized. New sandbox types would go here. |
| Frontend API | `static/lib/api.js` | `launchSession()`, `getProjectSettings()`, `updateProjectSettings()` — all need sandbox extensions. |

### Conventions Extracted

- **Backend pattern**: Route factory `xxxRoutes(config)` → Service function → Type-safe results
- **Config flow**: `AppConfig` created in `main.ts`, threaded through route/service factories
- **Settings storage**: JSON file in `$PROJECTS_ROOT/.session-manager/` (projects.json, summaries.json)
- **Dynamic imports**: Heavy features (PTY/FFI) are lazily imported only when needed (see `createApiRoutesWithTerminal`)
- **Error pattern**: `{ ok: boolean; error?: string }` result objects throughout
- **Frontend**: Preact + HTM components, `api.js` wraps all fetch calls

### Integration Surfaces

- **Launch flow**: `POST /api/launch` → `launchSession()` → `launchInTerminal()` / `launchInBrowser()` — this is the single point where Claude Code is started
- **PTY flow**: WebSocket `/api/terminal/ws` → `PTYManager.create()` → shell process — already supports custom `cwd` and `env`
- **Settings flow**: `GET/PUT /api/projects/:id/settings` → `ProjectSettings` type — currently stores `displayName`, `tags`, `preferredModel`, `customLaunchFlags`
- **Dashboard**: `GET /api/dashboard` → `DashboardStats` — would need sandbox counts

---

## 2. Requirements Feasibility Analysis

### Technical Needs by Requirement

| Req | Data Models | APIs/Services | UI Components | External Deps |
|---|---|---|---|---|
| 1. Strategy selection | `SandboxStrategy` enum, `SandboxConfig` | Strategy validation service, dependency checker | Strategy picker in project settings | Docker CLI, Lima CLI |
| 2. Per-project isolation | Extend `ProjectSettings` with sandbox config | Sandbox instance manager, filesystem scoping | Sandbox status per project | Docker/Lima per-project |
| 3. Whole-app sandbox | Dockerfile / Lima template | Launch script/wrapper | Global sandbox indicator | Docker, Lima |
| 4. Native sandbox | Claude Code `--sandbox` flag detection | Flag injection in launch command | Toggle in settings | Claude Code CLI |
| 5. Docker/DevContainer | Container config, volume mount spec | Docker container lifecycle service | Container settings form | Docker CLI, docker-compose |
| 6. Docker Sandboxes | Docker Sandbox ID, network policy | `docker sandbox` CLI wrapper | Sandbox management panel | Docker Desktop 4.58+ |
| 7. Lima microVM | Lima instance config, template | `limactl` CLI wrapper | VM management panel | Lima (`limactl`) |
| 8. Lifecycle mgmt | Sandbox instance state model | CRUD API endpoints | Lifecycle controls in UI | — |
| 9. Security policy | Network policy, mount config, resource limits | Policy application per backend | Policy editor form | — |
| 10. Status visibility | Sandbox status per project | Status polling/query | Badges, indicators, dashboard counts | — |

### Identified Gaps

| Gap | Type | Impact |
|---|---|---|
| No sandbox service exists | **Missing** | Core new service needed (`src/services/sandbox-manager.ts`) |
| No Docker/Lima CLI integration | **Missing** | New subprocess management for container/VM lifecycle |
| `LaunchRequest` has no sandbox field | **Missing** | Type extension needed |
| `ProjectSettings` has no sandbox config | **Missing** | Type extension + migration |
| No dependency detection logic | **Missing** | Need to check for Docker, Lima, Claude Code sandbox support |
| No sandbox state tracking | **Missing** | Need to track running sandbox instances (in-memory + optional persistence) |
| Frontend has no sandbox UI | **Missing** | New components for sandbox config, status badges, management |
| `session-launcher.ts` only supports Terminal.app and browser | **Constraint** | Need to add `docker exec`, `limactl shell`, or PTY-based launch paths |
| `PTYManager` spawns local processes only | **Constraint** | For Docker/Lima, need to spawn `docker exec -it` or `limactl shell` as the PTY command |
| Deno permissions model | **Constraint** | `--allow-run` must include `docker`, `limactl` in addition to current `claude,osascript,open,git` |
| Whole-app sandboxing is external | **Constraint** | A Dockerfile/Lima template is a documentation/ops concern, not a runtime feature — design must clarify scope |

### Research Needed (defer to design)

- **R1**: Exact CLI commands for `docker sandbox create/start/stop/rm` with Claude Code template — API may have changed
- **R2**: Lima template format for Claude Code — what base image, what mounts, how to install Deno + Claude Code
- **R3**: Claude Code `--sandbox` flag behavior — does it accept custom Seatbelt profiles? Can the session manager detect if sandbox mode was used?
- **R4**: Docker Desktop Sandboxes availability detection — how to distinguish Docker Desktop with Sandbox support from plain Docker Engine or OrbStack
- **R5**: Dev Container CLI (`devcontainer up`) vs Docker Compose — which is the right abstraction for the `devcontainer` strategy

### Complexity Signals

- **Strategy selection + dependency checking**: Moderate — multiple external CLI tools to probe
- **Container/VM lifecycle management**: High — subprocess management, state tracking, error handling for multiple backends
- **Per-project isolation with filesystem scoping**: Moderate — volume mounts and path mapping
- **Whole-app sandboxing**: Low (documentation/scripting) or High (if we build a self-containerizing mechanism)
- **UI for sandbox management**: Moderate — new components but follows existing patterns

---

## 3. Implementation Approach Options

### Option A: Extend Existing Components

**Strategy**: Add sandbox support directly into existing services and routes.

- **Extend `session-launcher.ts`**: Add `launchInDocker()`, `launchInLima()`, `launchWithNativeSandbox()` alongside existing `launchInTerminal()`
- **Extend `ProjectSettings`**: Add `sandboxStrategy`, `sandboxConfig` fields
- **Extend `LaunchRequest`**: Add `sandbox` field
- **Extend `launcher.ts` route**: Handle sandbox parameter, call appropriate launch function
- **Extend `PTYManager`**: Use `docker exec -it` or `limactl shell` as the PTY command
- **Extend dashboard/project components**: Add sandbox badges

**Trade-offs**:
- ✅ Minimal new files, leverages existing launch/PTY infrastructure
- ✅ Sandbox is "just another launch target" — clean conceptual fit
- ❌ `session-launcher.ts` becomes complex (6+ launch methods)
- ❌ Lifecycle management (start/stop containers) doesn't fit the stateless service pattern

### Option B: Create New Sandbox Service Layer

**Strategy**: New `src/services/sandbox-manager.ts` service + `src/routes/sandbox.ts` route, with session-launcher delegating to it.

- **New `sandbox-manager.ts`**: Manages sandbox instances (create, start, stop, destroy), dependency detection, state tracking
- **New `sandbox.ts` route**: CRUD endpoints for sandbox lifecycle
- **New backend adapters**: `docker-adapter.ts`, `lima-adapter.ts`, `native-adapter.ts` — each implements a common `SandboxBackend` interface
- **Extend existing**: `session-launcher.ts` calls `sandboxManager.launchIn(sandbox, claudeArgs)` instead of `launchInTerminal()`
- **New frontend components**: `sandbox-settings.js`, `sandbox-status.js`

**Trade-offs**:
- ✅ Clean separation — sandbox is its own domain with clear boundaries
- ✅ Each backend adapter is testable in isolation
- ✅ Follows existing pattern of domain-specific services
- ❌ More files and interfaces to design
- ❌ Sandbox manager is stateful (tracking running instances), unlike existing pure services

### Option C: Hybrid — Phased Implementation

**Strategy**: Phase 1 extends existing components for basic sandbox support; Phase 2 extracts into dedicated service as complexity grows.

- **Phase 1** (MVP):
  - Extend `ProjectSettings` + `LaunchRequest` with sandbox strategy
  - Add `launchWithNativeSandbox()` to `session-launcher.ts` (just adds `--sandbox` flag)
  - Add `launchInDocker()` using `docker run` with volume mounts
  - Add dependency detection as utility functions
  - Add sandbox badges to frontend
  - Provide a Dockerfile for whole-app sandboxing (documentation)

- **Phase 2** (Full):
  - Extract `sandbox-manager.ts` with backend adapters
  - Add Docker Sandbox and Lima support
  - Add lifecycle management routes and UI
  - Add security policy configuration
  - Add sandbox state persistence

**Trade-offs**:
- ✅ Delivers value quickly with native + Docker support
- ✅ Defers complexity of lifecycle management until patterns are clear
- ✅ Phase 1 validates the integration approach before committing to full architecture
- ❌ Phase 2 requires refactoring Phase 1 code
- ❌ Risk of Phase 1 patterns becoming entrenched if Phase 2 is delayed

---

## 4. Implementation Complexity & Risk

**Effort: L (1-2 weeks)**
Justification: Multiple external CLI integrations (Docker, Lima, Claude Code sandbox), new stateful service (sandbox lifecycle), new UI components, and cross-cutting changes to launch flow, settings, and dashboard.

**Risk: High**
Justification:
- External dependency on Docker Desktop Sandboxes API (may change, macOS-specific quirks)
- Lima integration is less documented for this use case
- Claude Code's native sandbox behavior needs runtime detection
- Subprocess lifecycle management (containers, VMs) introduces failure modes not present in current codebase
- Whole-app sandboxing scope is ambiguous (runtime feature vs. ops tooling)

---

## 5. Recommendations for Design Phase

### Preferred Approach

**Option C (Hybrid)** is recommended. The sandbox feature spans multiple external tools with different maturity levels. A phased approach lets us:
1. Ship native sandbox + Docker quickly (Phase 1) — these cover the most common use cases
2. Validate the integration patterns before building the full lifecycle manager (Phase 2)
3. Defer Lima and Docker Sandboxes to Phase 2 where research items R1-R5 are resolved

### Key Design Decisions to Make

1. **Sandbox as launch target vs. persistent environment**: Is a sandbox created per-session (ephemeral) or per-project (long-lived)? This fundamentally shapes the architecture.
2. **PTY integration**: Should sandboxed sessions use the existing WebSocket terminal (PTY spawns `docker exec`), or launch in external Terminal.app?
3. **Whole-app sandbox scope**: Is this a Dockerfile we document, or a `deno task start:sandboxed` command that self-containerizes?
4. **State management**: In-memory sandbox tracking vs. persisted state file — what happens on server restart?
5. **Deno permission changes**: Adding `--allow-run=docker,limactl` changes the security posture of the application itself.

### Research Items to Carry Forward

- R1: Docker Sandbox CLI exact commands and template format
- R2: Lima template for Claude Code + Deno environment
- R3: Claude Code `--sandbox` flag detection and customization
- R4: Docker Desktop Sandboxes feature detection
- R5: Dev Container CLI integration approach
