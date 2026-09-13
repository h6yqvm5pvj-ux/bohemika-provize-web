// Local, signed-out browser check. All non-local requests are blocked.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node browser-check.cjs <output.json>
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        return url.origin === "http://127.0.0.1:3108" ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const response = await page.goto("http://127.0.0.1:3108/login", { waitUntil: "networkidle", timeout: 30000 });
      assert.equal(response.status(), 200);
      await page.locator('input[type="email"]').waitFor({ state: "visible" });
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const scripts = performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name));
        return {
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          scripts: scripts.map(entry => ({ path: new URL(entry.name).pathname, decodedBytes: entry.decodedBodySize, encodedBytes: entry.encodedBodySize })),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(metrics.horizontalOverflow, false);
      const scriptBytes = metrics.scripts.reduce((sum, script) => sum + script.decodedBytes, 0);
      const scriptEncodedBytes = metrics.scripts.reduce((sum, script) => sum + script.encodedBytes, 0);
      await page.goto("http://127.0.0.1:3108/smlouvy", { waitUntil: "networkidle", timeout: 30000 });
      assert.equal(new URL(page.url()).pathname, "/login");
      const denied = await page.request.get("http://127.0.0.1:3108/api/contracts/list");
      assert.equal(denied.status(), 401);
      assert.deepEqual(errors, []);
      results.push({ width, status: response.status(), scriptBytes, scriptEncodedBytes, ...metrics, protectedRedirect: "/login", unauthenticatedApi: denied.status(), pageErrors: errors });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results.map(result => ({ ...result, scripts: undefined })), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
