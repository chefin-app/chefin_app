import type { AdminActivityItem, AdminIdentity, AdminOverviewData, OverviewPeriod } from './types';

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const getApiUrl = (): string => {
  const value = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!value) throw new AdminApiError('The admin API URL is not configured.', 0);
  return value;
};

async function adminRequest<T>(path: string, accessToken: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/api/admin${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new AdminApiError('The admin service is currently unreachable.', 0);
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new AdminApiError(payload.error ?? 'The admin request failed.', response.status);
  }
  return payload;
}

export const fetchAdminSession = async (accessToken: string): Promise<AdminIdentity> => {
  const response = await adminRequest<{ admin: AdminIdentity }>('/session', accessToken);
  return response.admin;
};

export const fetchAdminOverview = (
  accessToken: string,
  period: OverviewPeriod
): Promise<AdminOverviewData> => adminRequest(`/overview?period=${period}`, accessToken);

export const fetchAdminActivity = async (accessToken: string): Promise<AdminActivityItem[]> => {
  const response = await adminRequest<{ activity: AdminActivityItem[] }>('/activity', accessToken);
  return response.activity;
};
