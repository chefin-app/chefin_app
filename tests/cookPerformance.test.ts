import { buildCookPerformance } from '../backend/cookPerformance';

describe('cook performance summary', () => {
  const now = new Date('2026-09-10T04:00:00.000Z');

  it('counts checkouts instead of dish lines and deducts applied delivery charges', () => {
    const result = buildCookPerformance(
      [
        {
          checkout_id: 'checkout-1',
          customer_id: 'customer-1',
          total_price: 20,
          payment_status: 'paid',
          refund_status: 'not_required',
          status: 'completed',
          completed_at: '2026-09-09T04:00:00.000Z',
        },
        {
          checkout_id: 'checkout-1',
          customer_id: 'customer-1',
          total_price: 15,
          payment_status: 'paid',
          refund_status: 'not_required',
          status: 'completed',
          completed_at: '2026-09-09T04:00:00.000Z',
        },
        {
          checkout_id: 'checkout-2',
          customer_id: 'customer-2',
          total_price: 30,
          payment_status: 'paid',
          refund_status: 'refund_required',
          status: 'cancelled',
          completed_at: null,
        },
      ],
      [5, 4],
      [{ amount: -8, status: 'applied', updated_at: '2026-09-09T05:00:00.000Z' }],
      now
    );

    expect(result).toMatchObject({
      totalEarned: 27,
      grossFoodEarnings: 35,
      deliveryChargesCovered: 8,
      ordersFulfilled: 1,
      averageRating: 4.5,
      ratingCount: 2,
      completionRate: 50,
      averageEarningsPerOrder: 27,
      last30DaysEarned: 27,
      last30DaysOrders: 1,
    });
  });

  it('excludes pending ledger charges and older completions from the 30-day snapshot', () => {
    const result = buildCookPerformance(
      [
        {
          checkout_id: 'checkout-1',
          customer_id: 'customer-1',
          total_price: '40.00',
          payment_status: 'paid',
          refund_status: 'not_required',
          status: 'completed',
          completed_at: '2026-07-01T04:00:00.000Z',
        },
      ],
      [],
      [{ amount: '-10.00', status: 'pending', updated_at: '2026-09-09T04:00:00.000Z' }],
      now
    );

    expect(result.totalEarned).toBe(40);
    expect(result.last30DaysEarned).toBe(0);
    expect(result.last30DaysOrders).toBe(0);
    expect(result.averageRating).toBeNull();
    expect(result.completionRate).toBe(100);
  });

  it('does not count a partially completed checkout as fulfilled earnings', () => {
    const result = buildCookPerformance(
      [
        {
          checkout_id: 'checkout-1',
          customer_id: 'customer-1',
          total_price: 20,
          payment_status: 'paid',
          refund_status: 'not_required',
          status: 'completed',
          completed_at: '2026-09-09T04:00:00.000Z',
        },
        {
          checkout_id: 'checkout-1',
          customer_id: 'customer-1',
          total_price: 10,
          payment_status: 'paid',
          refund_status: 'not_required',
          status: 'ready',
          completed_at: null,
        },
      ],
      [5],
      [],
      now
    );

    expect(result.ordersFulfilled).toBe(0);
    expect(result.totalEarned).toBe(0);
    expect(result.completionRate).toBeNull();
  });
});
