import { html } from "htm/preact";
import { navigate } from "../lib/router.js";
import { timeAgo } from "../lib/format.js";

export function SessionRow({ session, showProject = false }) {
  const now = Date.now();
  const lastMs = session.lastTimestamp ? new Date(session.lastTimestamp).getTime() : 0;
  const isActive = now - lastMs < 3600000; // active within last hour
  const dotClass = isActive ? "dot purple" : "dot muted";

  const handleClick = () => {
    navigate(`/transcript/${session.id}`);
  };

  const handleResume = (e) => {
    e.stopPropagation();
  };

  return html`
    <div class="session-row" onclick=${handleClick}>
      <div class=${dotClass}></div>
      <div class="session-summary">${session.summary || session.id}</div>
      ${session.gitBranch && html`<span class="branch">${session.gitBranch}</span>`}
      ${showProject && html`<div class="session-project">${session.projectId || ""}</div>`}
      <div class="session-msgs">${session.messageCount || 0}</div>
      <div class="session-time">${timeAgo(session.lastTimestamp)}</div>
      <button class="btn-resume" onclick=${handleResume}>${"\u25B6"} Resume</button>
    </div>
  `;
}
