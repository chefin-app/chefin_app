-- The cook application flow submits a 'fosim_registration' document
-- (FoSIM food premises registration) alongside the two existing document
-- types, but the check constraint never allowed that value, causing every
-- submission that included it to fail.

ALTER TABLE public.verification_documents
  DROP CONSTRAINT IF EXISTS verification_documents_doc_type_check;

ALTER TABLE public.verification_documents
  ADD CONSTRAINT verification_documents_doc_type_check
  CHECK (
    doc_type IN (
      'food_handler_certificate',
      'typhoid_vaccination',
      'fosim_registration'
    )
  ) NOT VALID;

ALTER TABLE public.verification_documents
  VALIDATE CONSTRAINT verification_documents_doc_type_check;
