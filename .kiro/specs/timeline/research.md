# Research & Design Decisions

## Summary
- **Feature**: timeline
- **Discovery Scope**: Extension (brownfield — adding new view + route + service function to existing app)
- **Key Findings**:
  - `TranscriptEntry` already has timestamp, type, text, toolCalls — sufficient for feed items with minor extension
  - No polling/SSE mechanism exists; `setInterval` in component `useEffect` is the simplest viable approach
  - Dashboard route pattern (aggregate across projects, parse top-N JSONL files) is directly reusable for timeline aggregation

## Research Log

### Cross-Session Message Aggregation Performance
- **Context**: Timeline requires merging messages from multiple JSONL sessions sorted by timestamp. Need to assess feasibility.
- **Findings**:
  - `extractSessionMetadata()` reads entire JSONL per session but only extracts summary fields — lightweight
  - `parseTranscript()` reads entire JSONL and builds full `TranscriptEntry[]` with tool-call pairing — heavier
  - Dashboard already parses top 20 files to find 10 with content; extending to 30-50 is feasible
  - Key optimization: a lighter extraction function that yields only timestamp + type + text preview (skip tool-call pairing)
- **Implications**: New `extractTimelineEntries()` function should be lighter than `parseTranscript()` — extract only fields needed for feed display, skip thinking blocks and full tool results

### Importance Classification Heuristic
- **Context**: Need to categorize messages as high/normal/low importance without ML.
- **Findings**:
  - **High**: Assistant messages containing permission-related tool use (Bash, Write, Edit with confirmation patterns), messages ending with `?`, system messages with `level: "error"`, tool results with `is_error: true`
  - **Normal**: User messages (all — user input is always relevant), assistant text responses without questions
  - **Low**: Tool calls (routine file reads, greps), thinking blocks, progress messages
  - Pattern: assistant messages with `AskUserQuestion` tool or text ending in `?` are strong question indicators
- **Implications**: Keyword + structure heuristic is sufficient; no external dependencies needed

### Attention-Required Detection
- **Context**: Subset of "high" importance — messages that need active user response.
- **Findings**:
  - Permission prompts: not explicitly stored in JSONL (they're CLI-level). Proxy: the *last* assistant message in an active session that contains a question or tool call awaiting approval
  - Questions: assistant messages ending with `?` or containing `AskUserQuestion` tool use
  - Errors: `ToolResultBlock.is_error === true`, system messages with error-level
  - "Resolved" semantics: if the session has a newer user message after the attention message, it's resolved; if session is no longer active, it's resolved
- **Implications**: Attention detection requires checking if a message is the *last* in an active session and whether it's unanswered

### Polling Strategy
- **Context**: No existing live-update mechanism in the app. Need to decide approach.
- **Findings**:
  - SSE/WebSocket would require new server infrastructure (Hono supports WebSocket via upgrade, used in terminal.ts)
  - `setInterval` polling is simpler, fits existing architecture, no new backend patterns
  - Dashboard already loads in ~200-500ms for typical project counts
  - Active session detection (`getActiveSessionIds()`) reads small JSON files — very fast
- **Implications**: Poll at 10s interval for timeline data. Separate faster poll (5s) for active session sidebar only.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| REST polling | Frontend polls GET /api/timeline at interval | Simple, fits existing arch, no new infra | Extra server load, slight delay | Recommended |
| SSE stream | Server pushes new messages via EventSource | Real-time, efficient once connected | New server pattern, connection management | Overkill for this feature |
| File watcher + WebSocket | Watch JSONL files, push via WS | True real-time | Complex, Deno file watching limitations | Already have WS infra in terminal.ts but too complex |

## Design Decisions

### Decision: Lightweight Timeline Entry Extraction
- **Context**: Full `parseTranscript()` is too heavy for aggregating across 30+ sessions
- **Alternatives**:
  1. Reuse `parseTranscript()` and take first/last N entries per session
  2. New `extractTimelineEntries()` that yields entries without tool-call pairing
- **Selected Approach**: New function `extractTimelineEntries()` in `session-parser.ts`
- **Rationale**: Avoids O(n) tool-call map building; only needs text preview + timestamp + type + importance
- **Trade-offs**: Small code duplication with `parseTranscript()`, but much faster for timeline use case

### Decision: In-Memory Response Cache with TTL
- **Context**: Timeline endpoint aggregates data from many JSONL files; re-parsing on every poll is wasteful
- **Alternatives**:
  1. No cache (parse fresh each request)
  2. In-memory TTL cache (10s)
  3. Persistent cache file (like summaries.json)
- **Selected Approach**: In-memory TTL cache (10s expiry) in timeline route
- **Rationale**: Matches polling interval; eliminates redundant parsing; no disk I/O; memory-safe (single cached response)
- **Trade-offs**: Stale by up to 10s; cleared on server restart (acceptable)

### Decision: Pinned Messages as Frontend-Only Logic
- **Context**: Pinned section needs to know which messages are "unresolved attention-required"
- **Alternatives**:
  1. Backend returns `isPinned` flag per entry
  2. Frontend filters attention entries from active sessions
- **Selected Approach**: Backend returns `importance` and `isAttention` fields; frontend computes pinned set by filtering attention entries from active sessions
- **Rationale**: Backend already knows importance; frontend has active session context from sidebar data; avoids backend tracking "resolved" state
- **Trade-offs**: Frontend logic slightly more complex, but avoids backend state management

## Risks & Mitigations
- **Performance with many sessions**: Mitigate by limiting to 50 most recent sessions, lightweight extraction, TTL cache
- **Importance classifier accuracy**: Mitigate by starting with conservative heuristic (questions + errors only), iterate based on usage
- **Stale data perception**: Mitigate by showing "last updated X seconds ago" indicator and manual refresh button
