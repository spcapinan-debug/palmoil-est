const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "webapp");
const fixture = fs.readFileSync(path.join(root, "test", "fixtures", "phase3-browser.json"));
const session = JSON.stringify({
  ok: true,
  user: { id: "browser-regression", email: "browser-regression@example.invalid" },
  roles: ["super_admin"],
  permissions: [],
  scopes: [],
});
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function loadPlaywright() {
  const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
  try {
    return require(modulePath);
  } catch (error) {
    throw new Error(`Playwright is required for this runtime test. Set PLAYWRIGHT_MODULE_PATH or install playwright. (${error.message})`);
  }
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/api/farm-session") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(session);
      return;
    }
    if (url.pathname === "/api/farm-tables") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(fixture);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: "Unavailable in browser fixture" }));
      return;
    }
    const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, "");
    let file = path.join(webRoot, relative || "index.html");
    if (!file.startsWith(webRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(webRoot, "index.html");
    }
    response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

async function run() {
  const { chromium } = loadPlaywright();
  const server = createServer();
  const port = await listen(server);
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROME_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROME_PATH;
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    // Keep dashboard bootstrap in flight so this test covers the original click race.
    await page.route("**/data/data.json*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

    const masterMenu = page.locator('details[data-menu-group="master"]');
    await masterMenu.locator(":scope > summary").click();
    const planningButton = page.locator('button[data-view="farm-work"]');
    await planningButton.waitFor({ state: "visible" });
    await planningButton.click();

    await page.locator(".farm-work-page").waitFor({ state: "visible" });
    await page.locator(".farm-work-budget-selector").waitFor({ state: "visible" });
    await page.locator("[data-planning-search]").first().waitFor({ state: "visible" });
    const shell = await page.evaluate(() => ({
      view: eval("state.view"),
      datePanelHidden: document.querySelector(".date-panel")?.classList.contains("hidden"),
      globalFilterHidden: document.querySelector(".global-filter-panel")?.classList.contains("hidden"),
      dashboardHidden: document.querySelector("#dashboard")?.classList.contains("hidden"),
      farmPageCount: document.querySelectorAll(".farm-work-page").length,
      selectorCount: document.querySelectorAll(".farm-work-budget-selector > .budget-tree-card").length,
      searchCount: document.querySelectorAll("[data-planning-search]").length,
      selectAllCount: document.querySelectorAll("[data-planning-select-all]").length,
      clearAllCount: document.querySelectorAll("[data-planning-clear-all]").length,
      summaryCount: document.querySelectorAll(".farm-plan-selected-summary-strip").length,
    }));
    assert.deepEqual(shell, {
      view: "farm-work",
      datePanelHidden: true,
      globalFilterHidden: true,
      dashboardHidden: true,
      farmPageCount: 1,
      selectorCount: 5,
      searchCount: 5,
      selectAllCount: 5,
      clearAllCount: 5,
      summaryCount: 1,
    });

    const activityCard = page.locator('[data-planning-ux-type="activity"]');
    await activityCard.locator('input[data-budget-pick="activity"]').first().waitFor({ state: "attached" });
    const activityCount = await activityCard.locator('input[data-budget-pick="activity"]').count();
    assert.ok(activityCount > 0);
    await activityCard.locator("[data-planning-search]").fill("__ไม่พบกิจกรรม__");
    assert.equal(await activityCard.locator('input[data-budget-pick="activity"]:visible').count(), 0);
    await activityCard.locator("[data-planning-search-empty]").waitFor({ state: "visible" });
    await activityCard.locator("[data-planning-search]").fill("");
    assert.equal(await activityCard.locator('input[data-budget-pick="activity"]:visible').count(), activityCount);

    await activityCard.locator("[data-planning-select-all]").click();
    await page.waitForFunction((count) => document.querySelector('[data-planning-summary-count="activity"]')?.textContent === String(count), activityCount);
    assert.equal(await activityCard.locator(".budget-tree-item.is-selected").count(), activityCount);
    assert.equal(await activityCard.locator("[data-planning-selected-count]").textContent(), `เลือกแล้ว ${activityCount}`);

    await page.waitForFunction(() => !document.querySelector('[data-planning-ux-type="activity"] [data-planning-clear-all]')?.disabled);
    await activityCard.locator("[data-planning-clear-all]").click();
    await page.waitForFunction(() => document.querySelector('[data-planning-summary-count="activity"]')?.textContent === "0");
    assert.equal(await activityCard.locator(".budget-tree-item.is-selected").count(), 0);
    assert.equal(await activityCard.locator("[data-planning-selected-count]").textContent(), "เลือกแล้ว 0");

    // Let the delayed dashboard request finish; it must not restore transport content.
    await page.waitForTimeout(1700);
    assert.equal(await page.evaluate(() => eval("state.view")), "farm-work");
    assert.equal(await page.locator(".farm-work-page").count(), 1);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
}

run().then(() => {
  console.log("planning navigation browser regression: ok");
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
