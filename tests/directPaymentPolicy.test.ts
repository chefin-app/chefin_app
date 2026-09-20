import { validateDirectMethod } from '../backend/directPaymentPolicy';

const settings = {
  qr_enabled: true,
  qr_image: 'qr',
  recipient_name: 'Cook',
  collection_enabled: true,
};
describe('direct payment checkout rules', () => {
  it('allows direct QR for collection and third-party delivery', () => {
    expect(validateDirectMethod('cook_qr', 'delivery', settings, true)).toBeNull();
    expect(validateDirectMethod('cook_qr', 'pickup', settings, true)).toBeNull();
  });
  it('rejects pay-on-delivery even if collection payment is enabled', () => {
    expect(validateDirectMethod('pay_on_collection', 'delivery', settings, true)).toMatch(
      /only available for pickup/
    );
    expect(validateDirectMethod('cod', 'delivery', settings, true)).toMatch(/supported/);
  });
  it('requires cook opt-in and buyer acknowledgement', () => {
    expect(validateDirectMethod('cook_qr', 'pickup', settings, false)).toMatch(/acknowledge/);
    expect(
      validateDirectMethod(
        'pay_on_collection',
        'pickup',
        { ...settings, collection_enabled: false },
        true
      )
    ).toMatch(/does not offer/);
    expect(
      validateDirectMethod('cook_qr', 'delivery', { ...settings, qr_image: null }, true)
    ).toMatch(/not enabled/);
    expect(validateDirectMethod('cook_qr', 'delivery', null, true)).toMatch(/not enabled/);
  });
  it('rejects legacy demo-card checkout rather than silently treating it as paid', () => {
    expect(validateDirectMethod(undefined, 'pickup', settings, true)).toMatch(/supported/);
    expect(validateDirectMethod('demo_card', 'pickup', settings, true)).toMatch(/supported/);
  });
});
