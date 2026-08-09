const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("webapp/styles.css", "utf8");
const html = fs.readFileSync("webapp/index.html", "utf8");

test("notification and daily mobile controls preserve 44px touch targets and full-screen layout", () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.app-notification-center \{ inset: 0; width: 100vw/);
  assert.match(css, /app-notification-item footer button \{ min-height: 44px/);
  assert.match(css, /farm-daily-vehicle-card/);
  assert.match(css, /overflow-x:\s*(auto|hidden)/);
  assert.match(css, /@media screen and \(max-width: 760px\)[\s\S]*?body\s*\{\s*zoom:\s*1/);
  assert.match(css, /@media screen and \(max-width: 760px\)[\s\S]*?\.actions button,[\s\S]*?min-height:\s*44px !important/);
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\)[\s\S]*?min-height:\s*44px !important/);
  assert.match(css, /@media screen and \(max-width: 760px\)[\s\S]*?\.app-notification-backdrop,[\s\S]*?\.app-notification-center\s*\{\s*zoom:\s*1/);
});

test("notification center has dialog semantics, filters, badge and accessible close", () => {
  assert.match(html, /id="appNotificationCenter"[^>]*role="dialog"/);
  assert.match(html, /id="appNotificationBadge"/);
  assert.match(html, /data-notification-filter="today"/);
  assert.match(html, /aria-label="ปิดศูนย์การแจ้งเตือน"/);
});
