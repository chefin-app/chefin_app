import { markAdminActivityRead } from '@/src/admin/api';

describe('admin activity read persistence', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    jest.restoreAllMocks();
  });

  it('persists the stable activity IDs for one or many notifications', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await markAdminActivityRead('admin-token', ['report-123', 'refund-456']);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/admin/activity/read',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
        body: JSON.stringify({ activityIds: ['report-123', 'refund-456'] }),
      })
    );
  });
});
