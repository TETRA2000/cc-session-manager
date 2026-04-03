import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { getDashboard } from "../lib/api.js";
import { formatTokens } from "../lib/format.js";
import { StatCard } from "./stat-card.js";
import { SessionRow } from "./session-row.js";
import { TranscriptPanel } from "./transcript.js";

export function DashboardView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDashboard()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return html`<div class="content"><div class="loading">Loading...</div></div>`;
  }

  if (!data) {
    return html`<div class="content"><div class="loading">Failed to load dashboard</div></div>`;
  }

  const stats = data.stats || {};
  const sessions = data.recentSessions || [];

  return html`
    <div class="split-pane">
      <div class="split-left">
        <div class="stat-grid stat-grid-compact">
          <${StatCard} label="PROJECTS" value=${stats.projects || 0} color="purple" />
          <${StatCard} label="SESSIONS" value=${stats.sessions || 0} />
          <${StatCard} label="ACTIVE (7D)" value=${stats.active7d || 0} color="green" />
          <${StatCard} label="TOKENS (30D)" value=${formatTokens(stats.tokens30d || 0)} />
          ${stats.activeSandboxes > 0 && html`<${StatCard} label="SANDBOXES" value=${stats.activeSandboxes} color="purple" />`}
        </div>

        <div class="section-title">RECENT SESSIONS</div>

        <div class="split-left-scroll">
          ${sessions.map(
            (s) => html`
              <div
                key=${s.id}
                class=${`session-row-wrapper${s.id === selectedSessionId ? " selected" : ""}`}
                onclick=${() => setSelectedSessionId(s.id)}
              >
                <${SessionRow} session=${s} showProject=${true} inline=${true} />
              </div>
            `
          )}
        </div>
      </div>
      <div class="split-right">
        <${TranscriptPanel} sessionId=${selectedSessionId} compact=${true} />
      </div>
    </div>
  `;
}
