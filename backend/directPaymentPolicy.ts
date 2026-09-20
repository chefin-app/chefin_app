export const DIRECT_PAYMENT_NOTICE =
  'You pay the cook directly. Chefin does not receive or hold this payment and cannot reverse the transfer. Refunds must be returned by the cook; Chefin can help review disputes.';

export function validateDirectMethod(
  method: unknown,
  fulfillment: string,
  settings: {
    qr_enabled: boolean;
    qr_image: string | null;
    recipient_name: string | null;
    collection_enabled: boolean;
  } | null,
  acknowledged: unknown
): string | null {
  if (method !== 'cook_qr' && method !== 'pay_on_collection')
    return 'Choose a supported payment method.';
  if (acknowledged !== true) return 'Please acknowledge the direct payment information.';
  if (method === 'pay_on_collection') {
    if (fulfillment !== 'pickup')
      return 'Pay on collection is only available for pickup. Delivery requires advance payment.';
    if (!settings?.collection_enabled) return 'This cook does not offer pay on collection.';
  } else if (!settings?.qr_enabled || !settings.qr_image || !settings.recipient_name) {
    return 'This cook has not enabled DuitNow QR payments.';
  }
  return null;
}
