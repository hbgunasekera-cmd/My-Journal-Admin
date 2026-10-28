create table if not exists public.location_season_guides (
  id uuid not null default gen_random_uuid(),
  cache_key text not null,
  place_name text not null,
  category text not null default 'Location',
  locality text not null,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'researching',
  guide jsonb null,
  error text null,
  batch_operation_name text null,
  batch_request_key text null,
  researched_at timestamp with time zone null,
  expires_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint location_season_guides_pkey primary key (id),
  constraint location_season_guides_cache_key_key unique (cache_key),
  constraint location_season_guides_status_check check (status = any (array['researching'::text, 'ready'::text, 'error'::text])),
  constraint location_season_guides_guide_object check (guide is null or jsonb_typeof(guide) = 'object'::text),
  constraint location_season_guides_latitude_range check (latitude >= -90 and latitude <= 90),
  constraint location_season_guides_longitude_range check (longitude >= -180 and longitude <= 180)
) tablespace pg_default;

create index if not exists idx_location_season_guides_batch
  on public.location_season_guides using btree (batch_operation_name, batch_request_key)
  where (batch_operation_name is not null);

alter table public.location_season_guides enable row level security;

revoke all privileges on table public.location_season_guides from public, anon, authenticated;
grant all privileges on table public.location_season_guides to service_role;
grant select, insert, update on table public.location_season_guides to anon;

drop policy if exists location_season_guides_anon_select on public.location_season_guides;
drop policy if exists location_season_guides_anon_insert on public.location_season_guides;
drop policy if exists location_season_guides_anon_update on public.location_season_guides;

create policy location_season_guides_anon_select
  on public.location_season_guides for select to anon using (true);
create policy location_season_guides_anon_insert
  on public.location_season_guides for insert to anon with check (true);
create policy location_season_guides_anon_update
  on public.location_season_guides for update to anon using (true) with check (true);
