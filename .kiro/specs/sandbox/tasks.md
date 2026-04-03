# Implementation Plan

- [ ] 1. Sandbox type definitions and configuration
- [ ] 1.1 Define sandbox types
  - Add `SandboxStrategy`, `SandboxStatus`, `NetworkPolicy`, `SandboxConfig`, `SandboxInstance`, `StrategyAvailability`, `LaunchCommand`, `SandboxResult`, `SandboxErrorCode` types to the centralized type file
  - Extend `ProjectSettings` with optional `sandbox` configuration field
  - Extend `AppConfig` with `defaultSandboxStrategy` and `insideContainer` fields
  - Extend `DashboardStats` with `activeSandboxes` count
  - Extend `LaunchRequest` with optional `sandbox` strategy field
  - _Requirements: 1.1, 1.4, 2.5, 7.3, 8.1_

- [ ] 1.2 Extend application config loading
  - Add `--sandbox-strategy` CLI argument parsing for global default strategy
  - Detect container environment via `CCSM_INSIDE_CONTAINER` env var and set `insideContainer` flag
  - Default `defaultSandboxStrategy` to `"none"` when not specified
  - _Requirements: 1.4, 1.5, 9.4_

- [ ] 2. Dependency detection service
- [ ] 2.1 (P) Implement dependency checker
  - Create a service that probes the system for available sandbox runtimes by executing detection commands as subprocesses
  - Check `sbx` availability by running `sbx --version` and parsing the version string
  - Check native sandbox availability: on macOS verify `sandbox-exec` binary exists, on Linux check for `bwrap`
  - Cache detection results in memory for the lifetime of the server process (no repeated probes)
  - Return structured status including availability, version, and actionable installation hints for missing tools (e.g., "Install Docker Desktop for sbx support")
  - _Requirements: 1.2, 1.3, 4.2, 10.1, 10.2, 10.3, 10.4_

- [ ] 3. Sandbox naming and hint cache
- [ ] 3.1 (P) Implement sandbox name generation and persistence
  - Create a deterministic naming function that generates `ccsm-<sha256-first12>` from a projectId using SHA-256 hash (12 hex chars = fixed 17-char name)
  - Implement hint cache read/write for the sandboxes JSON file that maps sandbox names to projectId and projectPath for reverse lookup
  - Implement startup reconciliation: load the hint cache, query `sbx ls` for running sandboxes, remove cache entries whose names no longer appear in the `sbx ls` output
  - _Requirements: 2.1, 2.2, 6.3, 6.6_

- [ ] 4. Docker Sandbox backend adapter
- [ ] 4.1 Implement sbx CLI wrapper for lifecycle operations
  - Implement `create()` that runs `sbx create --name <hash-name> claude <projectPath>` with optional extra workspace mounts (appended as `<path>:ro`)
  - Implement `stop()` via `sbx stop <name>` and `remove()` via `sbx rm <name>`, capturing stderr on failure
  - Implement network policy passthrough — pass the configured policy as the appropriate `sbx create` flag when creating the sandbox
  - Update the hint cache after create and remove operations
  - _Requirements: 2.1, 2.4, 6.1, 6.4, 7.1, 7.4_
  - _Contracts: SandboxBackend service interface_

- [ ] 4.2 Implement sbx ls tabular output parser
  - Parse the human-readable table output of `sbx ls` by identifying column headers (SANDBOX, AGENT, STATUS, PORTS, WORKSPACE) and extracting values by column position
  - Map parsed rows to sandbox instance objects with name, status, and info fields
  - Handle empty output (no sandboxes) and error cases gracefully
  - Filter results by the `ccsm-` prefix to only return session-manager-created sandboxes
  - _Requirements: 6.2, 6.6, 8.2, 8.6_

- [ ] 4.3 Implement sbx exec and streaming
  - Implement `exec()` for one-shot command execution inside a sandbox: run `sbx exec <name> -- <command>`, capture and return stdout as a string
  - Implement `stream()` that spawns `sbx exec <name> -- <command>` with piped stdout and returns the subprocess `ReadableStream<Uint8Array>` for piping into the existing JSONL streaming parser
  - Implement `getLaunchCommand()` returning `sbx exec -it <name> claude <args>` as the PTY command for the WebSocket terminal
  - _Requirements: 2.3, 5.1, 5.3, 5.4, 8.3_

- [ ] 5. Native sandbox backend adapter
- [ ] 5.1 (P) Implement native sandbox settings generation and launch
  - Generate a Claude Code sandbox settings JSON file scoped to the project directory: `sandbox.enabled: true`, `sandbox.filesystem.allowWrite: [projectPath]`, `sandbox.filesystem.denyWrite: ["~/"]`
  - Persist the settings file to the session manager data directory under a per-project path
  - Build the launch command as `claude --settings <settingsPath> <claudeArgs>`, usable by the PTY manager or terminal launcher
  - Handle the case where native sandbox is not available — return an error with a message suggesting the `sbx` strategy instead
  - Session data is read from the host filesystem directly (no `sbx exec` needed for native strategy)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Sandbox manager service
- [ ] 6.1 Implement sandbox lifecycle orchestration
  - Create the central sandbox manager that delegates to the sbx backend or native backend based on the requested strategy
  - Implement `ensureSandbox()`: check if a sandbox already exists for the project (via hint cache + `sbx ls`); if not, create one; return the instance
  - Implement `getSandbox()` that looks up a project's sandbox by computing its hash-name and querying the backend for status
  - Implement `listSandboxes()` that queries `sbx ls` and enriches results with projectId from the hint cache
  - Implement `stopSandbox()` and `removeSandbox()` that delegate to the backend and update the hint cache
  - Wire up the dependency checker to validate strategy availability before sandbox creation
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.4, 6.1, 6.4, 6.5, 6.6_

- [ ] 6.2 Implement sandboxed session data proxy
  - Extend the session data reading flow: when a project has an active sandbox (`sbx` strategy), use the backend's `stream()` method to read JSONL files from inside the sandbox instead of the host filesystem
  - Pipe the subprocess `ReadableStream` through `TextDecoderStream` and into the existing line-splitting JSONL parser to preserve streaming behavior
  - Discover session files inside the sandbox by running `sbx exec <name> -- ls ~/.claude/projects/` and parsing the directory listing
  - Fall back to host filesystem when the sandbox is stopped or not found
  - Cache sandboxed session metadata in memory to avoid repeated `sbx exec` calls for the same data
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 7. Sandbox API routes
- [ ] 7.1 Implement sandbox CRUD endpoints
  - Create a sandbox route factory following the existing pattern, providing REST endpoints for sandbox lifecycle management
  - `GET /api/sandbox/strategies` — return available strategies with dependency status from the dependency checker
  - `GET /api/sandbox/instances` — list all session-manager sandboxes via the sandbox manager
  - `GET /api/sandbox/instances/:projectId` — get sandbox status for a specific project
  - `POST /api/sandbox/instances` — create a sandbox for a project with strategy and config from request body; validate projectId and strategy
  - `POST /api/sandbox/instances/:name/stop` — stop a running sandbox
  - `DELETE /api/sandbox/instances/:name` — remove a sandbox (with cleanup)
  - `POST /api/sandbox/instances/:name/exec` — execute a command inside a sandbox and return stdout
  - Mount the route under `/api/sandbox` in the API router
  - _Requirements: 6.1, 6.2, 6.4, 8.1, 8.3, 8.4_

- [ ] 7.2 Extend session launch with sandbox support
  - Modify the existing launch route to accept the optional `sandbox` field in the request body
  - When `sandbox` is set and not `"none"`, call `ensureSandbox()` on the sandbox manager before building the launch command
  - Use `getLaunchCommand()` from the sandbox instance to produce the PTY command (`sbx exec -it` or `claude --settings`) instead of the default terminal launch
  - Pass the sandbox-aware launch command to the PTY manager for WebSocket terminal sessions
  - For non-sandbox launches, preserve the existing Terminal.app / browser launch behavior unchanged
  - _Requirements: 2.1, 2.3, 8.3, 8.5_

- [ ] 8. Credential status detection
- [ ] 8.1 (P) Implement sbx secret status check
  - Run `sbx secret ls` and parse the output to determine whether Anthropic credentials are configured
  - Expose credential status through the `GET /api/sandbox/strategies` endpoint as an additional field on the `sbx` strategy entry
  - When credentials are not configured, include setup instructions text: "Run `sbx secret set -g anthropic` to configure API key"
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 9. Frontend sandbox components
- [ ] 9.1 (P) Implement sandbox settings form
  - Add a sandbox configuration section to the project settings view
  - Provide a strategy selector dropdown listing available strategies (fetched from `/api/sandbox/strategies`), showing unavailable options as disabled with install hints
  - Show network policy selector (open/balanced/restricted) when `sbx` strategy is selected
  - Allow configuring extra mount paths and ephemeral mode toggle
  - Save sandbox config as part of the project settings on form submit
  - Display credential setup instructions when `sbx` is selected and credentials are not configured
  - _Requirements: 1.4, 1.5, 2.5, 3.2, 7.1, 7.2, 7.3_

- [ ] 9.2 (P) Implement sandbox status badges and management panel
  - Add a sandbox badge component to each project row on the project list, showing a visual indicator (icon/label) when a sandbox is active, distinguished by strategy type
  - Clicking the badge opens a detail panel showing: strategy, status, network policy, and sandbox name
  - Add sandbox management controls to the project detail view: create, stop, and remove buttons that call the sandbox CRUD API
  - Display error output from failed sandbox operations with remediation suggestions
  - Add a sandbox count to the dashboard stats section
  - _Requirements: 8.1, 8.2, 8.4, 8.6, 10.1, 10.2, 10.3, 10.5_

- [ ] 9.3 (P) Implement global sandbox indicator
  - Detect the `insideContainer` flag from a new API endpoint or inline config and display a global badge in the application header when the entire app is running in a container
  - _Requirements: 9.4, 10.4_

- [ ] 10. Whole-application sandboxing
- [ ] 10.1 (P) Create Dockerfile and sandbox launch task
  - Create a Dockerfile at the project root that builds a container image with Deno and Claude Code installed, copies the application, and runs the network-mode server
  - Set the `CCSM_INSIDE_CONTAINER=1` environment variable in the container so the app detects whole-app sandbox mode
  - Mount `~/.claude/` as read-only and `PROJECTS_ROOT` as read-write in the documented run command
  - Add `deno task start:sandbox` to deno.json that builds and runs the container with the appropriate volume mounts
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 11. Deno permission configuration
- [ ] 11.1 Add sandbox-aware task variants to deno.json
  - Add `dev:sandbox` and `start:sandbox` tasks that extend the existing dev/start tasks with `--allow-run=sbx` added to the permission flags
  - Follow the existing pattern of `dev:network` / `start:network` for incremental permission grants
  - _Requirements: 1.2, 2.1_

- [ ] 12. Testing
- [ ] 12.1 Unit tests for sandbox services
  - Test sandbox name generation: verify deterministic hashing, fixed length output, consistent results for the same input
  - Test hint cache read/write/reconciliation with fixtures
  - Test `sbx ls` tabular output parsing with sample output fixtures covering running, stopped, and empty states
  - Test dependency checker with mocked subprocess responses for both available and missing tools
  - Test native backend settings JSON generation and launch command building
  - _Requirements: 1.2, 2.1, 4.1, 10.1, 10.4_

- [ ] 12.2 Unit tests for sbx backend
  - Test `create()`, `stop()`, `remove()` with mocked `Deno.Command` responses
  - Test `getLaunchCommand()` output for various Claude Code arguments
  - Test `exec()` stdout capture and error handling for failed subprocesses
  - Test `stream()` returns a `ReadableStream` that can be piped through the JSONL parser
  - _Requirements: 2.1, 2.4, 5.1, 8.3_

- [ ] 12.3 Integration tests for sandbox API
  - Test sandbox CRUD endpoints via Hono `app.request()` with mocked sandbox manager
  - Test extended launch endpoint with sandbox parameter
  - Test strategy listing with mocked dependency checker
  - Test error responses for invalid strategy, missing project, and backend failures
  - _Requirements: 6.1, 6.4, 8.1, 8.4_

- [ ]* 12.4 (P) Frontend format tests
  - Test sandbox status display formatting
  - Test strategy display names and badge rendering logic
  - _Requirements: 10.1, 10.3_
