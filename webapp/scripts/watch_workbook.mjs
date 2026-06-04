import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const workbook = path.join(root, "Summary_Palm_RSPO-Ramp.xlsx");
const script = path.join(root, "webapp", "scripts", "extract_data.py");
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
  const child = spawn(python, [script, "--source", "query"], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => {
    running = false;
    if (code !== 0) console.error(`extract failed with code ${code}`);
    if (pending) runExtract("queued change");
  });
}

if (!fs.existsSync(workbook)) {
  console.error(`Workbook not found: ${workbook}`);
  process.exit(1);
}

runExtract("startup");
fs.watchFile(workbook, { interval: 3000 }, (current, previous) => {
  if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) runExtract("workbook changed");
});

console.log(`Watching ${workbook}`);
console.log("Keep this window open for realtime data.json updates.");
