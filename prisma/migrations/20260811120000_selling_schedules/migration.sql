-- Reusable dish-level selling schedules. These constrain restaurant business
-- hours; they never extend them. A listing may belong to at most one custom
-- schedule, while an unassigned listing follows all business hours.
CREATE TABLE IF NOT EXISTS public.selling_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  specific_dates boolean NOT NULL DEFAULT false,
  starts_on date,
  ends_on date,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT selling_schedules_name_key UNIQUE (cook_id, name),
  CONSTRAINT selling_schedules_dates_check CHECK (
    (NOT specific_dates AND starts_on IS NULL AND ends_on IS NULL)
    OR
    (specific_dates AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND starts_on <= ends_on)
  )
);

CREATE INDEX IF NOT EXISTS selling_schedules_cook_idx
  ON public.selling_schedules(cook_id);

CREATE TABLE IF NOT EXISTS public.selling_schedule_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.selling_schedules(id) ON DELETE CASCADE,
  iso_weekday integer NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  all_day boolean NOT NULL DEFAULT false,
  opens_at time(0),
  closes_at time(0),
  CONSTRAINT selling_schedule_windows_time_check CHECK (
    (all_day AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (NOT all_day AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
  )
);

CREATE INDEX IF NOT EXISTS selling_schedule_windows_schedule_day_idx
  ON public.selling_schedule_windows(schedule_id, iso_weekday);

CREATE TABLE IF NOT EXISTS public.listing_selling_schedules (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.selling_schedules(id) ON DELETE CASCADE,
  assigned_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_selling_schedules_schedule_idx
  ON public.listing_selling_schedules(schedule_id);

ALTER TABLE public.selling_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selling_schedule_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_selling_schedules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.selling_schedules FROM anon, authenticated;
REVOKE ALL ON TABLE public.selling_schedule_windows FROM anon, authenticated;
REVOKE ALL ON TABLE public.listing_selling_schedules FROM anon, authenticated;

GRANT ALL ON TABLE public.selling_schedules TO service_role;
GRANT ALL ON TABLE public.selling_schedule_windows TO service_role;
GRANT ALL ON TABLE public.listing_selling_schedules TO service_role;
