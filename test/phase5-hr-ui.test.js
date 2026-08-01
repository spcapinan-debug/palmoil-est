const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "webapp", "hr-phase5.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "webapp", "index.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

test("Phase 5 HR UI provides required routes and lazy API modes", () => {
  for (const route of ["/hr", "/hr/employees", "/hr/data-quality", "/hr/documents", "/hr/renewals"]) assert.ok(source.includes(route), route);
  assert.match(source, /\/hr\\\/employees\\\/\(\[0-9a-f-\]\{36\}\)/);
  for (const mode of ["summary", "employees", "employee", "data-quality", "documents", "renewals"]) assert.ok(source.includes(`mode = \"${mode}\"`) || source.includes(`mode = "${mode}"`), mode);
  assert.match(source, /ระบบใช้ Summary API และ Lazy Loading/);
});

test("UI includes search, pagination, loading, empty, error, retry, and accessible keyboard navigation", () => {
  for (const token of ["data-hr5-search", "data-hr5-page", "กำลังโหลด", "hr5-empty", "data-hr5-retry", "aria-label", "role=\"tab\"", "event.key === \"/\""]) {
    assert.ok(source.includes(token), token);
  }
  assert.match(source, /tabindex=\"0\" data-hr5-employee/);
});

test("Preview UI keeps mutating controls disabled and exports cleanup preview template only", () => {
  assert.match(source, /Feature flags ทั้งหมดปิดอยู่/);
  assert.ok((source.match(/button disabled/g) || []).length >= 5);
  assert.match(source, /hr-data-cleanup-preview-template\.csv/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|access[_-]?token/i);
});

test("responsive CSS covers required desktop, tablet, and mobile behavior", () => {
  assert.match(styles, /@media \(max-width: 1180px\)/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /\.hr5-table-wrap \{ overflow-x: auto/);
  assert.match(styles, /focus-visible/);
});

test("static routing serves the isolated HR client and sidebar links it", () => {
  assert.match(html, /src="\/hr-phase5\.js/);
  assert.match(html, /href="\/hr" data-hr5-link/);
  assert.ok(vercel.routes.some((route) => String(route.src).includes("hr-phase5")));
});
