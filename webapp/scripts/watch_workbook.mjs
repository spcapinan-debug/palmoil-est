import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const workbookCandidates = ["Data.xlsx", "data.xlsx", "Data.xlsm", "data.xlsm"].map((name) => path.join(root, name));
const workbook = workbookCandidates.find((candidate) => fs.existsSync(candidate));
const transportScript = path.join(root, "webapp", "scripts", "extract_data.py");
const millScript = path.join(root, "webapp", "scripts", "extract_mill_weight.py");
const python = process.env.PYTHON || "python";

let running = false;
let pending = false;

function runExtract(reason = "manual") {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  pending = false;
  console.log(`[${new Date().toLocaleString()}] extracting data (${reason})`);
  const child = spawn(python, [transportScript, "--source", "sheet"], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code !== 0) {
      running = false;
      console.error(`transport extract failed with code ${code}`);
      if (pending) runExtract("queued change");
      return;
    }
    const mill = spawn(python, [millScript], { cwd: root, stdio: "inherit" });
    mill.on("exit", (millCode) => {
      running = false;
      if (millCode !== 0) console.error(`mill-weight extract failed with code ${millCode}`);
      if (pending) runExtract("queued change");
    });
  });
}

if (!workbook) {
  console.error(`Workbook not found. Tried: ${workbookCandidates.join(", ")}`);
  process.exit(1);
}

runExtract("startup");
fs.watchFile(workbook, { interval: 3000 }, (current, previous) => {
  if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) runExtract("workbook changed");
});

console.log(`Watching ${workbook}`);
console.log("Keep this window open for realtime data.json and mill_weight.json updates.");
