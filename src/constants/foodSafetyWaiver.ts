/**
 * Versioned copy shown to every cook completing the food-safety step.
 * Changing any legal copy requires a new version and a matching row in the
 * cook_compliance_clause_versions migration/table.
 */
export const FOOD_SAFETY_WAIVER_VERSION = '2026-07-22-v1';

export const MOH_FOOD_PREMISES_GUIDANCE_URL = 'https://hq.moh.gov.my/fsq/xs/faq.php';
export const LOCAL_AUTHORITY_GUIDANCE_URL =
  'https://jkt.kpkt.gov.my/about-lgd/faqs/frequently-asked-questions-faq-on-environmental-health';

export const FOOD_SAFETY_WAIVER_SECTIONS = [
  {
    title: 'Registration and licensing',
    body: "If you prepare food at home for sale, Malaysia's Ministry of Health (MOH/KKM) requires the food premises to be registered through FoSIM. You may also need licences or approvals from your local authority. As the cook and food-business operator, you are responsible for identifying, obtaining and maintaining every registration, licence, permit, approval and food-safety requirement that applies where you operate, and for complying with the Food Act 1983, Food Hygiene Regulations 2009 and applicable local by-laws.",
  },
  {
    title: 'Your documents',
    body: 'A recognised Food Handler Training Certificate is evidence of training, while an anti-typhoid record is evidence of vaccination. These are separate requirements. Neither document proves food-premises registration or a local-authority business licence. Chefin may award a platform Verified badge after reviewing one supported document, but that badge does not confirm full regulatory compliance. You confirm that every document and statement you submit is genuine, accurate, current and applicable to you and your food business. You must stop offering food and notify Chefin if a required registration, licence, certificate or approval expires, is suspended or is revoked.',
  },
  {
    title: 'Possible penalties',
    body: 'Failure to register covered food premises is an offence and, upon conviction, may result in a fine not exceeding RM10,000 or imprisonment for up to 2 years. Other offences may carry different penalties.',
  },
  {
    title: 'Acknowledgement and indemnity',
    body: "Chefin's document review is for platform verification only. It is not a licence, government or legal approval, legal advice, or a guarantee that you may operate. To the extent permitted by Malaysian law, you accept responsibility for your food operations and agree to indemnify and hold Chefin, its affiliates, officers and employees harmless from third-party civil claims, losses, damages and reasonable costs caused by your proven legal non-compliance, breach of these obligations, or false or misleading documents, except to the extent caused by Chefin's negligence, fraud or wilful misconduct. This indemnity does not transfer your criminal or regulatory liability, and nothing in this clause excludes or restricts liability that cannot lawfully be excluded or restricted.",
  },
] as const;

export const FOOD_SAFETY_WAIVER_ACCEPTANCE =
  'I have read and accept the Cook Compliance Acknowledgement and Indemnity. I confirm that I am responsible for the requirements that apply to my food business and that the information and documents I submit are accurate.';

/** Canonical plain-text snapshot stored server-side for this version. */
export const FOOD_SAFETY_WAIVER_TEXT = FOOD_SAFETY_WAIVER_SECTIONS.map(
  section => `${section.title}\n${section.body}`
).join('\n\n');
