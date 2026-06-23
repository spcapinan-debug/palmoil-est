alter table public.areas
  add column if not exists estate_name text,
  add column if not exists zone_name text,
  add column if not exists plot_group_code text,
  add column if not exists payroll_department_code text,
  add column if not exists payroll_code_description text,
  add column if not exists source_row integer;

create index if not exists areas_estate_name_idx on public.areas(estate_name);
create index if not exists areas_zone_name_idx on public.areas(zone_name);
create index if not exists areas_plot_group_code_idx on public.areas(plot_group_code);
create index if not exists areas_payroll_department_code_idx on public.areas(payroll_department_code);

