const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "webapp", "index.html"), "utf8");
const authApiSource = fs.readFileSync(path.join(root, "api", "farm-auth.js"), "utf8");

test("standalone auth gate precedes and initially hides the application shell", () => {
  const gate = indexHtml.indexOf('id="farmAuthGate"');
  const shell = indexHtml.indexOf('id="farmAppShell"');
  assert.ok(gate >= 0 && shell > gate);
  assert.match(indexHtml, /id="farmAppShell" class="app-shell" hidden/);
  assert.match(indexHtml, /data-auth-screen="(?:login|forgot-password|reset-password|recovery-error)"/);
});

test("recovery callback is resolved before session restoration and app startup", () => {
  const initStart = appSource.indexOf("async function init()");
  const initSource = appSource.slice(initStart);
  assert.ok(initSource.indexOf("detectFarmPasswordRecovery") < initSource.indexOf("loadWorkspaceShell"));
  assert.ok(initSource.indexOf("loadWorkspaceShell") < initSource.indexOf("startAuthenticatedApplication"));
});

test("invalid recovery callback cannot fall through to the main application", () => {
  const start = appSource.indexOf("async function detectFarmPasswordRecovery");
  const end = appSource.indexOf("function resetFarmAuthenticatedData", start);
  const recovery = appSource.slice(start, end);
  assert.match(recovery, /if \(!expected\) return false/);
  assert.match(recovery, /showFarmAuthScreen\("recovery-error"\)/);
  assert.match(recovery, /return true/);
});

test("recovery credential validation is read-only until explicit password completion", () => {
  assert.match(authApiSource, /async function validatePasswordRecovery[\s\S]*validateRecoveryAccess/);
  assert.match(authApiSource, /action === "validate_password_recovery"/);
  assert.match(authApiSource, /completePasswordReset[\s\S]*method: "PUT"/);
});
