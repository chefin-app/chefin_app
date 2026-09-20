-- Run only in an isolated empty test database, before applying the new migration.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END; $$;
CREATE TABLE profiles (id uuid PRIMARY KEY);
CREATE TABLE delivery_jobs (id uuid PRIMARY KEY,status text);
CREATE TABLE orders (id uuid PRIMARY KEY,checkout_id uuid,customer_id uuid,status text,
  payment_status text CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('unpaid','paid','refunded')),
  fulfillment_type text,delivery_job_id uuid, cancelled_at timestamptz,cancelled_by text,cancellation_reason text);
CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY,checkout_id uuid UNIQUE,customer_id uuid,cook_id uuid,payment_method text,status text,
  processing_fee numeric,cook_payout numeric,payout_status text CONSTRAINT payment_transactions_payout_status_check CHECK(payout_status IN ('held','pending','paid','cancelled')),
  payout_available_at timestamptz,payout_hold_reason text,payout_released_at timestamptz,payout_paid_at timestamptz,updated_at timestamptz
);
\ir ../prisma/migrations/20260920120000_direct_cook_payments/migration.sql

INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO orders(id,checkout_id,customer_id,status,payment_status,fulfillment_type) VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','pending','unpaid','delivery'),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','pending','unpaid','delivery'),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','pending','unpaid','pickup');
INSERT INTO payment_transactions(id,checkout_id,customer_id,cook_id,payment_method,status,collection_model,direct_state,processing_fee,cook_payout,payout_status) VALUES
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','cook_qr','processing','direct_to_cook','awaiting_acceptance',1,20,'held'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','pay_on_collection','processing','direct_to_cook','awaiting_acceptance',1,20,'held');

DO $$
DECLARE oid uuid := '10000000-0000-0000-0000-000000000001'; buyer uuid := '00000000-0000-0000-0000-000000000001'; cook uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  BEGIN PERFORM direct_payment_action(oid,buyer,'accept'); RAISE EXCEPTION 'TEST: buyer accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  BEGIN PERFORM direct_payment_action(oid,buyer,'claim','BANK123'); RAISE EXCEPTION 'TEST: paid before acceptance'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM direct_payment_action(oid,cook,'accept');
  IF EXISTS(SELECT 1 FROM orders WHERE status<>'pending') THEN RAISE EXCEPTION 'Acceptance started unpaid preparation'; END IF;
  BEGIN UPDATE orders SET status='ready' WHERE id=oid; RAISE EXCEPTION 'TEST: unpaid preparation'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  BEGIN PERFORM direct_payment_action(oid,cook,'confirm'); RAISE EXCEPTION 'TEST: confirmed without report'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM direct_payment_action(oid,buyer,'claim','BANK123');
  BEGIN PERFORM direct_payment_action(oid,cook,'cancel'); RAISE EXCEPTION 'TEST: cancelled unresolved payment'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  BEGIN PERFORM direct_payment_action(oid,buyer,'confirm'); RAISE EXCEPTION 'TEST: buyer confirmed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM direct_payment_action(oid,cook,'confirm');
  PERFORM direct_payment_action(oid,cook,'confirm');
  IF (SELECT count(*) FROM orders WHERE status='confirmed' AND payment_status='paid')<>2 THEN RAISE EXCEPTION 'Checkout lines not confirmed together'; END IF;
  UPDATE payment_transactions SET payout_status='held',processing_fee=10,cook_payout=25;
  IF EXISTS(SELECT 1 FROM payment_transactions WHERE payout_status<>'not_applicable' OR processing_fee<>0 OR cook_payout<>0) THEN RAISE EXCEPTION 'Direct payout created'; END IF;
  PERFORM direct_payment_action(oid,cook,'cancel','Buyer requested cancellation');
  IF (SELECT count(*) FROM orders WHERE status='cancelled')<>2 THEN RAISE EXCEPTION 'Cancellation did not cover checkout'; END IF;
  BEGIN PERFORM direct_payment_action(oid,cook,'confirm'); RAISE EXCEPTION 'TEST: cancelled payment confirmed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;

  oid := '10000000-0000-0000-0000-000000000003';
  PERFORM direct_payment_action(oid,cook,'accept');
  BEGIN PERFORM direct_payment_action(oid,cook,'confirm'); RAISE EXCEPTION 'TEST: early COP confirmation'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  UPDATE orders SET status='ready' WHERE id=oid;
  BEGIN UPDATE orders SET status='completed' WHERE id=oid; RAISE EXCEPTION 'TEST: unpaid collection completed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM direct_payment_action(oid,cook,'confirm');
  UPDATE orders SET status='completed' WHERE id=oid;
  RAISE NOTICE 'PASS: authorization, acceptance, payment, retries, checkout cancellation, payout guards and collection handoff';
END;
$$;
