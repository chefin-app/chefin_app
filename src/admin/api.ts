import type {
  AdminActivityItem,
  AdminIdentity,
  AdminOverviewData,
  ManagedUserDetails,
  ModerationReport,
  OverviewPeriod,
  UserManagementFilter,
  UserManagementResponse,
  UserManagementSort,
} from './types';

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

async function adminRequest<T>(
  path: string,
  accessToken: string,
  init?: { method?: 'POST' | 'PATCH'; body?: Record<string, unknown> }
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/api/admin${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
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

export const fetchManagedUsers = (
  accessToken: string,
  options: {
    search: string;
    filter: UserManagementFilter;
    sort: UserManagementSort;
    dateRange: string;
    page: number;
    pageSize: number;
  }
): Promise<UserManagementResponse> => {
  const params = new URLSearchParams({
    search: options.search,
    filter: options.filter,
    sort: options.sort,
    dateRange: options.dateRange,
    page: String(options.page),
    pageSize: String(options.pageSize),
  });
  return adminRequest(`/users?${params.toString()}`, accessToken);
};

export const fetchManagedUserDetails = (
  accessToken: string,
  userId: string
): Promise<ManagedUserDetails> => adminRequest(`/users/${userId}`, accessToken);

export const inviteManagedUser = (
  accessToken: string,
  input: { email: string; fullName: string; role: string }
) =>
  adminRequest<{ success: true; userId: string }>('/users/invite', accessToken, {
    method: 'POST',
    body: input,
  });

export const updateManagedUser = (
  accessToken: string,
  userId: string,
  input: Record<string, unknown>
) =>
  adminRequest<{ success: true }>(`/users/${userId}`, accessToken, {
    method: 'PATCH',
    body: input,
  });

export const runManagedUserAction = <T = { success: true }>(
  accessToken: string,
  userId: string,
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> => adminRequest(`/users/${userId}/${action}`, accessToken, { method: 'POST', body });

export const fetchModerationReports = async (
  accessToken: string,
  options: { status: string; search: string }
): Promise<{ reports: ModerationReport[]; counts: Record<string, number> }> => {
  const params = new URLSearchParams(options);
  return adminRequest(`/moderation?${params.toString()}`, accessToken);
};

export const updateModerationReport = (
  accessToken: string,
  reportId: string,
  input: { status: string; resolutionNote?: string }
) =>
  adminRequest<{ success: true }>(`/moderation/${reportId}`, accessToken, {
    method: 'PATCH',
    body: input,
  });

export const reviewVerificationDocument = async (
  accessToken: string,
  input: {
    documentId: string;
    decision: 'approved' | 'rejected' | 'more_info_requested';
    reviewerNote?: string;
  }
) => {
  const response = await fetch(`${getApiUrl()}/api/verification/review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: input.documentId,
      decision: input.decision,
      reviewer_note: input.reviewerNote,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new AdminApiError(payload.error ?? 'Verification review failed.', response.status);
  return payload;
};

export const fetchVerificationDocumentFile = async (
  accessToken: string,
  documentId: string
): Promise<{ fileUrl: string; expiresInSeconds: number }> => {
  const response = await fetch(
    `${getApiUrl()}/api/verification/document/${encodeURIComponent(documentId)}/file`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const payload = (await response.json().catch(() => ({}))) as {
    fileUrl?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  if (!response.ok || !payload.fileUrl) {
    throw new AdminApiError(
      payload.error ?? 'The verification document could not be opened.',
      response.status
    );
  }
  return {
    fileUrl: payload.fileUrl,
    expiresInSeconds: payload.expiresInSeconds ?? 600,
  };
};
