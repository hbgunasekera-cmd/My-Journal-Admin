-- Admin and Client events share the log table, but retain their own reporter labels.
ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS client_error_logs_reporter_client;

ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS error_logs_reporter_admin;

ALTER TABLE public.error_logs
  DROP CONSTRAINT IF EXISTS error_logs_reporter_admin_or_client;

ALTER TABLE public.error_logs
  ADD CONSTRAINT error_logs_reporter_admin_or_client
  CHECK (reporter = ANY (ARRAY['Admin'::text, 'Client'::text]));
