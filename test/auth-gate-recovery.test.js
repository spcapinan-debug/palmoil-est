const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "webapp", "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const authApiSource = fs.readFileSync(path.join(root, "api", "farm-auth.js"), "utf8");

test("standalone auth gate precedes and initially hides the application shell", () => {
  const gate = indexHtml.indexOf('id="authShell"');
  const shell = indexHtml.indexOf('id="appShell"');
  assert.ok(gate >= 0 && shell > gate);
  assert.match(indexHtml, /<section id="authShell" class="auth-shell"[^>]*>/);
  assert.match(indexHtml, /<main id="appShell" class="app-shell" hidden>/);
  assert.match(indexHtml, /data-auth-screen="(?:login|forgot-password|reset-password|recovery-error)"/);
  assert.doesNotMatch(indexHtml, /id="farmAuthGate"|id="farmAppShell"/);
});

test("auth shell is full viewport, centered, responsive and independent of the mobile media query", () => {
  const mobileMedia = stylesSource.indexOf("@media screen and (max-width: 760px)");
  const authShellRule = stylesSource.indexOf(".auth-shell {");
  assert.ok(mobileMedia >= 0 && authShellRule > mobileMedia);
  const authRule = stylesSource.slice(authShellRule, stylesSource.indexOf("}", authShellRule) + 1);
  assert.match(authRule, /position: fixed;/);
  assert.match(authRule, /min-height: 100dvh;/);
  assert.match(authRule, /display: flex;/);
  assert.match(authRule, /align-items: center;/);
  assert.match(authRule, /justify-content: center;/);
  assert.match(stylesSource, /\.auth-card \{[\s\S]*width: min\(460px, calc\(100vw - 32px\)\)/);
  assert.match(stylesSource.slice(authShellRule), /@media \(max-width: 760px\)[\s\S]*\.auth-card \{[^}]*width: min\(440px, 100%\);/);
});

test("password visibility controls are buttons contained by each password field", () => {
  assert.match(indexHtml, /class="password-field"[\s\S]*id="authPassword"[\s\S]*id="authTogglePassword"/);
  assert.match(indexHtml, /id="authResetPassword"[\s\S]*id="authToggleResetPassword"/);
  assert.match(indexHtml, /id="authResetConfirm"[\s\S]*id="authToggleResetConfirm"/);
  assert.match(stylesSource, /\.auth-card \.password-field \{[\s\S]*position: relative;/);
  assert.match(stylesSource, /\.auth-card \.password-visibility \{[\s\S]*position: absolute;/);
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
