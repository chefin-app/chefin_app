/**
 * Cook verification tiers and the documents that unlock them.
 *
 * All three food/business compliance documents are required before a new cook
 * can receive final selling approval.
 */

export const VERIFICATION_BUCKET = 'food-safety-licenses';

export type VerificationDocType =
  | 'fosim_registration'
  | 'food_handler_certificate'
  | 'typhoid_vaccination';

export type VerificationDocStatus = 'pending' | 'approved' | 'rejected' | 'more_info_requested';

export interface VerificationDocMeta {
  type: VerificationDocType;
  title: string;
  subtitle: string;
}

/** Required evidence for final cook approval. */
export const TIER1_DOCUMENTS: VerificationDocMeta[] = [
  {
    type: 'fosim_registration',
    title: 'FoSIM food premises registration',
    subtitle: 'Registration evidence for the home food premises',
  },
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
