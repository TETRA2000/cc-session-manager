import { signal, effect } from "@preact/signals";
import { html } from "htm/preact";

export const route = signal({ path: "/", params: {} });

const routes = [
  { pattern: /^\/$/, path: "/" },
  { pattern: /^\/projects$/, path: "/projects" },
  { pattern: /^\/new-project$/, path: "/new-project" },
  { pattern: /^\/transcript\/(.+)$/, path: "/transcript/:sessionId" },
];

function parseHash() {
  const hash = window.location.hash.slice(1) || "/";
  for (const r of routes) {
    const match = hash.match(r.pattern);
    if (match) {
      const params = {};
      if (r.path === "/transcript/:sessionId") {
        params.sessionId = match[1];
      }
      return { path: r.path, params };
    }
  }
  return { path: "/", params: {} };
}

export function navigate(path) {
  window.location.hash = "#" + path;
}

function onHashChange() {
  route.value = parseHash();
}

window.addEventListener("hashchange", onHashChange);
route.value = parseHash();

export function Link({ href, children, ...props }) {
  const handleClick = (e) => {
    e.preventDefault();
    navigate(href);
  };
  return html`<a href=${"#" + href} onclick=${handleClick} ...${props}>${children}</a>`;
}
