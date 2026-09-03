import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const runtimeRequire = createRequire(path.join(root, ".phase2i-tools", "playwright", "package.json"));
const { chromium } = runtimeRequire("playwright");
const templatePath = path.join(root, "scripts", "phase2i-playwright-rc.js");
const baseUrl = process.env.PHASE2I_PREVIEW_URL || "";
const password = process.env.PHASE2I_RC_PASSWORD || "";
const bypass = process.env.PHASE2I_AUTOMATION_BYPASS || "";
const artifactRoot = path.join(root, "output", "playwright", "phase2i-rc").replaceAll("\\", "/");

if (!baseUrl || !password || !bypass) {
  throw new Error("PHASE2I_PLAYWRIGHT_RUNTIME_INPUT_MISSING");
}

fs.mkdirSync(artifactRoot, { recursive: true });
const source = fs.readFileSync(templatePath, "utf8")
  .replace("__PHASE2I_PREVIEW_URL__", baseUrl)
  .replace("__PHASE2I_RC_PASSWORD__", password)
  .replace("__PHASE2I_PLAYWRIGHT_ARTIFACT_DIR__", artifactRoot);
const run = (0, eval)(`(${source})`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

try {
  const previewHost = new URL(baseUrl).hostname;
  const bypassRoute = async (route) => {
    await route.continue({ headers: {
      ...route.request().headers(),
      "x-vercel-protection-bypass": bypass,
      "x-vercel-set-bypass-cookie": "true",
    } });
  };
  await page.route(`${baseUrl}/**`, bypassRoute);
  let previewReady = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
    const appMarker = await page.locator("#authShell, #appShell").count().catch(() => 0);
    if (new URL(page.url()).hostname === previewHost && appMarker > 0) {
      previewReady = true;
      break;
    }
    await page.waitForTimeout(1_000);
  }
  await page.unroute(`${baseUrl}/**`, bypassRoute);
  if (!previewReady) throw new Error("PHASE2I_BYPASS_NOT_READY");
  const initialSnapshot = await page.locator("body").ariaSnapshot();
  fs.writeFileSync(path.join(artifactRoot, "initial-snapshot.yml"), `${initialSnapshot}\n`, "utf8");
  const evidence = await run(page);
  const evidencePath = path.join(artifactRoot, "phase2i-playwright-results.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const summary = evidence.summary || {};
  process.stdout.write(`${JSON.stringify({
    status: summary.status || "FAIL",
    smoke: `${summary.smoke_passed || 0}/${summary.smoke_total || 0}`,
    matrix: `${summary.matrix_passed || 0}/${summary.matrix_total || 0}`,
    browser_e2e: summary.browser_e2e || "FAIL",
    payroll_reconciliation: summary.payroll_reconciliation || "FAIL",
    performance_reconciliation: summary.performance_reconciliation || "FAIL",
    permission_smoke: summary.permission_smoke || "FAIL",
  })}\n`);
  if (summary.status !== "PASS") process.exitCode = 1;
} finally {
  await browser.close();
}
