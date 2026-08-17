-- Optional per-dish daily portion limits. NULL means unlimited. Existing cooks
-- keep unlimited stock until they explicitly choose a daily limit.
ALTER TABLE public.listing_availability_settings
  ADD COLUMN IF NOT EXISTS daily_stock_limit integer;

ALTER TABLE public.listing_availability_settings
  DROP CONSTRAINT IF EXISTS listing_availability_settings_daily_stock_check;

ALTER TABLE public.listing_availability_settings
  ADD CONSTRAINT listing_availability_settings_daily_stock_check
  CHECK (daily_stock_limit IS NULL OR daily_stock_limit BETWEEN 1 AND 10000);

-- Capacity remains stored per opening window so existing order reservation
-- metadata stays valid. An advisory transaction lock and a date-wide SUM make
-- the supplied maximum a daily portion cap across every window for the dish.
CREATE OR REPLACE FUNCTION public.reserve_listing_daily_capacity(
  target_listing_id uuid,
  target_service_date date,
  target_window_start time,
  requested_quantity integer,
  maximum_orders integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_today integer;
BEGIN
  IF requested_quantity < 1 OR maximum_orders < 1 OR requested_quantity > maximum_orders THEN
    RETURN false;
  END IF;

  -- Serialise every window for one listing/service date, preventing two
  -- simultaneous slots from both claiming the final daily portions.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_listing_id::text || ':' || target_service_date::text, 0)
  );

  SELECT COALESCE(SUM(orders_taken), 0)
  INTO reserved_today
  FROM public.listing_daily_capacity
  WHERE listing_id = target_listing_id
    AND service_date = target_service_date;

  IF reserved_today + requested_quantity > maximum_orders THEN
    RETURN false;
  END IF;

  INSERT INTO public.listing_daily_capacity (
    listing_id, service_date, window_start, orders_taken, updated_at
  ) VALUES (
    target_listing_id, target_service_date, target_window_start,
    requested_quantity, now()
  )
  ON CONFLICT (listing_id, service_date, window_start)
  DO UPDATE SET
    orders_taken = public.listing_daily_capacity.orders_taken + EXCLUDED.orders_taken,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_listing_daily_capacity(uuid, date, time, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_listing_daily_capacity(uuid, date, time, integer, integer)
  TO service_role;
