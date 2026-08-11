const {
  ApiError,
  actorHasPermission,
  actorIsSuperAdmin,
  audit,
  authAdmin,
  authenticate,
  authorize,
  errorResponse,
  json,
  readBody,
  requireText,
  requireUuid,
  rest,
} = require("../lib/server/farm-api");

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiError(400, "INVALID_USERNAME", "Username ต้องมี 3-50 ตัว และใช้เฉพาะ a-z, 0-9, จุด, ขีดล่าง หรือขีดกลาง");
  }
  return username;
}

function normalizeEmail(value) {
  const email = requireText(value, "email", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "INVALID_EMAIL", "Email ไม่ถูกต้อง");
  }
  return email;
}

function normalizeLineId(value) {
  const lineId = String(value || "").trim();
  if (lineId.length > 100) throw new ApiError(400, "VALIDATION_ERROR", "LINE ID ต้องไม่เกิน 100 ตัวอักษร");
  return lineId || null;
}

function validatePassword(value) {
  const password = requireText(value, "password", 1024);
  if (password.length < 8) throw new ApiError(400, "WEAK_PASSWORD", "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  return password;
}

function authUser(data) {
  return data?.user || data;
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await authAdmin(`users?page=${page}&per_page=1000`);
    const batch = Array.isArray(data) ? data : (data?.users || []);
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function loadDirectory() {
  const [profiles, employees, departments, roles, profileRoles, authUsers] = await Promise.all([
    rest("profiles?select=id,employee_id,full_name,username,line_id,role,status,created_at,updated_at&limit=5000").then(({ data }) => data || []),
    rest("employees?select=id,employee_code,full_name,nickname,position,department_id,status,is_current,end_date&limit=5000").then(({ data }) => data || []),
    rest("departments?select=id,department_code,department_name,status&limit=1000").then(({ data }) => data || []),
    rest("roles?status=eq.active&select=id,role_key,role_name,description,status&order=role_name&limit=500").then(({ data }) => data || []),
    rest("profile_roles?is_active=eq.true&select=profile_id,role_id,effective_from,effective_to,is_active&limit=5000").then(({ data }) => data || []),
    listAuthUsers(),
  ]);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const rolesByProfile = new Map();
  profileRoles.forEach((link) => {
    const role = roleById.get(link.role_id);
    if (role) (rolesByProfile.get(link.profile_id) || rolesByProfile.set(link.profile_id, []).get(link.profile_id)).push(role);
  });
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const users = profiles.map((profile) => {
    const employee = employeeById.get(profile.employee_id) || null;
    const auth = authById.get(profile.id) || null;
    const assignedRoles = rolesByProfile.get(profile.id) || [];
    return {
      id: profile.id,
      employeeId: employee?.id || profile.employee_id || null,
      employeeCode: employee?.employee_code || null,
      employeeName: employee?.full_name || profile.full_name || null,
      nickname: employee?.nickname || null,
      position: employee?.position || null,
      departmentId: employee?.department_id || null,
      departmentName: departmentById.get(employee?.department_id)?.department_name || null,
      employeeStatus: employee?.status || null,
      employeeIsCurrent: employee?.is_current ?? null,
      employeeEndDate: employee?.end_date || null,
      username: profile.username || null,
      email: auth?.email || null,
      lineId: profile.line_id || null,
      role: assignedRoles[0]?.role_key || profile.role || null,
      roleId: assignedRoles[0]?.id || null,
      roleName: assignedRoles[0]?.role_name || profile.role || null,
      status: profile.status,
      lastLoginAt: auth?.last_sign_in_at || null,
      authMissing: !auth,
    };
  });
  return {
    users,
    employees: employees
      .filter((employee) => employee.is_current === true && employee.status === "active")
      .map((employee) => ({
        ...employee,
        departmentName: departmentById.get(employee.department_id)?.department_name || null,
      })),
    roles,
  };
}

async function profileById(id) {
  return rest(`profiles?id=eq.${encodeURIComponent(id)}&select=id,employee_id,full_name,username,line_id,role,status&limit=1`)
    .then(({ data }) => data?.[0] || null);
}

async function roleById(id) {
  return rest(`roles?id=eq.${encodeURIComponent(id)}&status=eq.active&select=id,role_key,role_name,description,status&limit=1`)
    .then(({ data }) => data?.[0] || null);
}

async function activeRoleKeys(profileId) {
  const links = await rest(`profile_roles?profile_id=eq.${encodeURIComponent(profileId)}&is_active=eq.true&select=role_id`)
    .then(({ data }) => data || []);
  if (!links.length) return [];
  const ids = links.map((link) => link.role_id).filter(Boolean);
  return rest(`roles?id=in.(${ids.join(",")})&select=role_key`).then(({ data }) => (data || []).map((role) => role.role_key));
}

async function assertUsernameAvailable(username, excludeId = "") {
  const rows = await rest(`profiles?username=eq.${encodeURIComponent(username)}&select=id&limit=2`).then(({ data }) => data || []);
  if (rows.some((row) => row.id !== excludeId)) throw new ApiError(409, "USERNAME_EXISTS", "Username นี้ถูกใช้งานแล้ว");
}

async function assertEmailAvailable(email, excludeId = "") {
  const users = await listAuthUsers();
  if (users.some((user) => user.id !== excludeId && String(user.email || "").toLowerCase() === email)) {
    throw new ApiError(409, "EMAIL_EXISTS", "Email นี้ถูกใช้งานแล้ว");
  }
}

function requireRoleAssignmentPermission(actor, roleKey, targetRoleKeys = []) {
  if (roleKey === "super_admin" || targetRoleKeys.includes("super_admin")) {
    if (!actorIsSuperAdmin(actor)) throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "เฉพาะ super_admin เท่านั้นที่จัดการบัญชี super_admin ได้");
    return;
  }
  if (!actorIsSuperAdmin(actor) && !actorHasPermission(actor, "system.user.role.manage")) {
    throw new ApiError(403, "FORBIDDEN", "ไม่มีสิทธิ์กำหนดบทบาทผู้ใช้งาน");
  }
}

async function assignRole(profileId, role) {
  const today = new Date().toISOString().slice(0, 10);
  await rest(`profile_roles?profile_id=eq.${encodeURIComponent(profileId)}&is_active=eq.true`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false, effective_to: today }),
    headers: { Prefer: "return=minimal" },
  });
  const existing = await rest(`profile_roles?profile_id=eq.${encodeURIComponent(profileId)}&role_id=eq.${encodeURIComponent(role.id)}&select=id&limit=1`)
    .then(({ data }) => data?.[0] || null);
  if (existing) {
    await rest(`profile_roles?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ effective_from: today, effective_to: null, is_active: true }),
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await rest("profile_roles", {
      method: "POST",
      body: JSON.stringify([{ profile_id: profileId, role_id: role.id, effective_from: today, is_active: true }]),
      headers: { Prefer: "return=minimal" },
    });
  }
}

async function roleAssignmentSnapshot(profileId) {
  return rest(`profile_roles?profile_id=eq.${encodeURIComponent(profileId)}&select=id,role_id,effective_from,effective_to,is_active`)
    .then(({ data }) => data || []);
}

async function restoreRoleAssignments(profileId, snapshot) {
  const today = new Date().toISOString().slice(0, 10);
  await rest(`profile_roles?profile_id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false, effective_to: today }),
    headers: { Prefer: "return=minimal" },
  });
  await Promise.all(snapshot.map((link) => rest(`profile_roles?id=eq.${encodeURIComponent(link.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      effective_from: link.effective_from,
      effective_to: link.effective_to,
      is_active: link.is_active,
    }),
    headers: { Prefer: "return=minimal" },
  })));
}

async function createUser(req, actor, body) {
  authorize(actor, { permissions: ["system.user.manage"] });
  const employeeId = requireUuid(body.employeeId, "employeeId");
  const roleId = requireUuid(body.roleId, "roleId");
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const lineId = normalizeLineId(body.lineId);
  const status = body.status === "inactive" ? "inactive" : "active";
  const [employee, role] = await Promise.all([
    rest(`employees?id=eq.${encodeURIComponent(employeeId)}&is_current=eq.true&status=eq.active&select=id,employee_code,full_name,status,is_current&limit=1`)
      .then(({ data }) => data?.[0] || null),
    roleById(roleId),
  ]);
  if (!employee) throw new ApiError(400, "EMPLOYEE_NOT_ACTIVE", "พนักงานต้องมีสถานะ active และเป็นข้อมูลปัจจุบัน");
  if (!role) throw new ApiError(400, "INVALID_ROLE", "ไม่พบบทบาทที่ใช้งานได้");
  requireRoleAssignmentPermission(actor, role.role_key);
  const existingEmployeeAccounts = await rest(`profiles?employee_id=eq.${encodeURIComponent(employeeId)}&status=eq.active&select=id,username,role,status&limit=2`)
    .then(({ data }) => data || []);
  if (existingEmployeeAccounts.length) {
    throw new ApiError(409, "EMPLOYEE_ACCOUNT_EXISTS", "พนักงานรายนี้มีบัญชีผู้ใช้งานแล้ว", { profileId: existingEmployeeAccounts[0].id });
  }
  await Promise.all([assertUsernameAvailable(username), assertEmailAvailable(email)]);

  let createdAuthId = "";
  try {
    const { data } = await authAdmin("users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const created = authUser(data);
    createdAuthId = requireUuid(created?.id, "authUserId");
    await rest("profiles?on_conflict=id", {
      method: "POST",
      body: JSON.stringify([{
        id: createdAuthId,
        employee_id: employee.id,
        full_name: employee.full_name,
        username,
        line_id: lineId,
        role: role.role_key,
        status,
      }]),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    await assignRole(createdAuthId, role);
    await audit(req, actor, "system_user_create", "profiles", createdAuthId, {
      before: null,
      after: { employeeId, employeeCode: employee.employee_code, username, email, lineId, role: role.role_key, status },
    });
    return { id: createdAuthId };
  } catch (error) {
    if (createdAuthId) await authAdmin(`users/${encodeURIComponent(createdAuthId)}`, { method: "DELETE" }).catch(() => null);
    throw error;
  }
}

async function updateUser(req, actor, body) {
  authorize(actor, { permissions: ["system.user.manage"] });
  const profileId = requireUuid(body.profileId, "profileId");
  const before = await profileById(profileId);
  if (!before) throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบบัญชีผู้ใช้งาน");
  const targetRoleKeys = await activeRoleKeys(profileId);
  const roleAssignmentsBefore = await roleAssignmentSnapshot(profileId);
  const username = normalizeUsername(body.username ?? before.username);
  const lineId = normalizeLineId(body.lineId);
  const email = normalizeEmail(body.email);
  const status = body.status === "inactive" ? "inactive" : "active";
  const role = await roleById(requireUuid(body.roleId, "roleId"));
  if (!role) throw new ApiError(400, "INVALID_ROLE", "ไม่พบบทบาทที่ใช้งานได้");
  requireRoleAssignmentPermission(actor, role.role_key, targetRoleKeys);
  if (targetRoleKeys.includes("super_admin") && !actorIsSuperAdmin(actor)) {
    throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "เฉพาะ super_admin เท่านั้นที่แก้บัญชี super_admin ได้");
  }
  await Promise.all([assertUsernameAvailable(username, profileId), assertEmailAvailable(email, profileId)]);
  const { data: currentAuthData } = await authAdmin(`users/${encodeURIComponent(profileId)}`);
  const previousEmail = String(authUser(currentAuthData)?.email || "").toLowerCase();
  try {
    if (email !== previousEmail) {
      await authAdmin(`users/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({ email, email_confirm: true }),
      });
    }
    await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      body: JSON.stringify({ username, line_id: lineId, role: role.role_key, status }),
      headers: { Prefer: "return=minimal" },
    });
    await assignRole(profileId, role);
  } catch (error) {
    if (email !== previousEmail && previousEmail) {
      await authAdmin(`users/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({ email: previousEmail, email_confirm: true }),
      }).catch(() => null);
    }
    await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      body: JSON.stringify(before),
      headers: { Prefer: "return=minimal" },
    }).catch(() => null);
    await restoreRoleAssignments(profileId, roleAssignmentsBefore).catch(() => null);
    throw error;
  }
  await audit(req, actor, "system_user_update", "profiles", profileId, {
    before: { username: before.username, email: previousEmail, lineId: before.line_id, role: before.role, status: before.status },
    after: { username, email, lineId, role: role.role_key, status },
  });
  return { id: profileId };
}

async function resetPassword(req, actor, body) {
  authorize(actor, { permissions: ["system.user.password.reset", "system.user.manage"] });
  const profileId = requireUuid(body.profileId, "profileId");
  const password = validatePassword(body.password);
  const targetRoleKeys = await activeRoleKeys(profileId);
  if (targetRoleKeys.includes("super_admin") && !actorIsSuperAdmin(actor)) {
    throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "เฉพาะ super_admin เท่านั้นที่ตั้งรหัสผ่านของ super_admin ใหม่ได้");
  }
  await authAdmin(`users/${encodeURIComponent(profileId)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  await audit(req, actor, "system_user_password_reset", "profiles", profileId, { targetProfileId: profileId });
  return { id: profileId };
}

async function changeOwnPassword(req, actor, body) {
  const password = validatePassword(body.password);
  await authAdmin(`users/${encodeURIComponent(actor.user.id)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  await audit(req, actor, "system_user_password_change", "profiles", actor.profile.id, { targetProfileId: actor.profile.id });
  return { id: actor.profile.id };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    const actor = await authenticate(req);
    if (req.method === "GET") {
      authorize(actor, { permissions: ["system.user.view", "system.user.manage"] });
      return json(res, 200, { ok: true, ...(await loadDirectory()) });
    }
    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readBody(req);
    const action = requireText(body.action, "action", 50);
    const result = action === "create_user" ? await createUser(req, actor, body)
      : action === "update_user" ? await updateUser(req, actor, body)
        : action === "reset_password" ? await resetPassword(req, actor, body)
          : action === "change_own_password" ? await changeOwnPassword(req, actor, body)
            : null;
    if (!result) throw new ApiError(400, "ACTION_NOT_ALLOWED", "User action is not allowed");
    return json(res, 200, { ok: true, user: result });
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = handler;
module.exports._test = {
  USERNAME_PATTERN,
  normalizeEmail,
  normalizeLineId,
  normalizeUsername,
  requireRoleAssignmentPermission,
  validatePassword,
};
