-- Account lifecycle and moderation audit support for the admin dashboard.
-- This migration never deletes account, order, payment, or report records.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason varchar(500),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS suspension_ends_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS deactivation_reason varchar(500),
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS restricted_listing_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz(6) NOT NULL DEFAULT now();

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_allowed;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_allowed
  CHECK (account_status IN ('active', 'suspended', 'deactivated')) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_account_status_allowed;

CREATE INDEX IF NOT EXISTS profiles_account_status_idx
  ON public.profiles(account_status, created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_suspension_expiry_idx
  ON public.profiles(suspension_ends_at)
  WHERE account_status = 'suspended' AND suspension_ends_at IS NOT NULL;

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz(6) NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS resolution_note varchar(1000);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid,
  action varchar(80) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_target_idx
  ON public.admin_audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx
  ON public.admin_audit_logs(actor_user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_logs FROM anon, authenticated;

-- Keep the role constraint compatible with legacy guest/cook rows while
-- allowing trusted service-role provisioning of administrators.
DO $$
DECLARE
  constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.user_roles'::regclass
    AND conname = 'user_roles_role_allowed';

  IF constraint_definition IS NOT NULL AND constraint_definition NOT ILIKE '%admin%' THEN
    ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_allowed;
    constraint_definition := NULL;
  END IF;

  IF constraint_definition IS NULL THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_role_allowed
      CHECK (role IN ('guest', 'cook', 'admin')) NOT VALID;
    ALTER TABLE public.user_roles VALIDATE CONSTRAINT user_roles_role_allowed;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_admin_role_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'admin' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin roles can only be assigned by a trusted service'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_prevent_admin_self_assignment ON public.user_roles;
CREATE TRIGGER user_roles_prevent_admin_self_assignment
  BEFORE INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_role_self_assignment();

-- Direct Supabase writes are rejected for suspended/deactivated users. The
-- service-role admin/backend client has no auth.uid() and deliberately bypasses
-- this trigger; those endpoints perform their own token/status checks.
CREATE OR REPLACE FUNCTION public.enforce_account_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status varchar(20);
  suspension_expiry timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT account_status, suspension_ends_at
    INTO current_status, suspension_expiry
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF current_status = 'deactivated' OR
     (current_status = 'suspended' AND
       (suspension_expiry IS NULL OR suspension_expiry > now())) THEN
    RAISE EXCEPTION 'This account is currently read-only.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'user_roles', 'favourites', 'listings', 'availability',
    'orders', 'reviews', 'verification_documents',
    'cook_compliance_acceptances', 'content_reports'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS account_write_access_guard ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER account_write_access_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_account_write_access()',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

COMMENT ON COLUMN public.profiles.account_status IS
  'active, suspended (read-only, optionally temporary), or deactivated (soft-deleted and login-banned).';
COMMENT ON TABLE public.admin_audit_logs IS
  'Append-only service-role audit history for administrator actions.';
