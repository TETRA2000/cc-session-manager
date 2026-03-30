# Implementation Plan

- [x] 1. Server network binding and configuration
- [x] 1.1 Extend server config with host, token, and auth settings
  - Add `--host` and `--token` CLI flags to the argument parser in the entry point
  - Extend the application config type with `host`, `token`, and `authEnabled` fields
  - When `--host` is a non-localhost address, derive `authEnabled` as true
  - Generate a cryptographically random token (32 bytes, hex-encoded) when auth is enabled and no `--token` is provided
  - Default `--host` to `127.0.0.1` to preserve backward compatibility
  - _Requirements: 1.1, 1.2, 2.4, 2.5_

- [x] 1.2 Update server startup to bind on configured host
  - Pass the configured host to the HTTP server binding instead of hardcoded `127.0.0.1`
  - Update the startup banner to display the bound host, port, and auth token (if enabled)
  - Detect and display LAN and Tailscale IP addresses when binding to `0.0.0.0`
  - Update Deno task definitions to allow broader network permissions when host is specified
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Authentication middleware
- [x] 2.1 Implement bearer token auth middleware for the API server
  - Create a Hono middleware that intercepts all `/api/*` requests
  - Skip authentication entirely when `authEnabled` is false in config
  - Check `Authorization: Bearer <token>` header first, then fall back to `?token=<token>` query parameter
  - Return a 401 JSON response with `{ "error": "Unauthorized" }` when credentials are missing or invalid
  - Use constant-time string comparison for token validation to prevent timing attacks
  - Register the middleware before all API route handlers
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 2.2 Add auth middleware tests
  - Test that requests with a valid Bearer header pass through and receive a 200 response
  - Test that requests with a valid query parameter token pass through
  - Test that requests with an invalid or missing token receive a 401 response
  - Test that auth is bypassed when server is bound to localhost only
  - Test that existing endpoints continue to work without auth when auth is disabled
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 3. PTY manager service
- [x] 3.1 (P) Implement PTY session management using pty-ffi
  - Create a service that spawns shell processes via the `@sigma/pty-ffi` JSR package
  - Support creating PTY sessions with configurable shell, working directory, and environment variables
  - Implement session lookup by ID and concurrent session tracking via an in-memory map
  - Relay PTY output through a callback-based interface for downstream consumers
  - Support terminal resize by forwarding rows/columns to the PTY
  - Implement a keepalive mechanism: when a client disconnects, buffer output and keep the PTY alive for a configurable timeout (default 30 seconds) before cleanup
  - Clean up all PTY sessions on server shutdown
  - _Requirements: 5.1, 5.2, 5.8_

- [x] 3.2 (P) Add PTY manager tests
  - Test session creation, lookup by ID, and destroy lifecycle
  - Test that destroying a session cleans up the PTY process
  - Test keepalive timeout: session survives brief disconnect, cleans up after timeout expires
  - Test concurrent session tracking (multiple sessions coexist)
  - _Requirements: 5.1, 5.2, 5.8_

- [x] 4. Terminal WebSocket endpoint
- [x] 4.1 Implement WebSocket route for terminal relay
  - Create a route handler that upgrades HTTP connections to WebSocket at `/api/terminal/ws`
  - Validate the auth token from the `?token=` query parameter before completing the upgrade
  - Implement the connection protocol: on receiving a `connect` message, spawn a new PTY or reattach to an existing session by ID
  - Respond with a `connected` message containing the PTY session ID for use in reconnection
  - Relay `data` messages between WebSocket and PTY (base64-encode/decode terminal bytes)
  - Handle `resize` messages by forwarding columns and rows to the PTY
  - Implement `ping`/`pong` for keepalive detection
  - On WebSocket close, start the PTY keepalive timer rather than immediately destroying the session
  - Send `exit` message with the process exit code when the PTY terminates
  - Send `error` message and close the WebSocket on failures (spawn error, invalid session ID)
  - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

- [x] 5. Swift Package setup and shared models
- [x] 5.1 (P) Initialize Swift Package with multi-target structure
  - Create a `swift/` directory with a `Package.swift` defining three targets: `CCSessionAPI` (library), `CCSessionCLI` (executable), and test targets
  - Configure platform requirements: iOS 17+, macOS 14+ for Apple; Swift 5.9+ for Linux
  - Add SPM dependencies: `swift-argument-parser` for CLI, `SwiftTerm` for iOS terminal (Apple-only conditional dependency)
  - Ensure the library target uses only Foundation (no platform-specific imports) for cross-platform compilation
  - _Requirements: 3.1, 6.1_

- [x] 5.2 (P) Define shared Swift model types mirroring the server API
  - Create Codable/Sendable structs for all API response types: `DashboardStats`, `ProjectSummary`, `SessionSummary`, `TranscriptEntry`, `ToolCallEntry`, `TokenInfo`, `ProjectSettings`
  - Create wrapper response types: `DashboardResponse`, `ProjectsResponse`, `ProjectDetailResponse`, `TranscriptResponse`
  - Implement the `JSONValue` enum (string, number, bool, object, array, null) with full Codable support for dynamic tool call inputs
  - Create request types: `LaunchRequest`, `CreateProjectRequest`
  - Create result types: `LaunchResult`, `CreateProjectResult`
  - Define the `APIError` enum with cases for unauthorized, notFound, serverError, networkError, decodingError
  - _Requirements: 3.4, 3.6_

- [x] 6. Swift API client
- [x] 6.1 Implement the SessionClient with typed API methods
  - Create a `SessionClient` class conforming to `Sendable`, initialized with server URL and optional auth token
  - Implement a shared request builder that injects the Bearer token header and constructs endpoint URLs
  - Add typed async methods for each REST endpoint: dashboard, projects, project detail, project settings, transcript, launch, create project, update settings
  - Map HTTP status codes to the `APIError` enum: 401 → unauthorized, 404 → notFound, 5xx → serverError, network failures → networkError, JSON decode failures → decodingError
  - On Linux, import `FoundationNetworking` via `#if canImport(FoundationNetworking)`
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 6.2 Add Swift model and client tests
  - Write decoding tests for each model type using sample JSON fixtures matching the server's actual response format
  - Test `JSONValue` encoding/decoding round-trips for all cases (string, number, bool, nested object, array, null)
  - Test `SessionClient` URL construction and header injection using a mock URL protocol
  - Test error mapping for 401, 404, 500, and network timeout responses
  - _Requirements: 3.2, 3.4, 3.6_

- [x] 7. iOS app — connection and navigation
- [x] 7.1 Build the server connection screen with Keychain persistence
  - Create a connection view with text fields for server URL and auth token
  - Add a QR code scanner option using AVFoundation to capture server URL and token from a QR code displayed in the server startup banner
  - Validate the connection by calling the dashboard endpoint and showing success or error state
  - Persist the server URL and token securely in the iOS Keychain using the Security framework
  - Load saved credentials on app launch and auto-connect if available
  - Provide a disconnect/reset option to clear stored credentials
  - _Requirements: 4.1, 4.2, 4.8_

- [x] 7.2 Set up app navigation structure with tab bar and routing
  - Configure the app entry point to show the connection screen when no saved credentials exist
  - Set up a `NavigationStack`-based tab bar with tabs for Dashboard, Projects, and Terminal
  - Pass the connected `SessionClient` instance to child views via the SwiftUI environment
  - Support dark and light mode via SwiftUI's automatic appearance handling
  - _Requirements: 4.7_

- [x] 8. iOS app — session browsing views
- [x] 8.1 (P) Build the dashboard view with stats and recent sessions
  - Fetch dashboard data from the API and display stat cards (project count, session count, 7-day activity, 30-day tokens)
  - Display a list of recent sessions with AI summaries, timestamps, and model badges
  - Support pull-to-refresh to reload dashboard data
  - Tapping a session navigates to its transcript
  - _Requirements: 4.3_

- [x] 8.2 (P) Build the project list with search and session detail
  - Fetch all projects from the API and display in a searchable list
  - Filter projects by name as the user types in the search field
  - Tapping a project fetches its sessions and displays them sorted by last activity
  - Show session details: message count, tool call count, model, git branch, ACTIVE/REMOTE status badges
  - Tapping a session navigates to its transcript
  - _Requirements: 4.4, 4.5_

- [x] 8.3 (P) Build the transcript viewer
  - Fetch the full transcript for a session and display messages in a scrollable list
  - Render user messages, assistant messages, and system messages with distinct visual styling
  - Display tool calls paired with their results, using collapsible sections for long output
  - Make thinking blocks collapsible (collapsed by default)
  - Show model name and token usage for assistant messages
  - _Requirements: 4.6_

- [ ] 9. iOS app — terminal access
- [ ] 9.1 Build the terminal emulator view using SwiftTerm
  - Wrap SwiftTerm's `TerminalView` in a `UIViewRepresentable` for SwiftUI integration
  - Connect the terminal view to a WebSocket at `/api/terminal/ws` using `URLSessionWebSocketTask`
  - Implement the connection protocol: send `connect` message on open, store returned session ID for reconnection
  - Feed incoming `data` messages (base64-decoded) into SwiftTerm's input handler
  - Capture user keystrokes from SwiftTerm's delegate and send as `data` messages to the WebSocket
  - Send `resize` messages when the terminal view's layout changes
  - _Requirements: 5.4, 5.5_

- [ ] 9.2 Add terminal session launch and reconnection
  - When the user chooses to launch a Claude Code session (resume/continue/new), open the terminal view and send the appropriate `claude` command after PTY connection
  - Display a disconnection notice when the WebSocket closes unexpectedly
  - Implement automatic reconnection with exponential backoff (max 3 attempts) using the stored PTY session ID
  - Show a "Session ended" message when the server sends an `exit` frame
  - _Requirements: 5.6, 5.7_

- [x] 10. Linux CLI client
- [x] 10.1 (P) Implement CLI commands for remote session browsing
  - Create a root command using ArgumentParser with global `--server` and `--token` options
  - Implement `dashboard` subcommand: fetch and display project/session counts and recent sessions in formatted text
  - Implement `projects` subcommand: list all projects with session counts and last activity
  - Implement `sessions <project-id>` subcommand: list sessions for a project with key metadata
  - Implement `transcript <session-id>` subcommand: display session transcript with formatted messages
  - On API errors (401, network), print a clear error message and exit with code 1
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 11. Integration testing and end-to-end validation
- [ ] 11.1 Verify server backward compatibility
  - Confirm that starting the server without `--host` or `--token` behaves identically to the current version (localhost-only, no auth)
  - Verify existing web frontend continues to work when auth is disabled
  - Run existing test suite and confirm all tests pass with the new changes
  - _Requirements: 1.2, 2.5_

- [ ] 11.2 End-to-end validation across platforms
  - Start the server with `--host 0.0.0.0` and connect from the iOS app over LAN or Tailscale
  - Browse dashboard, projects, and transcripts from the iOS app
  - Open a terminal session from the iOS app and run a Claude Code session
  - Verify terminal resize, reconnection, and session keepalive work
  - Run the Linux CLI against the remote server and verify all subcommands produce correct output
  - _Requirements: 1.1, 1.3, 3.2, 4.3, 5.4, 6.3_
