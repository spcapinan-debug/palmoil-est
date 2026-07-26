const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const farmSession = require("../api/farm-session");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "index.html"), "utf8");

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

test("workspace session endpoint rejects non-GET requests before authentication", async () => {
  const res = responseRecorder();
  await farmSession({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error.code, "METHOD_NOT_ALLOWED");
});

test("workspace session returns roles, permissions, and scopes through shared authentication", () => {
  assert.match(appSource, /fetch\(FARM_SESSION_API/);
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "farm-session.js"), "utf8");
  assert.match(source, /authenticate\(req\)/);
  assert.match(source, /permissions:\s*\[\.\.\.actor\.permissions\]/);
  assert.match(source, /scopes:\s*actor\.scopes/);
});

test("legacy view routes remain supported while new workspace routes resolve separately", () => {
  assert.match(appSource, /params\.get\("view"\)\s*\|\|\s*params\.get\("page"\)/);
  assert.match(appSource, /params\.get\("route"\)/);
  assert.match(appSource, /resolveWorkspaceRoute\(state\.workspaceNavigation,\s*route\)/);
  assert.match(appSource, /workspaceRoutePath\(item\.route\)\s*===\s*path/);
  assert.match(appSource, /if\s*\(requestedRoute\)\s*applyWorkspaceRoute\(requestedRoute\)/);
});

test("legacy and new route helpers resolve executable route fixtures", () => {
  const start = appSource.indexOf("function initialViewFromUrl()");
  const end = appSource.indexOf("function workspaceLegacyView", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {
    URLSearchParams,
    TRANSPORT_VIEWS: new Set(["dashboard", "stock"]),
    state: {
      view: "dashboard",
      actionCenterFilters: { year: "", from: "", to: "", ap: "", block: "", team: "", activity: "", rspo: "" },
    },
    window: { location: { search: "?view=farm-work", pathname: "/" } },
  };
  vm.runInNewContext(`${appSource.slice(start, end)}
    result = { initialViewFromUrl, requestedWorkspaceRouteFromUrl, resolveWorkspaceRoute, workspaceRoutePath };`, sandbox);
  assert.equal(sandbox.result.initialViewFromUrl(), "farm-work");

  sandbox.window.location = { search: "?route=%2Ffarm%2Fwork", pathname: "/" };
  assert.equal(sandbox.result.requestedWorkspaceRouteFromUrl(), "/farm/work");
  const route = sandbox.result.resolveWorkspaceRoute(
    [{ route: "/farm/work", legacy_view_key: "farm-work" }],
    "/farm/work?year=2569&block=WEBTEST-2569"
  );
  assert.equal(route.legacy_view_key, "farm-work");
  assert.equal(sandbox.result.workspaceRoutePath("/farm/work?year=2569"), "/farm/work");
});

test("all Phase 2 workspace routes retain a valid legacy destination", () => {
  const start = appSource.indexOf("function workspaceLegacyView");
  const end = appSource.indexOf("function workspaceCanAccess", start);
  assert.ok(start >= 0 && end > start);
  const knownViews = new Set([
    "farm-management-dashboard", "farm-area", "farm-work", "farm-result", "farm-inventory",
    "farm-people", "farm-payroll", "farm-budget", "farm-reports", "farm-governance",
  ]);
  const sandbox = { isFarmView: (view) => knownViews.has(view) };
  vm.runInNewContext(`${appSource.slice(start, end)}; result = { workspaceLegacyView };`, sandbox);
  const routes = {
    "/farm/dashboard": ["dashboard", "farm-management-dashboard"],
    "/farm/master": ["farm.master", "farm-area"],
    "/farm/work": ["farm.work", "farm-work"],
    "/farm/daily": ["farm.daily", "farm-result"],
    "/inventory": ["inventory.stock", "farm-inventory"],
    "/inventory/fuel": ["inventory.fuel", "farm-inventory"],
    "/hr/people": ["hr.people", "farm-people"],
    "/payroll": ["payroll", "farm-payroll"],
    "/budget": ["budget", "farm-budget"],
    "/reports": ["reports", "farm-reports"],
    "/system/access": ["system.access", "farm-governance"],
  };
  for (const [route, [workspaceKey, expectedView]] of Object.entries(routes)) {
    assert.equal(sandbox.result.workspaceLegacyView({ route, workspace_key: workspaceKey }), expectedView, route);
  }
});

test("database navigation stays behind the dynamic-menu feature flag", () => {
  assert.match(appSource, /if\s*\(!state\.dynamicMenuEnabled\s*\|\|\s*!els\.farmMenuSection\)\s*return/);
  assert.match(appSource, /workspaceFlag\(payload\.tables\?\.system_settings,\s*"system\.dynamic_menu_enabled"\)/);
  assert.equal((appSource.match(/system\.dynamic_menu_enabled/g) || []).length, 1);
  assert.doesNotMatch(appSource, /system\.dynamic_menu_enabled[\s\S]{0,160}(POST|PUT|PATCH|setting_value\s*:\s*"true")/);
});

test("navigation metadata hides substeps and keeps only primary entrances in the menu", () => {
  assert.match(appSource, /tabMetadata\s*=\s*new Map/);
  assert.match(appSource, /is_primary:\s*tabMetadata\.get\(item\.id\)\?\.is_primary/);
  assert.match(appSource, /\.filter\(\(item\)\s*=>\s*!item\.is_hidden\s*&&\s*workspaceCanAccess\(item\)\)/);
  assert.match(appSource, /item\.is_primary/);
});

test("Action Center uses the existing aggregate views and forwards all documented filters", () => {
  assert.match(appSource, /v_management_action_center/);
  assert.match(appSource, /v_system_module_readiness/);
  for (const key of ["year", "from", "to", "ap", "block", "team", "activity", "rspo"]) {
    assert.match(appSource, new RegExp(`(?:filter\\(|data-action-center-filter=)"?${key}`));
  }
  assert.match(appSource, /workspaceRouteWithFilters\(route\)/);
  assert.match(appSource, /workspaceRouteCanAccess\(item\.route\)/);
  assert.match(appSource, /item\.issue_count/);
  assert.match(appSource, /item\.next_action|item\.readiness_status/);
});

test("farm navigation has its own target and does not replace the transport menu section", () => {
  const transport = indexSource.indexOf('data-menu-group="transport"');
  const farm = indexSource.indexOf('id="farmMenuSection"');
  assert.ok(transport >= 0);
  assert.ok(farm > transport);
});
