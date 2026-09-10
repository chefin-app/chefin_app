ALTER TABLE public.cook_applications
  ADD COLUMN IF NOT EXISTS reverification_started_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS reverification_identity_submitted_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS reverification_food_submitted_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS reverification_food_skipped_at timestamptz(6);

UPDATE public.cook_applications
SET reverification_started_at = COALESCE(reverification_started_at, updated_at, now())
WHERE status = 'reverification_required';

-- Preserve the newest active identity submission and close any historical
-- duplicates before enforcing the one-pending-submission invariant.
WITH ranked_identity AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY submitted_at DESC, id DESC) AS position
  FROM public.identity_verification_documents
  WHERE status = 'pending'
)
UPDATE public.identity_verification_documents AS document
SET status = 'more_info_requested',
    reviewer_note = COALESCE(document.reviewer_note, 'Superseded by a newer identity submission.'),
    reviewed_at = COALESCE(document.reviewed_at, now())
FROM ranked_identity
WHERE document.id = ranked_identity.id AND ranked_identity.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS identity_one_pending_per_user_idx
  ON public.identity_verification_documents(user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.pickup_handoffs (
  checkout_id uuid PRIMARY KEY,
  representative_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  code_hash text NOT NULL,
  code_ciphertext text NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  regeneration_count integer NOT NULL DEFAULT 0 CHECK (regeneration_count BETWEEN 0 AND 1),
  locked_until timestamptz(6),
  verified_at timestamptz(6),
  verified_by uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pickup_handoffs_customer_idx
  ON public.pickup_handoffs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pickup_handoffs_cook_idx
  ON public.pickup_handoffs(cook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pickup_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL,
  actor_user_id uuid,
  event_type varchar(50) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pickup_handoff_events_checkout_idx
  ON public.pickup_handoff_events(checkout_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL,
  representative_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  alert_type varchar(50) NOT NULL,
  severity varchar(20) NOT NULL CHECK (severity IN ('warning', 'critical')),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  due_at timestamptz(6) NOT NULL,
  triggered_at timestamptz(6) NOT NULL DEFAULT now(),
  resolved_at timestamptz(6),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, alert_type)
);

CREATE INDEX IF NOT EXISTS order_alerts_open_idx
  ON public.order_alerts(status, severity, triggered_at DESC);

ALTER TABLE public.pickup_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pickup_handoffs FROM anon, authenticated;
REVOKE ALL ON TABLE public.pickup_handoff_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.order_alerts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_reverification_stage_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application public.cook_applications%ROWTYPE;
BEGIN
  SELECT * INTO application
  FROM public.cook_applications
  WHERE user_id = NEW.user_id;

  IF TG_TABLE_NAME = 'identity_verification_documents' THEN
    IF application.status = 'reverification_required'
       AND application.reverification_identity_submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Identity has already been submitted for this reverification cycle';
    END IF;
    IF application.status IS DISTINCT FROM 'reverification_required'
       AND application.identity_status IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'Identity is already under review';
    END IF;
  ELSIF TG_TABLE_NAME = 'verification_documents'
        AND application.status = 'reverification_required'
        AND (application.reverification_food_submitted_at IS NOT NULL
             OR application.reverification_food_skipped_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Food documents have already been submitted for this reverification cycle';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identity_reverification_stage_lock
  ON public.identity_verification_documents;
CREATE TRIGGER identity_reverification_stage_lock
  BEFORE INSERT ON public.identity_verification_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reverification_stage_lock();

DROP TRIGGER IF EXISTS food_reverification_stage_lock
  ON public.verification_documents;
CREATE TRIGGER food_reverification_stage_lock
  BEFORE INSERT ON public.verification_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reverification_stage_lock();

COMMENT ON TABLE public.pickup_handoffs IS
  'Server-only buyer PIN evidence for completing a self-pickup checkout.';
COMMENT ON TABLE public.pickup_handoff_events IS
  'Immutable audit trail for pickup handoff verification and exception requests.';
COMMENT ON TABLE public.order_alerts IS
  'Retry-safe operational alerts surfaced in the administrator console.';
