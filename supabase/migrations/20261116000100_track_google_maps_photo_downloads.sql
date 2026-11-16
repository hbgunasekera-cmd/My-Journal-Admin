alter table public.travel_bucket_list
  add column if not exists google_maps boolean not null default false;

comment on column public.travel_bucket_list.google_maps is
  'Whether this location’s selected cover and gallery photo set was downloaded from the admin portal for Google Maps contribution.';
