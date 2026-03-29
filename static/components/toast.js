import { html } from "htm/preact";
import { signal } from "@preact/signals";

const toastState = signal(null);
let timer = null;

export function showToast(message, type = "success", durationMs = 3000) {
  if (timer) clearTimeout(timer);
  toastState.value = { message, type };
  timer = setTimeout(() => {
    toastState.value = null;
    timer = null;
  }, durationMs);
}

export function Toast() {
  const toast = toastState.value;
  if (!toast) return null;

  return html`
    <div class="toast toast-${toast.type}">
      ${toast.message}
    </div>
  `;
}
