# Requirements Document

## Introduction

This specification defines per-project sandboxing for the Claude Code Session Manager using Docker Sandbox (`sbx` CLI) as the primary isolation backend, with Claude Code's native Seatbelt sandbox as a lightweight fallback. Each project gets its own isolated sandbox VM with secure credential handling via Docker Sandbox's host-side proxy. The Deno server remains on the host with minimal permission expansion, using `sbx exec` for all interactions with sandboxed environments.

### Key Constraints
- Docker Sandbox CLI is `sbx` — commands: `sbx create`, `sbx exec`, `sbx ls`, `sbx stop`, `sbx rm`
- Credentials handled by Docker Sandbox's host-side proxy (`sbx secret`) — session manager has no credential code
- Sandboxes don't inherit `~/.claude` from host — each sandbox has its own Claude Code home
- Workspace directories are mounted from host automatically; session data inside sandbox is transient
- Deno server stays on host, reading `~/.claude/projects/` directly for non-sandboxed session browsing

## Requirements

### Requirement 1: Sandbox Strategy Selection

**Objective:** As a developer, I want to choose a sandboxing strategy for my projects, so that I can balance security isolation against setup requirements.

#### Acceptance Criteria

1. The Session Manager shall support the following sandbox strategies: `none` (no sandbox), `sbx` (Docker Sandbox VM via `sbx` CLI), and `native` (Claude Code's built-in Seatbelt/bubblewrap sandbox).
2. When the user selects a sandbox strategy, the Session Manager shall verify that the required runtime is available on the system before proceeding.
3. If the required runtime is not available, the Session Manager shall display an error identifying the missing dependency and suggesting installation steps.
4. The Session Manager shall allow a default sandbox strategy to be configured globally and overridden per project.
5. When no sandbox strategy is configured, the Session Manager shall default to `none` and display a recommendation suggesting sandbox adoption.

### Requirement 2: Per-Project Docker Sandbox Isolation

**Objective:** As a developer working on multiple projects, I want each project to run in its own Docker Sandbox VM, so that untrusted code in one project cannot affect other projects or the host system.

#### Acceptance Criteria

1. When a user launches a Claude Code session for a project with the `sbx` strategy, the Session Manager shall create a dedicated Docker Sandbox named `ccsm-<projectId>` scoped to that project's workspace directory.
2. If a Docker Sandbox already exists for the project, the Session Manager shall reuse the existing sandbox instead of creating a new one.
3. While a Docker Sandbox is running, the Session Manager shall route all terminal interactions through `sbx exec -it <name>` commands.
4. When a user destroys a project's sandbox, the Session Manager shall run `sbx rm <name>` and clean up the sandbox VM while preserving workspace files on the host.
5. The Session Manager shall allow sandbox configuration (network policy, extra mounts, ephemeral mode) to be set per project via project settings.

### Requirement 3: Sandbox Credential Management

**Objective:** As a developer, I want Claude Code inside a sandbox to authenticate securely without exposing API keys to the session manager, so that credentials are handled with minimal attack surface.

#### Acceptance Criteria

1. The Session Manager shall delegate all credential management to Docker Sandbox's host-side proxy — no API keys or tokens shall be stored, passed, or logged by the session manager.
2. When a user has not configured credentials via `sbx secret`, the Session Manager shall display setup instructions guiding them to run `sbx secret set -g anthropic`.
3. The Session Manager shall detect whether credentials are configured by checking `sbx secret ls` and display the credential status in the sandbox management UI.

### Requirement 4: Claude Code Native Sandbox (Fallback)

**Objective:** As a developer without Docker Desktop, I want to use Claude Code's built-in sandbox as a lightweight alternative, so that I get OS-level process isolation with zero additional setup.

#### Acceptance Criteria

1. When the sandbox strategy is `native`, the Session Manager shall launch Claude Code with sandbox settings enabled via the `--settings` flag.
2. The Session Manager shall detect whether native sandbox is supported on the current OS (macOS: sandbox-exec, Linux: bubblewrap).
3. If native sandbox fails to initialize, the Session Manager shall display a warning and offer to proceed unsandboxed.
4. When using native sandbox, the Session Manager shall scope filesystem write access to the project's working directory.
5. While using native sandbox, the Session Manager shall read session data from the host's `~/.claude/projects/` directly (no `sbx exec` needed).

### Requirement 5: Sandboxed Session Data Access

**Objective:** As a developer, I want to browse and review sessions from sandboxed Claude Code instances, so that the session manager remains useful for sandboxed projects.

#### Acceptance Criteria

1. When a project has an active Docker Sandbox, the Session Manager shall read session data from inside the sandbox via `sbx exec <name> -- cat <path>` instead of the host filesystem.
2. When a project has no active sandbox (or uses `native` strategy), the Session Manager shall read session data from the host's `~/.claude/projects/` as usual.
3. If `sbx exec` fails to read session data (e.g., sandbox stopped), the Session Manager shall display a message indicating that session data is unavailable until the sandbox is running.
4. The Session Manager shall cache sandboxed session metadata to reduce `sbx exec` calls on repeated access.

### Requirement 6: Sandbox Lifecycle Management

**Objective:** As a developer, I want to manage Docker Sandbox instances (create, stop, remove) from the Session Manager UI, so that I can control sandbox resources without switching to the terminal.

#### Acceptance Criteria

1. The Session Manager shall provide API endpoints for creating, stopping, and removing sandbox instances.
2. When the user navigates to a project detail view, the Session Manager shall display the current sandbox status by querying `sbx ls`.
3. When a sandbox is in the `running` state, the Session Manager shall allow the user to launch Claude Code sessions and execute commands within it.
4. When a sandbox encounters an error during creation, the Session Manager shall display the error output from the `sbx` CLI and suggest remediation steps.
5. The Session Manager shall support an ephemeral mode that automatically runs `sbx rm` when the Claude Code session exits.
6. While a sandbox is running, the Session Manager shall display metadata from `sbx ls` (status, resource usage).

### Requirement 7: Sandbox Security Policy

**Objective:** As a developer, I want to configure security policies for sandboxes, so that I can enforce least-privilege network access per project.

#### Acceptance Criteria

1. The Session Manager shall allow configuring network policy per sandbox: `open` (unrestricted), `balanced` (curated access to common registries and APIs), or `restricted` (no external network).
2. The Session Manager shall allow configuring additional workspace mount paths (read-only or read-write) beyond the primary project directory.
3. The Session Manager shall store sandbox security policy as part of the per-project settings in `projects.json`.
4. When a sandbox is created, the Session Manager shall apply the configured network policy and mount paths via the corresponding `sbx create` flags.

### Requirement 8: Sandbox Status Visibility

**Objective:** As a developer, I want to see at a glance which projects have active sandboxes, so that I can verify my security posture across all projects.

#### Acceptance Criteria

1. The Session Manager shall display a sandbox indicator (badge) on the project list for each project that has an active sandbox.
2. When the user clicks a sandbox indicator, the Session Manager shall show sandbox details: strategy type, status, and network policy.
3. The Session Manager shall visually distinguish between sandbox strategies (`sbx` vs `native`).
4. The dashboard shall include a count of active sandboxes.

### Requirement 9: Whole-Application Sandboxing

**Objective:** As a security-conscious user, I want to run the entire Session Manager application inside a container, so that the complete application is isolated from the host.

#### Acceptance Criteria

1. The Session Manager shall provide a Dockerfile and a `deno task start:sandbox` command that runs the entire application inside a Docker container.
2. When running in whole-application sandbox mode, the Session Manager shall mount `~/.claude/` as read-only and `PROJECTS_ROOT` as read-write.
3. While in whole-application sandbox mode, the Session Manager shall retain full functionality including session browsing, launching, and web terminal.
4. When whole-application sandbox mode is active, the Session Manager shall display a global indicator in the UI header.

### Requirement 10: Dependency Detection

**Objective:** As a developer, I want the Session Manager to detect available sandbox runtimes automatically, so that I only see strategies that will work on my system.

#### Acceptance Criteria

1. The Session Manager shall detect Docker Sandbox availability by checking for the `sbx` CLI.
2. The Session Manager shall detect native sandbox availability by checking the OS and the presence of `sandbox-exec` (macOS) or `bwrap` (Linux).
3. When listing available strategies, the Session Manager shall mark each as available or unavailable with version information.
4. The Session Manager shall cache dependency check results for the lifetime of the server process.
