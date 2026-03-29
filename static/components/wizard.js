import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { createProject, launchSession } from "../lib/api.js";
import { showToast } from "./toast.js";
import { navigate } from "../lib/router.js";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function WizardView() {
  const [name, setName] = useState("");
  const [gitInit, setGitInit] = useState(true);
  const [gitRemote, setGitRemote] = useState("");
  const [claudeMd, setClaudeMd] = useState(true);
  const [mcpJson, setMcpJson] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null); // { path } on success

  const nameValid = name.length > 0 && NAME_RE.test(name);
  const nameError = name.length > 0 && !nameValid ? "Invalid name (letters, numbers, hyphens, dots, underscores)" : "";

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createProject({
        name,
        gitInit,
        gitRemote: gitInit ? gitRemote : undefined,
        claudeMd,
        mcpJson,
        launchAfter: false,
      });
      setResult(res);
      showToast("Project created!");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleLaunch = () => {
    launchSession({
      mode: "new",
      projectId: name,
      projectPath: result.path,
      target: "terminal",
    })
      .then(() => showToast("Launched in Terminal"))
      .catch((err) => showToast(err.message, "error"));
  };

  if (result) {
    return html`
      <div class="content">
        <div class="wizard-success">
          <div class="wizard-success-icon">${"\u2713"}</div>
          <h2 class="wizard-title">Project Created</h2>
          <p class="wizard-path">${result.path}</p>
          <div class="wizard-actions">
            <button class="btn btn-accent" onclick=${handleLaunch}>Launch Session</button>
            <button class="btn" onclick=${() => navigate("/projects")}>Go to Projects</button>
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="content">
      <h2 class="wizard-title">New Project</h2>

      <div class="wizard-form">
        <div class="wizard-field">
          <label class="wizard-label">Project Name</label>
          <input
            class="wizard-input"
            type="text"
            placeholder="my-awesome-project"
            value=${name}
            oninput=${(e) => setName(e.target.value)}
            autofocus
          />
          ${nameError && html`<div class="wizard-error">${nameError}</div>`}
          ${nameValid && html`<div class="wizard-hint">~/Projects/${name}</div>`}
        </div>

        <div class="wizard-field">
          <label class="wizard-checkbox">
            <input type="checkbox" checked=${gitInit} onchange=${(e) => setGitInit(e.target.checked)} />
            Initialize Git repository
          </label>
        </div>

        ${gitInit && html`
          <div class="wizard-field wizard-indent">
            <label class="wizard-label">Remote URL (optional)</label>
            <input
              class="wizard-input"
              type="text"
              placeholder="https://github.com/user/repo.git"
              value=${gitRemote}
              oninput=${(e) => setGitRemote(e.target.value)}
            />
          </div>
        `}

        <div class="wizard-field">
          <label class="wizard-checkbox">
            <input type="checkbox" checked=${claudeMd} onchange=${(e) => setClaudeMd(e.target.checked)} />
            Create CLAUDE.md
          </label>
        </div>

        <div class="wizard-field">
          <label class="wizard-checkbox">
            <input type="checkbox" checked=${mcpJson} onchange=${(e) => setMcpJson(e.target.checked)} />
            Create .mcp.json
          </label>
        </div>

        <div class="wizard-actions">
          <button
            class="btn btn-accent"
            onclick=${handleCreate}
            disabled=${!nameValid || creating}
          >
            ${creating ? "Creating..." : "Create Project"}
          </button>
          <button class="btn" onclick=${() => navigate("/")}>Cancel</button>
        </div>
      </div>
    </div>
  `;
}
