ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "pickup_window_end" TIMESTAMPTZ(6);

ALTER TABLE "public"."delivery_jobs"
  ADD COLUMN IF NOT EXISTS "preparation_ready_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "estimated_arrival_start" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "estimated_arrival_end" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "estimated_travel_min_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimated_travel_max_minutes" INTEGER;

UPDATE "public"."orders"
SET "pickup_window_end" = "pickup_time" + INTERVAL '30 minutes'
WHERE "pickup_time" IS NOT NULL AND "pickup_window_end" IS NULL;
