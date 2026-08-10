create index if not exists area_map_versions_uploaded_by_profile_idx
  on public.area_map_versions (uploaded_by_profile_id)
  where uploaded_by_profile_id is not null;

create index if not exists area_map_versions_published_by_profile_idx
  on public.area_map_versions (published_by_profile_id)
  where published_by_profile_id is not null;
