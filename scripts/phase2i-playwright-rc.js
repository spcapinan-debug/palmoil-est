async (page) => {
  const baseUrl = "__PHASE2I_PREVIEW_URL__";
  const password = "__PHASE2I_RC_PASSWORD__";
  const artifactRoot = "__PHASE2I_PLAYWRIGHT_ARTIFACT_DIR__";
  if (!/^https:\/\/palmoil-iz3p6na3q-spc-est[.]vercel[.]app$/.test(baseUrl)) {
    throw new Error("PHASE2I_PREVIEW_TARGET_MISMATCH");
  }
  if (!password) throw new Error("PHASE2I_RC_PASSWORD_MISSING");

  const accounts = {
    admin: "rc2i.preview.admin",
    manager: "rc2i.preview.manager",
    payroll: "rc2i.preview.payroll",
    viewer: "rc2i.preview.viewer",
  };
  const workspaces = [
    { id: "planning", path: "/farm/work?mode=workspace&tab=annual-plans", selector: ".farm-canonical-planning", role: "admin" },
    { id: "budget", path: "/budget", selector: ".farm-budget-contract, .farm-budget-rate-table, .farm-budget-year-settings", role: "admin" },
    { id: "work", path: "/farm/work?mode=workspace&tab=work-orders", selector: ".farm-workspace-content", role: "admin" },
    { id: "scheduler", path: "/farm/dispatch", selector: "[data-canonical-scheduler]", role: "admin" },
    { id: "daily-result", path: "/farm/daily", selector: ".farm-result-page", role: "admin" },
    { id: "payroll", path: "/payroll", selector: "[data-phase2g-payroll-workspace]", role: "payroll" },
    { id: "performance", path: "/?view=farm-performance", selector: "[data-phase2h-performance-workspace]", role: "admin" },
  ];
  const viewports = [
    { width: 1728, height: 992 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  const evidence = {
    phase: "2I-G",
    preview: baseUrl,
    smoke: [],
    matrix: [],
    browser_e2e: null,
    payroll_reconciliation: null,
    performance_reconciliation: null,
    permissions: [],
    auth_attempts: [],
    errors: { console: [], page: [], request: [], expected_auth_bootstrap: [], expected_permission_denial: [] },
  };
  let activeCase = "bootstrap";
  let currentRole = "";
  let currentSession = null;

  page.on("console", (message) => {
    if (message.type() === "error") {
      const row = { case: activeCase, text: message.text().slice(0, 500) };
      if (activeCase.startsWith("login-") && /status of 401/.test(row.text)) {
        evidence.errors.expected_auth_bootstrap.push(row);
      } else if (activeCase === "permission-payroll-denial" && /status of 403/.test(row.text)) {
        evidence.errors.expected_permission_denial.push(row);
      } else {
        evidence.errors.console.push(row);
      }
    }
  });
  page.on("pageerror", (error) => {
    evidence.errors.page.push({ case: activeCase, text: String(error?.message || error).slice(0, 500) });
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(baseUrl)) {
      evidence.errors.request.push({ case: activeCase, url: new URL(request.url()).pathname, text: String(request.failure()?.errorText || "request failed").slice(0, 240) });
    }
  });

  async function login(role) {
    activeCase = `login-${role}`;
    await page.context().clearCookies({ name: /^farm-(access|refresh)-token$/ });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator("#authShell").waitFor({ state: "visible", timeout: 30000 });
    let response = null;
    let authPayload = {};
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.locator("#authIdentifier").fill(accounts[role]);
      await page.locator("#authPassword").fill(password);
      const authResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/farm-auth")
        && candidate.request().method() === "POST", { timeout: 30000 });
      await page.locator("#authSubmit").click();
      response = await authResponse;
      authPayload = await response.json().catch(() => ({}));
      evidence.auth_attempts.push({
        role,
        attempt,
        http_status: response.status(),
        error_code: authPayload?.error?.code || null,
      });
      if (response.status() === 200) break;
      if (attempt < 3) await page.waitForTimeout(1000);
    }
    if (response?.status() !== 200) {
      throw new Error(`PHASE2I_BROWSER_LOGIN_${role.toUpperCase()}_${response?.status() || 0}_${authPayload?.error?.code || "UNKNOWN"}`);
    }
    await page.locator("#appShell:not([hidden])").waitFor({ state: "visible", timeout: 30000 });
    const session = await page.request.get(`${baseUrl}/api/farm-session`);
    if (session.status() !== 200) throw new Error(`PHASE2I_BROWSER_SESSION_${role.toUpperCase()}_${session.status()}`);
    const payload = await session.json();
    if (payload.profile?.username !== accounts[role]) {
      throw new Error(`PHASE2I_BROWSER_SESSION_IDENTITY_${role.toUpperCase()}`);
    }
    currentRole = role;
    currentSession = { role, username: payload.profile.username, roles: payload.roles || [], permissions: payload.permissions || [] };
    return currentSession;
  }

  async function ensureRole(role) {
    if (currentRole !== role || !currentSession) return login(role);
    return currentSession;
  }

  async function openWorkspace(workspace, caseLabel) {
    activeCase = caseLabel;
    await ensureRole(workspace.role);
    activeCase = caseLabel;
    await page.goto(`${baseUrl}${workspace.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator("#appShell:not([hidden])").waitFor({ state: "visible", timeout: 30000 });
    await page.locator(workspace.selector).first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);
  }

  async function auditWorkspace(workspace, viewport, kind) {
    const label = `${kind}-${workspace.id}-${viewport.width}x${viewport.height}`;
    const errorStart = {
      console: evidence.errors.console.length,
      page: evidence.errors.page.length,
      request: evidence.errors.request.length,
    };
    await page.setViewportSize(viewport);
    await openWorkspace(workspace, label);
    const layout = await page.evaluate(({ selector, id }) => {
      const root = document.querySelector(selector);
      const rootRect = root?.getBoundingClientRect();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
      };
      const major = root ? [...root.querySelectorAll(".farm-panel, .farm-result-card, .phase2g-payroll-kpis > article, .phase2g-payroll-grid > article, .phase2h-kpi-card, .phase2h-panel")].filter(visible) : [];
      const overlaps = [];
      for (let i = 0; i < major.length; i += 1) {
        for (let j = i + 1; j < major.length; j += 1) {
          const a = major[i]; const b = major[j];
          if (a.parentElement !== b.parentElement || a.contains(b) || b.contains(a)) continue;
          const ar = a.getBoundingClientRect(); const br = b.getBoundingClientRect();
          const width = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
          const height = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
          const area = width > 8 && height > 8 ? width * height : 0;
          const smaller = Math.min(ar.width * ar.height, br.width * br.height);
          if (area > 0 && smaller > 0 && area / smaller > 0.05) {
            overlaps.push(`${a.className}|${b.className}`.slice(0, 240));
          }
        }
      }
      const allowedScroll = ".table-wrap, .phase2h-table-scroll, .budget-tree-scroll, .farm-selector-list, [class*='table-scroll']";
      const clipped = root ? [...root.querySelectorAll("h1,h2,h3,h4,button,label")].filter(visible).filter((element) => {
        if (element.closest(allowedScroll)) return false;
        const style = getComputedStyle(element);
        return element.clientWidth > 8 && element.scrollWidth > element.clientWidth + 4
          && !["auto", "scroll"].includes(style.overflowX);
      }).slice(0, 12).map((element) => String(element.textContent || "").trim().slice(0, 120)) : [];
      return {
        rootFound: Boolean(root),
        textLength: String(root?.innerText || "").trim().length,
        rootWidth: Math.round(rootRect?.width || 0),
        rootHeight: Math.round(rootRect?.height || 0),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        overlaps,
        clipped,
        payrollLeak: id !== "payroll" && Boolean(document.querySelector("[data-phase2g-payroll-workspace]")),
        performanceLeak: id !== "performance" && Boolean(document.querySelector("[data-phase2h-performance-workspace]")),
        rcMarkerVisible: /RC2I|UAT2I/.test(String(root?.innerText || "")),
      };
    }, { selector: workspace.selector, id: workspace.id });
    await page.screenshot({ path: `${artifactRoot}/${label}.png`, fullPage: false });
    const caseErrors = {
      console: evidence.errors.console.slice(errorStart.console).filter((row) => row.case === label),
      page: evidence.errors.page.slice(errorStart.page).filter((row) => row.case === label),
      request: evidence.errors.request.slice(errorStart.request).filter((row) => row.case === label),
    };
    const ok = layout.rootFound && layout.textLength >= 20 && layout.rootWidth >= Math.min(300, viewport.width * 0.55)
      && !layout.overflow && layout.overlaps.length === 0 && layout.clipped.length === 0
      && !layout.payrollLeak && !layout.performanceLeak
      && caseErrors.console.length === 0 && caseErrors.page.length === 0 && caseErrors.request.length === 0;
    return { workspace: workspace.id, viewport: `${viewport.width}x${viewport.height}`, ok, layout, errors: caseErrors };
  }

  async function tablePayload(names) {
    const requestPath = `/api/farm-tables?tables=${encodeURIComponent(names.join(","))}&limit=5000&refresh=1`;
    const browserResponse = await page.evaluate(async (path) => {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      return { status: response.status, payload };
    }, requestPath);
    const payload = browserResponse.payload;
    return {
      status: browserResponse.status,
      payload,
      tables: payload.tables || {},
      tableMeta: payload.tableMeta || {},
      warnings: payload.warnings || {},
      errors: payload.errors || {},
    };
  }

  async function browserEvidence() {
    const adminSession = await ensureRole("admin");
    const canonical = await tablePayload([
      "annual_work_plans", "planned_work_items", "planned_work_labor_requirements",
      "work_orders", "work_order_labor_requirements", "work_results", "work_result_workers",
      "survey_responses", "survey_findings", "payroll_earning_lines",
      "v_phase2h_performance_result", "v_phase2h_performance_worker",
    ]);
    const tables = canonical.payload.tables || {};
    const rcRows = (name) => (tables[name] || []).filter((row) => /RC2I|UAT2I/.test(JSON.stringify(row)));
    const plan = rcRows("annual_work_plans").find((row) => row.planning_request_key === "RC2I-BROWSER-PLAN");
    const item = (tables.planned_work_items || []).find((row) => row.annual_plan_id === plan?.id);
    const order = (tables.work_orders || []).find((row) => row.planned_work_item_id === item?.id);
    const result = (tables.work_results || []).find((row) => row.work_order_id === order?.id);
    const planRequirements = (tables.planned_work_labor_requirements || [])
      .filter((row) => row.planned_work_item_id === item?.id && row.selected_for_plan);
    const woRequirements = (tables.work_order_labor_requirements || [])
      .filter((row) => row.work_order_id === order?.id);
    const workers = (tables.work_result_workers || []).filter((row) => row.work_result_id === result?.id);
    const earnings = (tables.payroll_earning_lines || []).filter((row) => row.work_result_id === result?.id);
    const earning = earnings.find((row) => row.work_result_worker_id);
    const worker = workers.find((row) => row.id === earning?.work_result_worker_id);
    const woRequirement = woRequirements.find((row) => row.id === worker?.work_order_labor_requirement_id);
    const planRequirement = planRequirements.find((row) => row.id === woRequirement?.source_planned_work_labor_requirement_id);
    const performanceWorker = (tables.v_phase2h_performance_worker || [])
      .find((row) => row.work_result_worker_id === worker?.id);
    const counts = Object.fromEntries([
      "annual_work_plans", "planned_work_items", "work_orders", "work_results", "survey_responses",
      "survey_findings",
    ].map((name) => [name, rcRows(name).length]));
    counts.payroll_earning_lines = earnings.length;
    counts.v_phase2h_performance_result = (tables.v_phase2h_performance_result || [])
      .filter((row) => row.work_result_id === result?.id).length;
    const lineage = Boolean(planRequirement && woRequirement && worker && earning && performanceWorker);
    evidence.browser_e2e = {
      status: canonical.status === 200 && Object.values(counts).every((count) => count > 0)
        && planRequirements.length >= 2 && woRequirements.length >= 2 && workers.length >= 2
        && lineage ? "PASS" : "FAIL",
      http_status: canonical.status,
      counts,
      frozen_lineage: lineage,
      selected_labor_requirements: planRequirements.length,
      work_order_labor_requirements: woRequirements.length,
      result_workers: workers.length,
      admin_role_present: adminSession.roles.includes("super_admin"),
    };

    const performanceDom = await (async () => {
      await openWorkspace(workspaces.find((item) => item.id === "performance"), "reconciliation-performance");
      return page.locator("[data-phase2h-performance-workspace]").innerText();
    })();
    const performanceCounts = Object.fromEntries([
      "v_phase2h_performance_result", "v_phase2h_performance_worker",
    ].map((name) => [name, rcRows(name).length]));
    const concepts = ["Plan", "Actual", "Labor", "Material", "Fuel", "Survey", "Cost"];
    evidence.performance_reconciliation = {
      status: Object.values(performanceCounts).every((count) => count > 0) && concepts.every((label) => performanceDom.toLowerCase().includes(label.toLowerCase())) ? "PASS" : "FAIL",
      counts: performanceCounts,
      concepts: Object.fromEntries(concepts.map((label) => [label, performanceDom.toLowerCase().includes(label.toLowerCase())])),
    };

    await login("payroll");
    await openWorkspace(workspaces.find((item) => item.id === "payroll"), "reconciliation-payroll");
    const payroll = await tablePayload([
      "v_phase2g_payroll_period_workspace", "payroll_employee_summaries",
      "v_phase2g_bpay_reconciliation_export", "contractor_period_estimates",
    ]);
    const payrollTables = payroll.payload.tables || {};
    const periods = payrollTables.v_phase2g_payroll_period_workspace || [];
    const bpay = payrollTables.v_phase2g_bpay_reconciliation_export || [];
    const expectedBpay = bpay.find((row) => /^RC2I-/.test(String(row.employee_code || ""))
      && Number(row.source_result_count) > 0 && String(row.variance_state) === "matched");
    const expectedPeriod = periods.find((row) => row.payroll_period_id === expectedBpay?.payroll_period_id
      || row.id === expectedBpay?.payroll_period_id);
    const contractorRows = payrollTables.contractor_period_estimates || [];
    const payrollText = await page.locator("[data-phase2g-payroll-workspace]").innerText();
    evidence.payroll_reconciliation = {
      status: payroll.status === 200 && Boolean(expectedPeriod && expectedBpay)
        && contractorRows.length > 0 && payrollText.trim().length >= 20 ? "PASS" : "FAIL",
      http_status: payroll.status,
      period_match: Boolean(expectedPeriod),
      bpay_match: Boolean(expectedBpay),
      source_result_count: expectedBpay ? Number(expectedBpay.source_result_count) : null,
      variance_state: expectedBpay?.variance_state || null,
      employee_code: expectedBpay?.employee_code || null,
      net_amount: expectedBpay ? Number(expectedBpay.net_amount) : null,
      contractor_count: contractorRows.length,
      row_counts: Object.fromEntries(Object.entries(payrollTables).map(([name, rows]) => [name, rows.length])),
    };
  }

  async function permissionSmoke() {
    const admin = await ensureRole("admin");
    await openWorkspace(workspaces.find((item) => item.id === "planning"), "permission-admin");
    evidence.permissions.push({ role: "admin", status: admin.roles.includes("super_admin") ? "PASS" : "FAIL", planning_visible: true });

    const viewer = await login("viewer");
    await openWorkspace({
      ...workspaces.find((item) => item.id === "performance"),
      role: "viewer",
    }, "permission-performance-only");
    const performanceTable = "v_phase2h_performance_result";
    const payrollTable = "v_phase2g_payroll_employee_drilldown";
    const performanceRead = await tablePayload([performanceTable]);
    activeCase = "permission-payroll-denial";
    const payrollDenied = await tablePayload([payrollTable]);
    const payrollWarning = payrollDenied.warnings[payrollTable];
    const payrollErrorCode = payrollDenied.payload?.error?.code || null;
    const payrollDeniedByContract = (payrollDenied.status === 403 && payrollErrorCode === "FORBIDDEN")
      || (payrollDenied.status === 200 && Boolean(payrollWarning)
        && (payrollDenied.tables[payrollTable] || []).length === 0);
    evidence.permissions.push({
      role: "performance-only",
      username: viewer.username,
      permissions: viewer.permissions,
      status: performanceRead.status === 200 && !performanceRead.warnings[performanceTable]
        && Array.isArray(performanceRead.tables[performanceTable])
        && viewer.permissions.includes("performance.view")
        && !viewer.permissions.includes("payroll.view")
        && payrollDeniedByContract ? "PASS" : "FAIL",
      performance_http: performanceRead.status,
      restricted_payroll_http: payrollDenied.status,
      restricted_payroll_error: payrollErrorCode,
      restricted_payroll_warning: payrollWarning || null,
    });

    const payrollSession = await login("payroll");
    await openWorkspace(workspaces.find((item) => item.id === "payroll"), "permission-payroll");
    const payrollRead = await tablePayload(["v_phase2g_payroll_employee_drilldown"]);
    evidence.permissions.push({
      role: "payroll-view-calculate",
      status: payrollRead.status === 200
        && !payrollRead.warnings.v_phase2g_payroll_employee_drilldown
        && payrollSession.permissions.includes("payroll.view")
        && payrollSession.permissions.includes("payroll.calculate") ? "PASS" : "FAIL",
      restricted_payroll_http: payrollRead.status,
    });
  }

  for (const workspace of workspaces) {
    evidence.smoke.push(await auditWorkspace(workspace, { width: 1440, height: 900 }, "smoke"));
  }
  const smokePassed = evidence.smoke.every((row) => row.ok);
  if (smokePassed) {
    for (const workspace of workspaces) {
      for (const viewport of viewports) {
        evidence.matrix.push(await auditWorkspace(workspace, viewport, "matrix"));
      }
    }
  }
  await browserEvidence();
  await permissionSmoke();
  const matrixPassed = smokePassed && evidence.matrix.length === 42 && evidence.matrix.every((row) => row.ok);
  const permissionPassed = evidence.permissions.every((row) => row.status === "PASS");
  const noUnexpectedErrors = evidence.errors.console.length === 0
    && evidence.errors.page.length === 0 && evidence.errors.request.length === 0;
  evidence.summary = {
    smoke: smokePassed ? "PASS" : "FAIL",
    smoke_passed: evidence.smoke.filter((row) => row.ok).length,
    smoke_total: evidence.smoke.length,
    matrix: matrixPassed ? "PASS" : "FAIL",
    matrix_passed: evidence.matrix.filter((row) => row.ok).length,
    matrix_total: evidence.matrix.length,
    browser_e2e: evidence.browser_e2e.status,
    payroll_reconciliation: evidence.payroll_reconciliation.status,
    performance_reconciliation: evidence.performance_reconciliation.status,
    permission_smoke: permissionPassed ? "PASS" : "FAIL",
    unexpected_browser_errors: noUnexpectedErrors ? "PASS" : "FAIL",
    status: smokePassed && matrixPassed && permissionPassed
      && noUnexpectedErrors
      && evidence.browser_e2e.status === "PASS"
      && evidence.payroll_reconciliation.status === "PASS"
      && evidence.performance_reconciliation.status === "PASS" ? "PASS" : "FAIL",
  };
  return evidence;
}
