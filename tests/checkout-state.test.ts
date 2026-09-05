import { parseCheckoutDraft } from '../src/utils/checkout-state';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const address = {
  recipientName: 'Aina',
  phoneNumber: '0123456789',
  addressLine1: '1 Jalan Example',
  city: 'Petaling Jaya',
  state: 'Selangor',
  postcode: '47301',
  countryCode: 'MY' as const,
  latitude: 3.1,
  longitude: 101.6,
};

const draft = {
  version: 1,
  cartFingerprint: 'same-basket',
  fulfillmentType: 'delivery',
  address,
  addressDefaults: { recipientName: 'Aina' },
  quotes: [{ jobId: 'quote-1' }],
  quoteExpiresAt: '2026-09-03T12:30:00.000Z',
  savedAt: '2026-09-03T12:00:00.000Z',
};

describe('checkout state', () => {
  it('restores the selected tab, address and a current quote', () => {
    const restored = parseCheckoutDraft(
      JSON.stringify(draft),
      'same-basket',
      new Date('2026-09-03T12:10:00.000Z').getTime()
    );
    expect(restored?.fulfillmentType).toBe('delivery');
    expect(restored?.address).toEqual(address);
    expect(restored?.quotes).toHaveLength(1);
  });

  it('keeps checkout choices but discards quotes when the basket changed', () => {
    const restored = parseCheckoutDraft(
      JSON.stringify(draft),
      'changed-basket',
      new Date('2026-09-03T12:10:00.000Z').getTime()
    );
    expect(restored?.fulfillmentType).toBe('delivery');
    expect(restored?.address).toEqual(address);
    expect(restored?.quotes).toEqual([]);
    expect(restored?.quoteExpiresAt).toBeNull();
  });

  it('does not restore an expired delivery quote', () => {
    const restored = parseCheckoutDraft(
      JSON.stringify(draft),
      'same-basket',
      new Date('2026-09-03T12:31:00.000Z').getTime()
    );
    expect(restored?.quotes).toEqual([]);
    expect(restored?.quoteExpiresAt).toBeNull();
  });
});
