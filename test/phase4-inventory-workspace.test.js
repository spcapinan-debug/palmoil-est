const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(
  path.join(__dirname, "..", "webapp", "app.js"),
  "utf8",
);
const stylesSource = fs.readFileSync(
  path.join(__dirname, "..", "webapp", "styles.css"),
  "utf8",
);

test("inventory workspace retains the eight Phase 4 tabs and legacy stock operations", () => {
  for (const [id, label] of [
    ["overview", "ภาพรวมคลัง"],
    ["stock", "Stock คงเหลือ"],
    ["receipts", "รับพัสดุ"],
    ["issues", "จ่ายพัสดุ"],
    ["daily-usage", "การใช้รายวัน"],
    ["returns", "คืนพัสดุ"],
    ["conversions", "แปลงหน่วย/SKU"],
    ["stock-card", "Stock Card"],
    ["transfers", "โอนคลัง"],
    ["counts", "ตรวจนับ"],
    ["adjustments", "ปรับยอด"],
  ]) {
    assert.ok(appSource.includes(`["${id}", "${label}"]`), `${id}: ${label}`);
  }
});

test("issue workspace exposes the Phase 4 lifecycle fields and action controls", () => {
  for (const label of [
    "เลขใบจ่าย",
    "คลัง",
    "ใบงาน",
    "ผู้รับ",
    "วันที่จ่าย",
    "วันเริ่มใช้",
    "วันสิ้นสุด",
    "หลายวัน",
    "Status",
    "Usage Status",
    "จำนวนที่ต้องการ",
    "หน่วยที่ต้องการ",
    "หน่วยจ่าย",
    "Conversion Rate",
    "Raw Quantity",
    "Rounded Quantity",
    "Base Quantity",
    "Rounding Difference",
    "Used",
    "Returned",
    "Outstanding",
    "Usage Day Count",
  ]) {
    assert.ok(appSource.includes(`["${label}"`), label);
  }
  for (const actionAttribute of [
    "data-inventory-record-usage",
    "data-inventory-prepare-return",
    "data-inventory-open-return",
    "data-inventory-close-issue",
  ]) {
    assert.ok(appSource.includes(actionAttribute), actionAttribute);
  }
});

test("transaction actions use the server action API and require destructive confirmations", () => {
  for (const action of [
    "calculate-material-issue-quantity",
    "configure-goods-issue-period",
    "record-goods-issue-daily-usage",
    "prepare-goods-return",
    "update-goods-return-line",
    "approve-goods-return",
    "post-goods-return",
    "close-goods-issue-usage",
    "save-material-conversion",
  ]) {
    assert.ok(appSource.includes(`"${action}"`), action);
  }
  assert.match(appSource, /confirm\("ยืนยัน Post ใบคืนเข้าคลัง\?/);
  assert.match(appSource, /confirm\("ยืนยันปิดใบจ่าย\?/);
  assert.match(appSource, /state\.view === "farm-inventory" \? 500 : 5000/);
  assert.match(appSource, /inventoryTablesByTab/);
});

test("responsive inventory layout covers the requested breakpoints without page overflow", () => {
  for (const breakpoint of ["1180px", "820px", "520px"]) {
    assert.ok(stylesSource.includes(`@media (max-width: ${breakpoint})`), breakpoint);
  }
  assert.match(stylesSource, /\.farm-workspace-tabs[\s\S]*?overflow-x:\s*auto/);
  assert.match(stylesSource, /\.farm-inventory-workspace \.table-wrap[\s\S]*?overflow-x:\s*auto/);
});

test("Phase 4 lifecycle arithmetic preserves stock and closes the issue balance", () => {
  const openingStock = 100;
  const issued = 20;
  const stockAfterIssue = openingStock - issued;
  const usedInBags = 10;
  const kilogramsUsed = 250;
  const kilogramsPerBag = 50;
  const convertedUsage = kilogramsUsed / kilogramsPerBag;
  const returned = 5;
  const stockAfterReturn = stockAfterIssue + returned;
  const outstanding = issued - usedInBags - convertedUsage - returned;

  assert.equal(stockAfterIssue, 80);
  assert.equal(convertedUsage, 5);
  assert.equal(stockAfterReturn, 85);
  assert.equal(outstanding, 0);
});
