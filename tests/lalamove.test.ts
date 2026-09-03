import { createHmac } from 'crypto';

import { createLalamoveSignature, verifyLalamoveWebhook } from '../backend/lalamove';

describe('Lalamove HMAC integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LALAMOVE_API_KEY: 'test-key',
      LALAMOVE_API_SECRET: 'test-secret',
      LALAMOVE_WEBHOOK_PATH: '/api/delivery/lalamove/webhook',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('signs outbound requests using the documented CRLF payload', () => {
    const timestamp = '1788310000000';
    const body = JSON.stringify({ data: { serviceType: 'MOTORCYCLE' } });
    const expected = createHmac('sha256', 'test-secret')
      .update(`${timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n${body}`)
      .digest('hex');

    expect(createLalamoveSignature(timestamp, 'post', '/v3/quotations', body, 'test-secret')).toBe(
      expected
    );
  });

  it('accepts a valid webhook and rejects tampered delivery data', () => {
    const timestamp = '1788310000000';
    const data = { orderId: 'lalamove-order-1', status: 'COMPLETED' };
    const signature = createLalamoveSignature(
      timestamp,
      'POST',
      '/api/delivery/lalamove/webhook',
      JSON.stringify(data),
      'test-secret'
    );

    expect(verifyLalamoveWebhook({ apiKey: 'test-key', timestamp, signature, data })).toBe(true);
    expect(
      verifyLalamoveWebhook({
        apiKey: 'test-key',
        timestamp,
        signature,
        data: { ...data, status: 'CANCELED' },
      })
    ).toBe(false);
  });
});
