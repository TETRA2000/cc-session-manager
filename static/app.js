import { html } from "htm/preact";
import { render } from "preact";
import { route } from "./lib/router.js";
import { Header } from "./components/header.js";
import { DashboardView } from "./components/dashboard.js";
import { ProjectsView } from "./components/projects.js";
import { TranscriptView } from "./components/transcript.js";
import { WizardView } from "./components/wizard.js";
import { TimelineView } from "./components/timeline.js";
import { Toast } from "./components/toast.js";

function App() {
  const currentRoute = route.value;

  let view;
  switch (currentRoute.path) {
    case "/projects":
      view = html`<${ProjectsView} />`;
      break;
    case "/new-project":
      view = html`<${WizardView} />`;
      break;
    case "/timeline":
      view = html`<${TimelineView} />`;
      break;
    case "/transcript/:sessionId":
      view = html`<${TranscriptView} />`;
      break;
    case "/":
    default:
      view = html`<${DashboardView} />`;
      break;
  }

  return html`
    <div class="container">
      <${Header} />
      ${view}
    </div>
    <${Toast} />
  `;
}

render(html`<${App} />`, document.getElementById("app"));
