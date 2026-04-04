// Screenshot generator for timeline mockups
// Usage: NODE_PATH=/opt/node22/lib/node_modules node docs/mockups/screenshot.mjs

const { chromium } = require("playwright");
const path = require("path");

const VIEWPORT = { width: 1280, height: 900 };

const mockups = [
  {
    html: path.resolve(__dirname, "timeline-light.html"),
    out: path.resolve(__dirname, "../screenshots/timeline-light.png"),
  },
  {
    html: path.resolve(__dirname, "timeline-dark.html"),
    out: path.resolve(__dirname, "../screenshots/timeline-dark.png"),
  },
];

(async () => {
  const browser = await chromium.launch();

  for (const { html, out } of mockups) {
    const page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);
    // Block external font requests to avoid timeout; use system fallback fonts
    await page.route("**/*.googleapis.com/**", (route) => route.abort());
    await page.route("**/*.gstatic.com/**", (route) => route.abort());
    await page.goto(`file://${html}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out, type: "png", fullPage: false });
    console.log(`Saved: ${out}`);
    await page.close();
  }

  await browser.close();
})();
