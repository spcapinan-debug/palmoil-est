function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

const DISABLED_ERROR = {
  ok: false,
  error: {
    code: "BUDGET_CLEANUP_DISABLED",
    message: "Legacy Budget cleanup is disabled during canonical Budget migration.",
  },
};

module.exports = async function handler(req, res) {
  if (req.method === "GET" || req.method === "POST") {
    return json(res, 410, DISABLED_ERROR);
  }
  res.setHeader("Allow", "GET, POST");
  return json(res, 405, {
    ok: false,
    error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
  });
};
