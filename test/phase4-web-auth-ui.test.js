const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "webapp", "index.html"), "utf8");

test("Preview exposes a first-party UAT sign-in dialog backed by HttpOnly auth cookies", () => {
  assert.match(indexHtml, /id="farmAuthDialog"/);
  assert.match(indexHtml, /id="farmAuthEmail"[^>]+autocomplete="username"[^>]+required/);
  assert.match(indexHtml, /id="farmAuthPassword"[^>]+autocomplete="current-password"[^>]+required/);
  assert.match(appSource, /const FARM_AUTH_API[^;]+\/api\/farm-auth/);
  assert.match(appSource, /body:\s*JSON\.stringify\(\{\s*action:\s*"sign_in",\s*email,\s*password\s*\}\)/);
  assert.match(appSource, /credentials:\s*"same-origin"/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\("supabaseAccessToken"\)/);
});

test("authenticated header uses the server session instead of a static Director identity", () => {
  assert.match(appSource, /state\.farmSession\?\.profile\?\.displayName/);
  assert.match(appSource, /state\.workspaceRoles/);
  assert.match(appSource, /action:\s*"sign_out"/);
  assert.doesNotMatch(indexHtml, /<strong>Director<\/strong>/);
});

test("planner block resolver accepts null joined rows", () => {
  assert.match(appSource, /const source = order && typeof order === "object" \? order : \{\}/);
  assert.match(appSource, /const directId = source\.block\?\.id \|\| source\.block_id/);
});
