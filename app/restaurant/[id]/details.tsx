import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  describeOpenState,
  type RestaurantOpeningHour,
  type RestaurantProfilePayload,
} from '@/src/utils/restaurantProfile';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatClock = (time: string): string => {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
};

/** Collapse identical consecutive day ranges, e.g. "Monday – Sunday  9:30am – 9:30pm". */
const groupOpeningHours = (
  openingHours: RestaurantOpeningHour[]
): { days: string; hours: string }[] => {
  const byDay = new Map<number, string>();
  for (let day = 1; day <= 7; day++) {
    const windows = openingHours
      .filter(window => window.enabled && window.isoWeekday === day)
      .sort((a, b) => (a.opensAt < b.opensAt ? -1 : 1))
      .map(window => `${formatClock(window.opensAt.slice(0, 5))} – ${formatClock(window.closesAt.slice(0, 5))}`);
    byDay.set(day, windows.length ? windows.join(', ') : 'Closed');
  }
  const groups: { startDay: number; endDay: number; hours: string }[] = [];
  for (let day = 1; day <= 7; day++) {
    const hours = byDay.get(day)!;
    const last = groups[groups.length - 1];
    if (last && last.hours === hours && last.endDay === day - 1) last.endDay = day;
    else groups.push({ startDay: day, endDay: day, hours });
  }
  return groups.map(group => ({
    days:
      group.startDay === group.endDay
        ? WEEKDAYS[group.startDay - 1]
        : `${WEEKDAYS[group.startDay - 1]} – ${WEEKDAYS[group.endDay - 1]}`,
    hours: group.hours,
  }));
};

export default function RestaurantDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const restaurantId = Array.isArray(id) ? id[0] : id;

  const [data, setData] = useState<RestaurantProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/id/${restaurantId}/profile`
      );
      const json = (await response.json().catch(() => ({}))) as RestaurantProfilePayload & {
        error?: string;
      };
      if (!response.ok || !json.profile) {
        throw new Error(json.error ?? 'Details are not available.');
      }
      setData(json);
    } catch (error) {
      console.error('Error fetching restaurant details:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <Ionicons name="information-circle-outline" size={44} color="#9AA3AB" />
          <Text style={styles.stateText}>These details could not be loaded.</Text>
          <TouchableOpacity style={styles.stateButton} onPress={() => router.back()}>
            <Text style={styles.stateButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { profile, areaAddress, openingHours, achievements } = data;
  const displayName = profile.restaurant_name || profile.full_name || 'Home restaurant';
  const openState = describeOpenState(openingHours);
  const hourGroups = groupOpeningHours(openingHours);
  const achievementRows = [
    achievements.foodSafetyLicense && {
      title: 'Food safety license',
      subtitle: 'Holds a verified food safety license',
    },
    achievements.foodHandlerCertificate && {
      title: 'MOH Food Handler Certificate',
      subtitle: 'Completed the MOH-accredited food handling course',
    },
    achievements.fosimRegistration && {
      title: 'FoSIM registered premises',
      subtitle: 'Home food premises registered with FoSIM',
    },
    achievements.typhoidVaccination && {
      title: 'Anti-typhoid vaccination',
      subtitle: 'Vaccination verified by the Chefin team',
    },
  ].filter(Boolean) as { title: string; subtitle: string }[];

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Ionicons name="location-outline" size={21} color="#333B36" />
          </View>
          <View style={styles.sectionBody}>
            <Text style={styles.sectionTitle}>Area</Text>
            <Text style={styles.sectionText}>
              {areaAddress || 'Area shared after you place an order'}
            </Text>
            <Text style={styles.sectionHint}>
              The exact address is shared once your order is confirmed.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Ionicons name="time-outline" size={21} color="#333B36" />
          </View>
          <View style={styles.sectionBody}>
            <Text style={styles.sectionTitle}>Opening hours</Text>
            <Text style={[styles.openNow, !openState.open && styles.closedNow]}>
              {openState.open ? 'Open now' : 'Closed'} · {openState.detail}
            </Text>
            {hourGroups.map(group => (
              <View key={group.days} style={styles.hoursRow}>
                <Text style={styles.hoursDays}>{group.days}</Text>
                <Text style={styles.hoursTime}>{group.hours}</Text>
              </View>
            ))}
          </View>
        </View>

        {achievementRows.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionIcon}>
              <Ionicons name="trophy-outline" size={21} color="#333B36" />
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.sectionTitle}>Food safety</Text>
              {achievementRows.map(row => (
                <View key={row.title} style={styles.achievementRow}>
                  <Ionicons name="shield-checkmark" size={20} color="#2E7D32" />
                  <View style={styles.achievementCopy}>
                    <Text style={styles.achievementTitle}>{row.title}</Text>
                    <Text style={styles.achievementSubtitle}>{row.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {profile.bio ? (
          <View style={styles.section}>
            <View style={styles.sectionIcon}>
              <Ionicons name="chatbox-ellipses-outline" size={21} color="#333B36" />
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.sectionTitle}>Their story</Text>
              <Text style={styles.sectionText}>{profile.bio}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E4',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 20, paddingBottom: 44 },
  section: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  sectionIcon: { width: 26, alignItems: 'center', paddingTop: 2 },
  sectionBody: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
  sectionText: { fontSize: 14, color: '#333B36', lineHeight: 21 },
  sectionHint: { fontSize: 12, color: '#8B928D', marginTop: 6, lineHeight: 17 },
  openNow: { fontSize: 13, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  closedNow: { color: '#C62828' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  hoursDays: { fontSize: 14, color: '#333B36' },
  hoursTime: { fontSize: 14, color: '#5F6368' },
  achievementRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  achievementCopy: { flex: 1 },
  achievementTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  achievementSubtitle: { fontSize: 12, color: '#5F6368', marginTop: 2, lineHeight: 17 },
  stateText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
    marginTop: 6,
  },
  stateButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stateButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
