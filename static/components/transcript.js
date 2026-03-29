import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { route } from "../lib/router.js";
import { getTranscript, launchSession } from "../lib/api.js";
import { timeAgo, formatTokens, truncate } from "../lib/format.js";
import { showToast } from "./toast.js";
import { ToolCall } from "./tool-call.js";

function ThinkingBlock({ text }) {
  const [expanded, setExpanded] = useState(false);
  const chevron = expanded ? "\u25BE" : "\u25B8";

  return html`
    <div class="thinking-block">
      <button class="thinking-header" onclick=${() => setExpanded(!expanded)}>
        <span>${chevron}</span>
        <span>Thinking...</span>
      </button>
      ${expanded && html`<div class="thinking-body">${text}</div>`}
    </div>
  `;
}

function renderInlineCode(text) {
  if (!text) return "";
  const parts = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(html`<code>${match[1]}</code>`);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function Message({ entry }) {
  const isUser = entry.type === "user";
  const isSystem = entry.type === "system";
  const avatarClass = isUser ? "msg-avatar user" : "msg-avatar assistant";
  const roleClass = isUser ? "msg-role user" : "msg-role assistant";
  const roleLabel = isUser ? "USER" : isSystem ? "SYSTEM" : "ASSISTANT";
  const avatarLetter = isUser ? "U" : isSystem ? "S" : "C";

  return html`
    <div class="msg">
      <div class=${avatarClass}>${avatarLetter}</div>
      <div class="msg-body">
        <div class=${roleClass}>${roleLabel}</div>
        ${entry.text && html`<div class="msg-text">${renderInlineCode(entry.text)}</div>`}
        ${entry.toolCalls && entry.toolCalls.map(
          (tc, i) => html`<${ToolCall} key=${i} toolCall=${tc} />`
        )}
      </div>
    </div>
  `;
}

/**
 * Reusable transcript panel. Used both standalone (#/transcript/:id) and inline (projects 2-pane).
 * @param {string} sessionId - Session to load
 * @param {boolean} compact - If true, uses compact header for inline mode
 */
export function TranscriptPanel({ sessionId, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setData(null);
    getTranscript(sessionId)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [sessionId]);

  const copyId = () => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!sessionId) {
    return html`<div class="transcript-empty">Select a session to view transcript</div>`;
  }

  if (loading) {
    return html`<div class="transcript-empty">Loading transcript...</div>`;
  }

  if (!data) {
    return html`<div class="transcript-empty">Failed to load transcript</div>`;
  }

  const meta = data.meta || {};
  const entries = data.entries || [];

  const handleResume = () => {
    launchSession({ mode: "resume", projectId: meta.projectId, sessionId, target: "terminal" })
      .then(() => showToast("Launched in Terminal"))
      .catch((err) => showToast(err.message, "error"));
  };

  const handleContinue = () => {
    launchSession({ mode: "continue", projectId: meta.projectId, target: "terminal" })
      .then(() => showToast("Launched in Terminal"))
      .catch((err) => showToast(err.message, "error"));
  };

  const handleWebOpen = () => {
    const url = meta.webUrl || "https://claude.ai/code";
    launchSession({ mode: "resume", projectId: meta.projectId, sessionId, target: "web", webUrl: url })
      .then(() => showToast("Opened in browser"))
      .catch((err) => showToast(err.message, "error"));
  };

  return html`
    <div class=${compact ? "transcript-panel" : ""}>
      <div class="session-bar ${compact ? "session-bar-compact" : ""}">
        <div class="session-breadcrumb">
          <div class="project-icon">${"\u25C6"}</div>
          <span class="session-bar-name">${meta.projectId || "Project"}</span>
          <span class="session-bar-sep">/</span>
          <span class="session-bar-summary">${meta.aiSummary || meta.summary || sessionId}</span>
        </div>
        <div class="session-bar-actions">
          <button class="btn-copy" onclick=${copyId}>${copied ? "Copied!" : "Copy ID"}</button>
          <button class="btn-resume" onclick=${handleResume}>${"\u25B6"} Resume</button>
          <button class="btn-continue" onclick=${handleContinue}>Continue latest</button>
          ${meta.isRemoteConnected && html`<button class="btn-resume" onclick=${handleWebOpen}>Open in Web</button>`}
        </div>
      </div>

      <div class="meta-bar">
        ${meta.gitBranch && html`<span>Branch: <span class="meta-branch">${meta.gitBranch}</span></span>`}
        <span>Messages: <span class="val">${meta.messageCount || entries.length}</span></span>
        ${meta.model && html`<span>Model: <span class="val">${meta.model}</span></span>`}
        ${meta.totalTokens > 0 && html`
          <span>Tokens: <span class="val">${formatTokens(meta.totalTokens)}</span></span>
        `}
        <span>Session: <span class="val">${truncate(sessionId, 8)}</span></span>
        ${meta.lastTimestamp && html`<span>Updated: <span class="val">${timeAgo(meta.lastTimestamp)}</span></span>`}
      </div>

      <div class="transcript">
        ${entries.map(
          (e, i) => html`<${Message} key=${e.uuid || i} entry=${e} />`
        )}
      </div>
    </div>
  `;
}

/** Standalone transcript view (used at #/transcript/:id) */
export function TranscriptView() {
  const sessionId = route.value.params.sessionId;
  return html`<${TranscriptPanel} sessionId=${sessionId} />`;
}
