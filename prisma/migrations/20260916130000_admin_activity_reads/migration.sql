CREATE TABLE IF NOT EXISTS public.admin_activity_reads (
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id varchar(160) NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS admin_activity_reads_admin_read_idx
  ON public.admin_activity_reads(admin_user_id, read_at DESC);

ALTER TABLE public.admin_activity_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_activity_reads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_activity_reads TO service_role;

COMMENT ON TABLE public.admin_activity_reads IS
  'Persistent per-admin read receipts for generated admin console activity items.';
