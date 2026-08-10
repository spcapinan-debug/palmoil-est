-- Existing project default privileges can grant every table privilege to
-- service_role. Area map history is append/update-only: no runtime delete,
-- truncate, trigger, or reference privilege is required.
revoke all on table public.area_map_versions from service_role;
grant select, insert, update on table public.area_map_versions to service_role;

revoke all on sequence public.area_map_versions_version_no_seq from service_role;
grant usage, select on sequence public.area_map_versions_version_no_seq to service_role;
