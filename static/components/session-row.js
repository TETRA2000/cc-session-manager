import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { navigate } from "../lib/router.js";
import { timeAgo, formatTokens } from "../lib/format.js";
import { launchSession } from "../lib/api.js";
import { showToast } from "./toast.js";

export function SessionRow({ session, showProject = false, inline = false }) {
  const isActive = session.isActive || false;
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

  const isRemote = !!session.isRemoteConnected;

  return html`
    <div class="session-row" onclick=${inline ? undefined : handleClick}>
      <div class="session-row-top">
        <div class=${dotClass}></div>
        <div class="session-summary">${session.aiSummary || session.lastMessage || session.summary || session.id}</div>
      </div>
      <div class="session-row-bottom">
        ${session.gitBranch && html`<span class="branch">${session.gitBranch}</span>`}
        ${isActive && html`<span class="badge-active">ACTIVE</span>`}
        ${isRemote && html`<span class="badge-remote">REMOTE</span>`}
        ${showProject && html`<span class="session-project">${session.projectId || ""}</span>`}
        <span class="session-row-spacer"></span>
        ${session.totalTokens > 0 && html`<span class="session-tokens">${formatTokens(session.totalTokens)}</span>`}
        <span class="session-msgs">${session.messageCount || 0}</span>
        <span class="session-time">${timeAgo(session.lastTimestamp)}</span>
        ${isRemote
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
    </div>
  `;
}
