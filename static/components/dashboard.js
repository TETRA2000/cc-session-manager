import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { getDashboard } from "../lib/api.js";
import { formatTokens } from "../lib/format.js";
import { StatCard } from "./stat-card.js";
import { SessionRow } from "./session-row.js";

export function DashboardView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
    <div class="content">
      <div class="stat-grid">
        <${StatCard} label="PROJECTS" value=${stats.projects || 0} color="purple" />
        <${StatCard} label="SESSIONS" value=${stats.sessions || 0} />
        <${StatCard} label="ACTIVE (7D)" value=${stats.active7d || 0} color="green" />
        <${StatCard} label="TOKENS (30D)" value=${formatTokens(stats.tokens30d || 0)} />
      </div>

      <div class="section-title">RECENT SESSIONS</div>

      <div class="session-list">
        ${sessions.map(
          (s) => html`<${SessionRow} key=${s.id} session=${s} showProject=${true} />`
        )}
      </div>
    </div>
  `;
}
