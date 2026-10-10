-- User-submitted moderation reports for listings and restaurant profiles.
--
-- target_id intentionally has NO foreign key: it can refer to either a listing
-- or a restaurant profile, and the audit record must survive the reported
-- content being removed.
--
-- Service-role only. RLS is enabled with no client policies, so browser
-- clients cannot read or write this table directly; the admin API uses the
-- service key. Later columns (updated_at, reviewed_by, resolved_at,
-- resolution_note) are added by 20260804000000_admin_user_management.

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type varchar(20) NOT NULL,
  target_id uuid NOT NULL,
  target_label varchar(200) NOT NULL,
  target_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason varchar(50) NOT NULL,
  details varchar(1000),
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_target_type_check CHECK (
    target_type IN ('listing', 'restaurant')
  ),
  CONSTRAINT content_reports_status_check CHECK (
    status IN ('pending', 'reviewing', 'resolved', 'dismissed')
  )
);

CREATE INDEX IF NOT EXISTS content_reports_moderation_queue_idx
  ON public.content_reports(status, created_at);
CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON public.content_reports(target_type, target_id);
-- Supports per-reporter rate limiting.
CREATE INDEX IF NOT EXISTS content_reports_reporter_rate_idx
  ON public.content_reports(reporter_id, created_at DESC);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.content_reports FROM anon, authenticated;
