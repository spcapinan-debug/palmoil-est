(() => {
  "use strict";

  const VERSION = "1.0.0";
  const TOOLBAR_ATTR = "data-area-master-admin-v1";
  const BLOCK_FIELDS = [
    "id", "estate_id", "zone_id", "plot_id", "block_code", "block_name", "ap_code",
    "area_rai", "area_hectare", "planting_year", "palm_age", "tree_count", "tree_per_rai",
    "palm_variety", "terrain_type", "rspo_status", "productive_status", "hcv_status",
    "gps_lat", "gps_lng", "map_boundary", "status", "note", "created_at", "updated_at",
  ];

  const ui = {
    busy: false,
    enhanceQueued: false,
    lastMapMergeSignature: "",
    mapDraft: null,
  };

  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function numberOrNull(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function integerOrNull(value) {
    const parsed = numberOrNull(value);
    return parsed == null ? null : Math.trunc(parsed);
  }

  function normalizeMapKey(value) {
    return text(value)
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[–—−]/g, "-")
      .replace(/\s+/g, "");
  }

  function deriveBlockGroup(code) {
    const value = normalizeMapKey(code);
    if (/^SB\d/.test(value)) return "SB";
    const match = value.match(/(?:^|[-_/])(PU|A|B|C|D|P|T)(?=\d|[-_/]|$)/);
    return match?.[1] || "";
  }

  function isFarmAreaView() {
    try {
      return typeof state !== "undefined" && state?.view === "farm-area";
    } catch (_) {
      return false;
    }
  }

  function sessionOk() {
    try { return Boolean(state?.farmSession?.ok); } catch (_) { return false; }
  }

  function roleSet() {
    try {
      return new Set([...(state?.workspaceRoles || [])].map((value) => String(value).toLowerCase()));
    } catch (_) {
      return new Set();
    }
  }

  function canManageAreaMaster() {
    if (!sessionOk()) return false;
    const roles = roleSet();
    if (["super_admin", "admin", "manager", "estate_manager"].some((role) => roles.has(role))) return true;
    try {
      if (typeof actorCan === "function") {
        return ["farm.area.manage", "farm.master.manage", "system.master.manage"].some((permission) => actorCan(permission));
      }
    } catch (_) {}
    return false;
  }

  function rowList(key) {
    try {
      if (typeof farmRowsByKey === "function") return farmRowsByKey(key) || [];
    } catch (_) {}
    return [];
  }

  function canonicalBlocks() {
    try {
      if (typeof farmAreaCatalogBlocks === "function") return farmAreaCatalogBlocks() || [];
    } catch (_) {}
    try {
      if (Array.isArray(state?.farmCanonicalAreaRows) && state.farmCanonicalAreaRows.length) return state.farmCanonicalAreaRows;
    } catch (_) {}
    return rowList("blocks");
  }

  function rawBlockById(id) {
    const raw = rowList("blocks").find((row) => String(row.id) === String(id));
    if (raw) return raw;
    return canonicalBlocks().find((row) => String(row.id) === String(id)) || null;
  }

  function filterBlockFields(row = {}) {
    const clean = {};
    for (const key of BLOCK_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) clean[key] = row[key];
    }
    return clean;
  }

  function safeError(payload, fallback) {
    return payload?.error?.message || payload?.message || payload?.error || fallback;
  }

  async function apiUpsertBlocks(rows, reason) {
    if (!rows.length) return [];
    if (rows.length > 500) throw new Error("รองรับการบันทึกครั้งละไม่เกิน 500 Block");
    if (typeof farmJsonRequest !== "function") throw new Error("Farm API client ยังไม่พร้อม");
    const api = typeof FARM_TABLES_API !== "undefined" ? FARM_TABLES_API : "/api/farm-tables";
    const { response, payload } = await farmJsonRequest(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "blocks", rows, onConflict: "id", reason }),
    });
    if (!response.ok || !payload?.ok) throw new Error(safeError(payload, `บันทึก Block ไม่สำเร็จ (${response.status})`));
    return Array.isArray(payload.rows) ? payload.rows : [];
  }

  async function refreshAreaData() {
    if (typeof loadFarmTablesFromDatabase === "function") {
      await loadFarmTablesFromDatabase({
        silent: true,
        force: true,
        tables: ["blocks", "estates", "zones", "plots", "plot_groups"],
      });
    }
    if (typeof loadFarmAreaMasterData === "function") await loadFarmAreaMasterData({ force: true });
    mergeDbMapBoundariesIntoState();
    if (typeof render === "function") render();
  }

  function toast(message, tone = "success") {
    let node = document.querySelector("[data-area-admin-toast]");
    if (!node) {
      node = document.createElement("div");
      node.setAttribute("data-area-admin-toast", "");
      node.className = "area-admin-toast";
      document.body.appendChild(node);
    }
    node.className = `area-admin-toast ${tone}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  function blockMapGeometry(boundary) {
    if (!boundary || typeof boundary !== "object") return null;
    if (boundary.type === "Feature") return boundary.geometry || null;
    if (["Polygon", "MultiPolygon"].includes(boundary.type)) return boundary;
    if (boundary.geometry && ["Polygon", "MultiPolygon"].includes(boundary.geometry.type)) return boundary.geometry;
    return null;
  }

  function flattenGeometryFeatures(block, geometry) {
    const common = {
      name: block.block_name || block.block_code || block.ap_code || block.id,
      map_key: normalizeMapKey(block.block_name || block.block_code || block.ap_code),
      block_id: block.id,
      block_code: block.block_code,
      match_status: "matched",
      source: "blocks.map_boundary",
    };
    if (geometry?.type === "Polygon") {
      return [{ type: "Feature", properties: common, geometry }];
    }
    if (geometry?.type === "MultiPolygon") {
      return geometry.coordinates.map((coordinates, index) => ({
        type: "Feature",
        properties: { ...common, part: index + 1 },
        geometry: { type: "Polygon", coordinates },
      }));
    }
    return [];
  }

  function visitCoordinates(value, callback) {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      callback(Number(value[0]), Number(value[1]));
      return;
    }
    for (const item of value) visitCoordinates(item, callback);
  }

  function featureBounds(features) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const feature of features) {
      visitCoordinates(feature?.geometry?.coordinates, (x, y) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      });
    }
    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : [];
  }

  function mergeDbMapBoundariesIntoState() {
    if (!isFarmAreaView()) return false;
    let map;
    try { map = state?.blockMapData; } catch (_) { return false; }
    if (!map || typeof map !== "object") return false;
    const blocks = canonicalBlocks();
    const boundaryBlocks = blocks.filter((block) => blockMapGeometry(block.map_boundary));
    const signature = JSON.stringify(boundaryBlocks.map((block) => [block.id, block.updated_at || "", JSON.stringify(block.map_boundary).length]));
    if (signature === ui.lastMapMergeSignature) return false;
    ui.lastMapMergeSignature = signature;

    const overrideIds = new Set(boundaryBlocks.map((block) => String(block.id)));
    const baseFeatures = (Array.isArray(map.features) ? map.features : []).filter((feature) => {
      const blockId = feature?.properties?.block_id;
      return !blockId || !overrideIds.has(String(blockId));
    });
    const dbFeatures = boundaryBlocks.flatMap((block) => flattenGeometryFeatures(block, blockMapGeometry(block.map_boundary)));
    const features = [...baseFeatures, ...dbFeatures];
    state.blockMapData = {
      ...map,
      source: { ...(map.source || {}), dbMapBoundaries: boundaryBlocks.length, dbMapOverlayVersion: VERSION },
      bounds: featureBounds(features),
      features,
    };
    for (const row of state.farmCanonicalAreaRows || []) {
      if (overrideIds.has(String(row.id))) row.map_status = "matched";
    }
    return true;
  }

  function zoneOptions(selectedId = "") {
    const estates = new Map(rowList("estates").map((row) => [String(row.id), row]));
    return rowList("zones")
      .filter((row) => String(row.status || "active").toLowerCase() === "active")
      .sort((a, b) => String(a.zone_name || a.zone_code).localeCompare(String(b.zone_name || b.zone_code), "th", { numeric: true }))
      .map((row) => {
        const estate = estates.get(String(row.estate_id || ""));
        const label = [row.zone_name || row.zone_code, estate?.estate_name || estate?.estate_code].filter(Boolean).join(" · ");
        return `<option value="${html(row.id)}" data-estate-id="${html(row.estate_id || "")}"${String(row.id) === String(selectedId) ? " selected" : ""}>${html(label)}</option>`;
      }).join("");
  }

  function estateOptions(selectedId = "") {
    return rowList("estates")
      .filter((row) => String(row.status || "active").toLowerCase() === "active")
      .sort((a, b) => String(a.estate_name || a.estate_code).localeCompare(String(b.estate_name || b.estate_code), "th", { numeric: true }))
      .map((row) => `<option value="${html(row.id)}"${String(row.id) === String(selectedId) ? " selected" : ""}>${html(row.estate_name || row.estate_code)}</option>`)
      .join("");
  }

  function ensureBlockDialog() {
    let dialog = document.querySelector("#areaMasterBlockDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "areaMasterBlockDialog";
    dialog.className = "area-admin-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="area-admin-dialog-shell" data-area-block-form>
        <header>
          <div><small>01 ข้อมูลหลัก · ข้อมูลพื้นที่</small><h3 data-area-block-title>เพิ่ม Block</h3></div>
          <button type="button" class="ghost" data-area-dialog-close aria-label="ปิด">✕</button>
        </header>
        <div class="area-admin-form-grid">
          <label class="span-2">Block UUID<input name="id" readonly></label>
          <label>Block Code<input name="block_code" required maxlength="80"></label>
          <label>Block Name<input name="block_name" required maxlength="160"></label>
          <label>AP Code<input name="ap_code" required maxlength="80"></label>
          <label>กลุ่ม (จาก Block Code)<input name="block_group" readonly></label>
          <label>Estate<select name="estate_id"><option value="">ไม่ระบุ</option></select></label>
          <label>Zone<select name="zone_id"><option value="">ไม่ระบุ</option></select></label>
          <label>ปีปลูก (พ.ศ.)<input name="planting_year" type="number" min="2450" max="2700"></label>
          <label>พื้นที่ (ไร่)<input name="area_rai" type="number" step="0.0001" min="0" required></label>
          <label>จำนวนต้น<input name="tree_count" type="number" step="1" min="0" required></label>
          <label>RSPO<select name="rspo_status"><option value="">ไม่ระบุ</option><option value="RSPO">RSPO</option><option value="NON-RSPO">NON-RSPO</option></select></label>
          <label>Terrain Type<input name="terrain_type" maxlength="120"></label>
          <label>Productive Status<input name="productive_status" maxlength="120"></label>
          <label>สถานะ<select name="status"><option value="active">ใช้งาน</option><option value="inactive">ไม่ใช้งาน</option></select></label>
          <label class="span-2">หมายเหตุ<textarea name="note" rows="3" maxlength="1000"></textarea></label>
          <div class="area-admin-map-summary span-2" data-area-block-map-summary></div>
        </div>
        <p class="area-admin-form-status" data-area-block-status role="status"></p>
        <footer>
          <button type="button" class="danger ghost" data-area-remove-uploaded-map hidden>ลบ Map ที่ Upload</button>
          <span></span>
          <button type="button" class="ghost" data-area-dialog-close>ยกเลิก</button>
          <button type="submit" class="primary" data-area-block-save>บันทึก Block</button>
        </footer>
      </form>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector("[data-area-block-form]");
    dialog.querySelectorAll("[data-area-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    form.elements.block_code.addEventListener("input", () => {
      form.elements.block_group.value = deriveBlockGroup(form.elements.block_code.value);
    });
    form.elements.zone_id.addEventListener("change", () => {
      const option = form.elements.zone_id.selectedOptions?.[0];
      if (option?.dataset.estateId) form.elements.estate_id.value = option.dataset.estateId;
    });
    form.addEventListener("submit", handleBlockFormSubmit);
    dialog.querySelector("[data-area-remove-uploaded-map]").addEventListener("click", handleRemoveUploadedMap);
    return dialog;
  }

  function populateBlockDialog(block = null) {
    const dialog = ensureBlockDialog();
    const form = dialog.querySelector("[data-area-block-form]");
    const row = block ? filterBlockFields(block) : {};
    const id = row.id || crypto.randomUUID();
    dialog.querySelector("[data-area-block-title]").textContent = block ? `แก้ไข Block ${row.block_code || row.block_name || ""}` : "เพิ่ม Block ใหม่";
    form.elements.estate_id.innerHTML = `<option value="">ไม่ระบุ</option>${estateOptions(row.estate_id || "")}`;
    form.elements.zone_id.innerHTML = `<option value="">ไม่ระบุ</option>${zoneOptions(row.zone_id || "")}`;
    form.elements.id.value = id;
    form.elements.block_code.value = row.block_code || "";
    form.elements.block_name.value = row.block_name || row.block_code || "";
    form.elements.ap_code.value = row.ap_code || row.block_code || "";
    form.elements.block_group.value = deriveBlockGroup(row.block_code || "");
    form.elements.estate_id.value = row.estate_id || "";
    form.elements.zone_id.value = row.zone_id || "";
    form.elements.planting_year.value = row.planting_year ?? "";
    form.elements.area_rai.value = row.area_rai ?? 0;
    form.elements.tree_count.value = row.tree_count ?? 0;
    form.elements.rspo_status.value = row.rspo_status || "";
    form.elements.terrain_type.value = row.terrain_type || "";
    form.elements.productive_status.value = row.productive_status || "";
    form.elements.status.value = row.status || "active";
    form.elements.note.value = row.note || "";
    form.dataset.originalId = block ? String(row.id) : "";
    const geometry = blockMapGeometry(row.map_boundary);
    dialog.querySelector("[data-area-block-map-summary]").innerHTML = geometry
      ? `<strong>Map ที่ Upload:</strong> ${html(geometry.type)} · จะคงไว้เมื่อแก้ไขข้อมูล Block`
      : `<strong>Map ที่ Upload:</strong> ยังไม่มี · สามารถเพิ่มจากปุ่ม Upload Map`;
    dialog.querySelector("[data-area-remove-uploaded-map]").hidden = !geometry;
    dialog.querySelector("[data-area-block-status]").textContent = "";
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => form.elements.block_code.focus());
  }

  function blockPayloadFromForm(form) {
    const original = form.dataset.originalId ? rawBlockById(form.dataset.originalId) : null;
    const areaRai = Math.max(0, numberOrNull(form.elements.area_rai.value) ?? 0);
    const treeCount = Math.max(0, integerOrNull(form.elements.tree_count.value) ?? 0);
    const plantingYear = integerOrNull(form.elements.planting_year.value);
    const blockCode = text(form.elements.block_code.value);
    const blockName = text(form.elements.block_name.value) || blockCode;
    const apCode = text(form.elements.ap_code.value) || blockCode;
    if (!blockCode) throw new Error("กรุณาระบุ Block Code");
    if (!blockName) throw new Error("กรุณาระบุ Block Name");
    if (!apCode) throw new Error("กรุณาระบุ AP Code");
    if (plantingYear != null && (plantingYear < 2450 || plantingYear > 2700)) throw new Error("ปีปลูกต้องเป็น พ.ศ. ที่ถูกต้อง");

    const now = new Date().toISOString();
    return filterBlockFields({
      ...(original || {}),
      id: form.elements.id.value,
      estate_id: form.elements.estate_id.value || null,
      zone_id: form.elements.zone_id.value || null,
      plot_id: original?.plot_id || null,
      block_code: blockCode,
      block_name: blockName,
      ap_code: apCode,
      area_rai: areaRai,
      area_hectare: areaRai ? Number((areaRai / 6.25).toFixed(6)) : 0,
      planting_year: plantingYear,
      palm_age: original?.palm_age ?? null,
      tree_count: treeCount,
      tree_per_rai: areaRai ? Number((treeCount / areaRai).toFixed(6)) : null,
      palm_variety: original?.palm_variety ?? null,
      terrain_type: text(form.elements.terrain_type.value) || null,
      rspo_status: form.elements.rspo_status.value || null,
      productive_status: text(form.elements.productive_status.value) || null,
      hcv_status: Boolean(original?.hcv_status),
      gps_lat: original?.gps_lat ?? null,
      gps_lng: original?.gps_lng ?? null,
      map_boundary: original?.map_boundary ?? null,
      status: form.elements.status.value || "active",
      note: text(form.elements.note.value) || null,
      ...(original?.created_at ? { created_at: original.created_at } : {}),
      updated_at: now,
    });
  }

  async function handleBlockFormSubmit(event) {
    event.preventDefault();
    if (ui.busy) return;
    const form = event.currentTarget;
    const status = form.querySelector("[data-area-block-status]");
    const save = form.querySelector("[data-area-block-save]");
    try {
      if (!canManageAreaMaster()) throw new Error("บัญชีนี้ไม่มีสิทธิ์แก้ไข Area Master");
      const payload = blockPayloadFromForm(form);
      ui.busy = true;
      save.disabled = true;
      status.textContent = "กำลังบันทึก...";
      await apiUpsertBlocks([payload], form.dataset.originalId ? "Area Master: edit Block" : "Area Master: add Block");
      status.textContent = "บันทึกสำเร็จ";
      await refreshAreaData();
      form.closest("dialog")?.close();
      toast(`บันทึก Block ${payload.block_code} แล้ว`);
    } catch (error) {
      status.textContent = `บันทึกไม่สำเร็จ: ${error.message}`;
    } finally {
      ui.busy = false;
      save.disabled = false;
    }
  }

  async function handleRemoveUploadedMap() {
    const dialog = ensureBlockDialog();
    const form = dialog.querySelector("[data-area-block-form]");
    const id = form.dataset.originalId;
    if (!id || ui.busy) return;
    const original = rawBlockById(id);
    if (!original || !blockMapGeometry(original.map_boundary)) return;
    if (!confirm(`ลบ Map ที่ Upload ของ Block ${original.block_code || original.block_name}?\n\nตัว Block จะไม่ถูกลบ และถ้ามี Legacy KMZ ระบบยังสามารถแสดง Legacy Map ได้`)) return;
    try {
      if (!canManageAreaMaster()) throw new Error("บัญชีนี้ไม่มีสิทธิ์แก้ไข Area Master");
      ui.busy = true;
      const payload = filterBlockFields({ ...original, map_boundary: null, updated_at: new Date().toISOString() });
      await apiUpsertBlocks([payload], "Area Master: remove uploaded map only");
      await refreshAreaData();
      dialog.close();
      toast(`ลบ Map ที่ Upload ของ ${original.block_code || original.block_name} แล้ว`);
    } catch (error) {
      dialog.querySelector("[data-area-block-status]").textContent = `ลบ Map ไม่สำเร็จ: ${error.message}`;
    } finally {
      ui.busy = false;
    }
  }

  function ensureMapDialog() {
    let dialog = document.querySelector("#areaMasterMapDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "areaMasterMapDialog";
    dialog.className = "area-admin-dialog area-admin-map-dialog";
    dialog.innerHTML = `
      <div class="area-admin-dialog-shell">
        <header>
          <div><small>Map Import · Preview ก่อนบันทึก</small><h3>Upload Map ราย Block</h3></div>
          <button type="button" class="ghost" data-area-map-close aria-label="ปิด">✕</button>
        </header>
        <section class="area-admin-map-intro">
          <strong>รองรับ KMZ / KML / GeoJSON</strong>
          <span>ระบบใช้ exact normalized match เท่านั้น ไม่มี fuzzy/nearest matching และจะยังไม่เขียนฐานข้อมูลจนกด “ยืนยัน Import”</span>
        </section>
        <div class="area-admin-map-stats" data-area-map-stats></div>
        <div class="table-wrap area-admin-map-preview-wrap">
          <table class="mini-table farm-table area-admin-map-preview">
            <thead><tr><th>#</th><th>ชื่อใน Map</th><th>Geometry</th><th>Match</th><th>Block Master</th><th>สถานะ</th></tr></thead>
            <tbody data-area-map-preview-body></tbody>
          </table>
        </div>
        <p class="area-admin-form-status" data-area-map-status role="status"></p>
        <footer>
          <button type="button" class="ghost" data-area-map-close>ยกเลิก</button>
          <button type="button" class="primary" data-area-map-confirm>ยืนยัน Import</button>
        </footer>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll("[data-area-map-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("[data-area-map-preview-body]").addEventListener("change", handleMapTargetChange);
    dialog.querySelector("[data-area-map-confirm]").addEventListener("click", confirmMapImport);
    return dialog;
  }

  function ringFromCoordinatesText(value) {
    return text(value).split(/\s+/).map((token) => token.split(",").slice(0, 2).map(Number))
      .filter((point) => point.length === 2 && point.every(Number.isFinite));
  }

  function polygonFromKmlNode(node) {
    const outer = node.querySelector("outerBoundaryIs LinearRing coordinates, LinearRing coordinates");
    const outerRing = ringFromCoordinatesText(outer?.textContent || "");
    if (outerRing.length < 3) return null;
    const holes = [...node.querySelectorAll("innerBoundaryIs LinearRing coordinates")]
      .map((item) => ringFromCoordinatesText(item.textContent || ""))
      .filter((ring) => ring.length >= 3);
    return [outerRing, ...holes];
  }

  function parseKmlText(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("ไฟล์ KML ไม่ถูกต้อง");
    const placemarks = [...doc.querySelectorAll("Placemark")];
    const features = [];
    for (const placemark of placemarks) {
      const name = text(placemark.querySelector(":scope > name")?.textContent) || `Placemark ${features.length + 1}`;
      const polygons = [...placemark.querySelectorAll("Polygon")].map(polygonFromKmlNode).filter(Boolean);
      if (!polygons.length) continue;
      features.push({
        type: "Feature",
        properties: { name },
        geometry: polygons.length === 1
          ? { type: "Polygon", coordinates: polygons[0] }
          : { type: "MultiPolygon", coordinates: polygons },
      });
    }
    if (!features.length) throw new Error("ไม่พบ Polygon ใน KML");
    return features;
  }

  function parseGeoJson(value) {
    const source = typeof value === "string" ? JSON.parse(value) : value;
    const input = source?.type === "FeatureCollection" ? source.features
      : source?.type === "Feature" ? [source]
        : source?.type ? [{ type: "Feature", properties: {}, geometry: source }] : [];
    const features = input.filter((feature) => ["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)).map((feature, index) => ({
      type: "Feature",
      properties: { ...(feature.properties || {}), name: feature.properties?.name || feature.properties?.block_name || feature.properties?.block_code || feature.id || `Feature ${index + 1}` },
      geometry: feature.geometry,
    }));
    if (!features.length) throw new Error("ไม่พบ Polygon/MultiPolygon ใน GeoJSON");
    return features;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") throw new Error("Browser นี้ยังไม่รองรับการแตก KMZ กรุณาใช้ KML หรือ GeoJSON");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extractKmlFromKmz(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 65557);
    for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error("KMZ/ZIP ไม่มี End of Central Directory");
    const entries = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder("utf-8");
    let selected = null;
    for (let index = 0; index < entries; index += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Central directory ของ KMZ ไม่ถูกต้อง");
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
      if (!selected && /\.kml$/i.test(name)) selected = { name, method, compressedSize, localOffset };
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    if (!selected) throw new Error("ไม่พบไฟล์ .kml ภายใน KMZ");
    if (view.getUint32(selected.localOffset, true) !== 0x04034b50) throw new Error("Local header ของ KMZ ไม่ถูกต้อง");
    const nameLen = view.getUint16(selected.localOffset + 26, true);
    const extraLen = view.getUint16(selected.localOffset + 28, true);
    const dataStart = selected.localOffset + 30 + nameLen + extraLen;
    const compressed = bytes.slice(dataStart, dataStart + selected.compressedSize);
    const plain = selected.method === 0 ? compressed : selected.method === 8 ? await inflateRaw(compressed) : null;
    if (!plain) throw new Error(`KMZ ใช้ compression method ${selected.method} ที่ยังไม่รองรับ`);
    return decoder.decode(plain);
  }

  async function parseMapFile(file) {
    const name = file.name || "map";
    const lower = name.toLowerCase();
    let features;
    if (lower.endsWith(".kmz")) features = parseKmlText(await extractKmlFromKmz(file));
    else if (lower.endsWith(".kml")) features = parseKmlText(await file.text());
    else if (lower.endsWith(".geojson") || lower.endsWith(".json")) features = parseGeoJson(await file.text());
    else throw new Error("รองรับเฉพาะ .kmz, .kml, .geojson และ .json");
    return { fileName: name, features };
  }

  function buildMapMatchIndex() {
    const blocks = canonicalBlocks();
    const index = new Map();
    for (const block of blocks) {
      for (const [source, value] of [["block_name", block.block_name], ["block_code", block.block_code]]) {
        const key = normalizeMapKey(value);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ block, source });
      }
    }
    return index;
  }

  function makeMapDraft(parsed) {
    const matchIndex = buildMapMatchIndex();
    const rows = parsed.features.map((feature, index) => {
      const mapName = text(feature.properties?.name || feature.properties?.block_name || feature.properties?.block_code) || `Polygon ${index + 1}`;
      const key = normalizeMapKey(mapName);
      const matches = matchIndex.get(key) || [];
      const uniqueById = [...new Map(matches.map((entry) => [String(entry.block.id), entry])).values()];
      return {
        index,
        feature,
        mapName,
        mapKey: key,
        matchSource: uniqueById.length === 1 ? uniqueById[0].source : "",
        targetBlockId: uniqueById.length === 1 ? String(uniqueById[0].block.id) : "",
        autoStatus: uniqueById.length === 1 ? "matched" : uniqueById.length > 1 ? "conflict" : "unmatched",
      };
    });
    return { ...parsed, rows };
  }

  function mapTargetOptions(selectedId = "") {
    const blocks = [...canonicalBlocks()].sort((a, b) => String(a.block_code || a.block_name).localeCompare(String(b.block_code || b.block_name), "th", { numeric: true }));
    return `<option value="">— เลือก Block —</option>${blocks.map((block) => {
      const label = [block.block_code || block.block_name, block.block_name && block.block_name !== block.block_code ? block.block_name : "", block.ap_code || ""].filter(Boolean).join(" · ");
      return `<option value="${html(block.id)}"${String(block.id) === String(selectedId) ? " selected" : ""}>${html(label)}</option>`;
    }).join("")}`;
  }

  function validateMapDraft(draft = ui.mapDraft) {
    if (!draft) return { ok: false, unmapped: 0, duplicates: 0, mapped: 0 };
    const mappedRows = draft.rows.filter((row) => row.targetBlockId);
    const counts = new Map();
    for (const row of mappedRows) counts.set(row.targetBlockId, (counts.get(row.targetBlockId) || 0) + 1);
    const duplicateIds = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
    for (const row of draft.rows) row.duplicateTarget = Boolean(row.targetBlockId && duplicateIds.has(row.targetBlockId));
    return {
      ok: mappedRows.length === draft.rows.length && duplicateIds.size === 0,
      unmapped: draft.rows.length - mappedRows.length,
      duplicates: duplicateIds.size,
      mapped: mappedRows.length,
    };
  }

  function renderMapDraft() {
    const dialog = ensureMapDialog();
    const body = dialog.querySelector("[data-area-map-preview-body]");
    const statsNode = dialog.querySelector("[data-area-map-stats]");
    const confirmButton = dialog.querySelector("[data-area-map-confirm]");
    const draft = ui.mapDraft;
    if (!draft) return;
    const validation = validateMapDraft(draft);
    statsNode.innerHTML = `
      <span><b>${draft.rows.length}</b> Polygon/Feature</span>
      <span class="ok"><b>${validation.mapped}</b> จับคู่แล้ว</span>
      <span class="${validation.unmapped ? "warn" : "ok"}"><b>${validation.unmapped}</b> ยังไม่จับคู่</span>
      <span class="${validation.duplicates ? "bad" : "ok"}"><b>${validation.duplicates}</b> Block ซ้ำ</span>
      <span><b>${html(draft.fileName)}</b></span>`;
    body.innerHTML = draft.rows.map((row) => {
      const status = row.duplicateTarget ? "conflict" : row.targetBlockId ? (row.autoStatus === "matched" ? "matched" : "manual") : row.autoStatus;
      const label = status === "matched" ? `Exact ${row.matchSource}` : status === "manual" ? "Manual" : status === "conflict" ? "Conflict" : "Unmatched";
      return `<tr data-area-map-row="${row.index}" class="status-${status}">
        <td>${row.index + 1}</td>
        <td><strong>${html(row.mapName)}</strong><small>${html(row.mapKey)}</small></td>
        <td>${html(row.feature.geometry?.type || "-")}</td>
        <td>${html(row.autoStatus === "matched" ? `Exact ${row.matchSource}` : row.autoStatus)}</td>
        <td><select data-area-map-target="${row.index}">${mapTargetOptions(row.targetBlockId)}</select></td>
        <td><span class="area-map-match-badge ${status}">${html(label)}</span></td>
      </tr>`;
    }).join("");
    confirmButton.disabled = !validation.ok || ui.busy;
    dialog.querySelector("[data-area-map-status]").textContent = validation.ok
      ? "พร้อม Import · ระบบจะเขียนเฉพาะ blocks.map_boundary ของ Block ที่จับคู่แล้ว"
      : "กรุณาจับคู่ทุก Polygon และแก้ Block ซ้ำก่อน Import";
  }

  function handleMapTargetChange(event) {
    const select = event.target.closest("[data-area-map-target]");
    if (!select || !ui.mapDraft) return;
    const row = ui.mapDraft.rows[Number(select.dataset.areaMapTarget)];
    if (!row) return;
    row.targetBlockId = select.value;
    if (row.targetBlockId && row.autoStatus !== "matched") row.autoStatus = "manual";
    renderMapDraft();
  }

  async function openMapUpload(file) {
    if (!file) return;
    const dialog = ensureMapDialog();
    dialog.querySelector("[data-area-map-status]").textContent = "กำลังอ่านไฟล์ Map...";
    if (!dialog.open) dialog.showModal();
    try {
      ui.mapDraft = makeMapDraft(await parseMapFile(file));
      renderMapDraft();
    } catch (error) {
      ui.mapDraft = null;
      dialog.querySelector("[data-area-map-preview-body]").innerHTML = "";
      dialog.querySelector("[data-area-map-stats]").innerHTML = "";
      dialog.querySelector("[data-area-map-status]").textContent = `อ่านไฟล์ไม่สำเร็จ: ${error.message}`;
      dialog.querySelector("[data-area-map-confirm]").disabled = true;
    }
  }

  function boundaryPayload(row, fileName) {
    return {
      type: "Feature",
      properties: {
        source_file: fileName,
        source_name: row.mapName,
        imported_at: new Date().toISOString(),
        imported_via: "area-master-admin-v1",
        map_key: row.mapKey,
      },
      geometry: row.feature.geometry,
    };
  }

  async function confirmMapImport() {
    const dialog = ensureMapDialog();
    const status = dialog.querySelector("[data-area-map-status]");
    const button = dialog.querySelector("[data-area-map-confirm]");
    const draft = ui.mapDraft;
    const validation = validateMapDraft(draft);
    if (!draft || !validation.ok || ui.busy) return;
    if (!canManageAreaMaster()) {
      status.textContent = "บัญชีนี้ไม่มีสิทธิ์แก้ไข Area Master";
      return;
    }
    if (!confirm(`ยืนยัน Import Map ${draft.rows.length} รายการจาก ${draft.fileName}?\n\nระบบจะอัปเดตเฉพาะ blocks.map_boundary และไม่ลบ Block`)) return;
    try {
      ui.busy = true;
      button.disabled = true;
      status.textContent = "กำลังบันทึก Map ลง Block Master...";
      const rows = draft.rows.map((mapRow) => {
        const block = rawBlockById(mapRow.targetBlockId);
        if (!block) throw new Error(`ไม่พบ Block UUID ${mapRow.targetBlockId}`);
        return filterBlockFields({
          ...block,
          map_boundary: boundaryPayload(mapRow, draft.fileName),
          updated_at: new Date().toISOString(),
        });
      });
      await apiUpsertBlocks(rows, `Area Master: import map ${draft.fileName}`);
      await refreshAreaData();
      dialog.close();
      toast(`Import Map สำเร็จ ${rows.length} Block`);
      ui.mapDraft = null;
    } catch (error) {
      status.textContent = `Import ไม่สำเร็จ: ${error.message}`;
    } finally {
      ui.busy = false;
      button.disabled = false;
    }
  }

  function ensureUploadInput() {
    let input = document.querySelector("#areaMasterMapFileInput");
    if (input) return input;
    input = document.createElement("input");
    input.id = "areaMasterMapFileInput";
    input.type = "file";
    input.accept = ".kmz,.kml,.geojson,.json,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml,application/geo+json,application/json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) await openMapUpload(file);
    });
    document.body.appendChild(input);
    return input;
  }

  function viewBlockOnMap(id) {
    try { state.farmDetailId = id; } catch (_) {}
    if (typeof render === "function") render();
    queueMicrotask(() => document.querySelector(".farm-area-map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addToolbar(board) {
    if (board.querySelector(`[${TOOLBAR_ATTR}]`)) return;
    const canManage = canManageAreaMaster();
    const dbMapCount = canonicalBlocks().filter((block) => blockMapGeometry(block.map_boundary)).length;
    const toolbar = document.createElement("section");
    toolbar.className = "area-admin-toolbar";
    toolbar.setAttribute(TOOLBAR_ATTR, "");
    toolbar.innerHTML = `
      <div class="area-admin-toolbar-copy">
        <strong>จัดการ Area Master</strong>
        <span>เพิ่ม/แก้ไขข้อมูลถึงราย Block และ Upload Map แบบ Preview → Match → Confirm</span>
      </div>
      <div class="area-admin-toolbar-status"><span>DB Map <b>${dbMapCount}</b></span><span>Block <b>${canonicalBlocks().length}</b></span></div>
      <div class="area-admin-toolbar-actions">
        <button type="button" class="primary" data-area-add-block ${canManage ? "" : "disabled"}>+ เพิ่ม Block</button>
        <button type="button" data-area-upload-map ${canManage ? "" : "disabled"}>Upload Map</button>
      </div>
      ${canManage ? "" : `<small class="area-admin-readonly">โหมดอ่านอย่างเดียว: ต้องเป็น Admin / Manager เพื่อแก้ไข Master</small>`}`;
    board.prepend(toolbar);
  }

  function decorateAreaTable(board) {
    const rows = [...board.querySelectorAll("tr[data-farm-area-block-row]")];
    for (const row of rows) {
      const table = row.closest("table");
      const header = table?.querySelector("thead tr");
      if (header && !header.querySelector("[data-area-actions-header]")) {
        const th = document.createElement("th");
        th.setAttribute("data-area-actions-header", "");
        th.textContent = "จัดการ";
        header.appendChild(th);
      }
      if (!row.querySelector("[data-area-actions-cell]")) {
        const id = row.dataset.farmAreaBlockRow;
        const td = document.createElement("td");
        td.setAttribute("data-area-actions-cell", "");
        td.className = "area-admin-row-actions";
        td.innerHTML = `<button type="button" class="compact" data-area-edit-block="${html(id)}">แก้ไข</button><button type="button" class="compact ghost" data-area-view-map="${html(id)}">แผนที่</button>`;
        row.appendChild(td);
      }
    }
  }

  function enhance() {
    ui.enhanceQueued = false;
    if (!isFarmAreaView()) return;
    mergeDbMapBoundariesIntoState();
    const board = document.querySelector(".farm-area-board");
    if (!board) return;
    addToolbar(board);
    decorateAreaTable(board);
  }

  function queueEnhance() {
    if (ui.enhanceQueued) return;
    ui.enhanceQueued = true;
    queueMicrotask(enhance);
  }

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-area-add-block]");
    if (add) { populateBlockDialog(null); return; }
    const edit = event.target.closest("[data-area-edit-block]");
    if (edit) { populateBlockDialog(rawBlockById(edit.dataset.areaEditBlock)); return; }
    const map = event.target.closest("[data-area-view-map]");
    if (map) { viewBlockOnMap(map.dataset.areaViewMap); return; }
    const upload = event.target.closest("[data-area-upload-map]");
    if (upload) ensureUploadInput().click();
  });

  const observer = new MutationObserver(queueEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", queueEnhance);
  window.addEventListener("hashchange", queueEnhance);
  document.addEventListener("DOMContentLoaded", queueEnhance, { once: true });
  queueEnhance();

  // Expose only a tiny diagnostic surface. No credentials or session values are included.
  window.__AREA_MASTER_ADMIN_V1__ = {
    version: VERSION,
    enhance: queueEnhance,
    parseGeoJson,
    parseKmlText,
    deriveBlockGroup,
    normalizeMapKey,
  };
})();
