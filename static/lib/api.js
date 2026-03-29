async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getDashboard() {
  return fetchJSON("/api/dashboard");
}

export async function getProjects() {
  return fetchJSON("/api/projects");
}

export async function getProject(id) {
  return fetchJSON(`/api/projects/${id}`);
}

export async function getTranscript(sessionId) {
  return fetchJSON(`/api/sessions/${sessionId}/transcript`);
}

export async function launchSession({ mode, projectId, sessionId, prompt, target, webUrl }) {
  const res = await fetch("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, projectId, sessionId, prompt, target, webUrl }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Launch failed");
  return data;
}
