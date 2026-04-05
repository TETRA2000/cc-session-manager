import { html } from "htm/preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { getTimeline } from "../lib/api.js";
import { timeAgo } from "../lib/format.js";
import { navigate } from "../lib/router.js";

const autoScrollEnabled = signal(true);

// ─── TimelineView (root component) ───

export function TimelineView() {
  const [entries, setEntries] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importance, setImportance] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState(null);
  const prevCountRef = useRef(0);

  const fetchData = useCallback(async (opts = {}) => {
    try {
      const data = await getTimeline({ importance, ...opts });
      if (opts.before) {
        setEntries((prev) => [...prev, ...data.entries]);
      } else {
        setEntries(data.entries);
      }
      setActiveSessions(data.activeSessions);
      setHasMore(data.hasMore);
      setOldestTimestamp(data.oldestTimestamp);
    } catch (e) {
      console.error("Timeline fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [importance]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(() => fetchData(), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const loadMore = useCallback(() => {
    if (oldestTimestamp && hasMore) {
      fetchData({ before: oldestTimestamp });
    }
  }, [oldestTimestamp, hasMore, fetchData]);

  // Compute pinned entries
  const activeSessionIds = new Set(activeSessions.map((s) => s.sessionId));
  const pinnedEntries = entries
    .filter((e) => e.isAttention && activeSessionIds.has(e.sessionId))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Apply session filter from sidebar
  const filteredEntries = selectedSessionId
    ? entries.filter((e) => e.sessionId === selectedSessionId)
    : entries;

  // Compute counts for filter bar
  const counts = { all: entries.length, high: 0, normal: 0, low: 0 };
  for (const e of entries) {
    counts[e.importance]++;
  }

  if (loading && entries.length === 0) {
    return html`<div class="loading">Loading timeline...</div>`;
  }

  return html`
    <div class="main-layout">
      <${ActiveSessionsSidebar}
        sessions=${activeSessions}
        selectedId=${selectedSessionId}
        onSelect=${(id) => setSelectedSessionId(id === selectedSessionId ? null : id)}
      />
      <div class="feed-area">
        <${FilterBar}
          selected=${importance}
          onSelect=${setImportance}
          counts=${counts}
        />
        <${FeedScroll}
          entries=${filteredEntries}
          pinnedEntries=${pinnedEntries}
          onLoadMore=${loadMore}
          hasMore=${hasMore}
          prevCount=${prevCountRef}
        />
      </div>
    </div>
  `;
}

// ─── ActiveSessionsSidebar ───

function ActiveSessionsSidebar({ sessions, selectedId, onSelect }) {
  const needsAttention = sessions.filter((s) => s.hasAttention);
  const running = sessions.filter((s) => !s.hasAttention);

  return html`
    <div class="tl-sidebar">
      <div class="sidebar-header">ACTIVE SESSIONS</div>
      <div class="sidebar-scroll">
        ${needsAttention.length > 0 && html`
          <div class="sidebar-section-label">NEEDS ATTENTION</div>
          ${needsAttention.map((s) => html`
            <${SidebarSession} key=${s.sessionId} session=${s}
              selected=${selectedId === s.sessionId} onSelect=${onSelect} />
          `)}
        `}
        ${running.length > 0 && html`
          <div class="sidebar-section-label">RUNNING</div>
          ${running.map((s) => html`
            <${SidebarSession} key=${s.sessionId} session=${s}
              selected=${selectedId === s.sessionId} onSelect=${onSelect} />
          `)}
        `}
        ${sessions.length === 0 && html`
          <div class="sidebar-empty">No active sessions</div>
        `}
      </div>
    </div>
  `;
}

function SidebarSession({ session, selected, onSelect }) {
  const s = session;
  return html`
    <div class="sidebar-session${selected ? " selected" : ""}"
         onclick=${() => onSelect(s.sessionId)}>
      <div class="presence-dot ${s.status}"></div>
      <div class="sidebar-info">
        <div class="sidebar-project">${s.projectName}</div>
        <div class="sidebar-meta">
          ${timeAgo(s.lastActivity)}
          ${" · "}
          <span class="sidebar-badge ${s.status}">${s.status.toUpperCase()}</span>
        </div>
      </div>
      ${s.hasAttention && html`<div class="attention-dot"></div>`}
    </div>
  `;
}

// ─── FilterBar ───

function FilterBar({ selected, onSelect, counts }) {
  const filters = [
    { key: "all", label: "All" },
    { key: "high", label: "High" },
    { key: "normal", label: "Normal" },
    { key: "low", label: "Low" },
  ];

  return html`
    <div class="filter-bar">
      <span class="filter-label">SHOW:</span>
      ${filters.map((f) => html`
        <button
          key=${f.key}
          class="filter-btn${selected === f.key ? " active" : ""}"
          onclick=${() => onSelect(f.key)}
        >
          ${f.label} <span class="count">${counts[f.key] ?? 0}</span>
        </button>
      `)}
      <div class="filter-spacer"></div>
      <button
        class="filter-btn${autoScrollEnabled.value ? " active" : ""}"
        onclick=${() => { autoScrollEnabled.value = !autoScrollEnabled.value; }}
        title="Toggle auto-scroll"
      >
        Auto-scroll
      </button>
    </div>
  `;
}

// ─── PinnedSection ───

function PinnedSection({ entries }) {
  if (entries.length === 0) return null;

  return html`
    <div class="pinned-section">
      <div class="pinned-header">
        <span class="pinned-icon">!</span>
        <span>${entries.length} item${entries.length > 1 ? "s" : ""} need${entries.length === 1 ? "s" : ""} attention</span>
      </div>
      ${entries.map((e) => html`
        <${FeedEntry} key=${e.uuid} entry=${e} />
      `)}
    </div>
  `;
}

// ─── FeedScroll ───

function FeedScroll({ entries, pinnedEntries, onLoadMore, hasMore, prevCount }) {
  const scrollRef = useRef(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Detect new messages
  useEffect(() => {
    if (entries.length > prevCount.current && prevCount.current > 0) {
      if (isAtTop && autoScrollEnabled.value) {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (!isAtTop) {
        setHasNewMessages(true);
      }
    }
    prevCount.current = entries.length;
  }, [entries.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop < 50;
    setIsAtTop(atTop);
    if (atTop) setHasNewMessages(false);

    // Load more when near bottom
    if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  const jumpToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setHasNewMessages(false);
  }, []);

  // Group entries by time
  const grouped = groupByTime(entries);

  return html`
    <div class="feed-scroll" ref=${scrollRef} onscroll=${handleScroll}>
      <${PinnedSection} entries=${pinnedEntries} />
      ${hasNewMessages && html`
        <div class="new-messages-banner" onclick=${jumpToTop}>
          New messages
        </div>
      `}
      ${grouped.map(({ label, items }) => html`
        <div class="time-separator" key=${label}>
          <span class="time-separator-label">${label}</span>
          <div class="time-separator-line"></div>
        </div>
        ${renderGroupedEntries(items)}
      `)}
      ${entries.length === 0 && html`
        <div class="loading">No recent activity</div>
      `}
    </div>
  `;
}

function renderGroupedEntries(entries) {
  const result = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const prev = entries[i - 1];
    if (prev && prev.sessionId === e.sessionId) {
      result.push(html`
        <div class="session-group-label" key=${"g-" + e.uuid}>continued from ${e.projectName}</div>
      `);
    }
    result.push(html`<${FeedEntry} key=${e.uuid} entry=${e} />`);
  }
  return result;
}

// ─── FeedEntry ───

function FeedEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const e = entry;

  const avatarClass = e.type === "assistant" ? "assistant"
    : e.type === "user" ? "user" : "system";
  const avatarText = e.type === "assistant" ? "AI"
    : e.type === "user" ? "U" : "!";
  const roleLabel = e.type === "assistant" ? "ASSISTANT"
    : e.type === "user" ? "USER"
    : "SYSTEM";

  return html`
    <div class="feed-entry${e.isAttention ? " attention" : ""}"
         onclick=${() => navigate("/transcript/" + e.sessionId)}>
      <div class="importance-bar ${e.importance}"></div>
      <div class="feed-avatar ${avatarClass}">${avatarText}</div>
      <div class="feed-body">
        <div class="feed-header">
          <span class="feed-role ${avatarClass}">${roleLabel}</span>
          <span class="feed-project-tag">${e.projectName}</span>
          ${e.isRemoteConnected && html`<span class="badge-remote">REMOTE</span>`}
          ${e.isAttention && html`
            <span class="attention-badge">
              ${e.type === "system" ? "! ERROR" : "? NEEDS INPUT"}
            </span>
          `}
          <span class="feed-time">${timeAgo(e.timestamp)}</span>
        </div>
        <div class="feed-text" onclick=${(ev) => { ev.stopPropagation(); setExpanded(!expanded); }}>
          ${expanded ? e.text : e.text}
        </div>
        ${e.toolNames.length > 0 && html`
          <div class="feed-tools">
            ${e.toolNames.map((name) => html`
              <span class="feed-tool" key=${name}>${name}</span>
            `)}
          </div>
        `}
      </div>
    </div>
  `;
}

// ─── Helpers ───

function groupByTime(entries) {
  const groups = [];
  let currentLabel = null;

  for (const e of entries) {
    const label = getTimeLabel(e.timestamp);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(e);
  }

  return groups;
}

function getTimeLabel(timestamp) {
  if (!timestamp) return "Unknown";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 2) return "JUST NOW";
  if (diffMin < 15) return `${diffMin} MINUTES AGO`;
  if (diffMin < 30) return "15 MINUTES AGO";
  if (diffMin < 60) return "30 MINUTES AGO";
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} HOUR${diffHr > 1 ? "S" : ""} AGO`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} DAY${diffDay > 1 ? "S" : ""} AGO`;
}
