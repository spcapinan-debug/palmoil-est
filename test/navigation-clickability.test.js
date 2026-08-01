const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

function navigationHarness() {
  const start = appSource.indexOf("const STATIC_MENU_ROUTE_BY_VIEW");
  const end = appSource.indexOf("function ensureFarmViewState", start);
  assert.ok(start >= 0 && end > start, "navigation helpers must remain executable as a unit");
  const listeners = { window: {}, tabs: {}, document: {} };
  const diagnostics = [];
  const sandbox = {
    URL,
    WORKSPACE_ROUTE_FALLBACKS: {
      "/farm/work": ["farm.work", "farm-work"],
      "/farm/dispatch": ["farm.dispatch", "farm-dispatch"],
      "/farm/daily": ["farm.daily", "farm-result"],
      "/inventory": ["inventory.stock", "farm-inventory"],
      "/payroll": ["payroll", "farm-payroll"],
      "/reports": ["reports", "farm-reports"],
      "/system/access": ["system.access", "farm-governance"],
    },
    state: {
      view: "dashboard", sidebarCollapsed: false, workspaceRoute: "", workspaceTab: "",
      farmSession: null, workspacePermissions: new Set(),
    },
    window: {
      location: { href: "https://preview.example/", origin: "https://preview.example", pathname: "/", search: "" },
      history: { pushState(_state, _title, url) { sandbox.window.location.href = String(url); } },
      addEventListener(type, handler) { (listeners.window[type] ||= []).push(handler); },
      clearTimeout() {},
    },
    els: {
      tabs: { addEventListener(type, handler) { (listeners.tabs[type] ||= []).push(handler); } },
      sidebarToggle: null, farmAuthButton: null, farmAuthClose: null, farmAuthCancel: null,
      farmAuthForm: null, farmAuthSignOut: null, farmAuthDialog: null,
    },
    document: {
      addEventListener(type, handler) { (listeners.document[type] ||= []).push(handler); },
      querySelector() { return null; },
    },
    localStorage: { setItem() {} },
    setView(view) { sandbox.state.view = view; sandbox.renderCount += 1; },
    farmPreviewDiagnostic(event, details) { diagnostics.push({ event, details }); },
    renderCount: 0,
    openSidebarFlyout() {}, closeSidebarFlyouts() {}, scheduleSidebarFlyoutClose() {},
    applySidebarState() {}, openFarmAuthDialog() {}, closeFarmAuthDialog() {},
    submitFarmSignIn() {}, submitFarmSignOut() {},
    requestedWorkspaceRouteFromUrl() { return ""; }, applyWorkspaceRoute() { return false; },
    applyWorkspaceFallbackRoute() { return false; }, initialViewFromUrl() { return "dashboard"; },
    workspaceTabFromUrl() { return ""; }, hydrateFarmWorkflowStateFromUrl() {}, render() {},
    loadFarmCurrentViewTables() {}, syncFarmResultDraftFromForm() {},
  };
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = { menuRouteForView, pushMenuRoute, activatePrimaryMenu, bindCriticalUiEvents };`, sandbox);
  return { sandbox, listeners, diagnostics, api: sandbox.result };
}

test("static fallback maps the required visible modules to real routes", () => {
  const { api } = navigationHarness();
  const expected = {
    "farm-work": "/farm/work", "farm-dispatch": "/farm/dispatch", "farm-result": "/farm/daily",
    "farm-inventory": "/inventory", "farm-payroll": "/payroll", "farm-reports": "/reports",
    "farm-governance": "/system/access",
  };
  for (const [view, route] of Object.entries(expected)) assert.equal(api.menuRouteForView(view), route, view);
});

test("a visible menu activation changes URL, selected module, render state, and safe diagnostics", () => {
  const { sandbox, diagnostics, api } = navigationHarness();
  const activated = api.activatePrimaryMenu({ dataset: { view: "farm-work" } });
  assert.equal(activated, true);
  assert.equal(sandbox.state.view, "farm-work");
  assert.equal(new URL(sandbox.window.location.href).pathname, "/farm/work");
  assert.equal(sandbox.renderCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostics[0])), {
    event: "navigation",
    details: {
      menuKey: "farm-work", route: "/farm/work", selectedModuleBefore: "dashboard",
      selectedModuleAfter: "farm-work", sessionOk: false, permissionCount: 0,
    },
  });
});

test("transport and unmapped static modules still receive clickable URL fallbacks", () => {
  const { sandbox, api } = navigationHarness();
  api.activatePrimaryMenu({ dataset: { view: "stock" } });
  assert.equal(new URL(sandbox.window.location.href).searchParams.get("view"), "stock");
  api.activatePrimaryMenu({ dataset: { view: "farm-activities" } });
  assert.equal(new URL(sandbox.window.location.href).searchParams.get("view"), "farm-activities");
});

test("Vercel serves bundled data files before the SPA catch-all", () => {
  const dataRoute = vercelConfig.routes.findIndex((route) => route.src === "/data/(.*)" && route.dest === "/webapp/data/$1");
  const catchAll = vercelConfig.routes.findIndex((route) => route.src === "/(.*)");
  assert.ok(dataRoute >= 0 && dataRoute < catchAll);
});
