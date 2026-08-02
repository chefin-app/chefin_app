export const MAX_REPORT_DETAILS_LENGTH = 1000;
export const MIN_OTHER_DETAILS_LENGTH = 10;

export const REPORT_REASONS = [
  {
    id: 'food_safety',
    label: 'Food safety concern',
    description: 'Unsafe handling, hygiene, allergens or spoiled food',
    icon: 'shield-outline',
  },
  {
    id: 'misleading_information',
    label: 'Misleading information',
    description: 'The description, photo, price or claims seem inaccurate',
    icon: 'alert-circle-outline',
  },
  {
    id: 'inappropriate_content',
    label: 'Inappropriate content',
    description: 'Offensive imagery, language or prohibited content',
    icon: 'eye-off-outline',
  },
  {
    id: 'fraud_or_scam',
    label: 'Suspected fraud or scam',
    description: 'Impersonation, fake offers or suspicious payment requests',
    icon: 'warning-outline',
  },
  {
    id: 'harassment',
    label: 'Harassment or discrimination',
    description: 'Abusive, threatening or discriminatory behaviour',
    icon: 'people-outline',
  },
  {
    id: 'other',
    label: 'Something else',
    description: 'Tell us what our moderation team should review',
    icon: 'ellipsis-horizontal-circle-outline',
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];
export type ReportTargetType = 'listing' | 'restaurant';

const REASON_IDS = new Set<string>(REPORT_REASONS.map(reason => reason.id));

export const countReportCharacters = (value: string): number => Array.from(value).length;

export const truncateReportDetails = (value: string): string =>
  Array.from(value).slice(0, MAX_REPORT_DETAILS_LENGTH).join('');

export const isReportReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && REASON_IDS.has(value);

export const validateReportDetails = (
  reason: ReportReason | null,
  details: string
): string | null => {
  if (!reason) return 'Choose the reason that best describes the issue.';

  const trimmedDetails = details.trim();
  if (countReportCharacters(trimmedDetails) > MAX_REPORT_DETAILS_LENGTH) {
    return `Details must be ${MAX_REPORT_DETAILS_LENGTH.toLocaleString()} characters or fewer.`;
  }
  if (reason === 'other' && countReportCharacters(trimmedDetails) < MIN_OTHER_DETAILS_LENGTH) {
    return `Please add at least ${MIN_OTHER_DETAILS_LENGTH} characters so we know what to review.`;
  }

  return null;
};
