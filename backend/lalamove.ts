import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const WEBHOOK_PATH = '/api/delivery/lalamove/webhook';

export type DeliveryStop = {
  coordinates: { lat: string; lng: string };
  address: string;
};

export type LalamoveQuotation = {
  quotationId: string;
  expiresAt: string;
  scheduleAt: string;
  serviceType: string;
  stops: Array<DeliveryStop & { stopId: string }>;
  priceBreakdown: { total: string; currency?: string; [key: string]: unknown };
  distance?: { value: string; unit: string };
  [key: string]: unknown;
};

export type LalamoveOrder = {
  orderId: string;
  quotationId: string;
  driverId?: string;
  shareLink?: string;
  status: string;
  priceBreakdown?: { total?: string; currency?: string; [key: string]: unknown };
  distance?: { value: string; unit: string };
  [key: string]: unknown;
};

type Contact = { stopId: string; name: string; phone: string; remarks?: string };

const config = () => {
  const apiKey = process.env.LALAMOVE_API_KEY?.trim();
  const apiSecret = process.env.LALAMOVE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error(
      'Live delivery quotes are not configured yet. Choose pickup or try again later.'
    );
  }
  const environment = process.env.LALAMOVE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  return {
    apiKey,
    apiSecret,
    market: process.env.LALAMOVE_MARKET?.trim() || 'MY',
    serviceType: process.env.LALAMOVE_SERVICE_TYPE?.trim() || 'MOTORCYCLE',
    hostname:
      environment === 'production'
        ? 'https://rest.lalamove.com'
        : 'https://rest.sandbox.lalamove.com',
  };
};

const errorMessage = (payload: unknown, status: number): string => {
  if (payload && typeof payload === 'object') {
    const value = payload as {
      message?: string;
      errors?: Array<{ message?: string; detail?: string }> | { message?: string; detail?: string };
    };
    const errors = Array.isArray(value.errors) ? value.errors : value.errors ? [value.errors] : [];
    const detail = errors
      .map(error => error.detail || error.message)
      .filter(Boolean)
      .join(' ');
    if (detail) return detail;
    if (value.message) return value.message;
  }
  return `Lalamove request failed (${status}).`;
};

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

export class LalamoveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'LalamoveApiError';
  }
}

export const createLalamoveSignature = (
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secret: string
) =>
  createHmac('sha256', secret)
    .update(`${timestamp}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${body}`)
    .digest('hex');

async function request<T>(
  method: string,
  path: string,
  data?: Record<string, unknown>,
  options: { maxAttempts?: number } = {}
): Promise<T> {
  const current = config();
  const body = data ? JSON.stringify({ data }) : '';
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timestamp = Date.now().toString();
    const requestId = randomUUID();
    const signature = createLalamoveSignature(timestamp, method, path, body, current.apiSecret);
    const response = await fetch(`${current.hostname}${path}`, {
      method,
      headers: {
        Authorization: `hmac ${current.apiKey}:${timestamp}:${signature}`,
        Market: current.market,
        'Request-ID': requestId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    });
    const responseText = await response.text();
    let payload: { data?: T } = {};
    try {
      payload = responseText ? (JSON.parse(responseText) as { data?: T }) : {};
    } catch {
      // Keep the response private; the status and request ID are enough to diagnose it.
    }
    if (response.ok && payload.data) return payload.data;

    const providerRequestId =
      response.headers.get('request-id') ?? response.headers.get('x-request-id') ?? requestId;
    const retryable = response.status >= 500 && response.status <= 599;
    console.warn('Lalamove API request failed', {
      method,
      path,
      status: response.status,
      requestId: providerRequestId,
      attempt,
      maxAttempts,
    });
    if (retryable && attempt < maxAttempts) {
      await wait(attempt * 400);
      continue;
    }
    const providerMessage = errorMessage(payload, response.status);
    throw new LalamoveApiError(
      `${providerMessage} (HTTP ${response.status}, Request ID ${providerRequestId})`,
      response.status,
      providerRequestId,
      retryable
    );
  }

  throw new Error('Lalamove quotation request unexpectedly stopped.');
}

export function createLalamoveQuotation(input: {
  pickup: DeliveryStop;
  dropoff: DeliveryStop;
  scheduleAt: string;
}) {
  const current = config();
  return request<LalamoveQuotation>(
    'POST',
    '/v3/quotations',
    {
      scheduleAt: input.scheduleAt,
      serviceType: current.serviceType,
      language: 'en_MY',
      stops: [input.pickup, input.dropoff],
    },
    // Quotations do not create a delivery order, so retrying transient 5xx failures is safe.
    { maxAttempts: 3 }
  );
}

export function placeLalamoveOrder(input: {
  quotationId: string;
  sender: Contact;
  recipient: Contact;
  deliveryJobId: string;
}) {
  return request<LalamoveOrder>('POST', '/v3/orders', {
    quotationId: input.quotationId,
    sender: input.sender,
    recipients: [input.recipient],
    isPODEnabled: true,
    metadata: { chefinDeliveryJobId: input.deliveryJobId },
  });
}

export async function cancelLalamoveOrder(orderId: string): Promise<void> {
  await request<LalamoveOrder>('DELETE', `/v3/orders/${encodeURIComponent(orderId)}`);
}

export function getLalamoveDriver(orderId: string, driverId: string) {
  return request<{
    driverId: string;
    name?: string;
    phone?: string;
    plateNumber?: string;
    photo?: string;
    coordinates?: { lat: string; lng: string; updatedAt?: string };
  }>('GET', `/v3/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(driverId)}`);
}

export function verifyLalamoveWebhook(payload: {
  apiKey?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  data?: unknown;
}): boolean {
  let current: ReturnType<typeof config>;
  try {
    current = config();
  } catch {
    return false;
  }
  if (
    payload.apiKey !== current.apiKey ||
    !['string', 'number'].includes(typeof payload.timestamp) ||
    typeof payload.signature !== 'string' ||
    !payload.data
  ) {
    return false;
  }
  const expected = createLalamoveSignature(
    String(payload.timestamp),
    'POST',
    process.env.LALAMOVE_WEBHOOK_PATH?.trim() || WEBHOOK_PATH,
    JSON.stringify(payload.data),
    current.apiSecret
  );
  const provided = payload.signature.toLowerCase();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
