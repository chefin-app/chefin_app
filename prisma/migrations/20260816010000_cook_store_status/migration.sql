-- Cook-controlled store status: open (normal), busy (longer prep time), or
-- paused (no new orders until store_paused_until).
ALTER TABLE "public"."profiles"
  ADD COLUMN "store_status" VARCHAR(10) NOT NULL DEFAULT 'open',
  ADD COLUMN "store_busy_prep_minutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "store_paused_until" TIMESTAMPTZ;
