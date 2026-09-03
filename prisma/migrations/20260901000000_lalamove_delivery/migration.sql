-- Exact customer delivery snapshots and third-party fleet state. Public
-- discovery continues to use coarse locations; these rows are visible only to
-- the customer and the cook attached to a paid delivery order.

CREATE TABLE IF NOT EXISTS public.customer_delivery_addresses (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  recipient_name varchar(120) NOT NULL,
  phone_number varchar(20) NOT NULL,
  address_line_1 varchar(200) NOT NULL,
  address_line_2 varchar(200),
  locality varchar(120),
  city varchar(120) NOT NULL,
  state varchar(120) NOT NULL,
  postcode varchar(10) NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'MY',
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  delivery_instructions varchar(500),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT customer_delivery_address_country_check CHECK (country_code = 'MY'),
  CONSTRAINT customer_delivery_address_coordinates_check CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  )
);

CREATE TABLE IF NOT EXISTS public.restaurant_delivery_locations (
  cook_profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  label varchar(250),
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  source varchar(20) NOT NULL DEFAULT 'address_search',
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_delivery_location_coordinates_check CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  )
);

-- Existing cooks only have the intentionally rounded discovery point. Seed it
-- as a fallback; the next address save replaces it with the private exact pin.
INSERT INTO public.restaurant_delivery_locations (
  cook_profile_id, label, latitude, longitude, source, updated_at
)
SELECT cook_profile_id, label, latitude, longitude, source, updated_at
FROM public.restaurant_discovery_locations
ON CONFLICT (cook_profile_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider varchar(30) NOT NULL DEFAULT 'lalamove',
  provider_quotation_id varchar(80) NOT NULL,
  provider_order_id varchar(80),
  provider_status varchar(40),
  status varchar(40) NOT NULL DEFAULT 'quoted',
  currency char(3) NOT NULL DEFAULT 'MYR',
  quoted_fee numeric(10, 2) NOT NULL,
  customer_delivery_fee numeric(10, 2) NOT NULL,
  cook_delivery_charge numeric(10, 2) NOT NULL DEFAULT 0,
  free_delivery_applied boolean NOT NULL DEFAULT false,
  distance_meters integer,
  scheduled_at timestamptz(6) NOT NULL,
  quote_expires_at timestamptz(6) NOT NULL,
  pickup_address jsonb NOT NULL,
  dropoff_address jsonb NOT NULL,
  provider_quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_event_at timestamptz(6),
  driver_id varchar(80),
  driver_name varchar(120),
  driver_phone varchar(30),
  driver_plate_number varchar(40),
  share_link text,
  proof_of_delivery_url text,
  booked_at timestamptz(6),
  picked_up_at timestamptz(6),
  delivered_at timestamptz(6),
  cancelled_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT delivery_jobs_provider_check CHECK (provider = 'lalamove'),
  CONSTRAINT delivery_jobs_status_check CHECK (
    status IN (
      'quoted', 'booking', 'assigning_driver', 'on_going', 'picked_up',
      'delivered', 'booking_failed', 'failed', 'cancelled', 'expired'
    )
  ),
  CONSTRAINT delivery_jobs_fee_check CHECK (
    quoted_fee >= 0 AND customer_delivery_fee >= 0 AND cook_delivery_charge >= 0
  )
);

CREATE INDEX IF NOT EXISTS delivery_jobs_customer_idx
  ON public.delivery_jobs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_jobs_cook_idx
  ON public.delivery_jobs(cook_id, scheduled_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_jobs_provider_order_idx
  ON public.delivery_jobs(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_delivery_job_idx
  ON public.orders(delivery_job_id)
  WHERE delivery_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cook_payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  delivery_job_id uuid NOT NULL UNIQUE REFERENCES public.delivery_jobs(id) ON DELETE RESTRICT,
  entry_type varchar(40) NOT NULL DEFAULT 'delivery_fee',
  amount numeric(10, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'MYR',
  status varchar(30) NOT NULL DEFAULT 'pending',
  description varchar(250) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT cook_payout_ledger_type_check CHECK (entry_type = 'delivery_fee'),
  CONSTRAINT cook_payout_ledger_amount_check CHECK (amount <= 0),
  CONSTRAINT cook_payout_ledger_status_check CHECK (
    status IN ('pending', 'applied', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS cook_payout_ledger_cook_idx
  ON public.cook_payout_ledger(cook_id, created_at DESC);

ALTER TABLE public.customer_delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cook_payout_ledger ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_delivery_addresses TO authenticated;
GRANT SELECT ON TABLE public.restaurant_delivery_locations TO authenticated;
GRANT SELECT ON TABLE public.delivery_jobs TO authenticated;
GRANT SELECT ON TABLE public.cook_payout_ledger TO authenticated;

DROP POLICY IF EXISTS customer_delivery_addresses_own ON public.customer_delivery_addresses;
CREATE POLICY customer_delivery_addresses_own ON public.customer_delivery_addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS restaurant_delivery_locations_owner_read ON public.restaurant_delivery_locations;
CREATE POLICY restaurant_delivery_locations_owner_read ON public.restaurant_delivery_locations
  FOR SELECT TO authenticated
  USING (cook_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS delivery_jobs_participant_read ON public.delivery_jobs;
CREATE POLICY delivery_jobs_participant_read ON public.delivery_jobs
  FOR SELECT TO authenticated
  USING (
    customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR cook_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS cook_payout_ledger_owner_read ON public.cook_payout_ledger;
CREATE POLICY cook_payout_ledger_owner_read ON public.cook_payout_ledger
  FOR SELECT TO authenticated
  USING (cook_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

COMMENT ON TABLE public.customer_delivery_addresses IS
  'A customer-owned exact Klang Valley delivery address, never used in public discovery payloads.';
COMMENT ON TABLE public.restaurant_delivery_locations IS
  'Private exact kitchen pickup pin for delivery fleets; public discovery continues to use rounded coordinates.';
COMMENT ON TABLE public.delivery_jobs IS
  'One Lalamove job per cook and checkout, shared by that cook''s order line rows.';
COMMENT ON TABLE public.cook_payout_ledger IS
  'Negative cook-funded delivery charges created when a free-delivery threshold is met.';
