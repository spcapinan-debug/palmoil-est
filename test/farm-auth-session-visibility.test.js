const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmApi = require("../lib/server/farm-api");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const sessionSource = fs.readFileSync(path.join(__dirname, "..", "api", "farm-session.js"), "utf8");

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test("authentication cookies remain HttpOnly, Secure, Lax, and root-scoped", () => {
  const cookie = farmApi.authCookie("farm-access-token", "synthetic", 3600);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=3600/);
});

test("expired access session refreshes and rotates both cookies", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("grant_type=refresh_token")) return new Response(JSON.stringify({
      access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 120, user: { id: "user-1" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (text.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (text.includes("/profiles?")) return new Response(JSON.stringify([{ id: "user-1", full_name: "UAT", role: "uat_manager", status: "active" }]), { status: 200 });
    return new Response("[]", { status: 200 });
  };
  t.after(() => {
    global.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const res = responseRecorder();
  const actor = await farmApi.refreshAuthentication({ headers: { cookie: "farm-refresh-token=synthetic-refresh" } }, res);
  assert.equal(actor.user.id, "user-1");
  assert.equal(res.headers["Set-Cookie"].length, 2);
  res.headers["Set-Cookie"].forEach((cookie) => assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/));
});

test("workspace session retries authentication through refresh only after 401", () => {
  assert.match(sessionSource, /actor = await authenticate\(req\)/);
  assert.match(sessionSource, /if \(error\?\.status !== 401\) throw error/);
  assert.match(sessionSource, /refreshAuthentication\(req, res\)/);
});

test("client sends same-origin credentials, refreshes once, and checks HTTP status", () => {
  assert.match(appSource, /async function farmJsonRequest/);
  assert.match(appSource, /credentials:\s*"same-origin"/);
  assert.match(appSource, /response\.status === 401/);
  assert.match(appSource, /retrySession:\s*false/);
  assert.match(appSource, /!response\.ok \|\| !payload\?\.ok \|\| !payload\.tables/);
});
