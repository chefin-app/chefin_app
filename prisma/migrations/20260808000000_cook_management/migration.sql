-- Separate cook workspace access from permission to sell, and introduce a
-- two-stage Malaysian identity + food compliance review. This migration is
-- non-destructive: existing cooks keep selling for a 90-day transition.

CREATE TABLE IF NOT EXISTS public.cook_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'draft',
  identity_status varchar(30) NOT NULL DEFAULT 'not_submitted',
  compliance_status varchar(30) NOT NULL DEFAULT 'not_submitted',
  citizenship_type varchar(30),
  submitted_at timestamptz(6),
  identity_reviewed_at timestamptz(6),
  identity_reviewed_by uuid,
  compliance_reviewed_at timestamptz(6),
  compliance_reviewed_by uuid,
  approved_at timestamptz(6),
  approved_by uuid,
  rejected_at timestamptz(6),
  rejected_by uuid,
  reviewer_note varchar(1000),
  reverification_due_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT cook_applications_status_check CHECK (
    status IN ('draft', 'pending', 'reverification_required', 'approved', 'rejected')
  ),
  CONSTRAINT cook_applications_identity_status_check CHECK (
    identity_status IN ('not_submitted', 'pending', 'approved', 'rejected', 'more_info_requested')
  ),
  CONSTRAINT cook_applications_compliance_status_check CHECK (
    compliance_status IN ('not_submitted', 'pending', 'approved', 'rejected', 'more_info_requested')
  ),
  CONSTRAINT cook_applications_citizenship_check CHECK (
    citizenship_type IS NULL OR citizenship_type IN ('malaysian_citizen', 'permanent_resident')
  )
);

CREATE INDEX IF NOT EXISTS cook_applications_queue_idx
  ON public.cook_applications(status, submitted_at ASC);
CREATE INDEX IF NOT EXISTS cook_applications_reverification_idx
  ON public.cook_applications(reverification_due_at)
  WHERE status = 'reverification_required';

CREATE TABLE IF NOT EXISTS public.identity_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  document_type varchar(20) NOT NULL,
  storage_path text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  reviewer_note varchar(1000),
  submitted_at timestamptz(6) NOT NULL DEFAULT now(),
  reviewed_at timestamptz(6),
  reviewed_by uuid,
  CONSTRAINT identity_documents_type_check CHECK (document_type IN ('mykad', 'mypr')),
  CONSTRAINT identity_documents_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'more_info_requested')
  )
);

CREATE INDEX IF NOT EXISTS identity_documents_user_idx
  ON public.identity_verification_documents(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS identity_documents_queue_idx
  ON public.identity_verification_documents(status, submitted_at ASC);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  permission varchar(50) NOT NULL,
  granted_by uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT admin_permissions_allowed_check CHECK (permission IN ('identity_review')),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS admin_permissions_lookup_idx
  ON public.admin_permissions(permission, user_id);

-- Grandfather every existing cook, including cook-admins. They retain full
-- selling access until the deadline while completing the new checks.
INSERT INTO public.cook_applications (
  user_id,
  status,
  identity_status,
  compliance_status,
  reverification_due_at,
  created_at,
  updated_at
)
SELECT DISTINCT
  ur.user_id,
  'reverification_required',
  'not_submitted',
  'not_submitted',
  now() + interval '90 days',
  now(),
  now()
FROM public.user_roles ur
JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.role = 'cook'
ON CONFLICT (user_id) DO NOTHING;

-- Sensitive identity review belongs to the designated administrator only.
INSERT INTO public.admin_permissions (user_id, permission, granted_by)
SELECT p.user_id, 'identity_review', p.user_id
FROM public.profiles p
WHERE p.user_id = '8c6ed4b6-3e0d-464b-a906-b63dcd09c99b'::uuid
ON CONFLICT (user_id, permission) DO NOTHING;

ALTER TABLE public.cook_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_permissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cook_applications FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.identity_verification_documents FROM anon, authenticated;
GRANT SELECT ON TABLE public.cook_applications TO authenticated;
GRANT SELECT ON TABLE public.identity_verification_documents TO authenticated;

DROP POLICY IF EXISTS cook_applications_read_own ON public.cook_applications;
CREATE POLICY cook_applications_read_own ON public.cook_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_documents_read_own ON public.identity_verification_documents;
CREATE POLICY identity_documents_read_own ON public.identity_verification_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A dedicated private bucket keeps national identity documents separate from
-- ordinary food-safety certificates. Owners may upload only into their own
-- UUID folder; downloads are issued by the authorised admin API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cook-identity-documents',
  'cook-identity-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS identity_storage_insert_own ON storage.objects;
CREATE POLICY identity_storage_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cook-identity-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS identity_storage_select_own ON storage.objects;

-- Direct client writes can create/edit drafts, but cannot make an unapproved
-- cook public. The service-role backend bypasses this and performs the same
-- eligibility check explicitly on admin approvals and order placement.
CREATE OR REPLACE FUNCTION public.enforce_cook_listing_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_user_id uuid;
  application_status varchar(30);
  reverification_due timestamptz;
  eligible boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO owner_user_id
  FROM public.profiles p
  WHERE p.id = NEW.cook_id;

  IF owner_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT ca.status, ca.reverification_due_at
    INTO application_status, reverification_due
  FROM public.cook_applications ca
  WHERE ca.user_id = owner_user_id;

  eligible := application_status = 'approved'
    OR (application_status = 'reverification_required' AND reverification_due > now());

  IF NOT eligible THEN
    NEW.status := 'pending';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_cook_eligibility_guard ON public.listings;
CREATE TRIGGER listings_cook_eligibility_guard
  BEFORE INSERT OR UPDATE OF status, is_active ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cook_listing_eligibility();

-- Apply the existing account write guard to the new owner-controlled records.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cook_applications', 'identity_verification_documents']
  LOOP
    IF to_regprocedure('public.enforce_account_write_access()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS account_write_access_guard ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER account_write_access_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_account_write_access()',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

COMMENT ON TABLE public.cook_applications IS
  'Cook approval workflow, separate from account lifecycle and role membership.';
COMMENT ON TABLE public.identity_verification_documents IS
  'Private MyKad/MyPR evidence; access requires the identity_review admin permission.';
COMMENT ON TABLE public.admin_permissions IS
  'Fine-grained capabilities for sensitive administrator operations.';
