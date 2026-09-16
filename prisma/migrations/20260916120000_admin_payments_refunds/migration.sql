-- Auditable checkout-level payments, manual refunds, and payout holds.

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code varchar(30) NOT NULL UNIQUE,
  checkout_id uuid NOT NULL UNIQUE,
  representative_order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  food_subtotal numeric(10,2) NOT NULL CHECK (food_subtotal >= 0),
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  gross_amount numeric(10,2) NOT NULL CHECK (gross_amount >= 0),
  processing_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (processing_fee >= 0),
  cook_payout numeric(10,2) NOT NULL CHECK (cook_payout >= 0),
  currency char(3) NOT NULL DEFAULT 'MYR',
  payment_method varchar(40) NOT NULL DEFAULT 'demo_card',
  gateway varchar(40) NOT NULL DEFAULT 'demo',
  gateway_reference varchar(120),
  status varchar(30) NOT NULL DEFAULT 'succeeded' CHECK (
    status IN ('processing', 'succeeded', 'refund_pending', 'refunded', 'failed')
  ),
  payout_status varchar(30) NOT NULL DEFAULT 'held' CHECK (
    payout_status IN ('held', 'pending', 'paid', 'cancelled')
  ),
  payout_available_at timestamptz(6),
  payout_hold_reason varchar(500),
  payout_released_at timestamptz(6),
  payout_paid_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  checkout_id uuid NOT NULL,
  representative_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL,
  source varchar(20) NOT NULL DEFAULT 'customer' CHECK (source IN ('customer', 'admin', 'system')),
  reason_code varchar(50) NOT NULL CHECK (
    reason_code IN ('never_arrived', 'missing_items', 'incorrect_item', 'food_quality', 'damaged_order', 'other')
  ),
  reason_details varchar(2000) NOT NULL,
  evidence_paths text[] NOT NULL DEFAULT '{}',
  requested_amount numeric(10,2) NOT NULL CHECK (requested_amount > 0),
  eligibility_deadline timestamptz(6) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewing', 'approved', 'rejected', 'processing', 'completed', 'failed')
  ),
  decision_note varchar(2000),
  gateway_refund_reference varchar(120),
  reviewed_by uuid,
  reviewed_at timestamptz(6),
  completed_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_active_checkout_idx
  ON public.refund_requests(checkout_id)
  WHERE status IN ('pending', 'reviewing', 'approved', 'processing');
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx
  ON public.payment_transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_payout_idx
  ON public.payment_transactions(payout_status, payout_available_at);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx
  ON public.refund_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_checkout_idx
  ON public.refund_requests(checkout_id, created_at DESC);

-- Backfill the current mock-paid orders into one payment per checkout.
WITH ranked AS (
  SELECT
    o.*,
    row_number() OVER (PARTITION BY o.checkout_id ORDER BY o.created_at, o.id) AS row_position
  FROM public.orders o
), grouped AS (
  SELECT
    r.checkout_id,
    max(r.id::text) FILTER (WHERE r.row_position = 1)::uuid AS representative_order_id,
    max(r.customer_id::text)::uuid AS customer_id,
    max(l.cook_id::text)::uuid AS cook_id,
    round(sum(r.total_price)::numeric, 2) AS food_subtotal,
    round(COALESCE(max(d.customer_delivery_fee), 0)::numeric, 2) AS delivery_fee,
    round(COALESCE(max(d.cook_delivery_charge), 0)::numeric, 2) AS cook_delivery_charge,
    bool_or(r.payment_status = 'paid') AS paid,
    bool_and(r.status = 'completed') AS completed,
    bool_or(r.status = 'cancelled') AS cancelled,
    max(r.completed_at) AS completed_at,
    min(r.created_at) AS created_at
  FROM ranked r
  JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.delivery_jobs d ON d.id = r.delivery_job_id
  GROUP BY r.checkout_id
)
INSERT INTO public.payment_transactions (
  transaction_code, checkout_id, representative_order_id, customer_id, cook_id,
  food_subtotal, delivery_fee, gross_amount, processing_fee, cook_payout,
  payment_method, gateway, gateway_reference, status, payout_status,
  payout_available_at, payout_hold_reason, created_at, updated_at
)
SELECT
  'TXN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  checkout_id,
  representative_order_id,
  customer_id,
  cook_id,
  food_subtotal,
  delivery_fee,
  food_subtotal + delivery_fee,
  round((food_subtotal + delivery_fee) * 0.018, 2),
  greatest(0, food_subtotal - round((food_subtotal + delivery_fee) * 0.018, 2) - cook_delivery_charge),
  'demo_card',
  'demo',
  'LEGACY-' || upper(substr(replace(checkout_id::text, '-', ''), 1, 12)),
  CASE WHEN paid THEN 'succeeded' ELSE 'failed' END,
  CASE
    WHEN cancelled THEN 'held'
    WHEN completed AND completed_at + interval '2 hours' <= now() THEN 'pending'
    ELSE 'held'
  END,
  CASE WHEN completed THEN completed_at + interval '2 hours' ELSE NULL END,
  CASE
    WHEN cancelled THEN 'Cancelled order pending refund review'
    WHEN NOT completed THEN 'Held until order completion and refund window expiry'
    WHEN completed_at + interval '2 hours' > now() THEN 'Two-hour refund window is still open'
    ELSE NULL
  END,
  COALESCE(created_at, now()),
  now()
FROM grouped
ON CONFLICT (checkout_id) DO NOTHING;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.refund_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.payment_transactions TO service_role;
GRANT ALL ON TABLE public.refund_requests TO service_role;

COMMENT ON TABLE public.payment_transactions IS
  'Checkout payment and cook payout state; direct client access is intentionally disabled.';
COMMENT ON TABLE public.refund_requests IS
  'Manual review queue for customer/admin refund requests with private evidence paths.';
