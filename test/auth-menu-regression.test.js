const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function bindHarness() {
  const start = appSource.indexOf("const STATIC_MENU_ROUTE_BY_VIEW");
  const end = appSource.indexOf("function ensureFarmViewState", start);
  const listeners = { window: {}, tabs: {}, document: {}, auth: {} };
  const sandbox = {
    URL,
    WORKSPACE_ROUTE_FALLBACKS: {
      "/farm/work": ["farm.work", "farm-work"], "/farm/dispatch": ["farm.dispatch", "farm-dispatch"],
      "/farm/daily": ["farm.daily", "farm-result"], "/inventory": ["inventory.stock", "farm-inventory"],
    },
    state: { view: "dashboard", sidebarCollapsed: false, workspaceRoute: "", workspaceTab: "", farmSession: null, workspacePermissions: new Set() },
    window: {
      location: { href: "https://preview.example/", origin: "https://preview.example", pathname: "/", search: "" },
      history: { pushState(_state, _title, url) { sandbox.window.location.href = String(url); } },
      addEventListener(type, handler) { (listeners.window[type] ||= []).push(handler); }, clearTimeout() {},
    },
    els: {
      tabs: { addEventListener(type, handler) { (listeners.tabs[type] ||= []).push(handler); } },
      sidebarToggle: null,
      farmAuthButton: { addEventListener(type, handler) { listeners.auth.button = { type, handler }; } },
      farmAuthClose: null, farmAuthCancel: null, farmAuthForm: null, farmAuthSignOut: null, farmAuthDialog: null,
    },
    document: { addEventListener(type, handler) { (listeners.document[type] ||= []).push(handler); }, querySelector() { return null; } },
    localStorage: { setItem() {} },
    setView(view) { sandbox.state.view = view; }, farmPreviewDiagnostic() {},
    openSidebarFlyout() {}, closeSidebarFlyouts() {}, scheduleSidebarFlyoutClose() {}, applySidebarState() {},
    openFarmAuthDialog() { sandbox.authOpened = true; }, closeFarmAuthDialog() {}, submitFarmSignIn() {}, submitFarmSignOut() {},
    requestedWorkspaceRouteFromUrl() { return ""; }, applyWorkspaceRoute() { return false; }, applyWorkspaceFallbackRoute() { return false; },
    initialViewFromUrl() { return "dashboard"; }, workspaceTabFromUrl() { return ""; }, hydrateFarmWorkflowStateFromUrl() {},
    render() {}, loadFarmCurrentViewTables() {}, syncFarmResultDraftFromForm() {},
  };
  vm.runInNewContext(`${appSource.slice(start, end)}\nresult = { bindCriticalUiEvents };`, sandbox);
  return { sandbox, listeners, bind: sandbox.result.bindCriticalUiEvents };
}

function clickEventFor(view) {
  const button = { dataset: { view } };
  return { target: { closest(selector) { return selector === "button[data-view]" ? button : null; } } };
}

test("critical navigation and auth handlers bind once before any session result", () => {
  const { listeners, bind } = bindHarness();
  assert.equal(bind(), true);
  assert.equal(bind(), false);
  assert.equal(listeners.tabs.click.length, 1);
  assert.equal(listeners.window.popstate.length, 1);
  assert.equal(listeners.auth.button.type, "click");
});

test("401 state, successful login state, and logout state reuse the same live menu handler", () => {
  const { sandbox, listeners, bind } = bindHarness();
  bind();
  const click = listeners.tabs.click[0];
  click(clickEventFor("farm-work"));
  assert.equal(sandbox.state.view, "farm-work");
  sandbox.state.farmSession = { ok: true };
  sandbox.state.workspacePermissions = new Set(["farm.work.read"]);
  click(clickEventFor("farm-dispatch"));
  assert.equal(sandbox.state.view, "farm-dispatch");
  sandbox.state.farmSession = null;
  sandbox.state.workspacePermissions.clear();
  click(clickEventFor("farm-result"));
  assert.equal(sandbox.state.view, "farm-result");
});

test("login control remains actionable when startup data or session loading fails", () => {
  const { sandbox, listeners, bind } = bindHarness();
  bind();
  listeners.auth.button.handler();
  assert.equal(sandbox.authOpened, true);
});
