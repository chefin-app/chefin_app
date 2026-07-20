/**
 * Malaysian banks a cook can select for payouts. Cooks are paid by bank
 * transfer, so the Bank Name field is constrained to this list rather than
 * free text — keeps names consistent for reconciliation and payout files.
 */
export const MALAYSIAN_BANKS = [
  'AFFIN BANK',
  'ALLIANCE BANK MALAYSIA BERHAD',
  'AL RAJHI BANK',
  'AMBANK BHD',
  'BANK ISLAM MALAYSIA BERHAD',
  'BANK KERJASAMA RAKYAT MALAYSIA',
  'BANK MUAMALAT',
  'BANK OF CHINA (MALAYSIA) BERHAD',
  'BANK PERTANIAN MALAYSIA BERHAD (AGROBANK)',
  'BANK SIMPANAN NASIONAL',
  'MBSB BANK BERHAD',
  'BANK OF AMERICA',
  'CIMB BANK BHD',
  'CITIBANK BHD',
  'DEUTSCHE BANK',
  'HONG LEONG BANK BHD',
  'HSBC BANK MALAYSIA BHD',
  'INDUSTRIAL AND COMMERCIAL BANK OF CHINA',
  'J.P. MORGAN CHASE BANK BERHAD',
  'KUWAIT FINANCE HOUSE (MALAYSIA) BHD',
  'MALAYAN BANKING BHD (MAYBANK)',
  'OCBC BANK MALAYSIA BHD',
  'PUBLIC BANK BHD',
  'RHB BANK RHB',
  'STANDARD CHARTERED BANK BHD',
  'UNITED OVERSEAS BANK MALAYSIA BHD',
] as const;

export type MalaysianBank = (typeof MALAYSIAN_BANKS)[number];
