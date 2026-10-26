-- Admin events come from this workspace; Client events can come from the separate client app.
ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS client_error_logs_reporter_client;

ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS error_logs_reporter_admin;

ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS error_logs_reporter_admin_or_client;

ALTER TABLE public.error_logs
  ADD CONSTRAINT error_logs_reporter_admin_or_client
  CHECK (reporter = ANY (ARRAY['Admin'::text, 'Client'::text]));

GRANT SELECT, INSERT, DELETE ON TABLE public.error_logs TO service_role;
