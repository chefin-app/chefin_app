-- Complete the in-app option-group lifecycle without removing historical data.
ALTER TABLE public.menu_option_groups
  ADD COLUMN IF NOT EXISTS archived_at timestamptz(6);

ALTER TABLE public.menu_options
  ADD COLUMN IF NOT EXISTS unavailable_until date,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz(6);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS selected_options jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_selected_options_array_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_selected_options_array_check
  CHECK (jsonb_typeof(selected_options) = 'array');

-- Archived records remain available for audit/history, while names may be
-- reused by active menu records. These replacements do not delete any rows.
ALTER TABLE public.menu_option_groups
  DROP CONSTRAINT IF EXISTS menu_option_groups_cook_name_key;
DROP INDEX IF EXISTS public.menu_option_groups_cook_name_active_key;
CREATE UNIQUE INDEX menu_option_groups_cook_name_active_key
  ON public.menu_option_groups(cook_id, lower(name))
  WHERE archived_at IS NULL;

ALTER TABLE public.menu_options
  DROP CONSTRAINT IF EXISTS menu_options_group_name_key;
DROP INDEX IF EXISTS public.menu_options_group_name_active_key;
CREATE UNIQUE INDEX menu_options_group_name_active_key
  ON public.menu_options(group_id, lower(name))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS menu_option_groups_active_cook_idx
  ON public.menu_option_groups(cook_id, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS menu_options_active_group_idx
  ON public.menu_options(group_id, sort_order)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.menu_options.unavailable_until IS
  'Inclusive Malaysia service date through which an option is sold out; NULL with is_available=false means indefinite.';
COMMENT ON COLUMN public.orders.selected_options IS
  'Immutable checkout snapshot of option groups, selections, and surcharge prices.';
