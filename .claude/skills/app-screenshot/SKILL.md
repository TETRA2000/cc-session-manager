---
name: app-screenshot
description: >
  Generate polished app screenshots with dummy data for READMEs and documentation.
  Use this skill whenever the user asks to create screenshots, mockup images, demo
  images, or preview images for their app — especially for README files, docs, or
  marketing. Also trigger when they say things like "take a screenshot with fake data",
  "create demo images", "make preview screenshots", or "I need images for the README".
  Works by creating self-contained HTML mock pages styled to match the app, then
  rendering them via Chrome DevTools MCP to produce PNG files.
---

# App Screenshot Generator

Create professional screenshots of your application using mock HTML pages with realistic dummy data. This avoids exposing real user data in documentation while producing pixel-perfect results that match your actual app.

## How It Works

The approach is: build a standalone HTML file that looks exactly like a view of the app, fill it with plausible dummy data, open it in Chrome, and screenshot it. This gives you full control over what appears in the image — no need to set up test accounts or sanitize real data.

## Step-by-Step Process

### 1. Understand what to screenshot

Ask the user which views/pages they want screenshots of. Look at the app's existing:
- CSS stylesheets (to reuse the exact styles)
- UI components (to understand the layout structure)
- Route structure (to know what views exist)

### 2. Build mock HTML pages

For each screenshot, create a self-contained HTML file:

```
docs/screenshots/mock-{view-name}.html
```

**Key principles:**

- **Reuse the app's actual CSS** — link to the real stylesheet with a relative path (`<link rel="stylesheet" href="../../static/style.css">`). This ensures pixel-perfect visual fidelity without duplicating styles.

- **Force dark mode** — most app screenshots look better in dark mode. Override CSS variables in a `<style>` block in the HTML head rather than relying on `prefers-color-scheme`. This makes the screenshot deterministic regardless of the system theme.

- **Use realistic but fictional data** — names like "auth-service", "web-client", "mobile-app" instead of real project names. Summaries like "Built authentication flow with OAuth2 and JWT tokens" instead of real conversation snippets. The data should feel believable — someone looking at the screenshot should think it's a real app being used.

- **Set a fixed container height** — add `height: 780px` (or similar) to the container so the HTML page renders at the right size before screenshotting. Without this, the page might be too tall or collapse.

- **Include web fonts** — if the app uses Google Fonts or similar, include the `<link>` tag so text renders correctly.

**Structure of a mock HTML file:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{View Name} Mock</title>
  <!-- Reuse the app's real stylesheet -->
  <link rel="stylesheet" href="../../static/style.css">
  <!-- Web fonts if needed -->
  <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
  <style>
    /* Force dark mode and any overrides */
    body { background: #131318; color: #e8e6f0; }
    :root {
      --bg-primary: #1a1a22;
      /* ... dark mode variable overrides ... */
    }
    .container { height: 780px; max-width: 1280px; }
  </style>
</head>
<body>
  <!-- Static HTML that mimics the app's rendered output -->
  <div class="container">
    <div class="header">...</div>
    <div class="content">...</div>
  </div>
</body>
</html>
```

The HTML is purely static — no JavaScript, no framework, just the DOM structure the app would produce. Copy the class names and nesting from the real components.

### 3. Render screenshots with Chrome DevTools

Use the Chrome DevTools MCP tools to capture screenshots:

```
1. mcp__chrome-devtools__resize_page(width: 1280, height: 800)
2. mcp__chrome-devtools__navigate_page(type: "url", url: "file:///path/to/mock.html")
3. mcp__chrome-devtools__take_screenshot(filePath: "docs/screenshots/{name}.png")
```

**Important details:**
- Resize the viewport **before** navigating — this ensures the page renders at the right dimensions from the start.
- Use `file://` URLs with absolute paths to the mock HTML files.
- Save PNGs directly to `docs/screenshots/` — the mock HTML files go there too during creation but should be deleted after screenshots are taken.

### 4. Clean up and commit

After taking all screenshots:
1. Delete the mock HTML files (they're build artifacts, not source files)
2. Update the README or docs to reference the new images
3. Use relative paths in markdown: `![Dashboard](docs/screenshots/dashboard.png)`

## Tips for Great Screenshots

- **Show the app in action** — don't screenshot empty states. Fill lists, show active sessions, display real-looking content in panels.
- **Highlight key features** — if the app has a 2-pane layout, show both panes populated. If there are status badges, include a mix of states.
- **Keep text readable** — at 1280px wide, font sizes from the real CSS should be fine. Don't try to cram too much in.
- **Use consistent dummy data** — if a project appears in multiple screenshots, use the same name/details across all of them.
- **3 screenshots is usually enough** — one for the main view, one for a secondary view, one for a key workflow (like a form or wizard).
