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
