# Gap Analysis: Timeline Feature

## 1. Current State Investigation

### Existing Assets

| Area | Asset | Relevance |
|------|-------|-----------|
| **Session parsing** | `src/services/session-parser.ts` — `extractSessionMetadata()`, `parseTranscript()` | Core data source. Already extracts timestamps, roles, content types, tool calls, active status. |
| **Active detection** | `src/services/project-discovery.ts` — `getActiveSessionIds()` | Reads `~/.claude/sessions/*.json` for active session UUIDs. Directly reusable. |
| **Project discovery** | `src/services/project-discovery.ts` — `discoverProjects()`, `getProjectSessions()` | Enumerates all projects/sessions. Foundation for cross-project aggregation. |
| **Dashboard route** | `src/routes/dashboard.ts` | Already aggregates recent sessions across projects (top 20 by mtime, parses top 10). Pattern to extend. |
| **Summary service** | `src/services/summary-service.ts` | AI summaries via `claude -p --model haiku`. Reusable for timeline entry labeling. |
| **Frontend routing** | `static/lib/router.js` | Hash-based with Preact Signals. Easy to add `/timeline` route. |
| **Split-pane layout** | `static/components/dashboard.js`, `projects.js` | Existing pattern: list on left, detail on right. Reusable for sidebar + feed. |
| **TranscriptPanel** | `static/components/transcript.js` | Reusable for click-through to session detail. |
| **Session row** | `static/components/session-row.js` | Badge display (ACTIVE, REMOTE), launch menu. Patterns to reuse. |
| **Types** | `src/types.ts` — `SessionSummary`, `TranscriptEntry` | Core interfaces. `TranscriptEntry` has timestamp, type, text, toolCalls — usable for feed entries. |

### Conventions Observed

- **Routes**: Factory function pattern `xxxRoutes(config: AppConfig): Hono`
- **Services**: Pure functions, no HTTP concerns
- **Frontend**: htm tagged templates, `useState`/`useEffect` hooks, `signal` for shared state
- **Data flow**: Single fetch on mount, no polling or live updates
- **CSS**: Single `style.css` with CSS variables, dark/light mode support

### Integration Surfaces

- `TranscriptEntry` has `timestamp`, `type` (user/assistant/system), `text`, `toolCalls` — sufficient for feed entries
- `SessionSummary` has `isActive`, `isRemoteConnected`, `webUrl`, `projectId` — sufficient for sidebar
- `getActiveSessionIds()` returns `Set<string>` — reusable for sidebar presence
- No existing message-level importance classification or attention detection

---

## 2. Requirements Feasibility Analysis

### Requirement-to-Asset Map

| Req | Need | Existing Asset | Gap |
|-----|------|----------------|-----|
| **R1: Unified Feed** | Cross-project message aggregation by timestamp | `dashboard.ts` aggregates sessions; `parseTranscript()` returns entries with timestamps | **Missing**: No API endpoint that returns individual messages across sessions sorted by time. Current aggregation is session-level, not message-level. |
| **R2: Importance Filter** | Message importance classification (high/normal/low) | `TranscriptEntry.type` distinguishes user/assistant/system; tool calls tracked | **Missing**: No importance classifier. Need heuristic to detect permission requests, questions, errors from message content. |
| **R3: Attention Highlighting** | Visual distinction for attention-required messages | `session-row.js` has badge patterns (ACTIVE, REMOTE) | **Missing**: No attention detection logic. Need content analysis for permission prompts, direct questions, error states. |
| **R4: Active Sidebar** | Presence-style session list | `getActiveSessionIds()` exists; `SessionSummary.isActive/isRemoteConnected` available | **Missing**: No periodic refresh mechanism. Currently one-shot on page load. |
| **R5: Pinned Messages** | Sticky section for unresolved attention items | No existing pinned/sticky UI pattern | **Missing**: Pinned section component. Need "resolved" state tracking (session continued = resolved). |
| **R6: Auto-Scroll** | Auto-scroll on new messages, pause when scrolled away | `transcript.js` has scroll-to-bottom on load | **Missing**: No polling for new data. No scroll-position detection. No "new messages" banner. |
| **R7: Navigation/Context** | Project/session context per entry, grouping | `SessionSummary` has `projectId`, `aiSummary`; session-row has project display | **Partial**: Data available, but no feed-level grouping of consecutive same-session messages. |

### Missing Capabilities

1. **Message-level cross-session API** — No endpoint returns individual messages from multiple sessions merged by timestamp. Dashboard returns session summaries, not messages.
2. **Importance classifier** — No logic to categorize messages as high/normal/low. Need heuristic: permission keywords, question marks in assistant text, error patterns.
3. **Attention detection** — No mechanism to identify "needs user input" messages. Need to detect: permission prompts (`tool_use` approval), direct questions (assistant messages ending with `?`), error states.
4. **Polling/live updates** — No existing polling, SSE, or WebSocket for data freshness. All views are static after initial load.
5. **Pinned UI pattern** — No sticky/pinned section in any existing view.
6. **Scroll position tracking** — No existing mechanism to detect user scroll position or toggle auto-scroll.

### Complexity Signals

- **Message aggregation**: Medium — need to parse multiple JSONL files, merge entries, and paginate. Performance concern with many large files.
- **Importance classification**: Low — heuristic-based, pattern matching on content text.
- **Polling**: Medium — new pattern for the app. Need interval + state management.
- **Pinned section + auto-scroll**: Low — frontend-only UI patterns.

---

## 3. Implementation Approach Options

### Option A: Extend Existing Components

**Strategy**: Add `/api/timeline` route using existing services; add timeline view as new frontend component reusing existing patterns.

**Backend changes**:
- New route file: `src/routes/timeline.ts` with `GET /api/timeline?limit=50&before=<timestamp>&importance=all|high|normal`
- Extend `session-parser.ts` with `classifyImportance(entry: TranscriptEntry): "high" | "normal" | "low"` function
- Reuse `discoverProjects()` + `getProjectSessions()` + `parseTranscript()` to aggregate messages

**Frontend changes**:
- New component: `static/components/timeline.js` with sidebar + feed layout
- Add `/timeline` route to `router.js` and nav header
- Reuse `TranscriptPanel` for click-through
- Add polling via `setInterval` in `useEffect`

**Trade-offs**:
- Leverages all existing parsing/discovery infrastructure
- No new backend patterns needed (still REST + JSON)
- Performance risk: parsing multiple JSONL files per request could be slow
- No new dependencies

### Option B: Create New Timeline Service

**Strategy**: Dedicated `src/services/timeline-service.ts` that pre-indexes messages with in-memory cache for fast timeline queries.

**Backend changes**:
- New service: `timeline-service.ts` with `TimelineService` class that scans all sessions on startup, caches message index, and refreshes incrementally
- New route: `timeline.ts` delegates to `TimelineService`
- New types: `TimelineEntry`, `TimelineFilter`, `TimelineResponse`

**Frontend changes**: Same as Option A.

**Trade-offs**:
- Fast queries from pre-built index
- Higher memory usage (message index in memory)
- More complex — new stateful service pattern (like `PTYManager`)
- Startup delay for initial indexing

### Option C: Hybrid Approach (Recommended)

**Strategy**: New timeline route with lazy parsing + response caching. New frontend component. Polling for freshness.

**Backend changes**:
- New route: `src/routes/timeline.ts`
- New service function in `session-parser.ts`: `extractTimelineEntries()` — lighter than full `parseTranscript()`, returns only display-relevant fields + importance
- Add `classifyImportance()` to `session-parser.ts`
- Simple in-memory response cache with TTL (invalidated on poll)

**Frontend changes**:
- New component: `static/components/timeline.js`
- New route in `router.js` + nav link
- Polling via `setInterval` in component
- Pinned section as sub-component
- Scroll detection via `useRef` + `onScroll`

**Trade-offs**:
- Balances performance (caching) with simplicity (no startup index)
- Incremental approach: can start without cache, add later
- `classifyImportance()` is testable in isolation
- Polling is simple and fits existing architecture (no SSE/WS infrastructure needed)

---

## 4. Research Needed (Deferred to Design)

1. **Performance**: How many sessions/messages can be aggregated per request? Need to benchmark JSONL parsing across 50+ sessions. May need to limit to recent sessions or active-only.
2. **Attention detection accuracy**: What patterns reliably identify permission prompts vs. regular questions? Need to sample real JSONL data for heuristic development.
3. **Polling interval**: What's the right balance between freshness and server load? 5s? 10s? 30s? May differ for active vs. inactive sessions.
4. **"Resolved" state**: How to determine if an attention-required message has been resolved? Options: session has newer messages after the attention message, session is no longer active, or user manually dismisses.

---

## 5. Effort & Risk Assessment

| Dimension | Rating | Justification |
|-----------|--------|---------------|
| **Effort** | **M (3–7 days)** | New route + service function + frontend component + polling. Follows existing patterns but introduces cross-session aggregation and new UI concepts (pinned section, auto-scroll). |
| **Risk** | **Medium** | Performance of multi-session JSONL parsing is the main unknown. Importance classification heuristic accuracy is untested. Polling is a new pattern but well-understood. |

---

## 6. Recommendations for Design Phase

**Preferred approach**: Option C (Hybrid) — new timeline route with lazy parsing, importance classifier in session-parser, response cache, and polling-based frontend.

**Key decisions for design**:
1. Pagination strategy: cursor-based (timestamp) vs. offset-based
2. Cache strategy: per-request TTL vs. file-watcher invalidation
3. Importance classifier: keyword matching vs. content structure analysis
4. Polling interval and freshness guarantees
5. Maximum number of sessions to aggregate (performance boundary)

**Research items to carry forward**:
- Benchmark JSONL parsing for 50+ sessions
- Sample real attention-required messages for classifier heuristic
- Define "resolved" semantics for pinned messages
