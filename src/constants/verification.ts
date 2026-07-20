/**
 * Cook verification tiers and the documents that unlock them.
 *
 * Submitting documents is entirely optional — cooks can start selling without
 * any. Approval of at least one Tier 1 document by an admin grants the Tier 1
 * "Verified" badge (profiles.verification_tier = 1, profiles.is_verified = true).
 */

export const VERIFICATION_BUCKET = 'food-safety-licenses';

export type VerificationDocType = 'food_handler_certificate' | 'typhoid_vaccination';

export type VerificationDocStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationDocMeta {
  type: VerificationDocType;
  title: string;
  subtitle: string;
}

/** Either one of these earns the Tier 1 badge once approved. */
export const TIER1_DOCUMENTS: VerificationDocMeta[] = [
  {
    type: 'food_handler_certificate',
    title: 'MOH Food Handler Certificate',
    subtitle: '3-hour MOH-accredited course · RM50 · lifetime validity',
  },
  {
    type: 'typhoid_vaccination',
    title: 'Anti-typhoid vaccination',
    subtitle: 'Vaccination record or certificate from a clinic',
  },
];

export interface VerificationDocument {
  id: string;
  user_id: string;
  doc_type: VerificationDocType;
  storage_path: string;
  status: VerificationDocStatus;
  reviewer_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}
