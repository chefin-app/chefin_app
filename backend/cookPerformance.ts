export type CookPerformanceOrder = {
  checkout_id: string;
  customer_id: string;
  total_price: number | string;
  payment_status: string | null;
  refund_status: string | null;
  status: string | null;
  completed_at: string | null;
};

export type CookPerformanceLedgerEntry = {
  amount: number | string;
  status: string;
  updated_at: string;
};

const money = (value: number): number => Number(value.toFixed(2));

export const buildCookPerformance = (
  orders: CookPerformanceOrder[],
  ratings: Array<number | string>,
  ledgerEntries: CookPerformanceLedgerEntry[],
  now = new Date()
) => {
  const checkoutStatuses = new Map<string, string[]>();
  for (const order of orders) {
    checkoutStatuses.set(order.checkout_id, [
      ...(checkoutStatuses.get(order.checkout_id) ?? []),
      order.status ?? '',
    ]);
  }
  const completedCheckoutIds = new Set(
    [...checkoutStatuses.entries()]
      .filter(
        ([, statuses]) => statuses.length > 0 && statuses.every(status => status === 'completed')
      )
      .map(([checkoutId]) => checkoutId)
  );
  const cancelledCheckouts = [...checkoutStatuses.values()].filter(
    statuses => statuses.length > 0 && statuses.every(status => status === 'cancelled')
  ).length;
  const terminalCheckouts = completedCheckoutIds.size + cancelledCheckouts;

  const completedLines = orders.filter(
    order =>
      completedCheckoutIds.has(order.checkout_id) &&
      order.payment_status === 'paid' &&
      order.refund_status === 'not_required'
  );
  const grossFoodEarnings = completedLines.reduce(
    (sum, order) => sum + (Number(order.total_price) || 0),
    0
  );
  const appliedDeliveryCharges = ledgerEntries
    .filter(entry => entry.status === 'applied')
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const totalEarned = Math.max(0, grossFoodEarnings + appliedDeliveryCharges);

  const normalizedRatings = ratings.map(Number).filter(Number.isFinite);
  const averageRating = normalizedRatings.length
    ? normalizedRatings.reduce((sum, rating) => sum + rating, 0) / normalizedRatings.length
    : null;

  const thirtyDayStart = now.getTime() - 30 * 24 * 60 * 60_000;
  const recentCompletedLines = completedLines.filter(
    order =>
      Boolean(order.completed_at) &&
      new Date(order.completed_at as string).getTime() >= thirtyDayStart
  );
  const recentCheckoutIds = new Set(recentCompletedLines.map(order => order.checkout_id));
  const recentFoodEarnings = recentCompletedLines.reduce(
    (sum, order) => sum + (Number(order.total_price) || 0),
    0
  );
  const recentDeliveryCharges = ledgerEntries
    .filter(
      entry => entry.status === 'applied' && new Date(entry.updated_at).getTime() >= thirtyDayStart
    )
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const last30DaysEarned = Math.max(0, recentFoodEarnings + recentDeliveryCharges);

  return {
    totalEarned: money(totalEarned),
    grossFoodEarnings: money(grossFoodEarnings),
    deliveryChargesCovered: money(Math.abs(Math.min(0, appliedDeliveryCharges))),
    ordersFulfilled: completedCheckoutIds.size,
    averageRating: averageRating == null ? null : Number(averageRating.toFixed(2)),
    ratingCount: normalizedRatings.length,
    completionRate:
      terminalCheckouts > 0
        ? Number(((completedCheckoutIds.size / terminalCheckouts) * 100).toFixed(1))
        : null,
    averageEarningsPerOrder:
      completedCheckoutIds.size > 0 ? money(totalEarned / completedCheckoutIds.size) : 0,
    last30DaysEarned: money(last30DaysEarned),
    last30DaysOrders: recentCheckoutIds.size,
  };
};
