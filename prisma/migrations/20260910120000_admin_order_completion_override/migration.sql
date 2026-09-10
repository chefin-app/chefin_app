-- Administrators may complete a checkout only as an audited exception after
-- every line is ready, paid, and clear of refund processing. The validation,
-- status transition, alert resolution, delivery-fee ledger application, and
-- audit record are committed atomically.

CREATE OR REPLACE FUNCTION public.admin_complete_checkout(
  target_checkout_id uuid,
  admin_user_id uuid,
  override_reason varchar
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
  fulfillment_kind varchar;
BEGIN
  IF target_checkout_id IS NULL THEN
    RAISE EXCEPTION 'Checkout is required';
  END IF;
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Administrator is required';
  END IF;
  IF length(trim(COALESCE(override_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Override reason must contain 10 to 500 characters';
  END IF;

  PERFORM id
  FROM public.orders
  WHERE checkout_id = target_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE checkout_id = target_checkout_id
      AND (
        status IS DISTINCT FROM 'ready'
        OR payment_status IS DISTINCT FROM 'paid'
        OR refund_status IS DISTINCT FROM 'not_required'
      )
  ) THEN
    RAISE EXCEPTION 'Only fully ready, paid checkouts without refund processing can be completed';
  END IF;

  IF (SELECT count(DISTINCT fulfillment_type)
      FROM public.orders
      WHERE checkout_id = target_checkout_id) <> 1 THEN
    RAISE EXCEPTION 'Checkout has inconsistent fulfillment types';
  END IF;

  SELECT fulfillment_type
  INTO fulfillment_kind
  FROM public.orders
  WHERE checkout_id = target_checkout_id
  LIMIT 1;

  IF fulfillment_kind NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Unsupported fulfillment type';
  END IF;

  WITH updated AS (
    UPDATE public.orders
    SET
      status = 'completed',
      completed_at = now(),
      cancelled_by = NULL,
      cancelled_at = NULL,
      cancellation_reason = NULL
    WHERE checkout_id = target_checkout_id
      AND status = 'ready'
    RETURNING id, created_at
  )
  SELECT array_agg(id ORDER BY created_at, id)
  INTO affected_ids
  FROM updated;

  IF affected_ids IS NULL THEN
    RAISE EXCEPTION 'Checkout completion did not update any orders';
  END IF;

  UPDATE public.order_alerts
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE checkout_id = target_checkout_id
    AND status = 'open';

  IF fulfillment_kind = 'delivery' THEN
    UPDATE public.cook_payout_ledger
    SET status = 'applied', updated_at = now()
    WHERE delivery_job_id IN (
      SELECT DISTINCT delivery_job_id
      FROM public.orders
      WHERE checkout_id = target_checkout_id
        AND delivery_job_id IS NOT NULL
    )
      AND status = 'pending';
  ELSE
    INSERT INTO public.pickup_handoff_events (
      checkout_id,
      actor_user_id,
      event_type,
      details
    ) VALUES (
      target_checkout_id,
      admin_user_id,
      'admin_override_completed',
      jsonb_build_object('reason', trim(override_reason))
    );
  END IF;

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    target_user_id,
    action,
    details
  )
  SELECT
    admin_user_id,
    profile.user_id,
    'order_completed_by_admin',
    jsonb_build_object(
      'checkoutId', target_checkout_id,
      'orderIds', to_jsonb(affected_ids),
      'fulfillmentType', fulfillment_kind,
      'previousStatus', 'ready',
      'reason', trim(override_reason)
    )
  FROM public.orders checkout_order
  JOIN public.profiles profile ON profile.id = checkout_order.customer_id
  WHERE checkout_order.checkout_id = target_checkout_id
  LIMIT 1;

  RETURN affected_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_checkout(uuid, uuid, varchar)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_checkout(uuid, uuid, varchar)
  TO service_role;

COMMENT ON FUNCTION public.admin_complete_checkout(uuid, uuid, varchar) IS
  'Atomically completes a fully ready checkout as an audited administrator exception.';
