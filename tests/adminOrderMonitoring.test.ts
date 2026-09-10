import {
  canAdminCancelCheckout,
  compactOrderId,
  deriveCheckoutStatus,
  formatFullAddress,
  isLiveCheckoutStatus,
  maskPhoneNumber,
  summarizeAddress,
} from '../backend/adminOrderMonitoring';

describe('admin order monitoring', () => {
  describe('checkout-level status', () => {
    it.each([
      [['pending', 'pending'], 'pending'],
      [['confirmed', 'confirmed'], 'preparing'],
      [['confirmed', 'pending'], 'preparing'],
      [['ready', 'confirmed'], 'ready'],
      [['completed', 'completed'], 'completed'],
      [['cancelled', 'cancelled'], 'cancelled'],
      [['completed', 'cancelled'], 'attention'],
      [['completed', 'ready'], 'attention'],
      [['cancelled', 'pending'], 'attention'],
      [[], 'attention'],
    ])('derives %s as %s', (statuses, expected) => {
      expect(deriveCheckoutStatus(statuses)).toBe(expected);
    });

    it('only treats actionable, non-ready orders as admin-cancellable', () => {
      expect(canAdminCancelCheckout(['pending'])).toBe(true);
      expect(canAdminCancelCheckout(['pending', 'confirmed'])).toBe(true);
      expect(canAdminCancelCheckout(['ready'])).toBe(false);
      expect(canAdminCancelCheckout(['completed'])).toBe(false);
      expect(canAdminCancelCheckout([])).toBe(false);
    });

    it('recognizes pending, preparing and ready checkouts as live', () => {
      expect(isLiveCheckoutStatus('pending')).toBe(true);
      expect(isLiveCheckoutStatus('preparing')).toBe(true);
      expect(isLiveCheckoutStatus('ready')).toBe(true);
      expect(isLiveCheckoutStatus('completed')).toBe(false);
    });
  });

  describe('privacy-safe display helpers', () => {
    it('uses a compact prefix for the visible order ID', () => {
      expect(compactOrderId('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567');
    });

    it('masks phone numbers while retaining enough context for identification', () => {
      expect(maskPhoneNumber('+60123456789')).toBe('+60••••••6789');
      expect(maskPhoneNumber('1234')).toBe('••••');
      expect(maskPhoneNumber(null)).toBeNull();
    });

    it('summarizes an address until an audited reveal is requested', () => {
      const address = {
        addressLine1: '12 Jalan Damai',
        locality: 'Bangsar',
        city: 'Kuala Lumpur',
        state: 'Wilayah Persekutuan Kuala Lumpur',
        postcode: '59100',
        countryCode: 'MY',
      };
      expect(summarizeAddress(address)).toBe(
        'Bangsar, Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, 59100'
      );
      expect(formatFullAddress(address)).toBe(
        '12 Jalan Damai, Bangsar, Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, 59100, MY'
      );
    });
  });
});
