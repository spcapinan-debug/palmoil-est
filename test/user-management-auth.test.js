const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const farmApi = require("../lib/server/farm-api");
const farmAuth = require("../api/farm-auth");
const farmTables = require("../api/farm-tables");
const farmUsers = require("../api/farm-users");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260811075310_employee_linked_system_users.sql"),
  "utf8",
);

test("username normalization is case-insensitive and rejects email ambiguity", () => {
  assert.equal(farmUsers._test.normalizeUsername("  APINAN  "), "apinan");
  assert.equal(farmUsers._test.normalizeUsername("Apinan.N-1"), "apinan.n-1");
  assert.throws(() => farmUsers._test.normalizeUsername("a@b.com"), (error) => error.code === "INVALID_USERNAME");
  assert.throws(() => farmUsers._test.normalizeUsername("a b"), (error) => error.code === "INVALID_USERNAME");
});

test("only a super admin can assign, remove, or operate on super_admin", () => {
  const superAdmin = { roles: new Set(["super_admin"]), permissions: new Set() };
  const delegatedAdmin = { roles: new Set(["hr_admin"]), permissions: new Set(["system.user.role.manage"]) };
  assert.doesNotThrow(() => farmUsers._test.requireRoleAssignmentPermission(superAdmin, "super_admin"));
  assert.throws(
    () => farmUsers._test.requireRoleAssignmentPermission(delegatedAdmin, "super_admin"),
    (error) => error.status === 403 && error.code === "SUPER_ADMIN_REQUIRED",
  );
  assert.throws(
    () => farmUsers._test.requireRoleAssignmentPermission(delegatedAdmin, "viewer", ["super_admin"]),
    (error) => error.status === 403 && error.code === "SUPER_ADMIN_REQUIRED",
  );
});

test("shared authorization treats super_admin as wildcard without permission rows", () => {
  const actor = { roles: new Set(["super_admin"]), permissions: new Set() };
  assert.equal(farmApi.actorIsSuperAdmin(actor), true);
  assert.equal(farmApi.actorHasPermission(actor, "future.permission"), true);
  assert.equal(farmApi.actorCan(actor, { permissions: ["future.permission"] }), true);
  assert.doesNotThrow(() => farmApi.authorize(actor, { permissions: ["future.permission"] }));
  assert.match(appSource, /function actorIsSuperAdmin\(\)/);
  assert.match(appSource, /return actorIsSuperAdmin\(\) \|\| actorHasPermission\(permission\)/);
});

test("profiles and profile_roles cannot be mutated through the generic table endpoint", () => {
  assert.equal(farmTables._test.SYSTEM_USER_TABLES.has("profiles"), true);
  assert.equal(farmTables._test.SYSTEM_USER_TABLES.has("profile_roles"), true);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "api", "farm-tables.js"), "utf8"), /must be changed through \/api\/farm-users/);
});

test("migration adds employee-linked identity without public password storage", () => {
  assert.match(migration, /add column if not exists username text/);
  assert.match(migration, /add column if not exists line_id text/);
  assert.match(migration, /profiles_username_lower_unique/);
  assert.match(migration, /profiles_one_active_account_per_employee/);
  assert.match(migration, /username = 'apinan'/);
  assert.match(migration, /role = 'super_admin'/);
  assert.match(migration, /employee_code = '200066'/);
  assert.doesNotMatch(migration, /add column[^;]*(?:plain_password|password_hash|\bpassword\b)/i);
});

test("user actions send password only to Supabase Auth Admin and omit it from audit payloads", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "farm-users.js"), "utf8");
  assert.match(source, /authAdmin\("users",[\s\S]*JSON\.stringify\(\{ email, password, email_confirm: true \}\)/);
  assert.match(source, /authAdmin\(`users\/\$\{encodeURIComponent\(profileId\)\}`,[\s\S]*JSON\.stringify\(\{ password \}\)/);
  assert.doesNotMatch(source, /audit\([^;]*\{\s*password\s*[,}:]/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*password/);
});

test("frontend user management is employee-linked and roles are returned by the API", () => {
  assert.match(appSource, /const FARM_USERS_API[^;]+\/api\/farm-users/);
  assert.match(appSource, /list="systemUserEmployeeOptions"/);
  assert.match(appSource, /state\.systemUserRoles[\s\S]{0,300}\.map/);
  assert.match(appSource, /data-system-user-create-employee/);
  assert.match(appSource, /change_own_password/);
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

async function withAuthFetch(t, fetchImpl, task) {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = fetchImpl;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  t.after(() => {
    global.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  return task();
}

test("username login resolves Auth email server-side and preserves the existing password", async (t) => {
  const calls = [];
  await withAuthFetch(t, async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("profiles?username=eq.apinan")) return Response.json([{ id: "4a216447-bf6c-4952-857d-bfadbc793ffe" }]);
    if (String(url).includes("/auth/v1/admin/users/")) return Response.json({ user: { id: "4a216447-bf6c-4952-857d-bfadbc793ffe", email: "spc.apinan@gmail.com" } });
    if (String(url).includes("grant_type=password")) return Response.json({
      access_token: "access", refresh_token: "refresh", expires_in: 3600,
      user: { id: "4a216447-bf6c-4952-857d-bfadbc793ffe" },
    });
    if (String(url).includes("profiles?id=eq.4a216447")) return Response.json([{ id: "4a216447-bf6c-4952-857d-bfadbc793ffe" }]);
    return Response.json({}, { status: 404 });
  }, async () => {
    const res = responseRecorder();
    await farmAuth({ method: "POST", body: { action: "sign_in", identifier: "APINAN", password: "existing-password" }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.headers["Set-Cookie"].length, 2);
  });
  const passwordGrant = calls.find((call) => call.url.includes("grant_type=password"));
  assert.deepEqual(JSON.parse(passwordGrant.options.body), { email: "spc.apinan@gmail.com", password: "existing-password" });
});

test("email login and every invalid or inactive identity use generic credentials errors", async (t) => {
  let active = true;
  let validPassword = true;
  await withAuthFetch(t, async (url) => {
    if (String(url).includes("grant_type=password")) {
      return validPassword ? Response.json({
        access_token: "access", refresh_token: "refresh", expires_in: 3600,
        user: { id: "4a216447-bf6c-4952-857d-bfadbc793ffe" },
      }) : Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (String(url).includes("profiles?id=eq.")) return Response.json(active ? [{ id: "4a216447-bf6c-4952-857d-bfadbc793ffe" }] : []);
    if (String(url).includes("profiles?username=eq.unknown")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }, async () => {
    const good = responseRecorder();
    await farmAuth({ method: "POST", body: { action: "sign_in", identifier: "spc.apinan@gmail.com", password: "correct" }, headers: {} }, good);
    assert.equal(good.statusCode, 200);

    validPassword = false;
    const wrong = responseRecorder();
    await farmAuth({ method: "POST", body: { action: "sign_in", identifier: "spc.apinan@gmail.com", password: "wrong" }, headers: {} }, wrong);
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(wrong.body.error, { code: "INVALID_CREDENTIALS", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    validPassword = true;
    active = false;
    const inactive = responseRecorder();
    await farmAuth({ method: "POST", body: { action: "sign_in", identifier: "spc.apinan@gmail.com", password: "correct" }, headers: {} }, inactive);
    assert.equal(inactive.statusCode, 401);
    assert.equal(inactive.body.error.code, "INVALID_CREDENTIALS");

    const unknown = responseRecorder();
    await farmAuth({ method: "POST", body: { action: "sign_in", identifier: "unknown", password: "correct" }, headers: {} }, unknown);
    assert.equal(unknown.statusCode, 401);
    assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  });
});
