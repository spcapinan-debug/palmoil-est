(() => {
  "use strict";

  const root = document.querySelector("#reportPage");
  if (!root) return;
  const state = { request: 0, query: "", status: "", page: 1, tab: "overview", detail: null };
  const isHr = () => /^\/hr(?:\/|$)/.test(location.pathname);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[c]);
  const fmt = (value) => new Intl.NumberFormat("th-TH").format(Number(value || 0));
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "—";

  function prepareChrome() {
    document.querySelector("#dashboard")?.classList.add("hidden");
    document.querySelector(".date-panel")?.classList.add("hidden");
    document.querySelector("#globalFilterPanel")?.classList.add("hidden");
    root.classList.remove("hidden");
    root.classList.add("hr5-report-page");
  }

  function nav(active) {
    const items = [["dashboard", "/hr", "ภาพรวม"], ["employees", "/hr/employees", "ทะเบียนพนักงาน"], ["documents", "/hr/documents", "เอกสาร"], ["renewals", "/hr/renewals", "ต่ออายุ"], ["quality", "/hr/data-quality", "คุณภาพข้อมูล"]];
    return `<nav class="hr5-nav" aria-label="เมนู HR">${items.map(([key, href, label]) => `<a href="${href}" data-hr5-link class="${active === key ? "active" : ""}">${label}</a>`).join("")}</nav>`;
  }

  function page(active, title, subtitle, content) {
    return `<div class="hr5-page"><header class="hr5-header"><div><span>PHASE 5 · HUMAN RESOURCES</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><b>Preview · Flags ปิดอยู่</b></header>${nav(active)}${content}</div>`;
  }

  function stateView(active, title, message, error = false) {
    return page(active, title, "ข้อมูลถูกกรองตาม Permission และ HR scope", `<section class="hr5-state ${error ? "error" : ""}" role="status">${error ? "" : `<i></i>`}<strong>${esc(message)}</strong>${error ? `<button type="button" data-hr5-retry>ลองใหม่</button>` : `<small>ระบบใช้ Summary API และ Lazy Loading</small>`}</section>`);
  }

  async function api(mode, params = {}) {
    const url = new URL("/api/hr-workspace", location.origin);
    url.searchParams.set("mode", mode);
    Object.entries(params).forEach(([key, value]) => value !== "" && value != null && url.searchParams.set(key, value));
    const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.error?.message || payload.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  const metric = (label, value, note, tone = "") => `<article class="hr5-metric ${tone}"><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(note)}</small></article>`;
  const empty = (message) => `<div class="hr5-empty">${esc(message)}</div>`;
  function table(items, columns, message) {
    if (!items?.length) return empty(message);
    return `<div class="hr5-table-wrap"><table class="hr5-table"><thead><tr>${columns.map(([label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${items.map((item) => `<tr>${columns.map(([, key, format]) => `<td>${format ? format(item[key], item) : esc(item[key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function readiness(flags = {}) {
    const values = Object.values(flags);
    return `<section class="hr5-readiness"><div><strong>Safe-by-default: Feature flags ทั้งหมดปิดอยู่</strong><p>Preview นี้อ่านข้อมูลเพื่อ UAT เท่านั้น การเขียนข้อมูลและการแจ้งเตือนภายนอกยังไม่เปิดใช้งาน</p></div><span>${values.filter(Boolean).length}/${values.length} เปิด</span></section>`;
  }

  function dashboard(data) {
    const m = data.metrics || {};
    return page("dashboard", "ศูนย์บริหารทรัพยากรบุคคล", "ภาพรวมจากฐานพนักงานเดิม เอกสาร การต่ออายุ และคุณภาพข้อมูล", `${readiness(data.featureFlags)}<section class="hr5-metrics">${metric("พนักงานปัจจุบัน", m.currentEmployees, "Employee Master เดิม")}${metric("พนักงาน Active", m.activeEmployees, "คง Employee ID เดิม", "good")}${metric("แรงงานต่างด้าว", m.migrantEmployees, "ติดตาม Compliance")}${metric("ยังไม่มีแผนก", m.missingDepartment, "รอ HR ยืนยัน", "warning")}${metric("เอกสารหมดอายุ", m.expiredDocuments, "ต้องดำเนินการ", "danger")}${metric("ครบกำหนดใน 90 วัน", m.due90Documents, "วางแผนล่วงหน้า", "warning")}${metric("เคสต่ออายุเปิด", m.openRenewals, "ติดตามจนจบ")}</section>
      <section class="hr5-grid"><article class="hr5-panel"><header><div><h3>เอกสารที่ต้องติดตาม</h3><p>เลขเอกสารถูกปกปิด</p></div><a href="/hr/documents" data-hr5-link>ดูทั้งหมด</a></header><div class="hr5-list">${(data.alerts || []).map((row) => `<a href="/hr/employees/${esc(row.employee_id)}" data-hr5-link><div><strong>${esc(row.full_name)}</strong><span>${esc(row.employee_code)} · ${esc(row.document_type_name_th)}</span></div><div><b>${esc(row.document_number_masked || "ไม่ระบุเลข")}</b><span class="${Number(row.days_to_expiry) < 0 ? "danger" : ""}">${Number(row.days_to_expiry) < 0 ? `เกิน ${fmt(Math.abs(row.days_to_expiry))} วัน` : `เหลือ ${fmt(row.days_to_expiry)} วัน`}</span></div></a>`).join("") || empty("ยังไม่มีเอกสารในช่วงแจ้งเตือน")}</div></article>
      <article class="hr5-panel"><header><div><h3>Renewal Pipeline</h3><p>ไม่แสดงข้อมูลอ่อนไหว</p></div><a href="/hr/renewals" data-hr5-link>เปิด Pipeline</a></header><div class="hr5-pipeline">${(data.renewalPipeline || []).map((row) => `<div><span>${esc(row.status)} · ${esc(row.priority)}</span><strong>${fmt(row.case_count)}</strong><small>เกินกำหนด ${fmt(row.overdue_count)}</small></div>`).join("") || empty("ยังไม่มีเคสต่ออายุ")}</div></article></section>
      <section class="hr5-panel hr5-vault"><div><strong>Private Document Vault</strong><p>Signed URL อายุไม่เกิน 5 นาที หลังตรวจ Permission และ HR scope พร้อม Audit</p></div><button disabled>เพิ่มเอกสาร</button></section>`);
  }

  function employees(data) {
    const p = data.pagination || {};
    const rows = data.rows || [];
    return page("employees", "ทะเบียนพนักงาน", "ค้นหาและเปิด Employee 360 โดยผลลัพธ์ถูกกรองฝั่ง Server", `<form class="hr5-toolbar" data-hr5-search><label>ค้นหา<span><input name="q" type="search" value="${esc(state.query)}" placeholder="รหัสหรือชื่อพนักงาน"><kbd>/</kbd></span></label><label>สถานะ<select name="status"><option value="">ทุกสถานะ</option><option value="active" ${state.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${state.status === "inactive" ? "selected" : ""}>Inactive</option></select></label><button>ค้นหา</button><button type="button" class="secondary" data-hr5-clear>ล้าง</button><button type="button" disabled>เพิ่มพนักงาน</button></form><section class="hr5-panel"><header><div><h3>พนักงาน ${fmt(p.total)} ราย</h3><p>รองรับชื่อไทย อังกฤษ และภาษาต้นทาง</p></div><span>หน้า ${fmt(p.page)} / ${fmt(p.pageCount)}</span></header><div class="hr5-table-wrap"><table class="hr5-table"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สัญชาติ</th><th>แผนก / ตำแหน่ง</th><th>การจ่าย</th><th>Compliance</th><th>สถานะ</th></tr></thead><tbody>${rows.map((row) => `<tr tabindex="0" data-hr5-employee="${esc(row.employee_id)}"><td><strong>${esc(row.employee_code)}</strong></td><td>${esc(row.full_name)}</td><td>${esc(row.nationality || "ไม่ระบุ")}</td><td><strong>${esc(row.department_name || "ไม่ระบุแผนก")}</strong><small>${esc(row.position_name || "ไม่ระบุตำแหน่ง")}</small></td><td>${esc(row.payment_type || "ไม่ระบุ")}</td><td><span class="hr5-status ${row.expired_document_count > 0 ? "danger" : ""}">${row.expired_document_count > 0 ? `หมดอายุ ${fmt(row.expired_document_count)}` : "ปกติ"}</span></td><td><span class="hr5-status">${esc(row.employee_status)}</span></td></tr>`).join("") || `<tr><td colspan="7">${empty("ไม่พบพนักงานตามตัวกรอง")}</td></tr>`}</tbody></table></div><footer class="hr5-pagination"><button data-hr5-page="${p.page - 1}" ${p.page <= 1 ? "disabled" : ""}>ก่อนหน้า</button><span>สูงสุด ${fmt(p.pageSize)} รายต่อหน้า</span><button data-hr5-page="${p.page + 1}" ${!p.hasMore ? "disabled" : ""}>ถัดไป</button></footer></section>`);
  }

  function detail(data) {
    state.detail = data;
    const e = data.employee;
    const tabs = [["overview", "ภาพรวม"], ["documents", "เอกสาร"], ["renewals", "ต่ออายุ"], ["attendance", "เวลาทำงาน"], ["leave", "การลา"], ["training", "อบรม"], ["medical", "สุขภาพ"], ["assets", "ทรัพย์สิน"], ["cases", "กรณีพนักงาน"], ["history", "ประวัติ"]];
    let content = "";
    if (state.tab === "overview") content = `<section class="hr5-profile"><article><span>รหัส</span><strong>${esc(e.employee_code)}</strong></article><article><span>สัญชาติ</span><strong>${esc(e.nationality || "ไม่ระบุ")}</strong></article><article><span>แผนก</span><strong>${esc(e.department_name || "ไม่ระบุ")}</strong></article><article><span>ตำแหน่ง</span><strong>${esc(e.position_name || "ไม่ระบุ")}</strong></article><article><span>การจ่าย</span><strong>${esc(e.payment_type || "ไม่ระบุ")}</strong></article><article><span>เริ่มงาน</span><strong>${fmtDate(e.start_date)}</strong></article></section><section class="hr5-grid"><article class="hr5-panel"><h3>ชื่อหลายภาษา</h3>${data.capabilities.sensitive ? `<dl><dt>ไทย</dt><dd>${esc([data.personal?.first_name_th, data.personal?.last_name_th].filter(Boolean).join(" ") || e.full_name)}</dd><dt>English</dt><dd>${esc([data.personal?.first_name_en, data.personal?.last_name_en].filter(Boolean).join(" ") || "—")}</dd><dt>ภาษาต้นทาง</dt><dd>${esc([data.personal?.first_name_native, data.personal?.last_name_native].filter(Boolean).join(" ") || "—")}</dd></dl>` : empty("ต้องมีสิทธิ์ดูข้อมูลอ่อนไหว")}</article><article class="hr5-panel"><h3>ผู้ติดต่อฉุกเฉิน</h3>${table(data.emergencyContacts, [["ชื่อ", "contact_name"], ["ความสัมพันธ์", "relationship"], ["โทรศัพท์", "phone"]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์")}</article></section>`;
    if (state.tab === "documents") content = table(data.documents, [["ประเภท", "document_type_name_th"], ["เลขปกปิด", "document_number_masked"], ["หมดอายุ", "expiry_date", fmtDate], ["สถานะ", "status"], ["ตรวจสอบ", "verification_status"]], data.capabilities.documentView ? "ยังไม่มีเอกสาร" : "ไม่มีสิทธิ์ดูเอกสาร");
    if (state.tab === "renewals") content = table(data.renewals, [["เลขเคส", "case_no"], ["ประเภท", "renewal_type"], ["สถานะ", "status"], ["เป้าหมาย", "target_completion_date", fmtDate], ["Priority", "priority"]], "ยังไม่มีเคสหรือไม่มีสิทธิ์");
    if (state.tab === "attendance") content = table(data.attendance, [["เดือน", "attendance_month", fmtDate], ["รายการ", "attendance_count", fmt], ["ชั่วโมง", "worked_hours", fmt], ["สาย", "late_count", fmt]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์");
    if (state.tab === "leave") content = table(data.leave, [["เลขคำขอ", "request_no"], ["เริ่ม", "start_date", fmtDate], ["สิ้นสุด", "end_date", fmtDate], ["วัน", "requested_days", fmt], ["สถานะ", "status"]], "ยังไม่มีคำขอหรือไม่มีสิทธิ์");
    if (state.tab === "training") content = table(data.training, [["หลักสูตร", "course_id"], ["เริ่ม", "started_on", fmtDate], ["จบ", "completed_on", fmtDate], ["ผล", "result_status"]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์");
    if (state.tab === "medical") content = table(data.medical, [["ประเภท", "exam_type_id"], ["ตรวจ", "exam_date", fmtDate], ["ครั้งถัดไป", "next_exam_date", fmtDate], ["พร้อมทำงาน", "fitness_status"]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์");
    if (state.tab === "assets") content = table(data.assets, [["ประเภท", "asset_type"], ["อ้างอิง", "asset_reference"], ["มอบ", "assigned_on", fmtDate], ["คืน", "returned_on", fmtDate], ["สถานะ", "status"]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์");
    if (state.tab === "cases") content = table(data.cases, [["เลขเคส", "case_no"], ["ประเภท", "case_type"], ["ชื่อเรื่อง", "title"], ["เปิด", "opened_on", fmtDate], ["สถานะ", "status"]], "ยังไม่มีข้อมูลหรือไม่มีสิทธิ์");
    if (state.tab === "history") content = table(data.statusHistory, [["จาก", "previous_status"], ["เป็น", "new_status"], ["มีผล", "effective_date", fmtDate], ["เหตุผล", "reason"]], "ยังไม่มีประวัติ");
    return page("employees", e.full_name, `${e.employee_code} · Employee 360`, `<div class="hr5-actions"><a href="/hr/employees" data-hr5-link>← กลับทะเบียนพนักงาน</a><div><button disabled>แก้ไข</button><button disabled>อัปโหลดเอกสาร</button></div></div><section class="hr5-tabs" role="tablist">${tabs.map(([key, label]) => `<button role="tab" data-hr5-tab="${key}" aria-selected="${state.tab === key}" class="${state.tab === key ? "active" : ""}">${label}</button>`).join("")}</section><section class="hr5-tab-panel">${content}</section>`);
  }

  function quality(data) {
    const c = data.counts || {};
    return page("quality", "คุณภาพข้อมูลพนักงาน", "Data Cleanup Preview เท่านั้น ไม่แก้พนักงานเดิมอัตโนมัติ", `<section class="hr5-readiness"><div><strong>ต้อง Preview และยืนยันก่อน Import จริง</strong><p>ตรวจ Record เดิม ค่าใหม่ Validation ผลกระทบ Error และ Warning</p></div><button data-hr5-template>CSV Template</button></section><section class="hr5-metrics">${metric("พนักงานมีประเด็น", c.records, "ตาม HR scope", "warning")}${metric("ประเด็นทั้งหมด", c.issues, "หนึ่งคนอาจหลายประเด็น")}${metric("ไม่มีแผนก", c.missingDepartment, "ไม่เติมอัตโนมัติ")}${metric("ไม่มีสัญชาติ", c.missingNationality, "ตรวจหลักฐาน")}${metric("ไม่มีโทรศัพท์", c.missingPhone, "รอ HR ยืนยัน")}${metric("ไม่มี Identification", c.missingIdentification, "ไม่แสดงเลขเต็ม")}${metric("ไม่มีผู้ติดต่อฉุกเฉิน", c.missingEmergencyContact, "ข้อมูลส่วนบุคคล")}${metric("ขาดเอกสารบังคับ", c.missingRequiredDocument, "ตาม Rule")}</section><section class="hr5-panel">${table(data.rows, [["รหัส", "employee_code", (v, r) => `<a href="/hr/employees/${esc(r.employee_id)}" data-hr5-link>${esc(v)}</a>`], ["ชื่อ", "full_name"], ["แผนก", "missing_department", (v) => v ? "ขาด" : "ครบ"], ["สัญชาติ", "missing_nationality", (v) => v ? "ขาด" : "ครบ"], ["โทรศัพท์", "missing_phone", (v) => v ? "ขาด" : "ครบ"], ["Identification", "missing_identification", (v) => v ? "ขาด" : "ครบ"], ["ฉุกเฉิน", "missing_emergency_contact", (v) => v ? "ขาด" : "ครบ"], ["รวม", "issue_count", fmt]], "ไม่พบประเด็น")}</section>`);
  }

  const documents = (data) => page("documents", "เอกสารและวันหมดอายุ", "เลขเอกสารถูกปกปิด ไม่มี Storage path หรือ Signed URL ใน List API", `<section class="hr5-panel"><header><div><h3>เอกสาร ${fmt(data.pagination?.total)} รายการ</h3><p>เรียงตามวันหมดอายุ</p></div><button disabled>เพิ่มเอกสาร</button></header>${table(data.rows, [["พนักงาน", "full_name"], ["รหัส", "employee_code"], ["ประเภท", "document_type_name_th"], ["เลขปกปิด", "document_number_masked"], ["หมดอายุ", "expiry_date", fmtDate], ["เหลือ (วัน)", "days_to_expiry", fmt], ["สถานะ", "status"]], "ยังไม่มีเอกสาร")}</section>`);
  const renewals = (data) => page("renewals", "งานต่ออายุเอกสาร", "ติดตาม Task สถานะ และเอกสารเวอร์ชันใหม่จนจบ", `<section class="hr5-panel"><header><div><h3>Renewal Pipeline</h3><p>${fmt(data.pagination?.total)} เคส</p></div><button disabled>เปิดเคส</button></header>${table(data.rows, [["เลขเคส", "case_no"], ["ประเภท", "renewal_type"], ["สถานะ", "status"], ["Priority", "priority"], ["เป้าหมาย", "target_completion_date", fmtDate], ["นัดหมาย", "appointment_date", fmtDate], ["ค่าใช้จ่าย", "actual_cost", fmt]], "ยังไม่มีเคส")}</section>`);

  async function renderRoute() {
    if (!isHr()) { root.classList.remove("hr5-report-page"); return false; }
    prepareChrome();
    const request = ++state.request;
    const path = location.pathname.replace(/\/+$/, "") || "/hr";
    let active = "dashboard", title = "ศูนย์บริหารทรัพยากรบุคคล", mode = "summary", params = {}, render = dashboard;
    const match = path.match(/^\/hr\/employees\/([0-9a-f-]{36})$/i);
    if (match) { active = "employees"; title = "Employee 360"; mode = "employee"; params = { id: match[1] }; render = detail; }
    else if (path === "/hr/employees") { active = "employees"; title = "ทะเบียนพนักงาน"; mode = "employees"; params = { q: state.query, status: state.status, page: state.page, pageSize: 25 }; render = employees; }
    else if (path === "/hr/data-quality") { active = "quality"; title = "คุณภาพข้อมูล"; mode = "data-quality"; params = { pageSize: 100 }; render = quality; }
    else if (path === "/hr/documents") { active = "documents"; title = "เอกสาร"; mode = "documents"; params = { pageSize: 100 }; render = documents; }
    else if (path === "/hr/renewals") { active = "renewals"; title = "งานต่ออายุ"; mode = "renewals"; params = { pageSize: 100 }; render = renewals; }
    root.innerHTML = stateView(active, title, "กำลังโหลดข้อมูล HR…");
    try {
      const data = await api(mode, params);
      if (request === state.request && isHr()) root.innerHTML = render(data);
    } catch (error) {
      if (request === state.request && isHr()) root.innerHTML = stateView(active, title, error.status === 401 ? "กรุณาเข้าสู่ระบบ" : error.message, true);
    }
    return true;
  }

  function go(path) { history.pushState({}, "", path); state.tab = "overview"; state.detail = null; renderRoute(); }
  document.addEventListener("click", (event) => {
    if (!isHr()) return;
    const link = event.target.closest("[data-hr5-link]"); if (link) { event.preventDefault(); go(link.getAttribute("href")); return; }
    if (event.target.closest("[data-hr5-retry]")) return void renderRoute();
    if (event.target.closest("[data-hr5-clear]")) { state.query = ""; state.status = ""; state.page = 1; return void renderRoute(); }
    const p = event.target.closest("[data-hr5-page]"); if (p && !p.disabled) { state.page = Number(p.dataset.hr5Page); return void renderRoute(); }
    const employee = event.target.closest("[data-hr5-employee]"); if (employee) return void go(`/hr/employees/${employee.dataset.hr5Employee}`);
    const tab = event.target.closest("[data-hr5-tab]"); if (tab && state.detail) { state.tab = tab.dataset.hr5Tab; root.innerHTML = detail(state.detail); return; }
    if (event.target.closest("[data-hr5-template]")) {
      const csv = "employee_code,field,current_value,new_value,validation_result,impact,error_count,warning_count\r\n";
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); a.download = "hr-data-cleanup-preview-template.csv"; a.click(); URL.revokeObjectURL(a.href);
    }
  });
  document.addEventListener("submit", (event) => { const form = event.target.closest("[data-hr5-search]"); if (!form) return; event.preventDefault(); const data = new FormData(form); state.query = String(data.get("q") || "").trim(); state.status = String(data.get("status") || ""); state.page = 1; renderRoute(); });
  document.addEventListener("keydown", (event) => {
    if (isHr() && event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { event.preventDefault(); root.querySelector('input[name="q"]')?.focus(); }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-hr5-employee]")) { event.preventDefault(); go(`/hr/employees/${event.target.dataset.hr5Employee}`); }
  });
  window.addEventListener("popstate", renderRoute);
  window.phase5HrRouteRender = renderRoute;
  renderRoute();
})();
