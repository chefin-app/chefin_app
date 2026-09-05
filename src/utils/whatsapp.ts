export interface PickupWhatsAppOrderSummary {
  quantity: number;
  dishTitle: string;
  selectedOptions?: Array<{
    groupName: string;
    options: Array<{ optionName: string }>;
  }>;
}

export interface PickupWhatsAppMessageDetails extends PickupWhatsAppOrderSummary {
  senderName?: string;
  recipientName: string;
  senderRole: 'buyer' | 'cook';
}

export const normalizeWhatsAppPhone = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.startsWith('0')) return `60${digits.slice(1)}`;
  return digits;
};

export const formatPickupOrderSummary = ({
  quantity,
  dishTitle,
  selectedOptions = [],
}: PickupWhatsAppOrderSummary): string => {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const summaryLines = [`${safeQuantity}× ${dishTitle.trim() || 'Dish'}`];

  selectedOptions.forEach(group => {
    const optionNames = group.options.map(option => option.optionName.trim()).filter(Boolean);
    if (optionNames.length > 0) {
      summaryLines.push(`${group.groupName.trim() || 'Options'}: ${optionNames.join(', ')}`);
    }
  });

  return summaryLines.join('\n');
};

export const buildPickupWhatsAppUrl = (
  phoneNumber: string,
  messageDetails: PickupWhatsAppMessageDetails
): string => {
  const phone = normalizeWhatsAppPhone(phoneNumber);
  const recipientName = messageDetails.recipientName.trim() || 'there';
  const senderName = messageDetails.senderName?.trim();
  const senderDescription = messageDetails.senderRole === 'buyer' ? 'the buyer' : 'the cook';
  const introduction = senderName
    ? `this is ${senderName}, ${senderDescription}`
    : `I'm ${senderDescription}`;
  const message = `Hi ${recipientName}, ${introduction} for this Chefin pickup.\n\nOrder summary:\n${formatPickupOrderSummary(messageDetails)}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};
