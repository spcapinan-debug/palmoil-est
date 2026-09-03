import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "phase2i-rc-manifest.json"), "utf8"));
const fixtureSql = fs.readFileSync(path.join(root, "scripts", "phase2i-runtime-fixture.sql"), "utf8");
const password = fixtureSql.match(/extensions[.]crypt[(][\s\r\n]*'([^']+)'/)?.[1] || "";
const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const resolvedRef = new URL(url).hostname.match(/^([a-z0-9]+)[.]supabase[.]co$/)?.[1] || "";
const mode = process.argv.includes("--cleanup") ? "cleanup" : "apply";

if (!url || !serviceKey || !password) throw new Error("PHASE2I_PREVIEW_AUTH_INPUT_MISSING");
if (resolvedRef !== manifest.staging.project_ref || resolvedRef === manifest.production.project_ref) {
  throw new Error("RC_PREVIEW_PRODUCTION_DATABASE_FORBIDDEN");
}
assert.equal(process.env.RC_STAGING_SUPABASE_REF, manifest.staging.project_ref,
  "RC_PREVIEW_STAGING_REF_ASSERTION_MISSING");

const definitions = [
  { key: "admin", username: "rc2i.preview.admin", email: "rc2i-preview-admin@example.invalid", profileRole: "super_admin", roleId: null, linkId: null },
  { key: "manager", username: "rc2i.preview.manager", email: "rc2i-preview-manager@example.invalid", profileRole: "manager", roleId: "2a000000-0000-4000-8000-000000000061", linkId: "2b000000-0000-4000-8000-000000000081" },
  { key: "supervisor", username: "rc2i.preview.supervisor", email: "rc2i-preview-supervisor@example.invalid", profileRole: "supervisor", roleId: "2a000000-0000-4000-8000-000000000062", linkId: "2b000000-0000-4000-8000-000000000082" },
  { key: "payroll", username: "rc2i.preview.payroll", email: "rc2i-preview-payroll@example.invalid", profileRole: "payroll_officer", roleId: "2a000000-0000-4000-8000-000000000063", linkId: "2b000000-0000-4000-8000-000000000083" },
  { key: "viewer", username: "rc2i.preview.viewer", email: "rc2i-preview-viewer@example.invalid", profileRole: "viewer", roleId: "2a000000-0000-4000-8000-000000000064", linkId: "2b000000-0000-4000-8000-000000000084" },
];

async function request(route, { method = "GET", body, prefer, auth = true } = {}) {
  const headers = { apikey: serviceKey };
  if (auth) headers.Authorization = `Bearer ${serviceKey}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = String(data?.error_code || data?.code || "REQUEST_FAILED").slice(0, 80);
    throw new Error(`PHASE2I_PREVIEW_AUTH_${method}_${response.status}_${code}`);
  }
  return data;
}

async function profileFor(definition) {
  const rows = await request(`/rest/v1/profiles?username=eq.${encodeURIComponent(definition.username)}&select=id,username,status&limit=1`);
  return rows?.[0] || null;
}

async function deleteUser(userId) {
  await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

async function cleanup() {
  let removed = 0;
  for (const definition of definitions) {
    const profile = await profileFor(definition);
    if (!profile?.id) continue;
    await deleteUser(profile.id);
    removed += 1;
  }
  console.log(JSON.stringify({ phase: "2I", target: resolvedRef, mode, removed, status: "PASS" }));
}

async function apply() {
  const createdUserIds = [];
  const users = [];
  try {
    for (const definition of definitions) {
      const existingProfile = await profileFor(definition);
      if (existingProfile?.id) {
        const user = await request(`/auth/v1/admin/users/${encodeURIComponent(existingProfile.id)}`);
        if (user.email !== definition.email) throw new Error("PHASE2I_PREVIEW_AUTH_IDENTITY_MISMATCH");
        users.push({ ...definition, id: user.id });
        continue;
      }
      const user = await request("/auth/v1/admin/users", {
        method: "POST",
        body: {
          email: definition.email,
          password,
          email_confirm: true,
          user_metadata: { fixture: "RC2I_PREVIEW_AUTH", display_name: `RC2I Preview ${definition.key}` },
        },
      });
      createdUserIds.push(user.id);
      users.push({ ...definition, id: user.id });
    }

    await request("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: users.map((user) => ({
        id: user.id,
        full_name: `RC2I Preview ${user.key}`,
        role: user.profileRole,
        status: "active",
        username: user.username,
      })),
    });

    const managerId = users.find((user) => user.key === "manager").id;
    await request("/rest/v1/profile_roles?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: users.filter((user) => user.roleId && user.linkId).map((user) => ({
        id: user.linkId,
        profile_id: user.id,
        role_id: user.roleId,
        effective_from: "2026-01-01",
        is_active: true,
        assigned_by_profile_id: managerId,
      })),
    });

    for (const user of users) {
      const session = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        auth: false,
        body: { email: user.email, password },
      });
      if (!session?.access_token || !session?.refresh_token) throw new Error("PHASE2I_PREVIEW_AUTH_LOGIN_FAILED");
    }

    console.log(JSON.stringify({
      phase: "2I",
      target: resolvedRef,
      mode,
      identities: users.length,
      roles: new Set(users.map((user) => user.roleId || user.profileRole)).size,
      password_login_verified: users.length,
      status: "PASS",
    }));
  } catch (error) {
    for (const userId of createdUserIds.reverse()) await deleteUser(userId).catch(() => null);
    throw error;
  }
}

await (mode === "cleanup" ? cleanup() : apply());
