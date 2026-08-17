-- Customer proximity, recurring restaurant hours, menu organisation and
-- verified cook-to-customer feedback. Existing orders and dated availability
-- are retained. Exact coordinates live only in service-role tables.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS menu_category varchar(80) NOT NULL DEFAULT 'Uncategorised';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_by varchar(20),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS cancellation_reason varchar(500),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS capacity_source varchar(20),
  ADD COLUMN IF NOT EXISTS capacity_service_date date,
  ADD COLUMN IF NOT EXISTS capacity_window_start time(0),
  ADD COLUMN IF NOT EXISTS capacity_availability_id uuid,
  ADD COLUMN IF NOT EXISTS capacity_quantity integer,
  ADD COLUMN IF NOT EXISTS capacity_released_at timestamptz(6);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancelled_by_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'cook', 'admin', 'system')) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_cancelled_by_check;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_capacity_reservation_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_capacity_reservation_check CHECK (
  (
    capacity_source IS NULL
    AND capacity_service_date IS NULL
    AND capacity_window_start IS NULL
    AND capacity_availability_id IS NULL
    AND capacity_quantity IS NULL
    AND capacity_released_at IS NULL
  )
  OR
  (
    capacity_source = 'recurring'
    AND capacity_service_date = scheduled_date
    AND capacity_window_start IS NOT NULL
    AND capacity_availability_id IS NULL
    AND capacity_quantity = quantity
    AND capacity_quantity > 0
  )
  OR
  (
    capacity_source = 'legacy'
    AND capacity_service_date = scheduled_date
    AND capacity_window_start IS NULL
    AND capacity_availability_id IS NOT NULL
    AND capacity_quantity = quantity
    AND capacity_quantity > 0
  )
) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_capacity_reservation_check;

CREATE TABLE IF NOT EXISTS public.customer_location_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  label varchar(200),
  latitude numeric(9,6),
  longitude numeric(9,6),
  source varchar(20),
  prompted_at timestamptz(6) NOT NULL DEFAULT now(),
  consented_at timestamptz(6),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT customer_location_coordinates_check CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (
      latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  ),
  CONSTRAINT customer_location_source_check CHECK (
    source IS NULL OR source IN ('device', 'manual')
  )
);

CREATE TABLE IF NOT EXISTS public.restaurant_discovery_locations (
  cook_profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  label varchar(200),
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  source varchar(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('address_search', 'manual')),
  precision varchar(20) NOT NULL DEFAULT 'approximate' CHECK (precision = 'approximate'),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  iso_weekday integer NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  opens_at time(0) NOT NULL,
  closes_at time(0) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_opening_hours_window_check CHECK (opens_at < closes_at),
  CONSTRAINT restaurant_opening_hours_window_key UNIQUE
    (cook_id, iso_weekday, opens_at, closes_at)
);

CREATE INDEX IF NOT EXISTS restaurant_opening_hours_cook_day_idx
  ON public.restaurant_opening_hours(cook_id, iso_weekday);

CREATE TABLE IF NOT EXISTS public.listing_availability_settings (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  schedule_mode varchar(30) NOT NULL DEFAULT 'restaurant_hours',
  max_orders_per_window integer NOT NULL DEFAULT 5,
  configured_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT listing_availability_schedule_mode_check
    CHECK (schedule_mode = 'restaurant_hours'),
  CONSTRAINT listing_availability_max_orders_check
    CHECK (max_orders_per_window BETWEEN 1 AND 1000)
);

CREATE TABLE IF NOT EXISTS public.listing_availability_overrides (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  state varchar(20) NOT NULL,
  reason varchar(200),
  created_by uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, service_date),
  CONSTRAINT listing_availability_override_state_check
    CHECK (state IN ('available', 'sold_out'))
);

CREATE INDEX IF NOT EXISTS listing_availability_override_date_idx
  ON public.listing_availability_overrides(service_date, state);

CREATE TABLE IF NOT EXISTS public.listing_daily_capacity (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  window_start time(0) NOT NULL,
  orders_taken integer NOT NULL DEFAULT 0 CHECK (orders_taken >= 0),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, service_date, window_start)
);

-- One conditional UPSERT serialises competing reservations for the same
-- listing/date/window and never allows orders_taken to exceed the supplied cap.
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
  reserved_count integer;
BEGIN
  IF requested_quantity < 1 OR maximum_orders < 1 OR requested_quantity > maximum_orders THEN
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
    updated_at = now()
  WHERE public.listing_daily_capacity.orders_taken + EXCLUDED.orders_taken <= maximum_orders
  RETURNING orders_taken INTO reserved_count;

  RETURN reserved_count IS NOT NULL AND reserved_count <= maximum_orders;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_listing_daily_capacity(uuid, date, time, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_listing_daily_capacity(uuid, date, time, integer, integer)
  TO service_role;

-- Release exactly the reservation recorded on a cancelled order. Locking the
-- order makes retries idempotent, while the exact window/legacy id prevents a
-- later opening-hours edit from decrementing an unrelated capacity counter.
CREATE OR REPLACE FUNCTION public.release_order_capacity(target_order_id uuid)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO reserved_order
  FROM public.orders
  WHERE id = target_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF reserved_order.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Capacity can only be released for a cancelled order';
  END IF;
  IF reserved_order.capacity_source IS NULL THEN
    RETURN NULL;
  END IF;
  IF reserved_order.capacity_released_at IS NOT NULL THEN
    RETURN reserved_order.capacity_source;
  END IF;

  IF reserved_order.capacity_source = 'recurring' THEN
    UPDATE public.listing_daily_capacity
    SET
      orders_taken = orders_taken - reserved_order.capacity_quantity,
      updated_at = now()
    WHERE listing_id = reserved_order.listing_id
      AND service_date = reserved_order.capacity_service_date
      AND window_start = reserved_order.capacity_window_start
      AND orders_taken >= reserved_order.capacity_quantity;
  ELSIF reserved_order.capacity_source = 'legacy' THEN
    UPDATE public.availability
    SET orders_taken = orders_taken - reserved_order.capacity_quantity
    WHERE id = reserved_order.capacity_availability_id
      AND listing_id = reserved_order.listing_id
      AND orders_taken >= reserved_order.capacity_quantity;
  ELSE
    RAISE EXCEPTION 'Order has an unsupported capacity source';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The recorded capacity reservation could not be released';
  END IF;

  UPDATE public.orders
  SET capacity_released_at = now()
  WHERE id = reserved_order.id;

  RETURN reserved_order.capacity_source;
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_capacity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_capacity(uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.menu_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  selection_type varchar(20) NOT NULL DEFAULT 'single',
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT menu_option_groups_name_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 100 AND name = btrim(name)),
  CONSTRAINT menu_option_groups_selection_check
    CHECK (selection_type IN ('single', 'multiple')),
  CONSTRAINT menu_option_groups_limits_check
    CHECK (min_select >= 0 AND max_select >= 1 AND max_select >= min_select),
  CONSTRAINT menu_option_groups_cook_name_key UNIQUE (cook_id, name)
);

CREATE INDEX IF NOT EXISTS menu_option_groups_cook_idx
  ON public.menu_option_groups(cook_id, created_at);

CREATE TABLE IF NOT EXISTS public.menu_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.menu_option_groups(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  price_delta numeric(10,2) NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT menu_options_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100 AND name = btrim(name)),
  CONSTRAINT menu_options_price_delta_check
    CHECK (price_delta >= 0),
  CONSTRAINT menu_options_sort_order_check
    CHECK (sort_order >= 0),
  CONSTRAINT menu_options_group_name_key UNIQUE (group_id, name)
);

CREATE INDEX IF NOT EXISTS menu_options_group_idx
  ON public.menu_options(group_id, sort_order);

CREATE TABLE IF NOT EXISTS public.listing_option_groups (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.menu_option_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, group_id),
  CONSTRAINT listing_option_groups_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS listing_option_groups_group_idx
  ON public.listing_option_groups(group_id);

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  punctuality_rating integer NOT NULL CHECK (punctuality_rating BETWEEN 1 AND 5),
  communication_rating integer NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
  handover_rating integer NOT NULL CHECK (handover_rating BETWEEN 1 AND 5),
  tags text[] NOT NULL DEFAULT '{}',
  comment varchar(500),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT customer_reviews_distinct_participants_check CHECK (cook_id <> customer_id),
  CONSTRAINT customer_reviews_tags_check CHECK (
    cardinality(tags) <= 8
    AND tags <@ ARRAY[
      'on_time', 'clear_communication', 'smooth_handover', 'late',
      'unreachable', 'changed_plan', 'disrespectful', 'unsafe_behaviour'
    ]::text[]
    AND NOT (tags @> ARRAY['on_time', 'late']::text[])
  )
);

CREATE INDEX IF NOT EXISTS customer_reviews_customer_idx
  ON public.customer_reviews(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_reviews_cook_idx
  ON public.customer_reviews(cook_id, created_at DESC);

-- These tables are mutated only by authenticated backend routes after owner
-- checks. Broad profile reads can never reveal either party's coordinates.
ALTER TABLE public.customer_location_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_discovery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_availability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_daily_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_location_preferences FROM anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_discovery_locations FROM anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_opening_hours FROM anon, authenticated;
REVOKE ALL ON TABLE public.listing_availability_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.listing_availability_overrides FROM anon, authenticated;
REVOKE ALL ON TABLE public.listing_daily_capacity FROM anon, authenticated;
REVOKE ALL ON TABLE public.menu_option_groups FROM anon, authenticated;
REVOKE ALL ON TABLE public.menu_options FROM anon, authenticated;
REVOKE ALL ON TABLE public.listing_option_groups FROM anon, authenticated;
REVOKE ALL ON TABLE public.customer_reviews FROM anon, authenticated;

-- The application backend uses only the service-role client for these private
-- tables. Explicit grants keep that contract intact even when a project's
-- default privileges have been tightened.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.customer_location_preferences,
  public.restaurant_discovery_locations,
  public.restaurant_opening_hours,
  public.listing_availability_settings,
  public.listing_availability_overrides,
  public.listing_daily_capacity,
  public.menu_option_groups,
  public.menu_options,
  public.listing_option_groups,
  public.customer_reviews
TO service_role;

COMMENT ON TABLE public.customer_location_preferences IS
  'Private customer-selected foreground/manual location for proximity recommendations.';
COMMENT ON TABLE public.restaurant_discovery_locations IS
  'Private approximate home-restaurant point used only for server-side distance sorting.';
COMMENT ON TABLE public.customer_reviews IS
  'Private operational feedback for the submitting cook and explicitly authorised administrators; never a public customer score.';
