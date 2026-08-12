const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}`);
  const end = appSource.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} must remain inspectable`);
  return appSource.slice(start, end);
}

test("successful auth reveals the app gate only after its secure session is restored", () => {
  const signIn = functionSource("submitFarmSignIn", "loadFarmPostLoginData");
  assert.match(signIn, /const loaded = await loadWorkspaceShell\(\{ sessionOnly: true \}\)/);
  assert.match(signIn, /if \(!loaded \|\| !state\.farmSession\?\.ok\) throw/);
  assert.ok(signIn.indexOf("showFarmAuthenticatedApplication();") > signIn.indexOf("if (!loaded || !state.farmSession?.ok) throw"));
  assert.match(signIn, /await startAuthenticatedApplication\(\)/);
  assert.doesNotMatch(signIn, /await loadFarmCurrentViewTables/);
});

test("post-login Area and workspace loading is a non-blocking diagnostic", () => {
  const loader = functionSource("loadFarmPostLoginData", "submitFarmSignOut");
  assert.match(loader, /Promise\.allSettled/);
  assert.match(loader, /loadWorkspaceNavigationData\(\)/);
  assert.match(loader, /loadFarmCurrentViewTables\(\{ silent: true, force: true \}\)/);
  assert.match(loader, /farmPreviewDiagnostic\("post-login-data"/);
  assert.match(loader, /console\.warn\("Post-login workspace data diagnostic"/);
  assert.match(loader, /return false/);
});

test("session authentication completes before optional workspace navigation", () => {
  const shellStart = appSource.indexOf("async function loadWorkspaceShell");
  const shellEnd = appSource.indexOf("function isTransportView", shellStart);
  const shell = appSource.slice(shellStart, shellEnd);
  assert.match(shell, /async function loadWorkspaceShell\(\{ sessionOnly = false \} = \{\}\)/);
  assert.match(shell, /state\.farmSession = session/);
  assert.match(shell, /renderFarmAuthState\(\)/);
  assert.match(shell, /if \(!sessionOnly\) await loadWorkspaceNavigationData\(\)/);
  assert.ok(shell.indexOf("state.farmSession = session") < shell.indexOf("loadWorkspaceNavigationData()"));
});

test("Area consistency mismatch is diagnostic-only in runtime render paths", () => {
  const diagnostic = functionSource("farmCheckAreaCatalogConsistency", "farmBudgetBlockHierarchy");
  assert.match(diagnostic, /checkFarmBlockIdConsistency/);
  assert.match(diagnostic, /console\.warn/);
  assert.doesNotMatch(diagnostic, /assertFarmBlockIdConsistency|throw new Error/);
  assert.match(appSource, /function renderFarmBudgetAreaTree[\s\S]*?farmCheckAreaCatalogConsistency\(\)/);
  assert.match(appSource, /function renderFarmAreaBoard[\s\S]*?farmCheckAreaCatalogConsistency\(\)/);
});

test("invalid password and failed session remain login failures", () => {
  const signIn = functionSource("submitFarmSignIn", "loadFarmPostLoginData");
  assert.match(signIn, /if \(!response\.ok \|\| !payload\?\.ok\) throw new Error/);
  assert.match(signIn, /if \(!loaded \|\| !state\.farmSession\?\.ok\) throw new Error/);
  assert.match(signIn, /farmAuthStatus\) els\.farmAuthStatus\.textContent = error\.message/);
});

test("session requests and auth requests keep same-origin secure-cookie semantics", () => {
  assert.match(appSource, /fetch\(FARM_AUTH_API,[\s\S]*?credentials: "same-origin"/);
  assert.match(appSource, /farmJsonRequest\(FARM_SESSION_API, \{ cache: "no-store" \}/);
  assert.match(appSource, /function closeFarmAuthDialog\(\)[\s\S]*?farmAuthDialog\?\.open[\s\S]*?\.close\(\)/);
});
