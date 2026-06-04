CREATE DATABASE IF NOT EXISTS palm_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE palm_management;

CREATE TABLE companies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE estates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_estates_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE datagroups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE terrains (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  estate_id BIGINT UNSIGNED NULL,
  parent_id BIGINT UNSIGNED NULL,
  code VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  terrain_type VARCHAR(80) NULL,
  crop_year SMALLINT NULL,
  structure_level INT NULL,
  area_rai DECIMAL(14,4) NULL,
  area_ha DECIMAL(14,4) NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  geometry_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_terrains_estate FOREIGN KEY (estate_id) REFERENCES estates(id),
  CONSTRAINT fk_terrains_parent FOREIGN KEY (parent_id) REFERENCES terrains(id),
  INDEX idx_terrains_parent (parent_id),
  INDEX idx_terrains_crop_year (crop_year),
  INDEX idx_terrains_estate (estate_id)
) ENGINE=InnoDB;

CREATE TABLE activity_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  datagroup_id BIGINT UNSIGNED NULL,
  CONSTRAINT fk_activity_groups_datagroup FOREIGN KEY (datagroup_id) REFERENCES datagroups(id)
) ENGINE=InnoDB;

CREATE TABLE activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_group_id BIGINT UNSIGNED NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  unit VARCHAR(40) NULL,
  crop VARCHAR(80) NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  is_indirect_cost TINYINT(1) DEFAULT 0,
  CONSTRAINT fk_activities_group FOREIGN KEY (activity_group_id) REFERENCES activity_groups(id),
  INDEX idx_activities_group (activity_group_id)
) ENGINE=InnoDB;

CREATE TABLE partners (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_code VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  partner_type VARCHAR(80) NULL,
  identity_type VARCHAR(80) NULL,
  identity_no VARCHAR(120) NULL,
  gang_code VARCHAR(80) NULL,
  designation VARCHAR(120) NULL,
  nationality VARCHAR(120) NULL,
  start_date DATE NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_partners_gang (gang_code),
  INDEX idx_partners_type (partner_type)
) ENGINE=InnoDB;

CREATE TABLE contracts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_code VARCHAR(80) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  contract_name VARCHAR(255) NULL,
  contract_type VARCHAR(80) NULL,
  supplier_partner_id BIGINT UNSIGNED NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  datagroup_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract_version (contract_code, version_no),
  CONSTRAINT fk_contract_supplier FOREIGN KEY (supplier_partner_id) REFERENCES partners(id),
  CONSTRAINT fk_contract_datagroup FOREIGN KEY (datagroup_id) REFERENCES datagroups(id)
) ENGINE=InnoDB;

CREATE TABLE contract_terrains (
  contract_id BIGINT UNSIGNED NOT NULL,
  terrain_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (contract_id, terrain_id),
  CONSTRAINT fk_contract_terrains_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_terrains_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id)
) ENGINE=InnoDB;

CREATE TABLE contract_activities (
  contract_id BIGINT UNSIGNED NOT NULL,
  activity_id BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(16,4) NULL,
  unit VARCHAR(40) NULL,
  PRIMARY KEY (contract_id, activity_id),
  CONSTRAINT fk_contract_activities_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_activities_activity FOREIGN KEY (activity_id) REFERENCES activities(id)
) ENGINE=InnoDB;

CREATE TABLE material_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE materials (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  material_group_id BIGINT UNSIGNED NULL,
  code VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  base_unit VARCHAR(40) NULL,
  crop VARCHAR(80) NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  harvest_unit VARCHAR(40) NULL,
  weighbridge_conversion DECIMAL(18,6) NULL,
  specific_weight DECIMAL(18,6) NULL,
  CONSTRAINT fk_materials_group FOREIGN KEY (material_group_id) REFERENCES material_groups(id),
  INDEX idx_materials_group (material_group_id)
) ENGINE=InnoDB;

CREATE TABLE warehouses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  estate_id BIGINT UNSIGNED NULL,
  location VARCHAR(255) NULL,
  CONSTRAINT fk_warehouses_estate FOREIGN KEY (estate_id) REFERENCES estates(id)
) ENGINE=InnoDB;

CREATE TABLE terrain_materials (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  terrain_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  characteristic VARCHAR(120) NULL,
  dosage DECIMAL(18,6) NULL,
  rate DECIMAL(18,6) NULL,
  UNIQUE KEY uq_terrain_material (terrain_id, material_id, characteristic),
  CONSTRAINT fk_terrain_materials_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id),
  CONSTRAINT fk_terrain_materials_material FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

CREATE TABLE plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_code VARCHAR(80) NOT NULL UNIQUE,
  plan_name VARCHAR(255) NOT NULL,
  crop_phase VARCHAR(120) NULL,
  budget_calendar VARCHAR(120) NULL,
  owner_partner_id BIGINT UNSIGNED NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_plans_owner FOREIGN KEY (owner_partner_id) REFERENCES partners(id)
) ENGINE=InnoDB;

CREATE TABLE work_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NULL,
  contract_id BIGINT UNSIGNED NULL,
  activity_id BIGINT UNSIGNED NOT NULL,
  work_order_no VARCHAR(80) NOT NULL,
  work_order_type VARCHAR(80) NULL,
  status ENUM('PLANNED','SCHEDULED','EXECUTED_ACTIVE','EXECUTED_CLOSED','CANCELLED') DEFAULT 'PLANNED',
  planned_start_date DATE NULL,
  planned_end_date DATE NULL,
  scheduled_start_date DATE NULL,
  scheduled_end_date DATE NULL,
  executed_start_date DATE NULL,
  executed_end_date DATE NULL,
  planned_qty DECIMAL(18,4) DEFAULT 0,
  actual_qty DECIMAL(18,4) DEFAULT 0,
  unit VARCHAR(40) NULL,
  planned_cost DECIMAL(18,2) DEFAULT 0,
  scheduled_cost DECIMAL(18,2) DEFAULT 0,
  executed_cost DECIMAL(18,2) DEFAULT 0,
  remark TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_work_order_no (work_order_no),
  CONSTRAINT fk_work_orders_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT fk_work_orders_contract FOREIGN KEY (contract_id) REFERENCES contracts(id),
  CONSTRAINT fk_work_orders_activity FOREIGN KEY (activity_id) REFERENCES activities(id),
  INDEX idx_work_orders_status_dates (status, scheduled_start_date, scheduled_end_date)
) ENGINE=InnoDB;

CREATE TABLE work_order_terrains (
  work_order_id BIGINT UNSIGNED NOT NULL,
  terrain_id BIGINT UNSIGNED NOT NULL,
  selected_area_ha DECIMAL(14,4) NULL,
  PRIMARY KEY (work_order_id, terrain_id),
  CONSTRAINT fk_work_order_terrains_wo FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_work_order_terrains_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id)
) ENGINE=InnoDB;

CREATE TABLE daily_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  work_order_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  partner_id BIGINT UNSIGNED NULL,
  gang_code VARCHAR(80) NULL,
  terrain_id BIGINT UNSIGNED NULL,
  qty DECIMAL(18,4) DEFAULT 0,
  unit VARCHAR(40) NULL,
  labour_cost DECIMAL(18,2) DEFAULT 0,
  material_cost DECIMAL(18,2) DEFAULT 0,
  equipment_cost DECIMAL(18,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'OPEN',
  remark TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_entries_wo FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
  CONSTRAINT fk_daily_entries_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_daily_entries_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id),
  INDEX idx_daily_entries_date_terrain (work_date, terrain_id),
  INDEX idx_daily_entries_gang (gang_code)
) ENGINE=InnoDB;

CREATE TABLE weighbridges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  datagroup_id BIGINT UNSIGNED NULL,
  CONSTRAINT fk_weighbridges_datagroup FOREIGN KEY (datagroup_id) REFERENCES datagroups(id)
) ENGINE=InnoDB;

CREATE TABLE weighbridge_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(120) NOT NULL UNIQUE,
  weighbridge_id BIGINT UNSIGNED NULL,
  ticket_date DATE NOT NULL,
  material_id BIGINT UNSIGNED NULL,
  partner_id BIGINT UNSIGNED NULL,
  terrain_id BIGINT UNSIGNED NULL,
  gross_weight_kg DECIMAL(18,3) DEFAULT 0,
  tare_weight_kg DECIMAL(18,3) DEFAULT 0,
  net_weight_kg DECIMAL(18,3) GENERATED ALWAYS AS (gross_weight_kg - tare_weight_kg) STORED,
  assigned_weight_kg DECIMAL(18,3) DEFAULT 0,
  settlement_status VARCHAR(50) DEFAULT 'PENDING',
  source_file VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_weighbridge FOREIGN KEY (weighbridge_id) REFERENCES weighbridges(id),
  CONSTRAINT fk_tickets_material FOREIGN KEY (material_id) REFERENCES materials(id),
  CONSTRAINT fk_tickets_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_tickets_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id),
  INDEX idx_tickets_date_status (ticket_date, settlement_status),
  INDEX idx_tickets_terrain_date (terrain_id, ticket_date)
) ENGINE=InnoDB;

CREATE TABLE harvest_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  daily_entry_id BIGINT UNSIGNED NULL,
  weighbridge_ticket_id BIGINT UNSIGNED NULL,
  harvest_date DATE NOT NULL,
  terrain_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NULL,
  bunch_count DECIMAL(18,3) DEFAULT 0,
  weight_kg DECIMAL(18,3) DEFAULT 0,
  abw_kg DECIMAL(18,6) GENERATED ALWAYS AS (CASE WHEN bunch_count > 0 THEN weight_kg / bunch_count ELSE NULL END) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_harvest_daily FOREIGN KEY (daily_entry_id) REFERENCES daily_entries(id),
  CONSTRAINT fk_harvest_ticket FOREIGN KEY (weighbridge_ticket_id) REFERENCES weighbridge_tickets(id),
  CONSTRAINT fk_harvest_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id),
  CONSTRAINT fk_harvest_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  INDEX idx_harvest_date_terrain (harvest_date, terrain_id)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movement_no VARCHAR(120) NOT NULL UNIQUE,
  movement_date DATE NOT NULL,
  movement_type ENUM('GOOD_RECEIPT','GOOD_ISSUE','TRANSFER','GOOD_DELIVERY','SKU_CONVERT','AMEND_MOVEMENT','STOCK_TAKE','ISSUE_RETURN') NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NULL,
  target_warehouse_id BIGINT UNSIGNED NULL,
  partner_id BIGINT UNSIGNED NULL,
  terrain_id BIGINT UNSIGNED NULL,
  sku VARCHAR(120) NULL,
  qty_base_unit DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(18,6) DEFAULT 0,
  total_cost DECIMAL(18,2) GENERATED ALWAYS AS (qty_base_unit * unit_cost) STORED,
  ref_doc_type VARCHAR(80) NULL,
  ref_doc_no VARCHAR(120) NULL,
  origin VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movements_material FOREIGN KEY (material_id) REFERENCES materials(id),
  CONSTRAINT fk_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_movements_target_warehouse FOREIGN KEY (target_warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_movements_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_movements_terrain FOREIGN KEY (terrain_id) REFERENCES terrains(id),
  INDEX idx_movements_date_type (movement_date, movement_type),
  INDEX idx_movements_material_warehouse (material_id, warehouse_id)
) ENGINE=InnoDB;

CREATE TABLE stock_balances (
  warehouse_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(120) NOT NULL DEFAULT '',
  qty_base_unit DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (warehouse_id, material_id, sku),
  CONSTRAINT fk_stock_balances_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_stock_balances_material FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

CREATE TABLE stock_takes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_take_no VARCHAR(120) NOT NULL UNIQUE,
  stock_take_date DATE NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  counted_qty DECIMAL(18,4) NOT NULL,
  system_qty DECIMAL(18,4) NOT NULL,
  variance_qty DECIMAL(18,4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  remark TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_takes_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_stock_takes_material FOREIGN KEY (material_id) REFERENCES materials(id),
  INDEX idx_stock_takes_date (stock_take_date)
) ENGINE=InnoDB;

CREATE TABLE checkroll_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_code VARCHAR(80) NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  budget_code VARCHAR(80) NULL,
  status VARCHAR(50) DEFAULT 'OPEN',
  UNIQUE KEY uq_checkroll_period (group_code, period_from, period_to)
) ENGINE=InnoDB;

CREATE TABLE employee_allowance_deductions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  checkroll_period_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('ALLOWANCE','DEDUCTION') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ad_period FOREIGN KEY (checkroll_period_id) REFERENCES checkroll_periods(id),
  CONSTRAINT fk_ad_partner FOREIGN KEY (partner_id) REFERENCES partners(id)
) ENGINE=InnoDB;

CREATE TABLE approvals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
  requested_by VARCHAR(120) NULL,
  approved_by VARCHAR(120) NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  remark TEXT NULL,
  INDEX idx_approvals_entity (entity_type, entity_id),
  INDEX idx_approvals_status (status)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vw_daily_harvest_by_block AS
SELECT
  h.harvest_date,
  e.code AS estate_code,
  t.code AS terrain_code,
  t.description AS terrain_description,
  t.crop_year,
  SUM(h.bunch_count) AS bunch_count,
  SUM(h.weight_kg) AS weight_kg,
  CASE WHEN SUM(h.bunch_count) > 0 THEN SUM(h.weight_kg) / SUM(h.bunch_count) ELSE NULL END AS abw_kg
FROM harvest_records h
JOIN terrains t ON t.id = h.terrain_id
LEFT JOIN estates e ON e.id = t.estate_id
GROUP BY h.harvest_date, e.code, t.code, t.description, t.crop_year;

CREATE OR REPLACE VIEW vw_stock_balance_by_material AS
SELECT
  w.code AS warehouse_code,
  m.code AS material_code,
  m.description AS material_description,
  SUM(sb.qty_base_unit) AS qty_base_unit,
  SUM(sb.total_cost) AS total_cost
FROM stock_balances sb
JOIN warehouses w ON w.id = sb.warehouse_id
JOIN materials m ON m.id = sb.material_id
GROUP BY w.code, m.code, m.description;

