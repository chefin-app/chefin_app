-- Date-specific business hours replace a cook's normal weekly schedule for
-- the selected date. A closed row has no time values; open rows require a
-- valid opening window. Multiple open rows allow split service periods.
CREATE TABLE IF NOT EXISTS public.restaurant_special_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  description varchar(120),
  is_closed boolean NOT NULL DEFAULT true,
  opens_at time(0),
  closes_at time(0),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_special_hours_window_check CHECK (
    (is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
  )
);

CREATE INDEX IF NOT EXISTS restaurant_special_hours_cook_date_idx
  ON public.restaurant_special_hours(cook_id, service_date);

ALTER TABLE public.restaurant_special_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_special_hours FROM anon, authenticated;
GRANT ALL ON TABLE public.restaurant_special_hours TO service_role;
