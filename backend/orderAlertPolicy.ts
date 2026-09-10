export type OverdueStage = 'overdue_30' | 'overdue_60' | null;
export type AcceptanceOverdueStage = 'acceptance_overdue_10' | 'acceptance_overdue_20' | null;
export type OrderMonitoringPhase = 'awaiting_acceptance' | 'fulfillment' | null;

const MINUTE_MS = 60_000;

export const getOrderMonitoringPhase = (statuses: Array<string | null>): OrderMonitoringPhase => {
  if (statuses.some(status => status === 'pending')) return 'awaiting_acceptance';
  if (statuses.some(status => status === 'confirmed' || status === 'ready')) return 'fulfillment';
  return null;
};

export const getOverdueStage = (dueAt: string | Date | null, now = new Date()): OverdueStage => {
  if (!dueAt) return null;
  const elapsed = now.getTime() - new Date(dueAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 30 * MINUTE_MS) return null;
  return elapsed >= 60 * MINUTE_MS ? 'overdue_60' : 'overdue_30';
};

/**
 * Paid orders should be acknowledged promptly even when they are scheduled
 * for a later date. This SLA is intentionally based on when the buyer placed
 * the order, not its pickup/delivery estimate.
 */
export const getAcceptanceOverdueStage = (
  createdAt: string | Date | null,
  now = new Date()
): AcceptanceOverdueStage => {
  if (!createdAt) return null;
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 10 * MINUTE_MS) return null;
  return elapsed >= 20 * MINUTE_MS ? 'acceptance_overdue_20' : 'acceptance_overdue_10';
};
