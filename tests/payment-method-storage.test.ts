import { getDefaultPaymentCard, parsePaymentMethods } from '@/src/utils/payment-method-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('payment method storage', () => {
  it('keeps an existing single-card record usable', () => {
    const methods = parsePaymentMethods(
      JSON.stringify({ brand: 'Visa', last4: '4242', expMonth: '12', expYear: '30' })
    );

    expect(methods.cards).toHaveLength(1);
    expect(methods.defaultCardId).toBe(methods.cards[0].id);
    expect(getDefaultPaymentCard(methods)).toMatchObject({ brand: 'Visa', last4: '4242' });
  });

  it('returns the selected default from a multi-card record', () => {
    const methods = parsePaymentMethods(
      JSON.stringify({
        version: 2,
        cards: [
          { id: 'visa', brand: 'Visa', last4: '4242', expMonth: '12', expYear: '30' },
          {
            id: 'mastercard',
            brand: 'Mastercard',
            last4: '4444',
            expMonth: '10',
            expYear: '31',
          },
        ],
        defaultCardId: 'mastercard',
      })
    );

    expect(getDefaultPaymentCard(methods)?.id).toBe('mastercard');
  });

  it('ignores malformed local records', () => {
    expect(parsePaymentMethods('{not-json')).toEqual({
      version: 2,
      cards: [],
      defaultCardId: null,
    });
  });
});
