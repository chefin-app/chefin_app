export const REFUND_REASON_CODES = new Set([
  'never_arrived',
  'missing_items',
  'incorrect_item',
  'food_quality',
  'damaged_order',
  'other',
]);

export const getRefundWindowMinutes = (): number => {
  const configured = Number(process.env.REFUND_WINDOW_MINUTES ?? 120);
  return Number.isInteger(configured) && configured >= 30 && configured <= 1440 ? configured : 120;
};

export const calculateProcessingFee = (grossAmount: number): number =>
  Number((Math.max(0, grossAmount) * 0.018).toFixed(2));

export const getRefundDeadline = (completedAt: string | Date): Date =>
  new Date(new Date(completedAt).getTime() + getRefundWindowMinutes() * 60_000);

export const validateRefundRequest = (input: {
  orderStatus: string | null;
  completedAt: string | null;
  fulfillmentType: string;
  reasonCode: string;
  reasonDetails: string;
  hasPhotoEvidence: boolean;
  now?: Date;
}): { deadline?: Date; error?: string } => {
  if (input.orderStatus !== 'completed' || !input.completedAt) {
    return { error: 'A refund request can only be submitted after the order is completed.' };
  }
  if (!REFUND_REASON_CODES.has(input.reasonCode)) {
    return { error: 'Choose a valid refund reason.' };
  }
  const detailsLength = input.reasonDetails.trim().length;
  if (detailsLength < 10 || detailsLength > 2000) {
    return { error: 'Describe the issue in 10 to 2000 characters.' };
  }
  if (input.fulfillmentType === 'pickup' && !input.hasPhotoEvidence) {
    return { error: 'A photo of the collected dish is required for pickup refund requests.' };
  }
  const deadline = getRefundDeadline(input.completedAt);
  if ((input.now ?? new Date()).getTime() > deadline.getTime()) {
    return {
      error: `The ${getRefundWindowMinutes()}-minute refund request window has passed.`,
    };
  }
  return { deadline };
};

export const getPayoutAvailability = (completedAt: string | null) =>
  completedAt ? getRefundDeadline(completedAt).toISOString() : null;
