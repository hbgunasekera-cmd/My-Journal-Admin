begin;

alter table public.saved_travel_routes
  add column if not exists seasonal_guide jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_travel_routes_seasonal_guide_object'
      and conrelid = 'public.saved_travel_routes'::regclass
  ) then
    alter table public.saved_travel_routes
      add constraint saved_travel_routes_seasonal_guide_object
      check (seasonal_guide is null or jsonb_typeof(seasonal_guide) = 'object');
  end if;
end $$;

comment on column public.saved_travel_routes.seasonal_guide is
  'Consolidated seasonal recommendation for the main area of this saved route.';

-- Older app versions sent JSON.stringify(waypoints) into a jsonb column, so
-- some rows contain an encoded JSON string instead of a JSON array.
update public.saved_travel_routes
set waypoints = (waypoints #>> '{}')::jsonb
where jsonb_typeof(waypoints) = 'string'
  and left(ltrim(waypoints #>> '{}'), 1) = '['
  and right(rtrim(waypoints #>> '{}'), 1) = ']';

-- Keep existing per-location research attached to matching route stops as
-- migration history, then let the app replace it with one route-level guide.
do $$
begin
  if to_regclass('public.location_season_guides') is not null then
    execute $migrate$
      with route_legacy_guides as (
        select
          route.id,
          jsonb_agg(
            jsonb_build_object(
              'placeName', guide.place_name,
              'locality', guide.locality,
              'guide', guide.guide,
              'error', guide.error,
              'researchedAt', guide.researched_at
            )
            order by guide.place_name
          ) as stop_guides
        from public.saved_travel_routes as route
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(route.waypoints) = 'array' then route.waypoints
            when jsonb_typeof(route.waypoints) = 'string'
              and left(ltrim(route.waypoints #>> '{}'), 1) = '['
              then (route.waypoints #>> '{}')::jsonb
            else '[]'::jsonb
          end
        ) as waypoint(value)
        join public.location_season_guides as guide
          on lower(regexp_replace(trim(coalesce(waypoint.value ->> 'place_name', waypoint.value ->> 'n', '')), '\s+', ' ', 'g'))
            = lower(regexp_replace(trim(guide.place_name), '\s+', ' ', 'g'))
          and coalesce(waypoint.value ->> 'latitude', waypoint.value ->> 'lt') is not null
          and coalesce(waypoint.value ->> 'longitude', waypoint.value ->> 'ln') is not null
          and abs(guide.latitude - coalesce(waypoint.value ->> 'latitude', waypoint.value ->> 'lt')::double precision) <= 0.0001
          and abs(guide.longitude - coalesce(waypoint.value ->> 'longitude', waypoint.value ->> 'ln')::double precision) <= 0.0001
        where guide.guide is not null or guide.error is not null
        group by route.id
      )
      update public.saved_travel_routes as route
      set seasonal_guide = jsonb_build_object(
        'status', 'needs_research',
        'legacyStopGuides', route_legacy_guides.stop_guides
      )
      from route_legacy_guides
      where route.id = route_legacy_guides.id
        and route.seasonal_guide is null
    $migrate$;

    drop table public.location_season_guides;
  end if;
end $$;

commit;
