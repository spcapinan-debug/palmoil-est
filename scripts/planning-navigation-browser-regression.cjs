const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "webapp");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "test", "fixtures", "phase3-browser.json"), "utf8"));
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

const authEmail = "browser-regression@example.invalid";
const authPassword = "browser-regression-password";

function requestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function hasFarmCookie(request, name) {
  return String(request.headers.cookie || "").split(";")
    .some((part) => part.trim().startsWith(`${name}=`));
}

function createServer(authRuntime) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/api/farm-session") {
      if (!hasFarmCookie(request, "farm-access-token")) {
        sendJson(response, 401, { ok: false, error: { code: "AUTH_REQUIRED", message: "Farm sign-in required" } });
        return;
      }
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(session);
      return;
    }
    if (url.pathname === "/api/farm-auth") {
      const body = await requestJson(request);
      authRuntime.actions.push(body.action || "");
      if (body.action === "bootstrap") {
        sendJson(response, 200, { ok: true, authenticated: false });
        return;
      }
      if (body.action === "refresh" && !hasFarmCookie(request, "farm-refresh-token")) {
        sendJson(response, 401, { ok: false, error: { code: "REFRESH_REQUIRED", message: "Farm refresh token required" } });
        return;
      }
      if (body.action !== "sign_in" || body.email !== authEmail || body.password !== authPassword) {
        sendJson(response, 401, { ok: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
        return;
      }
      response.setHeader("Set-Cookie", [
        "farm-access-token=browser-access; Path=/; HttpOnly; SameSite=Lax",
        "farm-refresh-token=browser-refresh; Path=/; HttpOnly; SameSite=Lax",
      ]);
      sendJson(response, 200, { ok: true, user: { id: "browser-regression" }, expiresIn: 3600 });
      return;
    }
    if (url.pathname === "/api/farm-tables") {
      if (!hasFarmCookie(request, "farm-access-token")) {
        authRuntime.unauthorizedFarmTables += 1;
        sendJson(response, 401, { ok: false, error: { code: "AUTH_REQUIRED", message: "Farm sign-in required" } });
        return;
      }
      const requested = String(url.searchParams.get("tables") || "").split(",").filter(Boolean);
      const tables = Object.fromEntries(requested
        .map((table) => [table, fixture.tables[table] || []]));
      sendJson(response, 200, { ...fixture, tables });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { ok: false, error: "Unavailable in browser fixture" });
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
  const fixtureCounts = {
    block: fixture.tables.blocks?.length || 0,
    activity: fixture.tables.activities?.length || 0,
    material: fixture.tables.materials?.length || 0,
    vehicle: fixture.tables.vehicles?.length || 0,
    worker: ["teams", "team_members", "employees", "contractors"]
      .reduce((sum, table) => sum + (fixture.tables[table]?.length || 0), 0),
  };
  Object.entries(fixtureCounts).forEach(([selector, count]) => {
    assert.ok(count > 0, `browser fixture must contain ${selector} rows`);
  });
  const { chromium } = loadPlaywright();
  const authRuntime = { actions: [], unauthorizedFarmTables: 0 };
  const server = createServer(authRuntime);
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
    let releaseFarmTables;
    let farmTablesRequestCount = 0;
    let farmTablesGate = new Promise((resolve) => { releaseFarmTables = resolve; });
    await page.route("**/api/farm-tables*", async (route) => {
      farmTablesRequestCount += 1;
      await farmTablesGate;
      await route.continue();
    });

    // Keep dashboard bootstrap in flight so this test covers the original click race.
    await page.route("**/data/data.json*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.route("**/data/summary_palmoil_terrain.json*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ source: null, records: [] }),
      });
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

    const masterMenu = page.locator('details[data-menu-group="master"]');
    await masterMenu.locator(":scope > summary").click();
    const planningButton = page.locator('button[data-view="farm-work"]');
    await planningButton.waitFor({ state: "visible" });
    await planningButton.click();

    const authDialog = page.locator("[data-farm-auth-dialog]");
    await authDialog.waitFor({ state: "visible" });
    if (process.env.FARM_AUTH_QA_SCREENSHOT) {
      await page.screenshot({ path: process.env.FARM_AUTH_QA_SCREENSHOT, fullPage: false });
    }
    assert.equal(farmTablesRequestCount, 0, "farm-tables must wait until the exact host has a Farm session");
    assert.equal(authRuntime.unauthorizedFarmTables, 0, "anonymous farm-tables requests are forbidden");
    assert.deepEqual(authRuntime.actions, ["bootstrap"], "client must bootstrap the exact-host Farm session before asking for credentials");

    await authDialog.locator("[data-farm-auth-email]").fill(authEmail);
    await authDialog.locator("[data-farm-auth-password]").fill(authPassword);
    await authDialog.locator("[data-farm-auth-submit]").click();
    await authDialog.waitFor({ state: "hidden" });
    for (let guard = 0; farmTablesRequestCount === 0 && guard < 100; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(farmTablesRequestCount > 0, "Planning must request farm tables automatically after Farm sign-in");
    assert.deepEqual(authRuntime.actions, ["bootstrap", "sign_in"]);
    const farmCookieNames = (await context.cookies(`http://127.0.0.1:${port}/`))
      .map((cookie) => cookie.name)
      .filter((name) => name.startsWith("farm-"))
      .sort();
    assert.deepEqual(farmCookieNames, ["farm-access-token", "farm-refresh-token"]);

    await page.locator(".farm-work-page").waitFor({ state: "visible" });
    await page.locator(".farm-work-budget-selector").waitFor({ state: "visible" });
    const preHydrationCache = await page.evaluate(() => Object.fromEntries(
      ["blocks", "activities", "materials", "vehicles", "teams", "team_members", "employees", "contractors"]
        .map((table) => [table, {
          rows: eval("farmDerivedCache.rowsByKey").has(table),
          lookup: eval("farmDerivedCache.lookupByTable").has(table),
        }])
    ));
    Object.entries(preHydrationCache).forEach(([table, cached]) => {
      assert.deepEqual(cached, { rows: false, lookup: false }, `${table} must not cache pre-hydration empties`);
    });
    releaseFarmTables();
    await page.locator("[data-planning-search]").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const counts = ["block", "activity", "material", "vehicle", "worker"].map((type) => {
        const card = document.querySelector(`[data-planning-ux-type="${type}"]`);
        return [...(card?.querySelectorAll("input[data-budget-pick]") || [])].filter((input) => {
          if (input.dataset.budgetBlockGroup) return false;
          return !(input.dataset.budgetPick === "worker" && String(input.value).startsWith("team:"));
        }).length;
      });
      return counts.every((count) => count > 0);
    });
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
      populatedCounts: Object.fromEntries(["block", "activity", "material", "vehicle", "worker"].map((type) => {
        const card = document.querySelector(`[data-planning-ux-type="${type}"]`);
        const count = [...(card?.querySelectorAll("input[data-budget-pick]") || [])].filter((input) => {
          if (input.dataset.budgetBlockGroup) return false;
          return !(input.dataset.budgetPick === "worker" && String(input.value).startsWith("team:"));
        }).length;
        return [type, count];
      })),
      emptyMessageCount: [...document.querySelectorAll(".farm-work-budget-selector .budget-tree-empty")]
        .filter((node) => node.textContent.includes("ยังไม่มีข้อมูล")).length,
      dbCounts: Object.fromEntries(["blocks", "activities", "materials", "vehicles", "teams", "team_members", "employees", "contractors"]
        .map((table) => [table, eval("state.farmDbRows")[table]?.length || 0])),
    }));
    assert.equal(shell.view, "farm-work");
    assert.equal(shell.datePanelHidden, true);
    assert.equal(shell.globalFilterHidden, true);
    assert.equal(shell.dashboardHidden, true);
    assert.equal(shell.farmPageCount, 1);
    assert.equal(shell.selectorCount, 5);
    assert.equal(shell.searchCount, 5);
    assert.equal(shell.selectAllCount, 5);
    assert.equal(shell.clearAllCount, 5);
    assert.equal(shell.summaryCount, 1);
    assert.equal(shell.emptyMessageCount, 0);
    Object.entries(shell.populatedCounts).forEach(([selector, count]) => assert.ok(count > 0, `${selector} selector must hydrate`));
    Object.entries(shell.dbCounts).forEach(([table, count]) => assert.ok(count > 0, `${table} DB rows must be assigned`));
    console.log("planning selector populated counts", shell.populatedCounts);

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
    if (process.env.PLANNING_QA_SCREENSHOT) {
      await page.screenshot({ path: process.env.PLANNING_QA_SCREENSHOT, fullPage: false });
    }

    // A completed Farm request may update data caches, but must not render over a newer view.
    farmTablesGate = new Promise((resolve) => { releaseFarmTables = resolve; });
    const requestCountBeforeStaleLoad = farmTablesRequestCount;
    await page.evaluate(() => {
      window.__farmStaleLoadDone = false;
      eval("loadFarmTablesFromDatabase")({
        silent: true,
        force: true,
        tables: ["activities"],
        renderIfView: "farm-work",
      }).finally(() => { window.__farmStaleLoadDone = true; });
    });
    for (let guard = 0; farmTablesRequestCount === requestCountBeforeStaleLoad && guard < 100; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(farmTablesRequestCount > requestCountBeforeStaleLoad, "stale-load scenario must reach /api/farm-tables");
    await page.evaluate(() => {
      eval("setView")("dashboard");
      const marker = document.createElement("i");
      marker.id = "farm-render-guard-marker";
      document.querySelector("#dashboard")?.append(marker);
    });
    releaseFarmTables();
    await page.waitForFunction(() => window.__farmStaleLoadDone === true);
    assert.equal(await page.evaluate(() => eval("state.view")), "dashboard");
    assert.equal(await page.locator("#farm-render-guard-marker").count(), 1);
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
