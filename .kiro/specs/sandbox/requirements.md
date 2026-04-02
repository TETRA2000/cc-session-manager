# Requirements Document

## Introduction

This specification defines sandboxing capabilities for the Claude Code Session Manager, enabling users to launch and manage Claude Code sessions within isolated execution environments. The goal is to improve security by preventing untrusted or experimental code from affecting the host system or other projects. Multiple sandboxing strategies are supported — from lightweight OS-level sandboxing (macOS Seatbelt, Deno permissions) to full VM isolation (Docker Sandboxes, microVMs) — with the ability to isolate each project independently or sandbox the entire application.

### Research Context

The following sandboxing approaches are available on macOS and inform this specification:

| Approach | Isolation Level | macOS Support | Setup Complexity |
|---|---|---|---|
| Claude Code native (Seatbelt) | OS-level process | Built-in | None |
| Deno permission model | Runtime-level | Built-in | None |
| macOS sandbox-exec | OS-level (Seatbelt) | Available (deprecated API) | Medium |
| Docker containers / Dev Containers | Container-level | Docker Desktop | Low-Medium |
| Docker Sandboxes (Desktop 4.58+) | Full microVM | Docker Desktop | Low |
| Lima / OrbStack microVM | VM-level | Via Virtualization.framework | Medium-High |

Key finding: Deno permissions constrain the Deno process itself but do not restrict child processes (e.g., spawned `claude` commands). OS-level or container-level sandboxing is needed to isolate the full process tree.

## Requirements

### Requirement 1: Sandbox Strategy Selection

**Objective:** As a developer, I want to choose from multiple sandboxing strategies when launching Claude Code sessions, so that I can balance security guarantees against setup complexity for my use case.

#### Acceptance Criteria

1. The Session Manager shall support the following sandbox strategies: `none` (no sandbox), `native` (Claude Code's built-in Seatbelt/bubblewrap sandbox), `docker` (standard Docker container), `devcontainer` (VS Code Dev Container), `docker-sandbox` (Docker Desktop Sandboxes microVM), and `lima` (Lima microVM).
2. When the user selects a sandbox strategy, the Session Manager shall verify that the required runtime dependency is available on the system (e.g., Docker daemon running, Lima installed) before proceeding.
3. If the selected sandbox strategy's runtime dependency is not available, the Session Manager shall display an error message identifying the missing dependency and suggesting installation steps.
4. The Session Manager shall allow a default sandbox strategy to be configured globally and overridden per project.
5. When no sandbox strategy is configured, the Session Manager shall default to `none` and display a security recommendation suggesting sandbox adoption.

### Requirement 2: Per-Project Sandbox Isolation

**Objective:** As a developer working on multiple projects, I want each project to run in its own isolated sandbox, so that untrusted or experimental code in one project cannot affect other projects or the host system.

#### Acceptance Criteria

1. When a user launches a Claude Code session for a project with sandboxing enabled, the Session Manager shall create a dedicated sandbox instance scoped to that project's working directory.
2. The Session Manager shall ensure that each project's sandbox has filesystem write access limited to the project's own directory tree and designated temporary directories only.
3. While a project sandbox is running, the Session Manager shall prevent that sandbox from reading or writing files belonging to other projects' directory trees.
4. When a project sandbox is destroyed, the Session Manager shall clean up all sandbox-specific resources (containers, VMs, temporary files) associated with that project.
5. The Session Manager shall allow sandbox configuration (strategy, network policy, resource limits) to be set independently per project via project settings.

### Requirement 3: Whole-Application Sandboxing

**Objective:** As a security-conscious user, I want to run the entire Session Manager application (Deno server, PTY manager, and all spawned Claude Code sessions) within a single sandbox, so that the complete application is isolated from the host system.

#### Acceptance Criteria

1. The Session Manager shall provide a launch mode that runs the entire Deno server process and all its child processes inside a sandbox (container or VM).
2. When running in whole-application sandbox mode, the Session Manager shall mount the `~/.claude/` directory as read-only and the `PROJECTS_ROOT` directory with appropriate read-write permissions.
3. While in whole-application sandbox mode, the Session Manager shall retain full functionality including session browsing, launching, web terminal, and network access.
4. The Session Manager shall provide a documented command or script to start the application in whole-application sandbox mode using Docker or Lima.
5. When whole-application sandbox mode is active, the Session Manager shall indicate this in the UI (e.g., a badge or status indicator).

### Requirement 4: Claude Code Native Sandbox Integration

**Objective:** As a developer, I want to leverage Claude Code's built-in sandbox when launching sessions, so that I get OS-level process isolation with zero additional setup.

#### Acceptance Criteria

1. When the sandbox strategy is `native`, the Session Manager shall launch Claude Code with sandbox mode enabled (using Claude Code's built-in Seatbelt on macOS or bubblewrap on Linux).
2. The Session Manager shall detect whether Claude Code's native sandbox is functional by checking for sandbox support on the current OS.
3. If Claude Code's native sandbox fails to initialize, the Session Manager shall display a warning and offer to proceed without sandboxing or with an alternative strategy.
4. When using native sandbox mode, the Session Manager shall pass the project's working directory as the sandbox's allowed write scope.

### Requirement 5: Docker Container and Dev Container Integration

**Objective:** As a developer, I want to launch Claude Code inside Docker containers or Dev Containers, so that I get container-level isolation with familiar tooling.

#### Acceptance Criteria

1. When the sandbox strategy is `docker`, the Session Manager shall create and start a Docker container with Claude Code installed, mounting the project directory as a volume.
2. When the sandbox strategy is `devcontainer`, the Session Manager shall detect and use the project's `.devcontainer/devcontainer.json` configuration to build and launch the container.
3. The Session Manager shall support configuring a base Docker image per project for the `docker` strategy.
4. When a Docker-based session ends, the Session Manager shall stop the container and optionally remove it based on user configuration (keep for reuse vs. ephemeral).
5. If the Docker daemon is not running, the Session Manager shall display an actionable error message suggesting the user start Docker Desktop or the Docker service.

### Requirement 6: Docker Sandboxes (microVM) Integration

**Objective:** As a developer requiring strong isolation, I want to launch Claude Code inside Docker Desktop Sandboxes, so that I get full microVM-level isolation with managed network policies.

#### Acceptance Criteria

1. When the sandbox strategy is `docker-sandbox`, the Session Manager shall create a Docker Sandbox using the `docker sandbox create` command with the Claude Code template.
2. The Session Manager shall support configuring the Docker Sandbox network policy per project: `open`, `balanced` (default), or `locked-down`.
3. When a Docker Sandbox session is created, the Session Manager shall capture and display the sandbox ID for management purposes.
4. The Session Manager shall support listing, stopping, and destroying Docker Sandbox instances from the UI.
5. If Docker Desktop Sandboxes are not available (e.g., OrbStack or older Docker Desktop version), the Session Manager shall detect this and suggest upgrading or switching to the `docker` strategy.

### Requirement 7: Lima microVM Integration

**Objective:** As a developer wanting VM-level isolation without Docker Desktop, I want to launch Claude Code inside Lima VMs, so that I can use open-source microVM tooling on macOS.

#### Acceptance Criteria

1. When the sandbox strategy is `lima`, the Session Manager shall create or reuse a Lima VM instance for the project.
2. The Session Manager shall provide a default Lima configuration template optimized for Claude Code usage (Deno installed, project directory mounted, minimal resource footprint).
3. When a Lima VM is created, the Session Manager shall configure filesystem sharing to mount the project directory into the guest.
4. The Session Manager shall support starting, stopping, and deleting Lima VM instances from the UI.
5. If `limactl` is not installed, the Session Manager shall display an error with installation instructions (e.g., `brew install lima`).

### Requirement 8: Sandbox Lifecycle Management

**Objective:** As a developer, I want to manage the lifecycle of sandbox instances (create, start, stop, destroy) from the Session Manager UI, so that I can control sandbox resources without switching to the terminal.

#### Acceptance Criteria

1. The Session Manager shall provide API endpoints for creating, starting, stopping, and destroying sandbox instances.
2. When the user navigates to a project detail view, the Session Manager shall display the current sandbox status (not created, running, stopped, error).
3. When a sandbox is in the `running` state, the Session Manager shall allow the user to launch new Claude Code sessions within it.
4. When a sandbox encounters an error during creation or startup, the Session Manager shall display the error output and suggest remediation steps.
5. The Session Manager shall support an "ephemeral" sandbox mode that automatically destroys the sandbox when the Claude Code session exits.
6. While a sandbox is running, the Session Manager shall track resource usage metadata (uptime, container/VM ID) and display it in the UI.

### Requirement 9: Sandbox Security Policy Configuration

**Objective:** As a developer, I want to configure security policies for sandboxes (network access, filesystem scope, resource limits), so that I can enforce least-privilege principles per project.

#### Acceptance Criteria

1. The Session Manager shall allow configuring network access policy per sandbox: `open` (unrestricted), `balanced` (allow common dev domains, block others), or `restricted` (no network access).
2. The Session Manager shall allow configuring additional filesystem mount paths (read-only or read-write) beyond the project directory.
3. Where resource limits are supported by the sandbox backend, the Session Manager shall allow configuring CPU and memory limits per sandbox.
4. The Session Manager shall store sandbox security policy as part of the project settings, persisted in the project's configuration.
5. When a sandbox is launched, the Session Manager shall apply the configured security policy and log any policy violations or fallbacks.

### Requirement 10: Sandbox Status Visibility

**Objective:** As a developer, I want to see at a glance which projects are running in sandboxes and which sandbox type is active, so that I can verify my security posture across all projects.

#### Acceptance Criteria

1. The Session Manager shall display a sandbox indicator (icon or badge) on the project list and dashboard for each project that has an active sandbox.
2. When the user hovers over or clicks a sandbox indicator, the Session Manager shall show sandbox details: strategy type, status, uptime, and network policy.
3. The Session Manager shall distinguish between sandbox strategies visually (e.g., different icons or labels for native, docker, docker-sandbox, lima).
4. When the entire application is running in whole-application sandbox mode, the Session Manager shall display a global indicator in the header.
5. The dashboard shall include a summary count of active sandboxes by type.
