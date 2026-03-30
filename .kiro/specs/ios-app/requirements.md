# Requirements Document

## Introduction

Extend CC Session Manager with native Swift clients (iOS, macOS, Linux CLI) that connect to the existing Deno API server over LAN or Tailscale. The server must be accessible beyond localhost with authentication, and iOS users must be able to interact with terminal sessions remotely.

The existing Deno/Hono REST API remains the single source of truth. Swift clients are consumers of this API — no data is read from `~/.claude/` directly on client devices.

## Requirements

### Requirement 1: Network-Accessible API Server

**Objective:** As a developer using CC Session Manager from another device, I want the Deno API server to accept connections from my local network and Tailscale, so that I can browse sessions from my phone or other machines.

#### Acceptance Criteria
1. When the server starts with a `--host` flag, the API Server shall bind to the specified interface address (e.g., `0.0.0.0`, a specific LAN IP, or a Tailscale IP).
2. When no `--host` flag is provided, the API Server shall default to `127.0.0.1` (localhost only) to preserve current behavior.
3. The API Server shall serve both the REST API and static frontend over the configured host/port.
4. When the server starts with network binding, the API Server shall display the accessible URL(s) including LAN and/or Tailscale addresses in the startup banner.

### Requirement 2: Authentication

**Objective:** As a developer exposing CC Session Manager on a network, I want API access protected by authentication, so that unauthorized users cannot browse my session data.

#### Acceptance Criteria
1. When the server starts with `--host` set to a non-localhost address, the API Server shall require authentication on all `/api/*` endpoints.
2. When a request lacks valid credentials, the API Server shall respond with HTTP 401 Unauthorized.
3. The API Server shall support token-based authentication via an `Authorization: Bearer <token>` header.
4. When the server starts with authentication enabled, the API Server shall generate a random token and display it in the startup banner (or accept a user-provided token via `--token` flag).
5. When the server is bound to `127.0.0.1` only, the API Server shall not require authentication (backward-compatible).
6. The API Server shall also accept the token as a query parameter (`?token=<token>`) to support initial browser-based access and QR code flows.

### Requirement 3: Swift API Client Library

**Objective:** As a developer building multi-platform Swift clients, I want a shared API client library, so that iOS, macOS, and Linux CLI all consume the same API without duplicating networking code.

#### Acceptance Criteria
1. The Swift API Client shall be a Swift Package that compiles on Apple platforms (iOS 17+, macOS 14+) and Linux.
2. The Swift API Client shall provide typed methods for all existing REST API endpoints (dashboard, projects, sessions, transcript, launch, project settings).
3. When configured with a server URL and auth token, the Swift API Client shall include the Bearer token in all API requests.
4. If an API request returns a non-2xx status, the Swift API Client shall throw a typed error with the HTTP status code and error message.
5. The Swift API Client shall use `async/await` and Swift concurrency (`Sendable` conformance).
6. The Swift API Client shall decode API responses into Swift model types that mirror the existing TypeScript interfaces (`ProjectSummary`, `SessionSummary`, `TranscriptEntry`, etc.).

### Requirement 4: iOS/macOS Native App

**Objective:** As a developer on the go, I want a native iOS/macOS app to browse my Claude Code sessions, so that I can review past conversations and project status from my phone or Mac without a browser.

#### Acceptance Criteria
1. The iOS/macOS App shall provide a server connection screen where the user enters the server URL and auth token (or scans a QR code).
2. The iOS/macOS App shall persist server connection settings securely in Keychain.
3. When connected, the iOS/macOS App shall display a dashboard with project count, session count, recent activity stats, and recent sessions with AI summaries.
4. The iOS/macOS App shall display a project list that supports filtering/searching by name.
5. When the user selects a project, the iOS/macOS App shall display its sessions sorted by last activity, showing message count, model, git branch, and status badges (ACTIVE/REMOTE).
6. When the user selects a session, the iOS/macOS App shall display the full transcript with user/assistant messages, tool calls paired with results, and thinking blocks (collapsible).
7. The iOS/macOS App shall support dark and light appearance following system settings.
8. When the server is unreachable, the iOS/macOS App shall display a clear connection error with a retry option.

### Requirement 5: Terminal Access from iOS

**Objective:** As a developer away from my desk, I want to interact with a terminal on my server from the iOS app, so that I can launch, resume, or monitor Claude Code sessions remotely.

#### Acceptance Criteria
1. The API Server shall expose a WebSocket endpoint (`/api/terminal/ws`) that spawns a PTY-backed shell process on the server.
2. When an iOS client connects to the terminal WebSocket, the API Server shall relay stdin/stdout/stderr between the WebSocket and the PTY process.
3. The terminal WebSocket endpoint shall require the same Bearer token authentication as the REST API.
4. The iOS/macOS App shall provide a terminal view with a text-based terminal emulator that renders ANSI escape sequences.
5. The iOS/macOS App shall support standard terminal interactions: text input, arrow keys, Ctrl-key combinations, and scrollback.
6. When the user launches a Claude Code session (resume/continue/new) via the app, the iOS/macOS App shall open a terminal view with `claude` running in it.
7. If the WebSocket connection drops, the iOS/macOS App shall display a disconnection notice and attempt reconnection.
8. While a terminal session is active, the API Server shall keep the PTY process alive even during brief network interruptions (within a configurable timeout).

### Requirement 6: Linux CLI Client

**Objective:** As a developer on a Linux machine without a browser, I want a Swift CLI tool to browse sessions from a remote CC Session Manager server, so that I can review session history from any machine on my network.

#### Acceptance Criteria
1. The Linux CLI shall be a Swift executable that compiles on Linux (Swift 5.9+).
2. The Linux CLI shall accept `--server <url>` and `--token <token>` arguments for server connection.
3. When invoked with `dashboard`, the Linux CLI shall display project/session counts and recent session summaries in a formatted text output.
4. When invoked with `projects`, the Linux CLI shall list all projects with session counts and last activity.
5. When invoked with `sessions <project-id>`, the Linux CLI shall list sessions for the given project.
6. When invoked with `transcript <session-id>`, the Linux CLI shall display the session transcript with formatted messages.
7. If the server is unreachable or returns an auth error, the Linux CLI shall display a clear error message and exit with a non-zero status code.
