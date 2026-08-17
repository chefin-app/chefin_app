ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_note varchar(500);

COMMENT ON COLUMN public.orders.customer_note IS
  'Optional buyer request for the cook, attached to this dish order row.';
