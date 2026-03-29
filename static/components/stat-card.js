import { html } from "htm/preact";

export function StatCard({ label, value, color }) {
  const valueClass = color ? `stat-value ${color}` : "stat-value";

  return html`
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class=${valueClass}>${value}</div>
    </div>
  `;
}
