const TABLES = [
  "transport_sync_runs",
  "transport_source_records",
  "transport_clear_ramp_log",
  "transport_mill_weight_records",
  "transport_mill_reconciliations",
];

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || "https://xhtwmzlorceebsemqkww.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || text || `Supabase ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function n(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function chunk(rows, size = 500) {
  const parts = [];
  for (let index = 0; index < rows.length; index += size) parts.push(rows.slice(index, index + size));
  return parts;
}

async function upsert(table, rows, conflictKey) {
  if (!rows.length) return [];
  const saved = [];
  for (const part of chunk(rows)) {
    const result = await supabaseFetch(`${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
      method: "POST",
      body: JSON.stringify(part),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    saved.push(...(Array.isArray(result) ? result : []));
  }
  return saved;
}

function sourceRecord(row, syncKey, index) {
  const sourceRow = Number(row._srcRow || row.sourceRow || index + 1) || index + 1;
  const recordKey = cleanText(row.recordKey || `${sourceRow}-${row.wpDocNo || ""}-${row.wpInOutType || ""}`, 180);
  return {
    record_key: recordKey,
    sync_key: syncKey,
    source_row: sourceRow,
    doc_no: cleanText(row.wpDocNo, 80),
    in_out_type: cleanText(row.wpInOutType, 10),
    doc_date: isoDate(row.weightDate || row.date || row.wpDocDate),
    factory_doc_no: cleanText(row.wpFacDocNo, 80),
    car_license: cleanText(row.wpCarLicense, 120),
    yard: cleanText(row.yard, 80),
    standard: cleanText(row.standard, 80),
    area_group: cleanText(row.areaGroup, 120),
    supplier_name: cleanText(row.name || row.customerName || row.wpctCode, 240),
    net_weight: n(row.wpNetWeight),
    factory_net_weight: n(row.wpFacNetWeight),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function clearRampRow(row) {
  return {
    clear_date: isoDate(row.date),
    clear_pr: n(row.clearPr),
    clear_tk: n(row.clearTk),
    clear_pr_set: Boolean(row.clearPrSet),
    clear_tk_set: Boolean(row.clearTkSet),
    garden_balance: n(row.gardenBalance),
    takuk_balance: n(row.takukBalance),
    loss_ramp: n(row.lossRamp),
    loss_transport: n(row.lossTransport),
    loss_pr_ramp: n(row.lossPrRamp),
    loss_pr_transport: n(row.lossPrTransport),
    loss_tk_ramp: n(row.lossTkRamp),
    loss_tk_transport: n(row.lossTkTransport),
    note: cleanText(row.note, 1000),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function millWeightRow(row, index) {
  const sourceRow = Number(row.sourceRow || index + 1) || index + 1;
  const docKey = cleanText(row.docKey || row.wpDocNo, 80);
  return {
    record_key: cleanText(row.recordKey || `${sourceRow}-${docKey}`, 180),
    source_row: sourceRow,
    doc_key: docKey,
    wp_doc_no: cleanText(row.wpDocNo, 80),
    doc_date: isoDate(row.date || row.wpDocDateText),
    customer_code: cleanText(row.wpctCode, 80),
    customer_name: cleanText(row.customerName || [row.ctinit, row.ctfname, row.ctlname].filter(Boolean).join(" "), 240),
    car_license: cleanText(row.wpCarLicense, 120),
    net_weight: n(row.wpNetWeight),
    grade: cleanText(row.wpGradeNew, 80),
    product: cleanText(row.wpproduct, 80),
    price_per_unit: n(row.wppriceperunit),
    total_pay: n(row.wptotalpay),
    rspo_flag: cleanText(row.wpRspo, 20),
    category: cleanText(row.category, 80),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function reconcileRow(row) {
  return {
    doc_key: cleanText(row.docKey, 80),
    reconcile_date: isoDate(row.date),
    source_doc_no: cleanText(row.sourceDocNo, 300),
    factory_doc_no: cleanText(row.factoryDocNo, 80),
    customer_name: cleanText(row.customerName, 240),
    car_license: cleanText(row.carLicense, 120),
    yard: cleanText(row.yard, 120),
    category: cleanText(row.category, 80),
    grade: cleanText(row.grade, 80),
    source_weight: n(row.sourceWeight),
    source_factory_weight: n(row.sourceFactoryWeight),
    mill_weight: n(row.millWeight),
    destination_weight: n(row.destinationWeight),
    diff_source: n(row.diffSource),
    diff_factory: n(row.diffFactory),
    loss_rate: n(row.lossRate),
    status: cleanText(row.status, 80),
    destination_source: cleanText(row.destinationSource, 120),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

async function tableCount(table) {
  const rows = await supabaseFetch(`${table}?select=id&limit=1`, {
    headers: { Prefer: "count=exact" },
  });
  return Array.isArray(rows) ? rows.length : 0;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });

  try {
    if (req.method === "GET") {
      const requestUrl = new URL(req.url, "http://localhost");
      if (requestUrl.searchParams.get("healthcheck") === "1") {
        const checks = {};
        for (const table of TABLES) {
          try {
            await tableCount(table);
            checks[table] = "ok";
          } catch (err) {
            checks[table] = err.message;
          }
        }
        return json(res, 200, {
          ok: Object.values(checks).every((value) => value === "ok"),
          route: "transport-sync",
          checks,
          hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
          hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        });
      }

      const [runs, clearRows, reconciliations] = await Promise.all([
        supabaseFetch("transport_sync_runs?select=*&order=created_at.desc&limit=10"),
        supabaseFetch("transport_clear_ramp_log?select=*&order=clear_date.asc&limit=1000"),
        supabaseFetch("transport_mill_reconciliations?select=*&order=reconcile_date.desc&limit=1000"),
      ]);
      return json(res, 200, { ok: true, runs, clearRows, reconciliations });
    }

    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const body = await readBody(req);
    const sourceRows = Array.isArray(body.sourceRecords) ? body.sourceRecords : [];
    const clearRows = Array.isArray(body.clearRows) ? body.clearRows : [];
    const millRows = Array.isArray(body.millRows) ? body.millRows : [];
    const reconcileRows = Array.isArray(body.reconciliations) ? body.reconciliations : [];
    const syncKey = cleanText(body.syncKey || `transport-${Date.now()}`, 160);
    const source = body.source || {};

    const runRows = [{
      sync_key: syncKey,
      reason: cleanText(body.reason || "manual", 120),
      source_payload: source,
      source_record_count: sourceRows.length,
      mill_record_count: millRows.length,
      clear_record_count: clearRows.length,
      reconcile_record_count: reconcileRows.length,
      date_min: isoDate(source.dateMin),
      date_max: isoDate(source.dateMax),
    }];

    const sourceDbRows = sourceRows.map((row, index) => sourceRecord(row, syncKey, index)).filter((row) => row.record_key);
    const clearDbRows = clearRows.map(clearRampRow).filter((row) => row.clear_date);
    const millDbRows = millRows.map(millWeightRow).filter((row) => row.record_key && row.doc_key);
    const reconcileDbRows = reconcileRows.map(reconcileRow).filter((row) => row.doc_key);

    await upsert("transport_sync_runs", runRows, "sync_key");
    await Promise.all([
      upsert("transport_source_records", sourceDbRows, "record_key"),
      upsert("transport_clear_ramp_log", clearDbRows, "clear_date"),
      upsert("transport_mill_weight_records", millDbRows, "record_key"),
      upsert("transport_mill_reconciliations", reconcileDbRows, "doc_key"),
    ]);

    return json(res, 200, {
      ok: true,
      syncKey,
      counts: {
        sourceRecords: sourceDbRows.length,
        clearRows: clearDbRows.length,
        millRows: millDbRows.length,
        reconciliations: reconcileDbRows.length,
      },
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
};
