import type { Ionicons } from '@expo/vector-icons';

/**
 * Transactional notification types emitted by the backend (see
 * backend/notifications.ts) with how each renders in the app.
 */
export type NotificationType =
  | 'order_placed'
  | 'new_order'
  | 'order_confirmed'
  | 'order_ready'
  | 'order_cancelled'
  | 'payout_sent'
  | 'verification_approved'
  | 'verification_rejected'
  | 'dish_approved'
  | 'dish_rejected'
  | 'favourite_new_dish'
  | 'favourite_new_slots'
  | 'review_request';

interface NotificationTypeMeta {
  icon: keyof typeof Ionicons.glyphMap;
  /** Icon + accent colour. */
  color: string;
  /** Soft background behind the icon. */
  background: string;
}

export const NOTIFICATION_TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  order_placed: { icon: 'card-outline', color: '#1976D2', background: '#E3F2FD' },
  new_order: { icon: 'receipt-outline', color: '#4CAF50', background: '#E8F5E9' },
  order_confirmed: { icon: 'checkmark-circle-outline', color: '#1976D2', background: '#E3F2FD' },
  order_ready: { icon: 'restaurant-outline', color: '#2E7D32', background: '#E8F5E9' },
  order_cancelled: { icon: 'close-circle-outline', color: '#C62828', background: '#FFEBEE' },
  payout_sent: { icon: 'cash-outline', color: '#B26A00', background: '#FFF3E0' },
  verification_approved: {
    icon: 'shield-checkmark-outline',
    color: '#2E7D32',
    background: '#E8F5E9',
  },
  verification_rejected: { icon: 'shield-outline', color: '#C62828', background: '#FFEBEE' },
  dish_approved: { icon: 'checkmark-done-outline', color: '#2E7D32', background: '#E8F5E9' },
  dish_rejected: { icon: 'alert-circle-outline', color: '#C62828', background: '#FFEBEE' },
  favourite_new_dish: { icon: 'heart-outline', color: '#E91E63', background: '#FCE4EC' },
  favourite_new_slots: { icon: 'time-outline', color: '#E91E63', background: '#FCE4EC' },
  review_request: { icon: 'star-outline', color: '#B26A00', background: '#FFF3E0' },
};

export const DEFAULT_NOTIFICATION_META: NotificationTypeMeta = {
  icon: 'notifications-outline',
  color: '#666',
  background: '#F0F0F0',
};
