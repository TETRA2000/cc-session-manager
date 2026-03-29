import { html } from "htm/preact";
import { useState } from "preact/hooks";

function getToolSummary(toolCall) {
  const input = toolCall.input || {};
  if (input.file_path) return input.file_path;
  if (input.command) return input.command;
  if (input.pattern) return input.pattern;
  if (input.path) return input.path;
  if (input.url) return input.url;
  if (input.query) return input.query;
  return "";
}

function formatInput(input) {
  if (!input) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function ToolCall({ toolCall }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded(!expanded);
  const chevron = expanded ? "\u25BE" : "\u25B8";
  const toolName = toolCall.name || toolCall.tool_name || "tool";
  const summary = getToolSummary(toolCall);
  const hasBody = toolCall.input || toolCall.result;

  return html`
    <div class="tool-call">
      <button class="tool-call-header" onclick=${toggle}>
        <span>${chevron}</span>
        <span>${"\u26A1"} ${toolName}</span>
        ${summary && html`<span class="tool-path">${summary}</span>`}
      </button>
      ${expanded && hasBody && html`
        <div class="tool-call-body">${toolCall.input ? formatInput(toolCall.input) : ""}${toolCall.result ? "\n\n--- Result ---\n" + toolCall.result : ""}</div>
      `}
    </div>
  `;
}
