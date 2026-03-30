# Research & Design Decisions

## Summary
- **Feature**: `ios-app`
- **Discovery Scope**: Complex Integration — extending existing Deno server + building new Swift multi-platform clients
- **Key Findings**:
  - Hono has built-in WebSocket helper for Deno via `upgradeWebSocket` from `hono/deno`
  - Deno lacks native PTY API; `Deno.Command` with `piped` stdio + `node-pty` via npm compat or `deno_pty` FFI are options; simplest approach is `Deno.Command` with piped streams (no true PTY) or using Deno's Node.js compat layer with `node-pty`
  - SwiftTerm is the primary iOS/macOS terminal emulator library (actively maintained, SwiftUI wrapper available)

## Research Log

### Hono WebSocket on Deno
- **Context**: Requirement 5 needs a WebSocket endpoint for terminal relay
- **Sources**: Hono docs (hono.dev/docs/helpers/websocket), GitHub issues #2997, #2423, honojs discussions #755
- **Findings**:
  - Hono provides `upgradeWebSocket` helper from `hono/deno` adapter
  - Pattern: `app.get('/ws', upgradeWebSocket((c) => ({ onMessage, onClose, onOpen })))`
  - Under the hood, uses `Deno.upgradeWebSocket()` API
  - Known limitation: Deno-specific options (protocol, idleTimeout) may not be fully exposed through Hono's abstraction
  - Alternative: Use `Deno.upgradeWebSocket()` directly in a Hono route handler for full control
- **Implications**: Can use Hono's WebSocket helper for the terminal endpoint; fall back to raw Deno API if idleTimeout control is needed

### Deno PTY Support
- **Context**: Terminal WebSocket relay requires a PTY-backed shell process
- **Sources**: Deno issue #3994, @sigma/pty-ffi (JSR), deno-pty-ffi GitHub
- **Findings**:
  - Deno has no built-in PTY API (tracked in denoland/deno#3994, still open)
  - Community solution: `@sigma/pty-ffi` (JSR package) — uses Deno FFI to call into compiled Rust library wrapping `portable-pty` crate
  - Actively maintained: v0.39.1 (October 2025), 180 commits, 43 releases
  - API surface:
    - `new Pty(command, options?)` — spawn shell/process
    - `pty.readable: ReadableStream<string>` — async stream of PTY output
    - `pty.write(data)` — send input
    - `pty.resize({ rows, columns })` — resize terminal
    - `pty.close()` — cleanup
    - `pty.exitCode` — process exit status
  - Works on macOS, Linux, and Windows
  - Requires `--allow-ffi` permission
  - For `deno compile`, use `noinit` subpath and `--include` the native library
- **Implications**: Use `jsr:@sigma/pty-ffi` as PTY dependency. Server needs `--allow-ffi` permission. Native Deno solution, no npm compat layer needed.

### Swift Terminal Emulator (iOS)
- **Context**: iOS app needs to render ANSI terminal output
- **Sources**: SwiftTerm GitHub (migueldeicaza/SwiftTerm)
- **Findings**:
  - SwiftTerm: Actively maintained terminal emulator for iOS/macOS, MIT license
  - Provides `TerminalView` (AppKit/UIKit) and a SwiftUI wrapper
  - Supports xterm-256color, mouse events, selection, scrollback
  - Can be fed data from any source (WebSocket, SSH, local process)
  - Swift Package Manager compatible
  - Alternative: Build custom ANSI parser — not recommended, significant effort
- **Implications**: Use SwiftTerm as the terminal rendering component. Feed WebSocket data into SwiftTerm's input handler.

### Swift URLSession WebSocket
- **Context**: Swift clients need WebSocket for terminal and HTTP for REST API
- **Sources**: Apple Developer docs (URLSessionWebSocketTask), Swift Forums, swift-corelibs-foundation
- **Findings**:
  - `URLSessionWebSocketTask` available on iOS 13+, macOS 10.15+
  - Supports text and binary frames, ping/pong
  - API: `send(_ message:)`, `receive()` (async/await)
  - **Critical**: NOT available on Linux — swift-corelibs-foundation uses libcurl and WebSocket was never implemented
  - `receive()` returns ONE message per call — must call repeatedly; no `AsyncSequence` conformance out of the box
  - Cross-platform alternatives: `websocket-kit` (Vapor/SwiftNIO), `WebSocket.swift` (tesseract-one)
  - On Linux, `#if canImport(FoundationNetworking)` required for URLSession
- **Implications**: Use `URLSessionWebSocketTask` on Apple platforms. Linux CLI does not need WebSocket (REST-only, no terminal). No cross-platform WebSocket library needed since terminal is iOS/macOS only.

### Swift Package Manager Multi-Platform
- **Context**: Shared API client library needs to compile on Apple + Linux
- **Sources**: Swift.org docs, SPM documentation
- **Findings**:
  - SPM supports multi-platform via `Package.swift` with platform conditions
  - `#if canImport(UIKit)` / `#if canImport(AppKit)` / `#if os(Linux)` for platform-conditional code
  - Keychain (Security.framework) is Apple-only; Linux alternative is file-based storage or environment variables
  - `Foundation.URLSession` works on both Apple and Linux (via swift-corelibs-foundation)
  - `Codable` works identically across platforms
  - Structure: Separate targets for shared library, iOS/macOS app, and Linux CLI
- **Implications**: Structure as a multi-target Swift Package. Shared `CCSessionAPI` library target with no platform dependencies. Keychain only in the app target behind `#if canImport(Security)`.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Monorepo Swift Package | Single Package.swift with multiple targets (library, app, CLI) | Shared types, single version, easy cross-compilation | Xcode project already exists separately | Can coexist: Xcode project references SPM package |
| Separate repos | Distinct repos for server, iOS app, CLI | Independent versioning | Duplicated model types, sync overhead | Over-engineering for this project |
| Embedded in Deno project | Swift code lives alongside Deno code in same repo | Single clone, unified development | Mixed toolchains | Chosen approach — fits solo developer workflow |

**Selected**: Embedded in Deno project — Swift Package at `swift/` directory, Xcode project at `ios/` references it.

## Design Decisions

### Decision: Authentication Mechanism
- **Context**: API needs protection when exposed on network
- **Alternatives Considered**:
  1. Bearer token (random or user-provided) — simple, stateless
  2. HTTP Basic Auth — simpler but credentials in every request in cleartext
  3. OAuth/OIDC — overkill for single-user local tool
- **Selected Approach**: Bearer token via `Authorization` header, also accepted as `?token=` query parameter
- **Rationale**: Simplest scheme that works for single-user, local-network scenario. No user database needed. Token displayed at startup or set via CLI flag.
- **Trade-offs**: Token is static for the server lifetime; no refresh mechanism. Acceptable for local/Tailscale use.
- **Follow-up**: Consider QR code generation at startup banner for easy mobile setup

### Decision: WebSocket Terminal Protocol
- **Context**: Need a wire format for terminal I/O over WebSocket
- **Alternatives Considered**:
  1. Raw binary frames (stdin/stdout bytes) — simplest
  2. JSON envelope with type field — structured, supports control messages (resize, ping)
  3. SSH protocol — overkill
- **Selected Approach**: JSON envelope: `{ "type": "data" | "resize" | "ping", "data": "base64", "cols": N, "rows": N }`
- **Rationale**: Need resize support for proper terminal emulation. JSON envelope is simple and extensible.
- **Trade-offs**: Slight overhead from JSON + base64 encoding; negligible for terminal throughput.

### Decision: Swift Package Structure
- **Context**: Need shared code between iOS app and Linux CLI
- **Alternatives Considered**:
  1. Single target with conditional compilation — simple but messy
  2. Multi-target package with shared library — clean separation
- **Selected Approach**: Multi-target: `CCSessionAPI` (library), `CCSessionCLI` (executable), iOS app via Xcode project linking the library
- **Rationale**: Clean separation of concerns. Library has no platform dependencies. CLI is Linux-focused. iOS app adds SwiftUI + Keychain + SwiftTerm.

## Risks & Mitigations
- **@sigma/pty-ffi native library** — Requires pre-compiled Rust library at runtime. Mitigation: Library is bundled with the JSR package; for `deno compile`, use `--include` with the native library path.
- **WebSocket reliability over Tailscale** — Tailscale connections may have higher latency. Mitigation: PTY keepalive timeout, WebSocket ping/pong, reconnection logic in iOS client.
- **SwiftTerm iOS compatibility** — Library primarily targets macOS historically. Mitigation: Verify iOS support in SwiftTerm before deep integration; fallback to basic text view if needed.
- **Deno permission expansion** — Adding `--allow-ffi` and broader `--allow-net` changes security model. Mitigation: Only expand permissions when `--host` is set; document the change.

## References
- [Hono WebSocket Helper](https://hono.dev/docs/helpers/websocket) — Hono's WebSocket API
- [Deno.upgradeWebSocket](https://docs.deno.com/api/deno/~/Deno.upgradeWebSocket) — Deno native WebSocket upgrade
- [SwiftTerm](https://github.com/migueldeicaza/SwiftTerm) — Terminal emulator for Swift
- [@sigma/pty-ffi on JSR](https://jsr.io/@sigma/pty-ffi) — Native Deno PTY via FFI + Rust portable-pty
- [deno-pty-ffi GitHub](https://github.com/sigmaSd/deno-pty-ffi) — Source repo
- [URLSessionWebSocketTask](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask) — Apple's WebSocket API
