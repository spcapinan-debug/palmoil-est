const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? appSource.indexOf(`function ${nextName}`, start + 1) : appSource.length;
  assert.ok(end > start, `${name} must be bounded`);
  return appSource.slice(start, end);
}

const planner = functionSource("renderFarmCanonicalPlanner", "farmPlanningItemArgs");
const budgetRows = functionSource("farmPlanningBudgetMaterialRows", "farmPlanningBasisLabel");
const createPlan = functionSource("createFarmCanonicalAnnualPlan", "updateFarmCanonicalAnnualPlan");
const createItem = functionSource("createFarmCanonicalPlannedItem", "updateFarmCanonicalPlannedItem");
const updateItem = functionSource("updateFarmCanonicalPlannedItem", "refreshFarmCanonicalPlannedItem");
const refreshItem = functionSource("refreshFarmCanonicalPlannedItem", "deleteFarmCanonicalPlannedItem");
const deleteItem = functionSource("deleteFarmCanonicalPlannedItem", "renderFarmWorkflowModeBar");
const materialSnapshot = functionSource("renderFarmPlanningMaterialSnapshot", "renderFarmPlanningBudgetPreview");
const selectedPlan = functionSource("renderFarmCanonicalSelectedPlan", "renderFarmCanonicalPlanner");
const itemDetail = functionSource("renderFarmCanonicalItemDetail", "renderFarmCanonicalSelectedPlan");
const entry = functionSource("renderFarmWorkEntry", "renderFarmDispatchEntry");
const actionRunner = functionSource("runFarmAction", "mergeFarmDbRow");

test("1. Planning screen no longer invokes the legacy Work Order planner", () => {
  assert.match(entry, /renderFarmCanonicalPlanner\(\)/);
  assert.doesNotMatch(entry, /renderFarmWorkPlanner|renderFarmWorkBoard/);
});

test("2. canonical Annual Plans are distinguishable from historical Plans", () => {
  assert.match(appSource, /row\.source_type === "canonical_budget"/);
  assert.match(appSource, /แผนมาตรฐาน/);
  assert.match(appSource, /ข้อมูลแผนเดิม/);
});

test("3. historical Plans remain readable without mutation controls", () => {
  assert.match(selectedPlan, /plan\.source_type !== "canonical_budget"/);
  assert.match(selectedPlan, /อ่านอย่างเดียว/);
});

test("4. Create Plan uses create_canonical_annual_work_plan", () => {
  assert.match(createPlan, /runFarmAction\("create_canonical_annual_work_plan"/);
});

test("5. Plan Year derives from the selected Budget Year", () => {
  assert.match(createPlan, /plan_year: Number\(year\.fiscal_year\)/);
  assert.match(appSource, /snapshot_required/);
});

test("6. caller-controlled status is absent from canonical Item creation", () => {
  const actionArgs = createItem.slice(createItem.indexOf("runFarmAction"), createItem.indexOf("{ reason:"));
  assert.doesNotMatch(actionArgs, /\bstatus\s*:/);
});

test("7. canonical Item creation uses the transactional snapshot action", () => {
  assert.match(createItem, /runFarmAction\("create_canonical_planned_work_item_snapshot"/);
});

test("8. Planning Material candidates use canonical Budget Block Materials only", () => {
  assert.match(budgetRows, /farmRowsByKey\("budget_rate_block_materials"\)/);
});

test("9. Planning has no budget_rate_materials usage-rate fallback", () => {
  assert.doesNotMatch(budgetRows, /budget_rate_materials/);
  assert.doesNotMatch(createItem, /budget_rate_materials/);
});

test("10. Planning has no activity_material_usage_rates fallback", () => {
  assert.doesNotMatch(budgetRows, /activity_material_usage_rates/);
  assert.doesNotMatch(createItem, /activity_material_usage_rates/);
});

test("11. Planning has no work_order_materials source fallback", () => {
  assert.doesNotMatch(budgetRows, /work_order_materials/);
  assert.doesNotMatch(createItem, /work_order_materials/);
});

test("12. Block-specific rates remain independent and retain their source Block id", () => {
  const preview = functionSource("renderFarmPlanningBudgetPreview", "renderFarmCanonicalPlanCards");
  assert.match(preview, /row\.budget_rate_block_id/);
  assert.match(preview, /row\.usage_rate/);
  assert.doesNotMatch(preview, /reduce\(|aggregate|groupBy/);
});

test("13. tree_count has a supported user-facing label", () => {
  assert.match(appSource, /tree_count: "จำนวนต้น"/);
  assert.match(createItem, /\["tree_count", "area_rai"\]/);
});

test("14. area_rai has a supported user-facing label", () => {
  assert.match(appSource, /area_rai: "พื้นที่ \(ไร่\)"/);
});

test("15. manual_qty is marked unsupported", () => {
  assert.match(appSource, /manual_qty: "กำหนดจำนวนเอง"/);
  assert.doesNotMatch(createItem.match(/\["tree_count", "area_rai"\]/)?.[0] || "", /manual_qty/);
});

test("16. bag_count is marked unsupported", () => {
  assert.match(appSource, /bag_count: "จำนวนกระสอบ"/);
  assert.doesNotMatch(createItem.match(/\["tree_count", "area_rai"\]/)?.[0] || "", /bag_count/);
});

test("17. unsupported basis prevents Planned Item submit", () => {
  assert.match(createItem, /materials\.some\(\(row\) => !\["tree_count", "area_rai"\]\.includes\(row\.usage_basis\)\)/);
  assert.match(appSource, /data-canonical-item-create \$\{canCreate \? "" : "disabled"\}/);
});

test("18. Material Snapshot renders stored usage_rate", () => {
  assert.match(materialSnapshot, /row\.snapshot_usage_rate/);
});

test("19. Material Snapshot renders stored basis_quantity", () => {
  assert.match(materialSnapshot, /row\.snapshot_basis_quantity/);
});

test("20. Material Snapshot renders stored planned_quantity", () => {
  assert.match(materialSnapshot, /row\.planned_quantity/);
});

test("21. Material Snapshot renders the stored unit", () => {
  assert.match(materialSnapshot, /farmLookup\("units", row\.unit_id\)/);
});

test("22. NULL costs render as a dash rather than business zero", () => {
  const nullableCost = functionSource("farmPlanningNullableCost", "farmPlanningOptionalNumber");
  assert.match(nullableCost, /value === null \|\| value === undefined \|\| value === "" \? "-"/);
  assert.match(materialSnapshot, /farmPlanningNullableCost\(row\.snapshot_unit_cost\)/);
  assert.match(materialSnapshot, /farmPlanningNullableCost\(row\.snapshot_amount_per_basis\)/);
});

test("23. page rendering and reload do not refresh a snapshot", () => {
  assert.doesNotMatch(planner, /refresh_canonical_planned_work_item_snapshot/);
  assert.doesNotMatch(materialSnapshot, /runFarmAction|refresh_canonical/);
});

test("24. metadata edit does not refresh a snapshot", () => {
  assert.match(updateItem, /runFarmAction\("update_canonical_planned_work_item"/);
  assert.doesNotMatch(updateItem, /refresh_canonical_planned_work_item_snapshot/);
});

test("25. explicit Refresh calls the refresh RPC action", () => {
  assert.match(refreshItem, /window\.confirm/);
  assert.match(refreshItem, /runFarmAction\("refresh_canonical_planned_work_item_snapshot"/);
});

test("26. each explicit Refresh gets a new strong idempotency request", () => {
  assert.match(actionRunner, /crypto\.randomUUID\(\)/);
  assert.match(actionRunner, /"Idempotency-Key": idempotencyKey/);
  assert.match(refreshItem, /runFarmAction/);
});

test("27. approved Plan cannot expose Refresh", () => {
  assert.match(itemDetail, /!frozen \? `<div class="farm-plan-actions"/);
  assert.match(itemDetail, /data-canonical-item-refresh/);
});

test("28. Draft Item delete calls the delete RPC action", () => {
  assert.match(deleteItem, /runFarmAction\("delete_canonical_planned_work_item"/);
  assert.match(deleteItem, /window\.confirm/);
});

test("29. Approved Item delete is unavailable", () => {
  assert.match(itemDetail, /!frozen \? `<div class="farm-plan-actions"/);
  assert.match(itemDetail, /data-canonical-item-delete/);
});

test("30. empty Draft Plan delete calls the delete Plan action", () => {
  assert.match(appSource, /runFarmAction\("delete_canonical_annual_work_plan"/);
  assert.match(selectedPlan, /items\.length === 0/);
});

test("31. Plan approval calls approve_canonical_annual_work_plan", () => {
  assert.match(appSource, /runFarmAction\("approve_canonical_annual_work_plan"/);
});

test("32. approval requires farm.plan.approve", () => {
  assert.match(appSource, /function farmCanApprovePlanning\(\)[\s\S]*farmHasWorkspacePermission\("farm\.plan\.approve"\)/);
  assert.match(selectedPlan, /farmCanApprovePlanning\(\)/);
});

test("33. Draft mutation controls require farm.plan.create", () => {
  assert.match(appSource, /function farmCanCreatePlanning\(\)[\s\S]*farmHasWorkspacePermission\("farm\.plan\.create"\)/);
  assert.match(createItem, /farmCanCreatePlanning\(\)/);
});

test("34. approved canonical Plan renders frozen read-only controls", () => {
  assert.match(selectedPlan, /const frozen = plan\.status === "approved"/);
  assert.match(selectedPlan, /อนุมัติแล้ว/);
  assert.match(selectedPlan, /\$\{frozen \? "disabled" : ""\}/);
});

test("35. no reopen or unapprove control exists", () => {
  assert.doesNotMatch(planner, /data-canonical-(?:plan-)?(?:reopen|unapprove)|กลับเป็นร่าง|ยกเลิกอนุมัติ/i);
});

test("36. canonical Planning exposes no Create Work Order CTA", () => {
  assert.doesNotMatch(planner, /data-farm-create-order-from-plan|data-canonical-create-work-order/);
});

test("37. the new Planning workflow never invokes create_work_order_from_plan_item", () => {
  const clickHandler = appSource.slice(appSource.indexOf('els.reportPage.addEventListener("click"'));
  assert.doesNotMatch(clickHandler, /runFarmAction\("create_work_order_from_plan_item"/);
  assert.doesNotMatch(planner, /create_work_order_from_plan_item/);
});

test("38. canonical Planning contains no direct browser Supabase mutation", () => {
  const canonicalActions = appSource.slice(appSource.indexOf("async function createFarmCanonicalAnnualPlan"), appSource.indexOf("function renderFarmWorkflowModeBar"));
  assert.doesNotMatch(canonicalActions, /SUPABASE|supabase\.from|fetch\(/i);
});

test("39. canonical Planning contains no generic farm-tables mutation", () => {
  const canonicalActions = appSource.slice(appSource.indexOf("async function createFarmCanonicalAnnualPlan"), appSource.indexOf("function renderFarmWorkflowModeBar"));
  assert.doesNotMatch(canonicalActions, /persistFarmRowToDatabase|FARM_TABLES_API|\/api\/farm-tables/);
  assert.match(canonicalActions, /runFarmAction/);
});

test("40. existing backend Phase 2C focused suites remain present", () => {
  assert.equal(fs.existsSync(path.join(root, "test", "phase2c-planning-material-snapshot.test.js")), true);
  assert.equal(fs.existsSync(path.join(root, "test", "phase2c-planning-runtime-contract.test.js")), true);
});

test("41. historical items require no snapshot rows to remain readable", () => {
  assert.match(appSource, /ข้อมูลแผนเดิมนี้ไม่มี Material Snapshot/);
  assert.match(selectedPlan, /items\.map/);
});

test("42. Material table displays source lineage safely", () => {
  assert.match(materialSnapshot, /source_budget_rate_block_material_id/);
  assert.match(materialSnapshot, /<code title=/);
});

test("43. double-submit protection disables controls and rejects concurrent actions", () => {
  assert.match(actionRunner, /if \(state\.farmSyncBusy\) throw new Error/);
  assert.match(selectedPlan, /!state\.farmSyncBusy/);
  assert.match(appSource, /data-canonical-plan-create \$\{canCreate \? "" : "disabled"\}/);
});

test("44. stable Planning errors render safe Thai messages", () => {
  for (const [code, message] of [
    ["PLANNING_PLAN_FROZEN", "แผนได้รับการอนุมัติแล้วและไม่สามารถแก้ไขได้"],
    ["PLANNING_REQUEST_KEY_REUSED", "คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาลองใหม่"],
    ["PLANNING_BUDGET_YEAR_PLAN_MISMATCH", "ปีของแผนไม่ตรงกับปีงบประมาณ"],
    ["PLANNING_BASIS_NOT_SUPPORTED", "รูปแบบการคำนวณวัสดุนี้ยังไม่รองรับในระบบวางแผน"],
    ["PLANNING_MATERIAL_SNAPSHOT_EMPTY", "ไม่พบวัสดุที่พร้อมใช้จากงบประมาณสำหรับงานและแปลงนี้"],
    ["PLANNING_PLAN_NOT_EMPTY", "ต้องลบรายการงานในแผนก่อนลบแผนประจำปี"],
    ["PLANNING_ITEM_HAS_WORK_ORDER", "รายการนี้มีการเชื่อมโยงใบสั่งงานแล้ว ไม่สามารถลบได้"],
  ]) {
    assert.match(appSource, new RegExp(code));
    assert.ok(appSource.includes(message));
  }
  assert.match(actionRunner, /farmPlanningActionErrorMessage\(error\)/);
});
