import {
  buildPickupWhatsAppUrl,
  formatPickupOrderSummary,
  normalizeWhatsAppPhone,
} from '../src/utils/whatsapp';

describe('pickup WhatsApp links', () => {
  it('converts a local Malaysian number to international format', () => {
    expect(normalizeWhatsAppPhone('012-345 6789')).toBe('60123456789');
  });

  it('preserves an international Malaysian number without punctuation', () => {
    expect(normalizeWhatsAppPhone('+60 12-345 6789')).toBe('60123456789');
  });

  it('prefills a buyer-friendly order summary instead of an order reference', () => {
    const url = buildPickupWhatsAppUrl('0123456789', {
      senderName: 'Nathan',
      recipientName: 'Aisha',
      senderRole: 'buyer',
      quantity: 2,
      dishTitle: 'Nasi Lemak',
      selectedOptions: [
        {
          groupName: 'Spice level',
          options: [{ optionName: 'Hot' }],
        },
      ],
    });
    const decodedUrl = decodeURIComponent(url);

    expect(url).toContain('https://wa.me/60123456789?text=');
    expect(decodedUrl).toContain('Hi Aisha, this is Nathan, the buyer for this Chefin pickup.');
    expect(decodedUrl).toContain('Order summary:\n2× Nasi Lemak\nSpice level: Hot');
    expect(decodedUrl).not.toContain('CF-');
  });

  it('identifies the cook when they initiate the conversation', () => {
    const decodedUrl = decodeURIComponent(
      buildPickupWhatsAppUrl('0123456789', {
        senderName: 'Aisha',
        recipientName: 'Nathan',
        senderRole: 'cook',
        quantity: 1,
        dishTitle: 'Roti Canai',
      })
    );

    expect(decodedUrl).toContain('Hi Nathan, this is Aisha, the cook for this Chefin pickup.');
  });

  it('uses the sender role when an older API response has no sender name', () => {
    const decodedUrl = decodeURIComponent(
      buildPickupWhatsAppUrl('0123456789', {
        recipientName: 'Aisha',
        senderRole: 'buyer',
        quantity: 1,
        dishTitle: 'Roti Canai',
      })
    );

    expect(decodedUrl).toContain("Hi Aisha, I'm the buyer for this Chefin pickup.");
  });

  it('omits empty option groups from the summary', () => {
    expect(
      formatPickupOrderSummary({
        quantity: 1,
        dishTitle: 'Roti Canai',
        selectedOptions: [{ groupName: 'Extras', options: [] }],
      })
    ).toBe('1× Roti Canai');
  });
});
