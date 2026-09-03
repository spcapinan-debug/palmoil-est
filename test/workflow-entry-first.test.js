const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "styles.css"), "utf8");

test("workflow routes default to entry mode and keep workspace as an explicit secondary mode", () => {
  const match = appSource.match(/function farmWorkflowModeFromUrl\(\) \{[\s\S]*?\n\}/);
  assert.ok(match);
  const sandbox = {
    URLSearchParams,
    window: { location: { search: "" } },
  };
  vm.runInNewContext(`${match[0]}; result = farmWorkflowModeFromUrl;`, sandbox);
  assert.equal(sandbox.result(), "entry");
  sandbox.window.location.search = "?mode=workspace";
  assert.equal(sandbox.result(), "workspace");
  sandbox.window.location.search = "?mode=anything-else";
  assert.equal(sandbox.result(), "entry");

  assert.match(appSource, /data-farm-workflow-mode=/);
  assert.match(appSource, /url\.searchParams\.set\("mode", "workspace"\)/);
  assert.match(appSource, /url\.searchParams\.delete\("mode"\)/);
});

test("planning entry opens the canonical Annual Plan and Material Snapshot flow", () => {
  const match = appSource.match(/function renderFarmWorkEntry\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  const body = match[1];
  assert.match(body, /renderFarmCanonicalPlanner\(\)/);
  assert.doesNotMatch(body, /renderFarmWorkBoard|renderFarmWorkPlanner/);
  assert.match(body, /ดู Workspace และติดตามงาน/);
});

test("dispatch entry opens scheduler, assignment form, and activity modal without an overview gate", () => {
  const match = appSource.match(/function renderFarmDispatchEntry\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  const body = match[1];
  const board = body.indexOf("renderFarmWorkBoard");
  const panel = body.indexOf("renderFarmDispatchPanel");
  const modal = body.indexOf("renderFarmActivityModal");
  assert.ok(board >= 0 && board < panel && panel < modal);
  assert.match(body, /title:\s*"Scheduler"/);
  assert.match(body, /ติดตามสถานะ/);
  assert.match(appSource, /"\/farm\/dispatch":\s*\["farm\.dispatch",\s*"farm-dispatch"\]/);
});

test("dispatch empty state formats a missing work order without crashing the route", () => {
  const match = appSource.match(/function farmShortWorkOrderNo\(order = \{\}\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  const factory = new Function("farmThaiYearSuffix", "farmToday", `${match[0]}; return farmShortWorkOrderNo;`);
  const shortNo = factory(() => "69", () => "2026-07-30");
  assert.equal(shortNo(null), "W69-001");
});

test("daily entry renders one continuous result form with primary save and submit actions", () => {
  const match = appSource.match(/function renderFarmDailyEntry\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  assert.match(match[1], /renderFarmDailyEntryActions\(\)/);
  assert.match(match[1], /renderFarmResultPanel\(\)/);
  assert.match(appSource, /data-farm-result-save[^>]*>บันทึกร่าง</);
  assert.match(appSource, /data-farm-result-action="submit_work_result"/);
  assert.match(appSource, /state\.farmSyncBusy \|\| !order \? "disabled"/);
  for (const section of ["workers", "materials", "vehicles", "survey", "weigh-tickets", "review"]) {
    assert.match(appSource, new RegExp(`data-farm-daily-jump="\\$\\{section\\}"|\\["${section}",`));
  }
});

test("daily drafts are isolated by work order and result date and survive route or session refresh", () => {
  assert.match(appSource, /return id && day \? `\$\{id\}::\$\{day\}`/);
  assert.match(appSource, /window\.sessionStorage\.setItem\(FARM_RESULT_DRAFT_CACHE_KEY/);
  assert.match(appSource, /window\.sessionStorage\.getItem\(FARM_RESULT_DRAFT_CACHE_KEY/);
  assert.match(appSource, /existingResultId:\s*state\.farmResultDraft\?\.existingResultId/);
  assert.match(appSource, /rememberFarmResultDraft\(\)/);
  assert.match(appSource, /restoreFarmResultDraft\(order,\s*preferredDate\)/);
  assert.match(appSource, /updateFarmWorkflowUrl\(\{\s*work_order:\s*id,\s*date:\s*draft\.resultDate/);
});

test("browser history rehydrates mode, selected order, date, tab, and filters", () => {
  assert.match(appSource, /window\.addEventListener\("popstate"/);
  assert.match(appSource, /hydrateFarmWorkflowStateFromUrl\(\)/);
  for (const key of ["work_order", "date", "tab", "activity", "team", "zone", "plot_group", "status", "q", "start", "end"]) {
    assert.match(appSource, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(appSource, /updateFarmWorkflowUrl\(\{\s*work_order:\s*state\.farmWorkDetailId\s*\},\s*\{\s*push:\s*true\s*\}\)/);
});

test("save draft remains authenticated action-only and reuses the same result id", () => {
  assert.match(appSource, /runFarmAction\("get_or_create_work_result"/);
  assert.match(appSource, /runFarmAction\("save_work_result_draft"/);
  assert.match(appSource, /state\.farmResultDraft\.existingResultId = resultId/);
  assert.doesNotMatch(
    appSource.match(/async function saveFarmDailyEntry\(\) \{[\s\S]*?\n\}/)?.[0] || "",
    /fetch\(|POST|PATCH|PUT/,
  );
});

test("entry controls remain usable on tablet and mobile without widening the page", () => {
  assert.match(cssSource, /\.farm-entry-mode-bar/);
  assert.match(cssSource, /\.farm-daily-entry-actions/);
  assert.match(cssSource, /\.farm-daily-detail-actions[\s\S]*overflow-x:\s*auto/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.farm-daily-entry-actions/);
  assert.match(cssSource, /@media \(max-width: 600px\)[\s\S]*\.farm-entry-mode-bar/);
  assert.match(cssSource, /\.farm-daily-entry,[\s\S]*min-width:\s*0/);
});
