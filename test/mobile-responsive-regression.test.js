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
});

test("notification center has dialog semantics, filters, badge and accessible close", () => {
  assert.match(html, /id="appNotificationCenter"[^>]*role="dialog"/);
  assert.match(html, /id="appNotificationBadge"/);
  assert.match(html, /data-notification-filter="today"/);
  assert.match(html, /aria-label="ปิดศูนย์การแจ้งเตือน"/);
});
