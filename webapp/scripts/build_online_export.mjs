import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "online_export", "stock-report-online");
const checkOnly = process.argv.includes("--check");
if (!checkOnly) fs.mkdirSync(outDir, { recursive: true });

let html = fs.readFileSync(path.join(root, "webapp", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "webapp", "styles.css"), "utf8");
const farmBlockSchema = fs.readFileSync(path.join(root, "webapp", "farm-block-schema.js"), "utf8");
let app = fs.readFileSync(path.join(root, "webapp", "app.js"), "utf8");
const data = fs.readFileSync(path.join(root, "webapp", "data", "data.json"), "utf8");

app = app.replace(
  'const res = await fetch("./data/data.json");\n  state.payload = await res.json();',
  "state.payload = window.__PALM_DATA__;"
);

html = html.replace(
  /<link rel="stylesheet" href="(?:\.\/|\/)styles\.css\?v=[^"]+">/,
  `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`
);

html = html.replace(
  /<script src="(?:\.\/|\/)farm-block-schema\.js\?v=[^"]+"><\/script>/,
  `<script>\n${farmBlockSchema.replace(/<\//g, "<\\/")}\n</script>`
);

html = html.replace(
  /<script src="(?:\.\/|\/)app\.js\?v=[^"]+"><\/script>/,
  `<script>window.__PALM_DATA__ = ${data.replace(/<\//g, "<\\/")};</script>\n<script>\n${app.replace(/<\//g, "<\\/")}\n</script>`
);

const output = path.join(outDir, "index.html");
const builtHtml = `<!-- Standalone online export generated ${new Date().toISOString()} -->\n${html}`;
if (checkOnly) {
  if (!builtHtml.includes("window.__PALM_DATA__")) throw new Error("Standalone data was not embedded");
  if (!builtHtml.includes("FarmBlockSchema")) throw new Error("Shared farm block schema was not embedded");
  console.log(`standalone export check passed (${(Buffer.byteLength(builtHtml) / 1024 / 1024).toFixed(2)} MB)`);
} else {
  fs.writeFileSync(output, builtHtml, "utf8");
  fs.writeFileSync(
    path.join(outDir, "README.txt"),
    [
      "เปิดดูออนไลน์:",
      "1. อัปโหลด index.html นี้ไปยัง static hosting",
      "2. เปิด URL ของไฟล์ index.html ได้ทันที",
      "ไฟล์นี้รวม styles, app และ data แล้ว ไม่ต้องมีไฟล์อื่นประกอบ",
      "",
    ].join("\r\n"),
    "utf8"
  );
  console.log(`${output}\n${(fs.statSync(output).size / 1024 / 1024).toFixed(2)} MB`);
}
