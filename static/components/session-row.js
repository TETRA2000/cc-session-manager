import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { navigate } from "../lib/router.js";
import { timeAgo } from "../lib/format.js";
import { launchSession } from "../lib/api.js";
import { showToast } from "./toast.js";

export function SessionRow({ session, showProject = false }) {
  const now = Date.now();
  const lastMs = session.lastTimestamp ? new Date(session.lastTimestamp).getTime() : 0;
  const isActive = now - lastMs < 3600000; // active within last hour
  const dotClass = isActive ? "dot purple" : "dot muted";
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClick = () => {
    navigate(`/transcript/${session.id}`);
  };

  const handleLaunch = (target) => {
    setMenuOpen(false);
    launchSession({
      mode: "resume",
      projectId: session.projectId,
      sessionId: session.id,
      target,
      webUrl: session.webUrl,
    })
      .then(() => showToast(target === "web" ? "Opened in browser" : "Launched in Terminal"))
      .catch((err) => showToast(err.message, "error"));
  };

  const handleResume = (e) => {
    e.stopPropagation();
    handleLaunch("terminal");
  };

  const toggleMenu = (e) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const hasWeb = !!session.webUrl;

  return html`
    <div class="session-row" onclick=${handleClick}>
      <div class=${dotClass}></div>
      <div class="session-summary">${session.summary || session.id}</div>
      ${session.gitBranch && html`<span class="branch">${session.gitBranch}</span>`}
      ${hasWeb && html`<span class="badge-web">WEB</span>`}
      ${showProject && html`<div class="session-project">${session.projectId || ""}</div>`}
      <div class="session-msgs">${session.messageCount || 0}</div>
      <div class="session-time">${timeAgo(session.lastTimestamp)}</div>
      ${hasWeb
        ? html`
          <div class="launch-group">
            <button class="btn-resume" onclick=${handleResume}>${"\u25B6"} Resume</button>
            <button class="launch-dropdown-toggle" onclick=${toggleMenu}>${"\u25BE"}</button>
            ${menuOpen && html`
              <div class="launch-menu">
                <button class="launch-menu-item" onclick=${(e) => { e.stopPropagation(); handleLaunch("terminal"); }}>Terminal</button>
                <button class="launch-menu-item" onclick=${(e) => { e.stopPropagation(); handleLaunch("web"); }}>Open in Web</button>
              </div>
            `}
          </div>
        `
        : html`<button class="btn-resume" onclick=${handleResume}>${"\u25B6"} Resume</button>`
      }
    </div>
  `;
}
