-- Direct receipts never create a platform payout. Existing platform payments retain their flow.
CREATE TABLE public.cook_payment_settings (
  cook_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  qr_enabled boolean NOT NULL DEFAULT false,
  collection_enabled boolean NOT NULL DEFAULT false,
  recipient_name text,
  qr_image text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cook_payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cook_payment_settings FROM anon, authenticated;
GRANT ALL ON public.cook_payment_settings TO service_role;

ALTER TABLE public.payment_transactions
  ADD COLUMN collection_model text NOT NULL DEFAULT 'platform',
  ADD COLUMN direct_state text,
  ADD COLUMN recipient_name text,
  ADD COLUMN qr_image text,
  ADD COLUMN buyer_reference text,
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN payment_deadline timestamptz,
  ADD COLUMN buyer_claimed_at timestamptz,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid,
  ADD COLUMN direct_acknowledged_at timestamptz;
ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_payout_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_payout_status_check
  CHECK (payout_status IN ('held','pending','paid','cancelled','not_applicable'));
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_collection_model_check
  CHECK (collection_model IN ('platform','direct_to_cook'));

-- Defence in depth for existing refund, completion and payout reconciliation paths.
CREATE FUNCTION public.protect_direct_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.collection_model = 'direct_to_cook' THEN
    NEW.processing_fee := 0;
    NEW.cook_payout := 0;
    NEW.payout_status := 'not_applicable';
    NEW.payout_available_at := NULL;
    NEW.payout_hold_reason := NULL;
    NEW.payout_released_at := NULL;
    NEW.payout_paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_direct_payment BEFORE INSERT OR UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_payment();

-- One checkout lock makes retries and concurrent confirmations safe and updates all dish lines together.
CREATE FUNCTION public.direct_payment_action(p_order uuid, p_actor uuid, p_action text, p_reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payment_transactions%ROWTYPE;
BEGIN
  SELECT t.* INTO p FROM payment_transactions t JOIN orders o ON o.checkout_id=t.checkout_id
    WHERE o.id=p_order FOR UPDATE OF t;
  IF NOT FOUND OR p.collection_model <> 'direct_to_cook' THEN RAISE EXCEPTION 'Direct payment not found'; END IF;
  IF p_action='claim' THEN
    IF p.customer_id<>p_actor THEN RAISE EXCEPTION 'Access denied'; END IF;
  ELSIF p.cook_id<>p_actor THEN RAISE EXCEPTION 'Access denied'; END IF;
  PERFORM id FROM orders WHERE checkout_id=p.checkout_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM orders WHERE checkout_id=p.checkout_id AND status IN ('cancelled','completed')) THEN
    RAISE EXCEPTION 'This checkout is no longer open';
  END IF;
  IF p_action='cancel' THEN
    IF p.buyer_claimed_at IS NOT NULL AND p.confirmed_at IS NULL THEN RAISE EXCEPTION 'The buyer reported payment. Verify receipt before cancellation; contact support if the transfer cannot be found'; END IF;
    IF EXISTS(SELECT 1 FROM orders WHERE checkout_id=p.checkout_id AND status NOT IN ('pending','confirmed')) THEN RAISE EXCEPTION 'This checkout can no longer be cancelled'; END IF;
    IF EXISTS(SELECT 1 FROM orders o JOIN delivery_jobs d ON d.id=o.delivery_job_id WHERE o.checkout_id=p.checkout_id AND d.status IN ('picked_up','delivered')) THEN RAISE EXCEPTION 'The courier has already collected this order'; END IF;
    UPDATE orders SET status='cancelled', cancelled_at=now(), cancelled_by='cook', cancellation_reason=left(coalesce(p_reference,'Cook cancelled'),500) WHERE checkout_id=p.checkout_id;
    UPDATE payment_transactions SET direct_state='cancelled', status=CASE WHEN confirmed_at IS NULL THEN 'failed' ELSE 'refund_pending' END,updated_at=now() WHERE id=p.id;
  ELSIF p_action='accept' THEN
    IF p.accepted_at IS NOT NULL THEN RETURN; END IF;
    UPDATE payment_transactions SET accepted_at=now(),
      payment_deadline=CASE WHEN payment_method='cook_qr' THEN now()+interval '10 minutes' ELSE NULL END,
      direct_state=CASE WHEN payment_method='cook_qr' THEN 'awaiting_payment' ELSE 'due_on_collection' END,
      updated_at=now() WHERE id=p.id;
    IF p.payment_method='pay_on_collection' THEN
      UPDATE orders SET status='confirmed' WHERE checkout_id=p.checkout_id AND status='pending';
    END IF;
  ELSIF p_action='claim' THEN
    IF p.direct_state='verification_pending' OR p.confirmed_at IS NOT NULL THEN RETURN; END IF;
    IF p.payment_method<>'cook_qr' OR p.direct_state<>'awaiting_payment' THEN RAISE EXCEPTION 'Wait for cook acceptance'; END IF;
    IF length(trim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Enter the bank transaction reference'; END IF;
    -- Late transfers still need reconciliation; never discard a buyer report because a timer expired.
    UPDATE payment_transactions SET direct_state='verification_pending', buyer_reference=trim(p_reference),
      buyer_claimed_at=now(), updated_at=now() WHERE id=p.id;
  ELSIF p_action='confirm' THEN
    IF p.confirmed_at IS NOT NULL THEN RETURN; END IF;
    IF p.accepted_at IS NULL THEN RAISE EXCEPTION 'Accept the checkout first'; END IF;
    IF p.payment_method='cook_qr' AND p.direct_state<>'verification_pending' THEN RAISE EXCEPTION 'Wait for the buyer payment report'; END IF;
    IF p.payment_method='pay_on_collection' AND EXISTS(SELECT 1 FROM orders WHERE checkout_id=p.checkout_id AND status<>'ready') THEN
      RAISE EXCEPTION 'Record collection payment when all dishes are ready';
    END IF;
    UPDATE payment_transactions SET direct_state='cook_confirmed', status='succeeded', confirmed_at=now(),
      confirmed_by=p_actor, updated_at=now() WHERE id=p.id;
    UPDATE orders SET payment_status='paid', status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END
      WHERE checkout_id=p.checkout_id;
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.direct_payment_action(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.direct_payment_action(uuid,uuid,text,text) TO service_role;

-- A pickup PIN proves handoff, not payment. Both are required for completion.
CREATE FUNCTION public.guard_direct_order_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p payment_transactions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM payment_transactions WHERE checkout_id=NEW.checkout_id;
  IF p.collection_model='direct_to_cook' THEN
    IF NEW.payment_status='paid' AND p.confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm receipt through the direct payment workflow'; END IF;
    IF NEW.status IN ('confirmed','ready','completed') AND p.accepted_at IS NULL THEN
      RAISE EXCEPTION 'Accept this checkout using its payment panel first';
    END IF;
    IF (NEW.status='completed' OR (p.payment_method='cook_qr' AND NEW.status IN ('confirmed','ready')))
       AND p.confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm receipt of payment first'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_direct_order_progress BEFORE UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_order_progress();
