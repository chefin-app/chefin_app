import type { MenuOptionGroup } from '@/src/types/menuOptions';

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
  deepLink:
    | { pathname: '/admin/moderation'; params: { reportId: string } }
    | { pathname: '/admin/cooks'; params: { userId: string; documentId?: string } }
    | { pathname: '/admin/orders'; params: { orderId: string } }
    | { pathname: '/admin/users'; params: { userId: string } };
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

export type CookManagementFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'pending'
  | 'reverification'
  | 'rejected';
export type CookManagementSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

export interface ManagedCook {
  userId: string;
  profileId: string;
  displayId: string;
  name: string;
  restaurantName: string | null;
  email: string;
  avatarUrl: string | null;
  address: string;
  joinedAt: string;
  accountStatus: ManagedAccountStatus;
  applicationStatus: string;
  identityStatus: string;
  complianceStatus: string;
  reverificationDueAt: string | null;
  eligibleToSell: boolean;
  verified: boolean;
  dishCount: number;
}

export interface CookManagementResponse {
  stats: {
    totalCooks: number;
    activeCooks: number;
    pendingVerification: number;
    reverificationRequired: number;
  };
  cooks: ManagedCook[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ManagedCookDetails {
  cook: {
    userId: string;
    profileId: string;
    displayId: string;
    name: string;
    restaurantName: string | null;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    bio: string | null;
    address: string;
    joinedAt: string;
    lastSignInAt: string | null;
    accountStatus: ManagedAccountStatus;
    verified: boolean;
    verificationTier: number;
    hostingType: string | null;
  };
  application: {
    status: string;
    identity_status: string;
    compliance_status: string;
    citizenship_type: string | null;
    submitted_at: string | null;
    reviewer_note: string | null;
    reverification_due_at: string | null;
  } | null;
  summary: {
    ordersDone: number;
    totalEarned: number;
    averageRating: number | null;
    ratingCount: number;
    dishCount: number;
  };
  listings: Array<{
    id: string;
    title: string;
    cuisine: string | null;
    status: string;
    is_active: boolean;
  }>;
  complianceDocuments: Array<{
    id: string;
    doc_type: string;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  }>;
  identityDocuments: Array<{
    id: string;
    document_type: string;
    status: string;
    reviewer_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  }>;
  canReviewIdentity: boolean;
}

export type DishManagementStatus = 'active' | 'inactive' | 'pending' | 'rejected';
export type DishManagementFilter = DishManagementStatus | 'all' | 'flagged';
export type DishManagementSort =
  | 'newest'
  | 'oldest'
  | 'title_asc'
  | 'title_desc'
  | 'price_asc'
  | 'price_desc'
  | 'orders_desc'
  | 'rating_desc';
export type DishManagementDateRange = 'all' | 'today' | '7d' | '30d' | '90d';
export type DishManagementAction =
  | 'approve'
  | 'reject'
  | 'unpublish'
  | 'republish'
  | 'clear_rejection';

export interface ManagedDish {
  id: string;
  displayId: string;
  cookId: string;
  cookUserId: string;
  title: string;
  cookName: string;
  restaurantName: string | null;
  cuisine: string | null;
  price: number;
  imageUrl: string | null;
  reviewStatus: string;
  isActive: boolean;
  status: DishManagementStatus;
  createdAt: string;
  totalOrders: number;
  averageRating: number | null;
  ratingCount: number;
  openReportCount: number;
}

export interface DishManagementResponse {
  stats: {
    totalDishes: number;
    activeDishes: number;
    inactiveDishes: number;
    pendingReview: number;
    flaggedDishes: number;
    averagePrice: number;
  };
  dishes: ManagedDish[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ManagedDishDetails {
  dish: ManagedDish & {
    description: string | null;
    dietaryTags: string[];
    ingredients: string[];
    menuCategory: string;
    cookAddress: string;
    freeDeliveryThreshold: number | null;
    portionsSold: number;
  };
  optionGroups: MenuOptionGroup[];
  availability: {
    settings: {
      enabled: boolean;
      scheduleMode: string;
      maxOrdersPerWindow: number;
      dailyStockLimit: number | null;
    } | null;
    openingHours: Array<{
      id: string;
      isoWeekday: number;
      opensAt: string;
      closesAt: string;
      enabled: boolean;
    }>;
    sellingSchedule: {
      id: string;
      name: string;
      specificDates: boolean;
      startsOn: string | null;
      endsOn: string | null;
      windows: Array<{
        id: string;
        isoWeekday: number;
        allDay: boolean;
        opensAt: string | null;
        closesAt: string | null;
      }>;
      listingIds: string[];
    } | null;
  };
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string | null;
    customerName: string;
    customerImageUrl: string | null;
  }>;
  reports: Array<{
    id: string;
    reporter_id: string;
    target_label: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    reviewed_by: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
  }>;
  reviewHistory: Array<{
    id: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
    actorName: string;
  }>;
}
