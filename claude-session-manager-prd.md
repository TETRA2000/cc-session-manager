# Claude Code Session Manager — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-03-29  
**Status:** Draft  

---

## 1. Overview

Claude Code Session Manager is a GUI-based desktop application built with Deno that provides visual management of Claude Code sessions. It reads the local `~/.claude` directory to parse conversation histories, organizes them by working directory as "projects," and enables users to start new or resume existing Claude Code sessions directly from the interface.

The tool leverages Deno's granular permission model to enforce a strict security boundary: read-only access to `~/.claude` for session data, and write access limited exclusively to a configurable projects root directory where new working directories are created and initialized.

---

## 2. Problem Statement

Claude Code stores session transcripts as JSONL files inside `~/.claude/projects/`, organized by encoded directory paths. While the CLI provides `--continue` and `--resume` for session recovery, there is no visual overview of all sessions across all projects. Developers working on multiple repositories lack a unified dashboard to browse history, compare sessions, or spin up new project workspaces with proper Git initialization — all without leaving a GUI.

Existing community tools (claude-code-transcripts, clog, claude-JSONL-browser) focus on transcript viewing and HTML export. None provide bidirectional session management: reading history *and* launching new or resumed sessions from a graphical interface.

---

## 3. Goals

1. Provide a single-pane-of-glass view of all Claude Code sessions grouped by working directory (project).
2. Enable launching Claude Code sessions (new or resumed) from the GUI with one click.
3. Scaffold new project working directories with Git repository initialization.
4. Enforce security through Deno's permission flags — no accidental writes to `~/.claude` or arbitrary filesystem locations.
5. Keep the tool self-contained with minimal dependencies, installable via `deno install`.

---

## 4. Non-Goals

- Replacing the Claude Code CLI itself.
- Editing or modifying existing session JSONL files.
- Cloud sync or remote session storage.
- Providing an AI chat interface (this is a *management* tool, not a client).
- Supporting Claude Code for Web API sessions (out of scope for v1).

---

## 5. Target Users

- Developers who use Claude Code across multiple repositories daily.
- Power users managing parallel sessions via worktrees or multiple projects.
- Team leads who want to audit or review session histories across projects.

---

## 6. Architecture

### 6.1 Runtime & Security Model

The application runs on **Deno** to take advantage of its sandboxed permission system.

```
deno run \
  --allow-read=$HOME/.claude,$PROJECTS_ROOT \
  --allow-write=$PROJECTS_ROOT \
  --allow-run=claude,git \
  --allow-net=127.0.0.1:3456 \
  --deny-write=$HOME/.claude \
  main.ts
```

| Permission | Scope | Rationale |
|---|---|---|
| `--allow-read` | `~/.claude`, `$PROJECTS_ROOT` | Read session JSONL files, history, and project directories |
| `--deny-write` | `~/.claude` | Prevent any modification to Claude's internal state |
| `--allow-write` | `$PROJECTS_ROOT` | Create new project directories, initialize Git repos, write config files |
| `--allow-run` | `claude`, `git` | Launch Claude Code sessions, run Git init/clone |
| `--allow-net` | `127.0.0.1:3456` | Serve the local GUI web interface |

### 6.2 High-Level Components

```
┌──────────────────────────────────────────────────────┐
│                    Web GUI (Browser)                  │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Project    │  │   Session    │  │   New        │ │
│  │  Explorer   │  │   Viewer     │  │   Project    │ │
│  │  Sidebar    │  │   Panel      │  │   Wizard     │ │
│  └────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼───────────────────────────────┐
│               Deno Backend Server                     │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │  Session Reader │  │  Project Manager           │  │
│  │  (JSONL Parser) │  │  (Git init, dir scaffold)  │  │
│  └────────────────┘  └────────────────────────────┘  │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │  Session Launcher│ │  File Watcher              │  │
│  │  (claude CLI)   │  │  (live session updates)    │  │
│  └────────────────┘  └────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
         │                        │
    ┌────▼──── (read-only) ──┐   ┌▼──── (read-write) ────┐
    │   ~/.claude/           │   │   $PROJECTS_ROOT/      │
    │   ├── projects/        │   │   ├── my-app/          │
    │   ├── history.jsonl    │   │   ├── api-server/      │
    │   └── stats-cache.json │   │   └── new-project/     │
    └────────────────────────┘   └────────────────────────┘
```

### 6.3 Data Flow

```
~/.claude/projects/
  └── -Users-takahiko-Code-my-app/    ← encoded path
       ├── sessions-index.json        ← session metadata index
       ├── abc123.jsonl               ← session transcript
       ├── def456.jsonl
       └── agent-a980ab1.jsonl        ← sub-agent transcript
```

The Session Reader component:

1. Scans `~/.claude/projects/` for all encoded-path directories.
2. Decodes directory names back to original filesystem paths (hyphens → slashes).
3. Reads `sessions-index.json` (when available) for session summaries, message counts, timestamps, and Git branch info.
4. Falls back to parsing individual JSONL files for metadata when index is absent.
5. Groups sessions by decoded working directory and presents them as "projects" in the GUI.

---

## 7. Feature Specifications

### 7.1 Project Explorer (Sidebar)

**Description:** A tree-view sidebar listing all known working directories as projects, with session counts and last-activity timestamps.

**Data Source:** `~/.claude/projects/` directory scan + decoded path mapping.

**Behavior:**

- Each project node shows the decoded directory path, total session count, and the timestamp of the most recent session.
- Expanding a project reveals its sessions sorted by last modification (newest first).
- Each session entry shows: auto-generated summary (from `sessions-index.json`), message count, Git branch name, and creation timestamp.
- A search/filter bar at the top allows filtering projects and sessions by keyword (matches against path, summary, and branch name).
- Projects under `$PROJECTS_ROOT` are visually distinguished (e.g., with a badge) to indicate they are managed projects.

### 7.2 Session Viewer Panel

**Description:** A read-only panel displaying the conversation transcript of a selected session.

**Data Source:** Individual `{sessionId}.jsonl` files.

**Behavior:**

- Renders the JSONL conversation as a chat-style timeline with user messages, assistant responses, tool calls (collapsed by default), and tool results.
- Supports syntax highlighting for code blocks within messages.
- Displays session metadata at the top: session ID, working directory, Git branch, model used, duration, token usage summary.
- Includes a "Copy Session ID" button for use with `claude --resume`.
- Linked sub-agent sessions (files matching `agent-*.jsonl`) appear as expandable child threads.
- A file watcher (via Deno's `Deno.watchFs`) optionally enables live-tail mode for active sessions.

### 7.3 Session Launcher

**Description:** Enables starting Claude Code sessions from the GUI.

**Supported launch modes:**

| Mode | Command Generated | Trigger |
|---|---|---|
| Resume existing session | `claude --resume {sessionId}` | Click "Resume" on any session in the sidebar |
| Continue latest session | `claude --continue` | Click "Continue" on a project header |
| New session in project | `claude` (with `cwd` set to project path) | Click "New Session" on a project |
| New session with prompt | `claude "{prompt}"` (with `cwd`) | Enter prompt in the "Quick Start" input |
| Worktree session | `claude --worktree {name}` | Click "New Worktree Session" |

**Execution:**

- Sessions are launched via `Deno.Command` (subprocess spawn) with the working directory (`cwd`) set to the target project path.
- Two launch targets are supported:
  - **Terminal session:** Opens a new terminal window/tab running the Claude Code CLI (default).
  - **Background (headless) session:** Runs `claude -p "{prompt}" --output-format stream-json` and streams output back to the GUI panel (advanced mode).
- The GUI updates the session list in real-time as new JSONL files appear in the project directory.

### 7.4 New Project Wizard

**Description:** A guided flow for creating a new project working directory under `$PROJECTS_ROOT`, initializing it with Git, and optionally starting a Claude Code session.

**Steps:**

1. **Name & Path** — User enters a project name. The tool creates `$PROJECTS_ROOT/{project-name}/`.
2. **Git Initialization** — Runs `git init` in the new directory. Optionally configures a remote origin URL.
3. **CLAUDE.md Setup** — Optionally creates a starter `CLAUDE.md` file from a template (user can select from built-in templates or provide custom content).
4. **MCP Configuration** — Optionally creates a `.mcp.json` from a template for common MCP server setups.
5. **Launch Session** — Offers to immediately start a new Claude Code session in the created directory.

**All writes are confined to `$PROJECTS_ROOT`** — the `--allow-write` permission scope guarantees this at the runtime level.

### 7.5 Project Management

**Description:** Organize and manage projects registered with the tool.

**Features:**

- **Register existing directory:** Point the tool at a directory outside `$PROJECTS_ROOT` to add it to the project list (read-only; the tool reads its sessions from `~/.claude/projects/` but does not write to the directory).
- **Archive project:** Move a project directory within `$PROJECTS_ROOT` to an `_archived/` subfolder.
- **Project settings:** Per-project metadata stored in `$PROJECTS_ROOT/.session-manager/projects.json`:
  - Display name (alias for the directory path)
  - Tags/labels for filtering
  - Default Git branch
  - Preferred Claude model
  - Custom launch flags

### 7.6 Global Dashboard

**Description:** A landing page providing an overview of Claude Code activity.

**Widgets:**

- **Recent sessions** — The 10 most recently active sessions across all projects with one-click resume.
- **Activity heatmap** — Calendar-style visualization of session activity sourced from `~/.claude/stats-cache.json` and `~/.claude/history.jsonl`.
- **Token usage summary** — Aggregated input/output token counts by model, sourced from `stats-cache.json`.
- **Quick actions** — "New Project," "Resume Last Session," "Open Projects Root in Finder/Explorer."

---

## 8. Configuration

The tool is configured via a single JSON file at `$PROJECTS_ROOT/.session-manager/config.json`:

```jsonc
{
  // Root directory where new projects are created
  "projectsRoot": "/Users/takahiko/Projects",

  // Path to Claude's data directory (default: ~/.claude)
  "claudeHome": "/Users/takahiko/.claude",

  // Port for the local web GUI
  "port": 3456,

  // Default terminal emulator for launching sessions
  // Options: "system" (OS default), "iterm", "wezterm", "alacritty", "wt"
  "terminal": "system",

  // Templates directory for CLAUDE.md and .mcp.json
  "templatesDir": "/Users/takahiko/Projects/.session-manager/templates",

  // Sessions older than this are collapsed in the sidebar
  "archiveAfterDays": 90,

  // Enable live file watching for active sessions
  "liveWatch": true,

  // Additional directories to scan for sessions (read-only)
  "additionalProjectDirs": [
    "/Users/takahiko/Work"
  ]
}
```

---

## 9. Security Considerations

### 9.1 Deno Permission Boundary

The core security guarantee is enforced by Deno's runtime, not by application code. Even if a bug exists in the application, the Deno process physically cannot:

- Write to `~/.claude` (enforced by `--deny-write=$HOME/.claude`).
- Write outside `$PROJECTS_ROOT` (enforced by `--allow-write=$PROJECTS_ROOT` with no broader write grants).
- Execute arbitrary binaries (enforced by `--allow-run=claude,git`).
- Open network connections to external hosts (enforced by `--allow-net=127.0.0.1:3456`).

### 9.2 Session Data Sensitivity

Session JSONL files may contain sensitive information (API keys, credentials, proprietary code). The tool:

- Never transmits session data over the network (GUI is served locally).
- Never copies or duplicates JSONL files.
- Never modifies or appends to JSONL files.
- Processes files in-memory with streaming parsers to limit memory footprint.

### 9.3 Subprocess Security

When launching Claude Code or Git:

- Commands are constructed from validated inputs (no shell interpolation).
- `Deno.Command` is used (not shell execution) to prevent injection.
- Only `claude` and `git` executables are permitted by the runtime.

---

## 10. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Deno 2.x | Granular permissions, TypeScript-first, single binary |
| Backend framework | Hono or Oak | Lightweight HTTP server for Deno |
| Frontend | Preact + HTM (no build step) | Minimal footprint, serves from Deno directly |
| Styling | Tailwind CSS (CDN) | Rapid UI development, utility-first |
| JSONL parsing | Custom streaming parser | Handle large session files without loading entire file |
| File watching | `Deno.watchFs` | Native Deno API, no dependencies |
| Subprocess | `Deno.Command` | Secure subprocess spawning with explicit permissions |
| Storage | JSON files in `$PROJECTS_ROOT/.session-manager/` | No database needed; config and project metadata only |

---

## 11. CLI Interface

While the primary interface is the GUI, a minimal CLI is provided for scripting:

```bash
# Start the GUI server
claude-session-manager serve [--port 3456]

# List all projects
claude-session-manager projects

# List sessions for a project
claude-session-manager sessions /path/to/project

# Create a new project
claude-session-manager new my-project [--template default]

# Launch a session
claude-session-manager launch /path/to/project [--resume sessionId]

# Show dashboard stats
claude-session-manager stats
```

---

## 12. Installation

```bash
# Install from source
deno install \
  --name claude-session-manager \
  --allow-read=$HOME/.claude,$PROJECTS_ROOT \
  --allow-write=$PROJECTS_ROOT \
  --allow-run=claude,git \
  --allow-net=127.0.0.1:3456 \
  --deny-write=$HOME/.claude \
  https://github.com/user/claude-session-manager/main.ts

# Or run directly
deno run \
  --allow-read=$HOME/.claude,./projects \
  --allow-write=./projects \
  --allow-run=claude,git \
  --allow-net=127.0.0.1:3456 \
  --deny-write=$HOME/.claude \
  main.ts
```

---

## 13. User Stories

### US-1: Browse session history
> As a developer, I want to see all my Claude Code sessions grouped by project so that I can quickly find and review past conversations.

**Acceptance Criteria:**
- Sessions are grouped by decoded working directory.
- Each session shows summary, timestamp, message count, and Git branch.
- Sessions are sorted by last modification date (newest first).
- Full-text search across session summaries and prompts is available.

### US-2: Resume a session
> As a developer, I want to resume a previous Claude Code session from the GUI so that I can continue where I left off without memorizing session IDs.

**Acceptance Criteria:**
- Clicking "Resume" on a session opens a terminal with `claude --resume {id}`.
- The session's working directory is automatically set as `cwd`.
- The GUI reflects the session as "active" while the terminal is open.

### US-3: Create a new project
> As a developer, I want to create a new project workspace with Git initialized and start a Claude Code session in it with one flow.

**Acceptance Criteria:**
- A wizard creates the directory under `$PROJECTS_ROOT`.
- `git init` runs automatically.
- An optional `CLAUDE.md` is created from a selectable template.
- A Claude Code session can be launched immediately after creation.
- No files are written outside `$PROJECTS_ROOT`.

### US-4: View session transcript
> As a developer, I want to read through a past session's conversation in a clean, readable format without leaving the GUI.

**Acceptance Criteria:**
- Chat-style rendering with user/assistant message bubbles.
- Tool calls are collapsible with syntax-highlighted input/output.
- Code blocks have syntax highlighting.
- Token usage is summarized in the header.

### US-5: Monitor active session
> As a developer, I want to see real-time updates from an active Claude Code session in the GUI.

**Acceptance Criteria:**
- File watcher detects new lines appended to the active session JSONL.
- New messages appear in the viewer without manual refresh.
- Live mode can be toggled on/off.

### US-6: Quick-launch from dashboard
> As a developer, I want to quickly resume my most recent session or start a new one from the landing page.

**Acceptance Criteria:**
- Dashboard shows the 10 most recent sessions across all projects.
- One-click resume for any listed session.
- "New Project" button opens the wizard.

---

## 14. Milestones

### Phase 1 — Core Reader (MVP)
- Session JSONL parser with streaming support.
- Project discovery from `~/.claude/projects/`.
- Web GUI with project explorer sidebar and session viewer.
- Deno permission setup with `--deny-write` on `~/.claude`.

### Phase 2 — Session Launcher
- Terminal session launch (`claude --resume`, `claude --continue`).
- New session creation with `cwd` targeting.
- Worktree session support.

### Phase 3 — Project Management
- New Project Wizard with Git init and `CLAUDE.md` templating.
- Project registration, tagging, and archival.
- Configuration system.

### Phase 4 — Dashboard & Live Features
- Global dashboard with activity heatmap and token usage.
- Live file watching for active sessions.
- Headless session streaming to GUI.

### Phase 5 — Polish
- Keyboard shortcuts and accessibility.
- Dark/light theme support.
- Session export to HTML (leverage claude-code-transcripts format).
- CLI interface for scripting.

---

## 15. Open Questions

1. **Terminal integration:** Cross-platform terminal detection and launch is non-trivial. Should v1 support only macOS (`open -a Terminal`) and defer Windows/Linux?
2. **Session index availability:** `sessions-index.json` may not exist in all Claude Code versions. How aggressively should we fall back to JSONL parsing?
3. **Claude Code version compatibility:** The `~/.claude` directory structure is not documented as a stable API. How should the tool handle breaking changes in future Claude Code releases?
4. **Multi-user support:** Should the tool support reading `.claude` directories from other user accounts (e.g., for team audit scenarios)?
5. **Deno Deploy:** Should we explore a hosted version that reads from a synced `.claude` directory, or is local-only the correct scope?

---

## 16. References

- [Claude Code Session Management — Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [claude-code-transcripts by Simon Willison](https://github.com/simonw/claude-code-transcripts)
- [Deno Security and Permissions](https://docs.deno.com/runtime/fundamentals/security/)
- [Claude Agent SDK — Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Anatomy of the .claude/ Folder](https://blog.dailydoseofds.com/p/anatomy-of-the-claude-folder)
- [~/.claude directory structure (samkeen gist)](https://gist.github.com/samkeen/dc6a9771a78d1ecee7eb9ec1307f1b52)
