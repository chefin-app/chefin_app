export type AdminOrderLineStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled';
export type AdminCheckoutStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'attention';

const LIVE_STATUSES = new Set<AdminOrderLineStatus>(['pending', 'confirmed', 'ready']);

export const deriveCheckoutStatus = (statuses: Array<string | null>): AdminCheckoutStatus => {
  const normalized = statuses.filter(Boolean) as AdminOrderLineStatus[];
  if (normalized.length === 0) return 'attention';
  if (normalized.every(status => status === 'completed')) return 'completed';
  if (normalized.every(status => status === 'cancelled')) return 'cancelled';
  if (normalized.some(status => status === 'completed' || status === 'cancelled')) {
    return 'attention';
  }
  if (normalized.some(status => status === 'ready')) return 'ready';
  if (normalized.some(status => status === 'confirmed')) return 'preparing';
  if (normalized.every(status => status === 'pending')) return 'pending';
  return 'attention';
};

export const isLiveCheckoutStatus = (status: AdminCheckoutStatus): boolean =>
  status === 'pending' || status === 'preparing' || status === 'ready';

export const canAdminCancelCheckout = (statuses: Array<string | null>): boolean =>
  statuses.length > 0 &&
  statuses.every(status => status !== null && LIVE_STATUSES.has(status as AdminOrderLineStatus)) &&
  statuses.every(status => status !== 'ready');

export const canAdminCompleteCheckout = (
  lines: Array<{
    status: string | null;
    paymentStatus: string | null;
    refundStatus: string | null;
  }>
): boolean =>
  lines.length > 0 &&
  lines.every(
    line =>
      line.status === 'ready' &&
      line.paymentStatus === 'paid' &&
      line.refundStatus === 'not_required'
  );

export const compactOrderId = (id: string): string => id.split('-')[0].toUpperCase();

export const maskPhoneNumber = (value: string | null | undefined): string | null => {
  const phone = value?.trim();
  if (!phone) return null;
  if (phone.length <= 4) return '•'.repeat(phone.length);
  return `${phone.slice(0, Math.min(3, phone.length - 4))}${'•'.repeat(Math.min(6, phone.length - 4))}${phone.slice(-4)}`;
};

export const summarizeAddress = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const parts = [address.locality, address.city, address.state, address.postcode]
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => String(part).trim());
  return [...new Set(parts)].join(', ') || null;
};

export const formatFullAddress = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const parts = [
    address.address,
    address.addressLine1 ?? address.address_line_1,
    address.addressLine2 ?? address.address_line_2,
    address.locality,
    address.city,
    address.state,
    address.postcode,
    address.countryCode ?? address.country_code,
  ]
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => String(part).trim());
  return parts.join(', ') || null;
};
