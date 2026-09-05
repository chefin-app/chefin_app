import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildPickupWhatsAppUrl, type PickupWhatsAppOrderSummary } from '@/src/utils/whatsapp';

type CoordinationPayload = {
  pickupPoint: { name: string; address: string };
  contact: { name: string; phoneNumber: string | null };
  sender?: { name: string; role: 'buyer' | 'cook' };
};

export default function PickupCoordinationCard({
  orderId,
  accessToken,
  orderSummary,
  senderRole,
}: {
  orderId: string;
  accessToken: string | undefined;
  orderSummary: PickupWhatsAppOrderSummary;
  senderRole: 'buyer' | 'cook';
}) {
  const [details, setDetails] = useState<CoordinationPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}/pickup-coordination`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async response => {
        const body = (await response.json().catch(() => ({}))) as CoordinationPayload & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? 'Pickup details are unavailable.');
        if (!cancelled) setDetails(body);
      })
      .catch(error => {
        if (!cancelled) console.warn('Could not load pickup coordination', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, orderId]);

  const openWhatsApp = () => {
    if (!details?.contact.phoneNumber) return;
    Alert.alert(
      'Continue to WhatsApp?',
      `You’ll contact ${details.contact.name} outside Chefin. WhatsApp will reveal your phone number to them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open WhatsApp',
          onPress: () =>
            Linking.openURL(
              buildPickupWhatsAppUrl(details.contact.phoneNumber!, {
                ...orderSummary,
                senderName: details.sender?.name,
                recipientName: details.contact.name,
                senderRole: details.sender?.role ?? senderRole,
              })
            ),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator size="small" color="#237A3B" />
        <Text style={styles.loadingText}>Loading pickup point…</Text>
      </View>
    );
  }
  if (!details) return null;

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={21} color="#237A3B" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>CONFIRMED PICKUP POINT</Text>
          <Text style={styles.title}>{details.pickupPoint.name}</Text>
        </View>
      </View>
      <Text style={styles.address}>{details.pickupPoint.address}</Text>
      <Text style={styles.note}>Meet at this registered restaurant address for collection.</Text>
      {details.contact.phoneNumber ? (
        <TouchableOpacity style={styles.whatsAppButton} activeOpacity={0.8} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.whatsAppText}>Message {details.contact.name} on WhatsApp</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.unavailableText}>
          WhatsApp contact is unavailable for this account.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#BFD8C5',
    backgroundColor: '#F4FAF5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: '#506255', fontSize: 13, fontWeight: '600' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDEFE1',
  },
  copy: { flex: 1 },
  eyebrow: { color: '#4D7055', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: '#173F21', fontSize: 16, fontWeight: '800', marginTop: 2 },
  address: { color: '#2F3B32', fontSize: 14, lineHeight: 21, marginTop: 12 },
  note: { color: '#68736A', fontSize: 12, lineHeight: 17, marginTop: 5 },
  whatsAppButton: {
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: '#168A47',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 15,
    paddingHorizontal: 14,
  },
  whatsAppText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  unavailableText: { color: '#7A641E', fontSize: 12, lineHeight: 17, marginTop: 12 },
});
