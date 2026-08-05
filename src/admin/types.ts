export type AdminAccessStatus =
  | 'checking'
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'error';

export interface AdminIdentity {
  userId: string;
  email: string | null;
  fullName: string;
  profileImage: string | null;
}

export type OverviewPeriod = '7d' | '30d' | '90d' | '1y';

export interface AdminActivityItem {
  id: string;
  type: 'report' | 'verification' | 'order' | 'cook' | 'user';
  title: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
  unread: boolean;
}

export interface AdminOverviewData {
  period: OverviewPeriod;
  generatedAt: string;
  summary: {
    totalUsers: number;
    totalCooks: number;
    totalDishes: number;
    totalOrders: number;
    recordedOrderValue: number;
    pendingActions: number;
  };
  salesSeries: Array<{ label: string; value: number; orders: number }>;
  breakdowns: {
    accounts: { users: number; cooks: number };
    fulfillment: { pickup: number; delivery: number };
    orderStatus: Record<string, number>;
    dishStatus: Record<string, number>;
  };
  topCooks: Array<{
    id: string;
    displayId: string;
    name: string;
    ownerName: string;
    avatarUrl: string | null;
    cuisine: string;
    totalOrders: number;
    averageRating: number | null;
    recordedOrderValue: number;
  }>;
  recentOrders: Array<{
    id: string;
    displayId: string;
    mealName: string;
    imageUrl: string | null;
    customerName: string;
    cookName: string;
    fulfillmentType: string;
    orderValue: number;
    status: string;
    createdAt: string | null;
  }>;
}

export type ManagedAccountStatus = 'active' | 'suspended' | 'deactivated';
export type ManagedPrimaryRole = 'Admin' | 'Cook' | 'Customer';
export type UserManagementFilter =
  | 'all'
  | 'cooks'
  | 'customers'
  | 'admins'
  | 'pending_verification'
  | 'flagged'
  | 'suspended'
  | 'deactivated';
export type UserManagementSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'last_active';

export interface ManagedUser {
  userId: string;
  profileId: string | null;
  displayId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  roles: string[];
  primaryRole: ManagedPrimaryRole;
  verified: boolean | null;
  joinedAt: string;
  lastSignInAt: string | null;
  status: ManagedAccountStatus;
  suspensionEndsAt: string | null;
  reportCount: number;
  reportsSubmitted: number;
  pendingVerification: boolean;
}

export interface UserManagementResponse {
  stats: {
    totalUsers: number;
    activeCooks: number;
    activeCustomers: number;
    flagged: number;
    pendingVerification: number;
  };
  users: ManagedUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ManagedReportSummary {
  id: string;
  target_type: string;
  target_label: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
}

export interface ManagedUserDetails {
  user: ManagedUser & {
    profileId: string;
    restaurantName: string | null;
    verificationTier: number;
    updatedAt: string | null;
    suspensionReason: string | null;
    suspendedAt: string | null;
    deactivatedAt: string | null;
    deactivationReason: string | null;
  };
  summary: {
    ordersPlaced: number;
    recordedSpend: number;
    reviewsSubmitted: number;
    reportsSubmitted: number;
    reportsAgainst: number;
  };
  reportsSubmitted: ManagedReportSummary[];
  reportsAgainst: ManagedReportSummary[];
  verificationDocuments: Array<{
    id: string;
    doc_type: string;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  }>;
  activity: Array<{
    id: string;
    actor_user_id?: string;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface ModerationReport {
  id: string;
  reporter_id: string;
  target_type: 'listing' | 'restaurant';
  target_id: string;
  target_label: string;
  target_snapshot: Record<string, unknown>;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewing' | 'actioned' | 'dismissed';
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  profiles:
    | { full_name: string; profile_image: string | null; user_id: string }
    | Array<{ full_name: string; profile_image: string | null; user_id: string }>
    | null;
}
