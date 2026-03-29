import { html } from "htm/preact";
import { route, Link } from "../lib/router.js";

export function Header() {
  const currentPath = route.value.path;

  return html`
    <div class="header">
      <${Link} href="/" class="logo" style="text-decoration:none">
        <div class="logo-dot"></div>
        <span class="logo-text">CLAUDE SESSION MANAGER</span>
      <//>
      <div class="header-actions">
        <${Link}
          href="/"
          class=${`nav-link${currentPath === "/" ? " active" : ""}`}
        >Dashboard<//>
        <${Link}
          href="/projects"
          class=${`nav-link${currentPath === "/projects" ? " active" : ""}`}
        >Projects<//>
        <button class="btn btn-accent" disabled>+ New project</button>
      </div>
    </div>
  `;
}
