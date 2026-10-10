-- Cook food-safety compliance: canonical clause versions plus append-only
-- evidence of acceptance.
--
-- The clause text below is the protected canonical copy. It is mirrored in
-- src/constants/foodSafetyWaiver.ts and tests/foodSafetyWaiver.test.ts asserts
-- the two are byte-identical. Publishing materially different terms means
-- inserting a NEW version row, never editing an accepted one in place.

CREATE TABLE IF NOT EXISTS public.cook_compliance_clause_versions (
  version varchar(40) PRIMARY KEY,
  locale varchar(10) NOT NULL DEFAULT 'en-MY',
  title varchar(120) NOT NULL,
  body text NOT NULL,
  acceptance_label text NOT NULL,
  effective_at timestamptz(6) NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.cook_compliance_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  clause_version varchar(40) NOT NULL
    REFERENCES public.cook_compliance_clause_versions(version) ON DELETE RESTRICT,
  source varchar(40) NOT NULL,
  -- Always database-generated: a client must not be able to backdate consent.
  accepted_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT cook_compliance_acceptances_user_clause_key UNIQUE (user_id, clause_version)
);

CREATE INDEX IF NOT EXISTS cook_compliance_acceptances_user_accepted_idx
  ON public.cook_compliance_acceptances (user_id, accepted_at DESC);

INSERT INTO public.cook_compliance_clause_versions
  (version, locale, title, body, acceptance_label, is_active)
VALUES (
  '2026-07-22-v1',
  'en-MY',
  'Cook Compliance Acknowledgement and Indemnity',
  $clause$Registration and licensing
If you prepare food at home for sale, Malaysia's Ministry of Health (MOH/KKM) requires the food premises to be registered through FoSIM. You may also need licences or approvals from your local authority. As the cook and food-business operator, you are responsible for identifying, obtaining and maintaining every registration, licence, permit, approval and food-safety requirement that applies where you operate, and for complying with the Food Act 1983, Food Hygiene Regulations 2009 and applicable local by-laws.

Your documents
A recognised Food Handler Training Certificate is evidence of training, while an anti-typhoid record is evidence of vaccination. These are separate requirements. Neither document proves food-premises registration or a local-authority business licence. Chefin may award a platform Verified badge after reviewing one supported document, but that badge does not confirm full regulatory compliance. You confirm that every document and statement you submit is genuine, accurate, current and applicable to you and your food business. You must stop offering food and notify Chefin if a required registration, licence, certificate or approval expires, is suspended or is revoked.

Possible penalties
Failure to register covered food premises is an offence and, upon conviction, may result in a fine not exceeding RM10,000 or imprisonment for up to 2 years. Other offences may carry different penalties.

Acknowledgement and indemnity
Chefin's document review is for platform verification only. It is not a licence, government or legal approval, legal advice, or a guarantee that you may operate. To the extent permitted by Malaysian law, you accept responsibility for your food operations and agree to indemnify and hold Chefin, its affiliates, officers and employees harmless from third-party civil claims, losses, damages and reasonable costs caused by your proven legal non-compliance, breach of these obligations, or false or misleading documents, except to the extent caused by Chefin's negligence, fraud or wilful misconduct. This indemnity does not transfer your criminal or regulatory liability, and nothing in this clause excludes or restricts liability that cannot lawfully be excluded or restricted.$clause$,
  $acceptance$I have read and accept the Cook Compliance Acknowledgement and Indemnity. I confirm that I am responsible for the requirements that apply to my food business and that the information and documents I submit are accurate.$acceptance$,
  true
)
ON CONFLICT (version) DO NOTHING;

-- Clause versions are world-readable; acceptances are private to their owner.
ALTER TABLE public.cook_compliance_clause_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cook_compliance_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cook_compliance_clause_versions_read
  ON public.cook_compliance_clause_versions;
CREATE POLICY cook_compliance_clause_versions_read
  ON public.cook_compliance_clause_versions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS cook_compliance_acceptances_select_own
  ON public.cook_compliance_acceptances;
CREATE POLICY cook_compliance_acceptances_select_own
  ON public.cook_compliance_acceptances
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Append-only: a cook may record their own acceptance and nothing more.
-- No UPDATE or DELETE policy exists, so consent evidence cannot be rewritten.
DROP POLICY IF EXISTS cook_compliance_acceptances_insert_own
  ON public.cook_compliance_acceptances;
CREATE POLICY cook_compliance_acceptances_insert_own
  ON public.cook_compliance_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.cook_compliance_clause_versions TO authenticated;
GRANT SELECT, INSERT ON public.cook_compliance_acceptances TO authenticated;
