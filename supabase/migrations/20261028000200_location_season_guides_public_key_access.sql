begin;

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

commit;
