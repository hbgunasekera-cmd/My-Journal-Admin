-- The Admin UI and separate Client app use the public Supabase API for error logs.
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full Access" ON public.error_logs;
DROP POLICY IF EXISTS "Policy with security definer functions" ON public.error_logs;
DROP POLICY IF EXISTS "Public full access" ON public.error_logs;
DROP POLICY IF EXISTS "error_logs_public_full_access" ON public.error_logs;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.error_logs TO PUBLIC;

CREATE POLICY "Full Access"
  ON public.error_logs
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);
