# Implementation Plan

- [x] 1. Define timeline data types and importance classifier
- [x] 1.1 Add timeline-specific types to the shared type definitions
  - Add `TimelineEntry` interface with uuid, sessionId, projectId, projectName, sessionSummary, type, text, importance, isAttention, timestamp, model, toolNames, isRemoteConnected
  - Add `ActiveSessionInfo` interface with sessionId, projectId, projectName, status, lastActivity, hasAttention, isRemoteConnected
  - Add `TimelineResponse` interface with entries, activeSessions, hasMore, oldestTimestamp
  - Add `ImportanceLevel` type alias for the three importance tiers
  - _Requirements: 1.2, 2.1, 4.2, 7.1, 7.2_

- [x] 1.2 (P) Implement the importance classification function
  - Classify each message as high, normal, or low importance based on content heuristics
  - Detect attention-required messages: assistant questions (text ending with `?` or containing `AskUserQuestion` tool use), error tool results, system error messages
  - Accept an `isLastInActiveSession` flag to distinguish actionable attention items from historical ones
  - Return both importance level and isAttention boolean
  - _Requirements: 2.1, 3.1, 3.4_

- [x] 1.3 (P) Implement lightweight timeline entry extraction from session files
  - Stream JSONL and extract only display-relevant fields: uuid, type, timestamp, text preview (200 chars), tool names, model
  - Skip non-display message types and meta messages (same filtering as existing parser)
  - Support optional `limit` and `before` timestamp parameters for per-session filtering
  - Return entries sorted by timestamp descending
  - _Requirements: 1.1, 1.2, 7.1_

- [x] 2. Build the timeline API route with caching
- [x] 2.1 Create the timeline route handler with cross-session aggregation
  - Discover all projects and list recent session files sorted by modification time
  - Extract timeline entries from the top 50 most recent sessions using the lightweight extractor
  - Detect active sessions and classify importance for each entry, marking attention flags
  - Merge entries from all sessions into a single list sorted by timestamp descending
  - Attach AI summaries and project display names to each entry
  - Build active sessions list with attention flags based on whether the session's last message needs input
  - _Requirements: 1.1, 1.3, 1.4, 2.2, 4.1, 4.2, 4.3_

- [x] 2.2 Add in-memory TTL cache with post-cache filtering
  - Cache the unfiltered aggregated result (all entries + active sessions) under a single key with 10-second TTL
  - On cache hit, apply importance filtering, `before` cursor pagination, and limit post-retrieval
  - Validate query parameters: cap limit at 100, validate `before` as ISO 8601, validate importance against allowed values
  - Return 400 for invalid parameters
  - _Requirements: 1.3, 2.2_

- [x] 2.3 Register the timeline route in the API router
  - Wire the new timeline route into the main API composition alongside existing routes
  - Follows the same factory pattern as dashboard, projects, and sessions routes
  - _Requirements: 1.1, 1.4_

- [x] 3. Build the timeline frontend view with routing and polling
- [x] 3.1 Add timeline route to the frontend router and navigation
  - Register `/timeline` path pattern in the client-side hash router
  - Add the timeline view component to the main app switch
  - Add "TIMELINE" navigation link to the header component
  - _Requirements: 1.1_

- [x] 3.2 Build the root timeline view component with polling
  - Fetch timeline data on mount and set up a 10-second polling interval that clears on unmount
  - Manage component state: entries, active sessions, loading flag, selected importance filter, selected session ID for sidebar filtering
  - Compute pinned entries by filtering attention-required entries from active sessions
  - Pass data down to child sub-components (sidebar, filter bar, pinned section, feed)
  - _Requirements: 6.6, 1.1, 1.4, 5.1_

- [x] 3.3 (P) Build the importance filter bar component
  - Render pill-shaped buttons for All, High, Normal, and Low importance levels
  - Display message counts per level computed from the full entry set
  - Highlight the active filter and trigger a re-fetch with the selected importance parameter on change
  - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [x] 3.4 (P) Build the active sessions sidebar component
  - Display active sessions with presence indicator dots (green for active, blue for remote)
  - Show project name, time since last activity, and ACTIVE/REMOTE status badge per session
  - Display a pulsing notification dot on sessions that have attention-required messages
  - Clicking a session filters the feed to show only that session's messages; clicking again clears the filter
  - Group sessions into "Needs Attention" and "Running" sections
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 3.5 (P) Build the pinned attention section component
  - Render a sticky section at the top of the feed area showing unresolved attention messages from active sessions
  - Display a count indicator in the header (e.g., "3 items need attention")
  - Sort pinned messages chronologically with oldest first so the most urgent appears at the top
  - Remove entries from the pinned section when their session becomes inactive or has newer messages on subsequent polls
  - Clicking a pinned message navigates to the full transcript view for that session
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 3.6 Build the feed scroll container with auto-scroll behavior
  - Render timeline entries in a scrollable container with time-group separators
  - Track scroll position: detect when user is at top (scrollTop < 50px) and store as state flag
  - Auto-scroll to top when new data arrives if user is at top and auto-scroll is enabled
  - Show a "New messages" clickable banner when new data arrives while user is scrolled away
  - Provide a toggle button to enable/disable auto-scrolling; disabled state overrides position-based logic
  - Trigger loading of older entries when user scrolls to bottom (pass `before` cursor to parent for pagination)
  - Group consecutive entries from the same session with a visual separator label
  - _Requirements: 1.3, 6.1, 6.2, 6.3, 6.4, 6.5, 7.4_

- [x] 3.7 (P) Build the individual feed entry component
  - Display avatar (AI/User/System), role label, project tag, status badge, timestamp, and text preview
  - Show a colored importance bar on the left edge (red for high, transparent otherwise)
  - Apply distinct attention styling (highlighted border and badge) for attention-required entries
  - Show compact tool call badges listing tool names used in the message
  - Clicking navigates to the transcript view for that session
  - Support expandable detail section on hover or click showing full message text
  - _Requirements: 1.2, 1.5, 2.5, 3.2, 7.1, 7.2, 7.3_

- [x] 4. Add timeline CSS styles
- [x] 4.1 (P) Add timeline-specific CSS classes to the stylesheet
  - Add styles for the timeline layout: sidebar, filter bar, feed scroll area, pinned section
  - Add styles for feed entries: importance bars, attention highlighting, project tags, time separators, session group labels
  - Add styles for the active sessions sidebar: presence dots, attention dot animation, section labels
  - Add styles for auto-scroll controls: new messages banner, toggle button
  - Support both light and dark mode via existing CSS variable system
  - _Requirements: 2.5, 3.2, 5.2, 6.3_

- [x] 5. Add tests for timeline functionality
- [x] 5.1 Add unit tests for the importance classifier
  - Test classification of assistant messages ending with question marks as high importance
  - Test classification of messages containing AskUserQuestion tool use as high + attention
  - Test classification of error tool results as high importance
  - Test that user messages are classified as normal importance
  - Test that tool-only messages (no text) are classified as low importance
  - Test the isLastInActiveSession flag interaction with attention detection
  - _Requirements: 2.1, 3.1, 3.4_

- [x] 5.2 (P) Add unit tests for the lightweight timeline entry extractor
  - Test extraction from a JSONL fixture with mixed message types
  - Verify non-display types and meta messages are filtered out
  - Verify text is truncated to 200 characters
  - Test the `limit` parameter caps entries per session
  - Test the `before` parameter filters entries by timestamp
  - _Requirements: 1.1, 1.2_

- [x] 5.3 (P) Add integration tests for the timeline API route
  - Test `GET /api/timeline` returns valid response with entries sorted by timestamp descending
  - Test `?importance=high` returns only high-importance entries
  - Test `?before=<timestamp>` returns entries older than cursor
  - Test `?limit=5` respects the limit parameter
  - Test invalid parameters return 400 errors
  - _Requirements: 1.1, 1.3, 2.2_

- [x] 5.4* Add frontend logic tests for pinned message computation and auto-scroll state
  - Test pinned entries are correctly filtered from attention entries with active sessions
  - Test auto-scroll state transitions: on → paused (scroll away), paused → on (scroll back/click banner), disabled toggle
  - _Requirements: 5.1, 5.3, 6.1, 6.2_
