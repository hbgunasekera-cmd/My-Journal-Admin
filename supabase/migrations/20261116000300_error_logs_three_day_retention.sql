-- Enable Supabase Cron for database-side retention (runs even when the admin app is closed).
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Remove rows that have already passed the retention window when this migration is applied.
delete from public.error_logs
where created_at < now() - interval '3 days';

-- Keep the retention window close to 72 hours; the job runs every 15 minutes.
select cron.schedule(
  'cleanup-error-logs-after-3-days',
  '*/15 * * * *',
  $$
    delete from public.error_logs
    where created_at < now() - interval '3 days';
  $$
);
