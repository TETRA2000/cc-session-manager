import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { getProjects, getProject, launchSession } from "../lib/api.js";
import { shortenPath } from "../lib/format.js";
import { SessionRow } from "./session-row.js";
import { showToast } from "./toast.js";

function ProjectGroup({ project }) {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && sessions === null) {
      setLoadingSessions(true);
      getProject(project.id)
        .then((d) => {
          setSessions(d.sessions || []);
          setLoadingSessions(false);
        })
        .catch(() => {
          setSessions([]);
          setLoadingSessions(false);
        });
    }
  };

  const handleContinue = (e) => {
    e.stopPropagation();
    launchSession({ mode: "continue", projectId: project.id, target: "terminal" })
      .then(() => showToast("Launched in Terminal"))
      .catch((err) => showToast(err.message, "error"));
  };

  return html`
    <div class=${`project-group${expanded ? " expanded" : ""}`}>
      <div class="project-header" onclick=${toggle}>
        <span class=${`project-chevron${expanded ? " open" : ""}`}>${"\u25B6"}</span>
        <div class="project-icon">${"\u25C6"}</div>
        <span class="project-name">${project.displayName}</span>
        <span class="project-path">${shortenPath(project.path)}</span>
        <span class="project-count">${project.sessionCount || 0} sessions</span>
        <button class="btn-continue" onclick=${handleContinue}>${"\u25B6"} Continue</button>
      </div>

      ${expanded && html`
        <div class="project-sessions">
          ${loadingSessions && html`<div class="loading">Loading...</div>`}
          ${sessions && sessions.map(
            (s) => html`<${SessionRow} key=${s.id} session=${s} />`
          )}
        </div>
      `}
    </div>
  `;
}

export function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    getProjects()
      .then((d) => {
        setProjects(d.projects || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return html`<div class="content"><div class="loading">Loading...</div></div>`;
  }

  const filtered = filter
    ? projects.filter((p) => {
        const q = filter.toLowerCase();
        return (
          (p.displayName && p.displayName.toLowerCase().includes(q)) ||
          (p.path && p.path.toLowerCase().includes(q))
        );
      })
    : projects;

  return html`
    <div class="content">
      <div style="margin-bottom: 16px;">
        <input
          class="search-box"
          type="text"
          placeholder="Filter projects..."
          value=${filter}
          oninput=${(e) => setFilter(e.target.value)}
        />
      </div>
      ${filtered.map(
        (p) => html`<${ProjectGroup} key=${p.id} project=${p} />`
      )}
    </div>
  `;
}
