import { html } from "htm/preact";
import { render } from "preact";
import { route } from "./lib/router.js";
import { Header } from "./components/header.js";
import { DashboardView } from "./components/dashboard.js";
import { ProjectsView } from "./components/projects.js";
import { TranscriptView } from "./components/transcript.js";

function App() {
  const currentRoute = route.value;

  let view;
  switch (currentRoute.path) {
    case "/projects":
      view = html`<${ProjectsView} />`;
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
  `;
}

render(html`<${App} />`, document.getElementById("app"));
