-- Checkout-level order monitoring, admin-created disputes, and an explicit
-- manual-refund queue. Existing line-item order IDs remain valid deep links.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_id uuid,
  ADD COLUMN IF NOT EXISTS refund_status varchar(30) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS refund_required_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS refund_note varchar(500);

-- Delivery line items already share a delivery job. Legacy pickup rows cannot
-- be grouped safely after the fact, so each remains its own checkout.
UPDATE public.orders
SET checkout_id = COALESCE(delivery_job_id, id)
WHERE checkout_id IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN checkout_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN checkout_id SET NOT NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refund_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_refund_status_check CHECK (
  refund_status IN ('not_required', 'refund_required', 'refunded', 'refund_failed')
) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_refund_status_check;

CREATE INDEX IF NOT EXISTS orders_checkout_idx
  ON public.orders(checkout_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.order_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL,
  representative_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL,
  source varchar(20) NOT NULL DEFAULT 'admin',
  complainant_type varchar(20) NOT NULL,
  reason varchar(100) NOT NULL,
  details varchar(2000) NOT NULL,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  status varchar(20) NOT NULL DEFAULT 'open',
  resolution varchar(50),
  resolution_note varchar(2000),
  resolved_by uuid,
  resolved_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT order_disputes_source_check CHECK (source = 'admin'),
  CONSTRAINT order_disputes_complainant_check CHECK (
    complainant_type IN ('customer', 'cook', 'other')
  ),
  CONSTRAINT order_disputes_status_check CHECK (
    status IN ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  CONSTRAINT order_disputes_resolution_check CHECK (
    (status IN ('open', 'reviewing') AND resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS order_disputes_checkout_idx
  ON public.order_disputes(checkout_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_disputes_status_idx
  ON public.order_disputes(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS order_disputes_one_open_per_checkout_idx
  ON public.order_disputes(checkout_id)
  WHERE status IN ('open', 'reviewing');

ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_disputes FROM anon, authenticated;
GRANT ALL ON TABLE public.order_disputes TO service_role;

-- Status validation and cancellation occur under one database transaction so
-- a cook cannot advance one line while an admin partly cancels the checkout.
CREATE OR REPLACE FUNCTION public.admin_cancel_checkout(
  target_checkout_id uuid,
  admin_user_id uuid,
  cancel_reason varchar
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
BEGIN
  IF target_checkout_id IS NULL THEN
    RAISE EXCEPTION 'Checkout is required';
  END IF;
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Administrator is required';
  END IF;
  IF length(trim(COALESCE(cancel_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Cancellation reason must contain at least 5 characters';
  END IF;

  PERFORM id
  FROM public.orders
  WHERE checkout_id = target_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE checkout_id = target_checkout_id
      AND status NOT IN ('pending', 'confirmed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Only pending or preparing checkouts can be cancelled';
  END IF;

  WITH updated AS (
    UPDATE public.orders
    SET
      status = 'cancelled',
      cancelled_by = 'admin',
      cancelled_at = COALESCE(cancelled_at, now()),
      cancellation_reason = trim(cancel_reason),
      refund_status = CASE
        WHEN payment_status = 'paid' AND refund_status = 'not_required' THEN 'refund_required'
        ELSE refund_status
      END,
      refund_required_at = CASE
        WHEN payment_status = 'paid' THEN COALESCE(refund_required_at, now())
        ELSE refund_required_at
      END,
      refund_note = CASE
        WHEN payment_status = 'paid' THEN 'Admin cancellation requires manual refund processing.'
        ELSE refund_note
      END
    WHERE checkout_id = target_checkout_id
      AND status IN ('pending', 'confirmed')
    RETURNING id, created_at
  )
  SELECT array_agg(id ORDER BY created_at, id)
  INTO affected_ids
  FROM updated;

  IF affected_ids IS NULL THEN
    SELECT array_agg(id ORDER BY created_at, id)
    INTO affected_ids
    FROM public.orders
    WHERE checkout_id = target_checkout_id;
  END IF;

  -- Keep the irreversible cancellation and its audit record in one database
  -- transaction. Follow-up notifications and fleet reconciliation are retriable.
  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    target_user_id,
    action,
    details
  )
  SELECT
    admin_user_id,
    profile.user_id,
    'order_cancelled_by_admin',
    jsonb_build_object(
      'checkoutId', target_checkout_id,
      'orderIds', to_jsonb(affected_ids),
      'reason', trim(cancel_reason),
      'refundRequired', true
    )
  FROM public.orders checkout_order
  JOIN public.profiles profile ON profile.id = checkout_order.customer_id
  WHERE checkout_order.checkout_id = target_checkout_id
  LIMIT 1;

  RETURN affected_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_checkout(uuid, uuid, varchar)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_checkout(uuid, uuid, varchar)
  TO service_role;
