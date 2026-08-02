export const REPORT_REASONS = [
  'food_safety',
  'misleading_information',
  'inappropriate_content',
  'fraud_or_scam',
  'harassment',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = 'listing' | 'restaurant';

export type ReportPayload = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
};

type ValidationResult = { ok: true; value: ReportPayload } | { ok: false; error: string };

const REASON_SET = new Set<string>(REPORT_REASONS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isReportTargetType = (value: unknown): value is ReportTargetType =>
  value === 'listing' || value === 'restaurant';

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const countCharacters = (value: string): number => Array.from(value).length;

export const validateReportPayload = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'A report body is required.' };
  }

  const body = input as Record<string, unknown>;
  if (!isReportTargetType(body.targetType)) {
    return { ok: false, error: "targetType must be 'listing' or 'restaurant'." };
  }
  if (!isUuid(body.targetId)) {
    return { ok: false, error: 'A valid targetId is required.' };
  }
  if (typeof body.reason !== 'string' || !REASON_SET.has(body.reason)) {
    return { ok: false, error: 'Choose a valid report reason.' };
  }
  if (body.details != null && typeof body.details !== 'string') {
    return { ok: false, error: 'details must be text.' };
  }

  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (countCharacters(details) > 1000) {
    return { ok: false, error: 'Details must be 1,000 characters or fewer.' };
  }
  if (body.reason === 'other' && countCharacters(details) < 10) {
    return { ok: false, error: 'Add at least 10 characters for an “Other” report.' };
  }

  return {
    ok: true,
    value: {
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason as ReportReason,
      details: details || null,
    },
  };
};
