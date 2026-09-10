import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  type AppNotification,
  type NotificationRole,
  useNotifications,
} from '@/src/context/NotificationsContext';

interface OrderFulfilledPopupProps {
  role: NotificationRole | null;
}

const isFulfilledNotification = (item: AppNotification, role: NotificationRole): boolean =>
  item.recipient_role === role &&
  !item.read &&
  (role === 'cook' ? item.type === 'payout_sent' : item.type === 'review_request');

const orderIdFrom = (item: AppNotification): string | null => {
  if (typeof item.data?.order_id === 'string') return item.data.order_id;
  if (Array.isArray(item.data?.order_ids)) {
    const first = item.data.order_ids.find(value => typeof value === 'string');
    return typeof first === 'string' ? first : null;
  }
  return null;
};

/**
 * Turns the existing real-time completion notifications into a prominent,
 * one-at-a-time acknowledgement. Dismissing the dialog marks its notification
 * read, so it will not be replayed on the next app launch.
 */
export default function OrderFulfilledPopup({ role }: OrderFulfilledPopupProps) {
  const router = useRouter();
  const { notifications, markAsRead } = useNotifications();
  const [activeId, setActiveId] = useState<string | null>(null);

  const candidate = useMemo(
    () => (role ? notifications.find(item => isFulfilledNotification(item, role)) : undefined),
    [notifications, role]
  );
  const activeNotification = useMemo(
    () =>
      role
        ? (notifications.find(
            item => item.id === activeId && isFulfilledNotification(item, role)
          ) ?? null)
        : null,
    [activeId, notifications, role]
  );

  useEffect(() => {
    setActiveId(null);
  }, [role]);

  useEffect(() => {
    if (!role || activeId || !candidate) return;
    // Completion can arrive while the cook's PIN sheet is closing. A short
    // delay keeps the native modal transition smooth on iOS and Android.
    const timer = setTimeout(() => setActiveId(candidate.id), 350);
    return () => clearTimeout(timer);
  }, [activeId, candidate, role]);

  useEffect(() => {
    if (activeId && !activeNotification) setActiveId(null);
  }, [activeId, activeNotification]);

  const dismiss = () => {
    if (!activeNotification) return;
    const id = activeNotification.id;
    setActiveId(null);
    markAsRead(id).catch(error => console.warn('Could not dismiss fulfilled message', error));
  };

  const rateOrder = () => {
    if (!activeNotification) return;
    const orderId = orderIdFrom(activeNotification);
    dismiss();
    if (orderId) {
      router.push({ pathname: '/review/[orderId]', params: { orderId } });
    } else {
      router.push('/(user)/food-orders');
    }
  };

  const isCook = role === 'cook';

  return (
    <Modal
      visible={Boolean(activeNotification)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.card} accessibilityViewIsModal>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close order fulfilled message"
            onPress={dismiss}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color="#536057" />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={38} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Order fulfilled!</Text>
          <Text style={styles.body}>
            {activeNotification?.body ??
              (isCook
                ? 'Your earnings will be credited to your account.'
                : 'Your order is complete. Tell us how it went.')}
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={isCook ? dismiss : rateOrder}
            activeOpacity={0.82}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{isCook ? 'Got it' : 'Rate your order'}</Text>
          </TouchableOpacity>
          {!isCook && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={dismiss}
              activeOpacity={0.75}
              style={styles.laterButton}
            >
              <Text style={styles.laterButtonText}>Maybe later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(15, 24, 18, 0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 38,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    marginBottom: 20,
    backgroundColor: '#42C975',
  },
  title: {
    color: '#17241B',
    fontFamily: 'mon-b',
    fontSize: 23,
    lineHeight: 29,
    textAlign: 'center',
  },
  body: {
    maxWidth: 310,
    marginTop: 10,
    color: '#657068',
    fontFamily: 'mon',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    marginTop: 24,
    paddingHorizontal: 20,
    backgroundColor: '#42C975',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'mon-b',
    fontSize: 15,
  },
  laterButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingHorizontal: 18,
  },
  laterButtonText: {
    color: '#536057',
    fontFamily: 'mon-sb',
    fontSize: 13,
  },
});
