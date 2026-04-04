# Requirements Document

## Introduction
A unified social media feed-style timeline view that aggregates messages from all Claude Code sessions into a single chronological stream. Users can filter by message importance, see highlighted prompts that require attention (permission requests, questions), and view active sessions as a sidebar presence list — similar to active users in a messaging app.

## Requirements

### Requirement 1: Unified Timeline Feed
**Objective:** As a developer, I want a single chronological feed of messages from all sessions, so that I can see recent Claude Code activity across all projects at a glance.

#### Acceptance Criteria
1. When the user navigates to the timeline view, the Session Manager shall display messages from all sessions sorted by timestamp in reverse chronological order (newest first).
2. The Session Manager shall display each timeline entry with the project name, session identifier, timestamp, and message content preview.
3. When the user scrolls to the bottom of the loaded entries, the Session Manager shall load additional older messages (infinite scroll or pagination).
4. The Session Manager shall aggregate messages from all discovered projects without requiring the user to select a specific project first.
5. When a timeline entry is clicked, the Session Manager shall navigate to the full transcript view for that session, scrolled to the relevant message.

### Requirement 2: Message Importance Filtering
**Objective:** As a developer, I want to filter the timeline to show only important messages, so that I can quickly find actionable items without scrolling through routine tool calls and progress updates.

#### Acceptance Criteria
1. The Session Manager shall categorize messages into importance levels: **high** (permission requests, user questions, errors), **normal** (assistant text responses, summaries), and **low** (tool calls, progress, routine output).
2. When the user selects an importance filter, the Session Manager shall display only messages at or above the selected importance level.
3. The Session Manager shall default to showing all importance levels when no filter is active.
4. When the importance filter is changed, the Session Manager shall update the timeline feed without a full page reload.
5. The Session Manager shall display a visual indicator on each timeline entry showing its importance level.

### Requirement 3: Attention-Required Message Highlighting
**Objective:** As a developer, I want messages that require my attention (permission prompts, questions) to be visually prominent, so that I can respond to them quickly.

#### Acceptance Criteria
1. The Session Manager shall identify attention-required messages: permission requests, direct questions to the user, and error states requiring user action.
2. The Session Manager shall render attention-required messages with distinct visual styling (e.g., highlighted border, icon, or badge) that differentiates them from regular messages.
3. While an active session has an unresolved attention-required message, the Session Manager shall show a notification indicator on the corresponding active session entry in the sidebar.
4. When the user applies the importance filter at the **high** level, the Session Manager shall include all attention-required messages.

### Requirement 4: Active Sessions Sidebar
**Objective:** As a developer, I want to see which sessions are currently active, displayed like online users in a messaging app, so that I can monitor running sessions and quickly switch to ones needing attention.

#### Acceptance Criteria
1. The Session Manager shall display a sidebar listing all currently active sessions, detected from PID files in `~/.claude/sessions/`.
2. The Session Manager shall show each active session with its project name, a status indicator (ACTIVE or REMOTE), and time since last activity.
3. When an active session has an attention-required message, the Session Manager shall display a badge or notification dot on that session's sidebar entry.
4. When the user clicks an active session in the sidebar, the Session Manager shall filter the timeline to show only messages from that session.
5. If a session becomes inactive (PID no longer running), the Session Manager shall remove it from the active sessions sidebar or visually mark it as ended.
6. The Session Manager shall update the active sessions list periodically without requiring a manual page refresh.

### Requirement 5: Timeline Navigation and Context
**Objective:** As a developer, I want clear context for each timeline message, so that I can understand which project and session a message belongs to without leaving the timeline.

#### Acceptance Criteria
1. The Session Manager shall display the project name and session summary (or AI-generated title) alongside each timeline entry.
2. Where a session has a `bridge_status` web URL, the Session Manager shall display a "Remote" badge on its timeline entries.
3. When the user hovers over or expands a timeline entry, the Session Manager shall show additional context such as the full message text, tool call details, or error output.
4. The Session Manager shall visually group consecutive messages from the same session to reduce visual clutter in the feed.
