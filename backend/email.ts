const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export async function sendAdminEmail(input: {
  to: string;
  subject: string;
  message: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ADMIN_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return { sent: false, error: 'Email delivery is not configured.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.message,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#26322b"><p>${escapeHtml(
          input.message
        ).replace(/\n/g, '<br/>')}</p><p style="color:#6b746e">Chefin Support</p></div>`,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      return { sent: false, error: payload.message ?? 'Email provider rejected the message.' };
    }
    return { sent: true };
  } catch (error: unknown) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Email delivery failed.',
    };
  }
}
