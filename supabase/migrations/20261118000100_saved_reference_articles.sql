create table if not exists public.saved_reference_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_reference_articles_title_length check (
    char_length(trim(title)) between 1 and 500
  ),
  constraint saved_reference_articles_content_length check (
    char_length(trim(content)) between 1 and 200000
  ),
  constraint saved_reference_articles_source_url_length check (
    source_url is null or char_length(source_url) <= 2048
  )
);

comment on table public.saved_reference_articles is
  'User-curated standalone article references. Articles are intentionally not linked to travel_bucket_list locations or generated location articles.';

create index if not exists idx_saved_reference_articles_updated_at
  on public.saved_reference_articles using btree (updated_at desc);

alter table public.saved_reference_articles enable row level security;

grant select, insert, update, delete on table public.saved_reference_articles to public;

drop policy if exists "saved_reference_articles_full_access" on public.saved_reference_articles;
create policy "saved_reference_articles_full_access"
  on public.saved_reference_articles
  for all
  to public
  using (true)
  with check (true);
