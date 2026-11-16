do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'travel_bucket_list'
      and column_name = 'google_maps_photos_downloaded'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'travel_bucket_list'
        and column_name = 'google_maps'
    ) then
      update public.travel_bucket_list
      set google_maps = coalesce(google_maps, false) or coalesce(google_maps_photos_downloaded, false);

      alter table public.travel_bucket_list
        drop column google_maps_photos_downloaded;
    else
      alter table public.travel_bucket_list
        rename column google_maps_photos_downloaded to google_maps;
    end if;
  else
    alter table public.travel_bucket_list
      add column if not exists google_maps boolean not null default false;
  end if;
end $$;

update public.travel_bucket_list
set google_maps = false
where google_maps is null;

alter table public.travel_bucket_list
  alter column google_maps set default false,
  alter column google_maps set not null;

comment on column public.travel_bucket_list.google_maps is
  'Whether this location’s selected cover and gallery photo set was downloaded from the admin portal for Google Maps contribution.';
