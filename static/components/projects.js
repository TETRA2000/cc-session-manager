import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { getProjects, getProject, launchSession, getProjectSettings, updateProjectSettings } from "../lib/api.js";
import { shortenPath } from "../lib/format.js";
import { SessionRow } from "./session-row.js";
import { showToast } from "./toast.js";

function ProjectSettingsPanel({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [tags, setTags] = useState("");
  const [preferredModel, setPreferredModel] = useState("");
  const [launchFlags, setLaunchFlags] = useState("");

  useEffect(() => {
    setLoading(true);
    getProjectSettings(projectId)
      .then((s) => {
        setDisplayName(s.displayName || "");
        setTags((s.tags || []).join(", "));
        setPreferredModel(s.preferredModel || "");
        setLaunchFlags((s.launchFlags || []).join(", "));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProjectSettings(projectId, {
        displayName,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        preferredModel,
        launchFlags: launchFlags.split(",").map((f) => f.trim()).filter(Boolean),
      });
      showToast("Settings saved");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return html`<div class="project-settings"><span style="font-size:12px;color:var(--text-tertiary)">Loading...</span></div>`;
  }

  return html`
    <div class="project-settings" onclick=${(e) => e.stopPropagation()}>
      <div class="project-settings-row">
        <label>Name</label>
        <input type="text" value=${displayName} oninput=${(e) => setDisplayName(e.target.value)} placeholder="Display name" />
      </div>
      <div class="project-settings-row">
        <label>Tags</label>
        <input type="text" value=${tags} oninput=${(e) => setTags(e.target.value)} placeholder="tag1, tag2" />
      </div>
      <div class="project-settings-row">
        <label>Model</label>
        <input type="text" value=${preferredModel} oninput=${(e) => setPreferredModel(e.target.value)} placeholder="claude-opus-4-6" />
      </div>
      <div class="project-settings-row">
        <label>Flags</label>
        <input type="text" value=${launchFlags} oninput=${(e) => setLaunchFlags(e.target.value)} placeholder="--verbose, --debug" />
      </div>
      <div style="margin-top: 8px;">
        <button class="btn btn-accent" onclick=${handleSave} disabled=${saving}>
          ${saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  `;
}

function ProjectGroup({ project }) {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTags, setSettingsTags] = useState(null);

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

  const handleSettingsClick = (e) => {
    e.stopPropagation();
    const next = !showSettings;
    setShowSettings(next);
    if (next && settingsTags === null) {
      getProjectSettings(project.id)
        .then((s) => {
          setSettingsTags(s.tags || []);
        })
        .catch(() => {
          setSettingsTags([]);
        });
    }
  };

  return html`
    <div class=${`project-group${expanded ? " expanded" : ""}`}>
      <div class="project-header" onclick=${toggle}>
        <span class=${`project-chevron${expanded ? " open" : ""}`}>${"\u25B6"}</span>
        <div class="project-icon">${"\u25C6"}</div>
        <span class="project-name">
          ${project.displayName}
          ${settingsTags && settingsTags.map(
            (t) => html`<span class="badge-tag" key=${t}>${t}</span>`
          )}
        </span>
        <span class="project-path">${shortenPath(project.path)}</span>
        <span class="project-count">${project.sessionCount || 0} sessions</span>
        <button class="settings-btn" onclick=${handleSettingsClick}>${"\u2699"}</button>
        <button class="btn-continue" onclick=${handleContinue}>${"\u25B6"} Continue</button>
      </div>

      ${showSettings && html`<${ProjectSettingsPanel} projectId=${project.id} />`}

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
