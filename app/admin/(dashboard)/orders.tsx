import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { AdminPanel } from '@/src/components/admin/AdminOverviewUI';

export default function OrderMonitoringPlaceholder() {
  const { cookId, orderId } = useLocalSearchParams<{ cookId?: string; orderId?: string }>();
  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>
      <Text style={styles.title}>Order Monitoring</Text>
      <Text style={styles.subtitle}>
        This is the destination for cook-level order drill-downs. The full monitoring table is
        scheduled for the Order Monitoring phase.
      </Text>
      <AdminPanel style={styles.panel}>
        <Ionicons name="receipt-outline" size={36} color="#4CAF50" />
        <Text style={styles.panelTitle}>
          {orderId ? 'Order selected' : 'Cook filter carried forward'}
        </Text>
        <Text style={styles.panelBody}>
          {orderId
            ? `Selected order: ${orderId}`
            : cookId
              ? `Selected cook: ${cookId}`
              : 'Open this page from a cook record to carry its user ID into the future order filters.'}
        </Text>
      </AdminPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 28, backgroundColor: '#F5F7F8' },
  eyebrow: { fontSize: 10, fontWeight: '800', color: '#4CAF50', letterSpacing: 1.4 },
  title: { fontSize: 32, fontWeight: '800', color: '#202823', marginTop: 5 },
  subtitle: { fontSize: 14, lineHeight: 21, color: '#6F7973', marginTop: 7, maxWidth: 720 },
  panel: { marginTop: 24, alignItems: 'center', paddingVertical: 50 },
  panelTitle: { marginTop: 14, fontSize: 16, fontWeight: '800', color: '#28332C' },
  panelBody: { marginTop: 6, fontSize: 12, color: '#7A847E', textAlign: 'center' },
});
