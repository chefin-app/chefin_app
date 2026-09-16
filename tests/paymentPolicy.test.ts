import {
  calculateProcessingFee,
  getPayoutAvailability,
  getRefundWindowMinutes,
  validateRefundRequest,
} from '../backend/paymentPolicy';

describe('payment and refund policy', () => {
  const originalWindow = process.env.REFUND_WINDOW_MINUTES;

  beforeEach(() => {
    process.env.REFUND_WINDOW_MINUTES = '120';
  });

  afterAll(() => {
    if (originalWindow === undefined) delete process.env.REFUND_WINDOW_MINUTES;
    else process.env.REFUND_WINDOW_MINUTES = originalWindow;
  });

  it('calculates the recorded 1.8% processing fee without floating point noise', () => {
    expect(calculateProcessingFee(36)).toBe(0.65);
    expect(calculateProcessingFee(-1)).toBe(0);
  });

  it('defaults invalid refund-window configuration to two hours', () => {
    process.env.REFUND_WINDOW_MINUTES = 'invalid';
    expect(getRefundWindowMinutes()).toBe(120);
  });

  it('requires completion, a meaningful reason, and pickup photo evidence', () => {
    const input = {
      orderStatus: 'completed',
      completedAt: '2026-09-16T08:00:00.000Z',
      fulfillmentType: 'pickup',
      reasonCode: 'food_quality',
      reasonDetails: 'The dish was unsafe to eat.',
      hasPhotoEvidence: false,
      now: new Date('2026-09-16T09:00:00.000Z'),
    };
    expect(validateRefundRequest(input)).toEqual({
      error: 'A photo of the collected dish is required for pickup refund requests.',
    });
    expect(validateRefundRequest({ ...input, hasPhotoEvidence: true })).toEqual({
      deadline: new Date('2026-09-16T10:00:00.000Z'),
    });
  });

  it('allows delivery claims without a photo but still enforces the deadline', () => {
    const input = {
      orderStatus: 'completed',
      completedAt: '2026-09-16T08:00:00.000Z',
      fulfillmentType: 'delivery',
      reasonCode: 'never_arrived',
      reasonDetails: 'The delivery was marked complete but never arrived.',
      hasPhotoEvidence: false,
    };
    expect(
      validateRefundRequest({ ...input, now: new Date('2026-09-16T09:59:59.000Z') })
    ).toHaveProperty('deadline');
    expect(validateRefundRequest({ ...input, now: new Date('2026-09-16T10:00:01.000Z') })).toEqual({
      error: 'The 120-minute refund request window has passed.',
    });
  });

  it('holds completed payouts until the same refund deadline', () => {
    expect(getPayoutAvailability('2026-09-16T08:00:00.000Z')).toBe('2026-09-16T10:00:00.000Z');
    expect(getPayoutAvailability(null)).toBeNull();
  });
});
