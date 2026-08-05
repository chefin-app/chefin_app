-- The admin verification flow distinguishes a request for additional
-- information from a rejection. Preserve the status constraint while adding
-- that explicit workflow state.

ALTER TABLE public.verification_documents
  DROP CONSTRAINT IF EXISTS verification_documents_status_check;

ALTER TABLE public.verification_documents
  ADD CONSTRAINT verification_documents_status_check
  CHECK (
    status IN (
      'pending',
      'approved',
      'rejected',
      'more_info_requested'
    )
  ) NOT VALID;

ALTER TABLE public.verification_documents
  VALIDATE CONSTRAINT verification_documents_status_check;
