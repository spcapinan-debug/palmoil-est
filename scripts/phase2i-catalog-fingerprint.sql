-- Deterministic application-owned catalog fingerprint for Phase 2I baseline checks.
-- Scope is public only. OIDs, timestamps, row data, and platform-managed schemas are excluded.
with catalog_records as (
  select 'relation'::text as component,
         concat_ws('|', n.nspname, c.relname, c.relkind::text,
           c.relrowsecurity::text, c.relforcerowsecurity::text,
           coalesce(pg_get_viewdef(c.oid, true), '')) as record
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'S')
  union all
  select 'column',
         concat_ws('|', n.nspname, c.relname, a.attnum::text, a.attname,
           format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
           a.attidentity::text, a.attgenerated::text,
           coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and a.attnum > 0
     and not a.attisdropped
  union all
  select 'constraint',
         concat_ws('|', n.nspname, c.relname, con.conname, con.contype::text,
           con.condeferrable::text, con.condeferred::text,
           pg_get_constraintdef(con.oid, true))
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
  union all
  select 'index',
         concat_ws('|', n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid))
    from pg_index x
    join pg_class c on c.oid = x.indrelid
    join pg_class i on i.oid = x.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
  union all
  select 'function',
         concat_ws('|', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid), p.provolatile::text, p.prosecdef::text,
           coalesce(array_to_string(p.proconfig, ','), ''), pg_get_functiondef(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'trigger',
         concat_ws('|', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true))
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
  union all
  select 'policy',
         concat_ws('|', schemaname, tablename, policyname, permissive, cmd,
           array_to_string(roles, ','), coalesce(qual, ''), coalesce(with_check, ''))
    from pg_policies
   where schemaname = 'public'
  union all
  select 'enum',
         concat_ws('|', n.nspname, t.typname, e.enumsortorder::text, e.enumlabel)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
   where n.nspname = 'public'
  union all
  select 'table_grant',
         concat_ws('|', table_schema, table_name, grantee, privilege_type, is_grantable)
    from information_schema.role_table_grants
   where table_schema = 'public'
  union all
  select 'routine_grant',
         concat_ws('|', n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid),
           pg_get_userbyid(a.grantor), pg_get_userbyid(a.grantee),
           a.privilege_type, a.is_grantable::text)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public'
  union all
  select 'sequence_grant',
         concat_ws('|', object_schema, object_name, grantee, privilege_type, is_grantable)
    from information_schema.role_usage_grants
   where object_schema = 'public'
), component_fingerprints as (
  select component,
         count(*)::bigint as record_count,
         md5(string_agg(record, E'\n' order by record)) as fingerprint
    from catalog_records
   group by component
), all_records as (
  select count(*)::bigint as record_count,
         md5(string_agg(component || '|' || record, E'\n' order by component, record)) as fingerprint
    from catalog_records
)
select jsonb_build_object(
  'scope', 'public',
  'overall', (select jsonb_build_object('record_count', record_count, 'fingerprint', fingerprint) from all_records),
  'components', (select jsonb_object_agg(component, jsonb_build_object('record_count', record_count, 'fingerprint', fingerprint) order by component) from component_fingerprints)
) as catalog_fingerprint;
