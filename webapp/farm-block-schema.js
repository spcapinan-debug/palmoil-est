(function exposeFarmBlockSchema(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FarmBlockSchema = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createFarmBlockSchema() {
  "use strict";

  const BLOCK_STATUS_OPTIONS = Object.freeze([
    Object.freeze({ value: "active", label: "ใช้งาน" }),
  ]);
  const BLOCK_RSPO_OPTIONS = Object.freeze([
    Object.freeze({ value: "RSPO", label: "RSPO" }),
    Object.freeze({ value: "Non-RSPO", label: "Non-RSPO" }),
  ]);

  const FARM_BLOCK_FIELD_SCHEMA = Object.freeze([
    { dbField: "block_name", label: "Block Name", type: "text", value: "block_name", displayFormatter: "text", optionsSource: null, validation: { required: true, maxLength: 120 }, editable: true, table: true },
    { dbField: "block_code", label: "Block Code", type: "text", value: "block_code", displayFormatter: "text", optionsSource: null, validation: { required: true, maxLength: 120 }, editable: true, table: true },
    { dbField: "plot_id", label: "AP Code / Plot", type: "select", value: "plot_id", displayFormatter: "plot", optionsSource: "plots", validation: { nullable: true }, editable: true, table: true },
    { dbField: "estate_id", label: "Estate", type: "select", value: "estate_id", displayFormatter: "estate", optionsSource: "estates", validation: { required: true }, editable: true, table: true },
    { dbField: "zone_id", label: "Zone", type: "select", value: "zone_id", displayFormatter: "zone", optionsSource: "zones", validation: { nullable: true }, editable: true, table: true },
    { dbField: null, label: "Block Group", type: "derived", value: "blockGroupCode", displayFormatter: "blockGroup", optionsSource: null, validation: {}, editable: false, table: true },
    { dbField: "planting_year", label: "Planting Year", type: "integer", value: "planting_year", displayFormatter: "integer", optionsSource: null, validation: { nullable: true, minimum: 2400, maximum: 2700 }, editable: true, table: true },
    { dbField: "area_rai", label: "Area Rai", type: "number", value: "area_rai", displayFormatter: "number", optionsSource: null, validation: { nullable: true, minimum: 0 }, editable: true, table: true },
    { dbField: "tree_count", label: "Tree Count", type: "integer", value: "tree_count", displayFormatter: "integer", optionsSource: null, validation: { nullable: true, minimum: 0 }, editable: true, table: true },
    { dbField: "rspo_status", label: "RSPO Status", type: "select", value: "rspo_status", displayFormatter: "rspo", optionsSource: "rspoStatuses", validation: { required: true }, editable: true, table: true },
    { dbField: "palm_variety", label: "Palm Variety", type: "text", value: "palm_variety", displayFormatter: "text", optionsSource: null, validation: { nullable: true, maxLength: 120 }, editable: true },
    { dbField: "terrain_type", label: "Terrain Type", type: "text", value: "terrain_type", displayFormatter: "text", optionsSource: null, validation: { nullable: true, maxLength: 120 }, editable: true },
    { dbField: "productive_status", label: "Productive Status", type: "text", value: "productive_status", displayFormatter: "text", optionsSource: null, validation: { nullable: true }, editable: false },
    { dbField: "hcv_status", label: "HCV", type: "boolean", value: "hcv_status", displayFormatter: "boolean", optionsSource: "boolean", validation: { required: true }, editable: true },
    { dbField: "status", label: "สถานะ Block", type: "select", value: "status", displayFormatter: "blockStatus", optionsSource: "blockStatuses", validation: { required: true }, editable: true, table: true },
    { dbField: "note", label: "Note", type: "textarea", value: "note", displayFormatter: "text", optionsSource: null, validation: { nullable: true, maxLength: 2000 }, editable: true },
    { dbField: "gps_lat", label: "GPS Latitude", type: "number", value: "gps_lat", displayFormatter: "number", optionsSource: null, validation: { nullable: true, minimum: -90, maximum: 90 }, editable: true },
    { dbField: "gps_lng", label: "GPS Longitude", type: "number", value: "gps_lng", displayFormatter: "number", optionsSource: null, validation: { nullable: true, minimum: -180, maximum: 180 }, editable: true },
    { dbField: null, label: "Map Status", type: "derived", value: "map_status", displayFormatter: "mapStatus", optionsSource: null, validation: {}, editable: false, table: true },
    { dbField: null, label: "Map Version", type: "derived", value: "map_version", displayFormatter: "mapVersion", optionsSource: null, validation: {}, editable: false },
  ].map(Object.freeze));

  function presentationKey(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function estateDisplayName(value = "") {
    const raw = String(value || "").trim();
    if (["สวนคีรีรัฐนิคม", "สวนคีรีรัฐ", "kirirat"].includes(presentationKey(raw))) return "Kirirat";
    return raw || "ไม่ระบุพื้นที่";
  }

  function zoneDisplayName(value = "") {
    const raw = String(value || "").trim();
    if (["ตอนบน", "upper"].includes(presentationKey(raw))) return "Upper";
    if (["ตอนล่าง", "lower"].includes(presentationKey(raw))) return "Lower";
    return raw || "ยังไม่ระบุ Zone";
  }

  function farmBlockGroup(block = {}, plotGroup = {}) {
    const direct = [plotGroup.group_code, plotGroup.group_name, block.plot_group_code, block.plot_group_name, block.plot_group]
      .map((value) => String(value || "").trim()).find(Boolean);
    if (direct) return direct;
    const source = [block.block_name, block.area_name, block.terrain_code, block.area_code, block.block_code]
      .map((value) => String(value || "").trim().toUpperCase()).find(Boolean) || "";
    return source.match(/^\d{2}-([A-Z]+)\d+/)?.[1]
      || source.match(/^((?!BA)[A-Z]+)\d+/)?.[1]
      || source.match(/-([A-Z]+)\d+/)?.[1]
      || "ไม่ระบุกลุ่ม";
  }

  function optionLabel(options, value, fallback = "-") {
    return options.find((option) => option.value === value)?.label || fallback;
  }

  function statusLabel(value) {
    return optionLabel(BLOCK_STATUS_OPTIONS, value, String(value || "-"));
  }

  function rspoLabel(value) {
    return optionLabel(BLOCK_RSPO_OPTIONS, value, String(value || "-"));
  }

  function validateBlockChanges(input = {}) {
    const changes = {};
    const errors = [];
    const editableByField = new Map(FARM_BLOCK_FIELD_SCHEMA.filter((field) => field.editable && field.dbField).map((field) => [field.dbField, field]));
    for (const [dbField, rawValue] of Object.entries(input || {})) {
      const field = editableByField.get(dbField);
      if (!field) {
        errors.push({ field: dbField, message: `${dbField} is not editable` });
        continue;
      }
      const rules = field.validation || {};
      const empty = rawValue == null || (typeof rawValue === "string" && rawValue.trim() === "");
      if (empty) {
        if (rules.required) errors.push({ field: dbField, message: `${field.label} is required` });
        else changes[dbField] = null;
        continue;
      }
      let value = rawValue;
      if (["text", "textarea", "select"].includes(field.type)) value = String(rawValue).trim();
      if (field.type === "number" || field.type === "integer") {
        value = Number(rawValue);
        if (!Number.isFinite(value) || (field.type === "integer" && !Number.isInteger(value))) {
          errors.push({ field: dbField, message: `${field.label} must be a valid ${field.type}` });
          continue;
        }
      }
      if (field.type === "boolean" && typeof value !== "boolean") {
        errors.push({ field: dbField, message: `${field.label} must be true or false` });
        continue;
      }
      if (rules.maxLength && String(value).length > rules.maxLength) errors.push({ field: dbField, message: `${field.label} is too long` });
      if (rules.minimum != null && Number(value) < rules.minimum) errors.push({ field: dbField, message: `${field.label} is below the minimum` });
      if (rules.maximum != null && Number(value) > rules.maximum) errors.push({ field: dbField, message: `${field.label} exceeds the maximum` });
      changes[dbField] = value;
    }
    return { changes, errors };
  }

  return Object.freeze({
    BLOCK_RSPO_OPTIONS,
    BLOCK_STATUS_OPTIONS,
    FARM_BLOCK_FIELD_SCHEMA,
    estateDisplayName,
    farmBlockGroup,
    optionLabel,
    rspoLabel,
    statusLabel,
    validateBlockChanges,
    zoneDisplayName,
  });
}));
