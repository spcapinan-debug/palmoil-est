-- Keep one budget/rate model only:
-- budget_activity_rates = contract/rate header by block/activity
-- budget_rate_materials = material lines for that rate
-- budget_rate_roles = wage, allowance, deduction and survey-adjustment lines

drop view if exists public.budget_activity_rate_editor;

create or replace view public.budget_activity_rate_editor
with (security_invoker = true)
as
select
  id,
  fiscal_year,
  rate_code,
  activity_group_name,
  activity_code,
  activity_name,
  rate_type,
  calculation_method,
  comparison_basis,
  unit_name,
  rate_amount,
  rate_text,
  estate_name,
  zone_name,
  plot_group_code,
  terrain_code,
  ap_code,
  area_rai,
  tree_count,
  effective_from,
  effective_to,
  approval_status,
  status,
  note,
  updated_at
from public.budget_activity_rates;

comment on view public.budget_activity_rate_editor is
  'Compact editor projection for budget_activity_rates. Legacy budget_rates and import rows were removed to avoid duplicate rate sources.';

drop table if exists public.budget_rate_import_rows cascade;
drop table if exists public.budget_rates cascade;
