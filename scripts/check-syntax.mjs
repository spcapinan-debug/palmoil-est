import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules"]);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

const files = filesUnder(root);
for (const file of files.filter((name) => /\.(?:js|mjs)$/.test(name))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}
for (const file of files.filter((name) => name.endsWith(".json"))) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}
execFileSync("git", ["diff", "--check"], { cwd: root, stdio: "pipe" });
console.log(`syntax/json checks passed (${files.length} files scanned)`);
