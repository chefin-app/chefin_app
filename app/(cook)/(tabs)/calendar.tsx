import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Switch,
  Alert,
  Modal,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

const DEFAULT_START_HOUR = 11;
const DEFAULT_END_HOUR = 13;
const DEFAULT_MAX_ORDERS = 5;

// Returns a Date at the given local hour:minute on the given YYYY-MM-DD.
const dateAt = (dateStr: string, hour: number, minute = 0): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0);
};

const formatTime = (date: Date): string => {
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minStr = m.toString().padStart(2, '0');
  return `${hour12}:${minStr} ${period}`;
};

const formatSlotRange = (startISO: string, endISO: string): string =>
  `${formatTime(new Date(startISO))} – ${formatTime(new Date(endISO))}`;

type Listing = {
  id: string;
  title: string;
  image_url: string | null;
  status: string;
};

type AvailabilityRow = {
  id: string;
  listing_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const monthBounds = (yearMonth: string): { start: string; end: string } => {
  // yearMonth is "YYYY-MM". Return inclusive start (1st) and exclusive end (1st of next month).
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: next };
};

// Combine a YYYY-MM-DD date with a local hour/minute and produce an ISO timestamp.
const isoAt = (dateStr: string, hour: number, minute = 0) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0).toISOString();
};

const isoAtTime = (dateStr: string, time: Date) =>
  isoAt(dateStr, time.getHours(), time.getMinutes());

export default function CookCalendarScreen() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [currentMonth, setCurrentMonth] = useState<string>(todayISO().slice(0, 7));
  // Cooks can view past availability but can't edit it.
  const isPastDate = selectedDate < todayISO();
  const [listings, setListings] = useState<Listing[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Listings being toggled — local override so the UI is responsive.
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Slot picker state — the listing whose slot is currently being edited.
  const [slotEditing, setSlotEditing] = useState<Listing | null>(null);
  const [draftStart, setDraftStart] = useState<Date>(new Date());
  const [draftEnd, setDraftEnd] = useState<Date>(new Date());
  const [draftMaxOrders, setDraftMaxOrders] = useState<string>(String(DEFAULT_MAX_ORDERS));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [slotSaving, setSlotSaving] = useState(false);

  const openSlotEditor = (listing: Listing) => {
    const row = availability.find(
      a => a.listing_id === listing.id && a.available_date === selectedDate && a.is_available
    );
    setDraftStart(row ? new Date(row.start_time) : dateAt(selectedDate, DEFAULT_START_HOUR));
    setDraftEnd(row ? new Date(row.end_time) : dateAt(selectedDate, DEFAULT_END_HOUR));
    // max_orders isn't in the AvailabilityRow type — fetch it from the row if present.
    setDraftMaxOrders(String((row as any)?.max_orders ?? DEFAULT_MAX_ORDERS));
    setSlotEditing(listing);
  };

  // ── Load cook's listings (approved + pending, since both are theirs) ──
  const loadListings = useCallback(async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!profile) return;
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, image_url, status')
      .eq('cook_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Listings load failed', error.message);
      return;
    }
    setListings((data ?? []) as Listing[]);
  }, [user]);

  // ── Load availability rows for the visible month ──────────────────
  const loadAvailability = useCallback(
    async (month: string) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) return;

      // First fetch listing ids for this cook, then filter availability.
      // (Postgrest doesn't easily join availability→listings with a where clause.)
      const { data: cookListings } = await supabase
        .from('listings')
        .select('id')
        .eq('cook_id', profile.id);
      const ids = (cookListings ?? []).map(l => l.id);
      if (ids.length === 0) {
        setAvailability([]);
        return;
      }

      const { start, end } = monthBounds(month);
      const { data, error } = await supabase
        .from('availability')
        .select('id, listing_id, available_date, start_time, end_time, is_available')
        .in('listing_id', ids)
        .gte('available_date', start)
        .lt('available_date', end);
      if (error) {
        console.warn('Availability load failed', error.message);
        return;
      }
      setAvailability((data ?? []) as AvailabilityRow[]);
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await loadListings();
        await loadAvailability(currentMonth);
        setLoading(false);
      })();
    }, [loadListings, loadAvailability, currentMonth])
  );

  useEffect(() => {
    // When month changes (user paginates), refetch availability for that month.
    if (!loading) loadAvailability(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // ── Toggle availability for a (listing, date) pair ─────────────────
  const isOnFor = (listingId: string, date: string): AvailabilityRow | undefined =>
    availability.find(
      a => a.listing_id === listingId && a.available_date === date && a.is_available
    );

  const handleToggle = async (listing: Listing, value: boolean) => {
    const date = selectedDate;
    const key = `${listing.id}_${date}`;
    if (pending.has(key)) return;
    setPending(prev => new Set(prev).add(key));

    try {
      const existing = availability.find(
        a => a.listing_id === listing.id && a.available_date === date
      );

      if (value) {
        // Turning ON — insert or flip is_available back to true
        if (existing) {
          const { data, error } = await supabase
            .from('availability')
            .update({ is_available: true })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          setAvailability(prev =>
            prev.map(a => (a.id === existing.id ? (data as AvailabilityRow) : a))
          );
        } else {
          const row = {
            listing_id: listing.id,
            available_date: date,
            start_time: isoAt(date, DEFAULT_START_HOUR),
            end_time: isoAt(date, DEFAULT_END_HOUR),
            max_orders: DEFAULT_MAX_ORDERS,
            is_available: true,
          };
          const { data, error } = await supabase.from('availability').insert(row).select().single();
          if (error) throw error;
          setAvailability(prev => [...prev, data as AvailabilityRow]);
        }
      } else {
        // Turning OFF — flip is_available to false (keep the row in case of past orders).
        if (existing) {
          const { error } = await supabase
            .from('availability')
            .update({ is_available: false })
            .eq('id', existing.id);
          if (error) throw error;
          setAvailability(prev =>
            prev.map(a => (a.id === existing.id ? { ...a, is_available: false } : a))
          );
        }
      }
    } catch (e: any) {
      Alert.alert('Could not update', e.message ?? 'Unknown error');
    } finally {
      setPending(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSlotSave = async () => {
    if (!slotEditing) return;
    const date = selectedDate;
    const existing = availability.find(
      a => a.listing_id === slotEditing.id && a.available_date === date && a.is_available
    );
    if (!existing) return;

    if (draftEnd <= draftStart) {
      Alert.alert('Invalid time range', 'End time must be after start time.');
      return;
    }
    const max = parseInt(draftMaxOrders, 10);
    if (isNaN(max) || max < 1) {
      Alert.alert('Invalid max orders', 'Please enter a number greater than 0.');
      return;
    }

    setSlotSaving(true);
    try {
      const { data, error } = await supabase
        .from('availability')
        .update({
          start_time: isoAtTime(date, draftStart),
          end_time: isoAtTime(date, draftEnd),
          max_orders: max,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      setAvailability(prev =>
        prev.map(a => (a.id === existing.id ? (data as AvailabilityRow) : a))
      );
      setSlotEditing(null);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSlotSaving(false);
    }
  };

  // Apply the current draft slot to the selected date + the next 6 days.
  // Existing rows for any of those dates get updated in-place; missing ones
  // get inserted with is_available=true.
  const handleApplyToWeek = async () => {
    if (!slotEditing) return;
    if (draftEnd <= draftStart) {
      Alert.alert('Invalid time range', 'End time must be after start time.');
      return;
    }
    const max = parseInt(draftMaxOrders, 10);
    if (isNaN(max) || max < 1) {
      Alert.alert('Invalid max orders', 'Please enter a number greater than 0.');
      return;
    }

    setSlotSaving(true);
    try {
      // Build the 7 target dates starting from the selected date.
      const [y, mo, da] = selectedDate.split('-').map(Number);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(y, mo - 1, da + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.push(ds);
      }

      // Find which of those dates already have an availability row.
      const { data: existingRows, error: fetchErr } = await supabase
        .from('availability')
        .select('id, available_date')
        .eq('listing_id', slotEditing.id)
        .in('available_date', dates);
      if (fetchErr) throw fetchErr;
      const existingByDate = new Map<string, string>(
        (existingRows ?? []).map(r => [r.available_date as string, r.id as string])
      );

      const inserts: any[] = [];
      const updateOps: { id: string; payload: any }[] = [];
      for (const date of dates) {
        const payload = {
          start_time: isoAtTime(date, draftStart),
          end_time: isoAtTime(date, draftEnd),
          max_orders: max,
          is_available: true,
        };
        const existingId = existingByDate.get(date);
        if (existingId) {
          updateOps.push({ id: existingId, payload });
        } else {
          inserts.push({ listing_id: slotEditing.id, available_date: date, ...payload });
        }
      }

      for (const { id: rowId, payload } of updateOps) {
        const { error } = await supabase.from('availability').update(payload).eq('id', rowId);
        if (error) throw error;
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('availability').insert(inserts);
        if (error) throw error;
      }

      // Reload availability for the current month to pick up everything we
      // just wrote. The 7-day window could spill into next month, but those
      // rows will show up when the cook navigates there.
      await loadAvailability(currentMonth);
      setSlotEditing(null);
    } catch (e: any) {
      Alert.alert('Could not apply to week', e.message ?? 'Unknown error');
    } finally {
      setSlotSaving(false);
    }
  };

  // ── markedDates for the Calendar ───────────────────────────────────
  const markedDates = useMemo(() => {
    const map: Record<string, any> = {};
    for (const a of availability) {
      if (!a.is_available) continue;
      const existing = map[a.available_date] ?? {};
      map[a.available_date] = { ...existing, marked: true, dotColor: '#4CAF50' };
    }
    map[selectedDate] = {
      ...(map[selectedDate] ?? {}),
      selected: true,
      selectedColor: '#4CAF50',
      selectedTextColor: '#fff',
    };
    return map;
  }, [availability, selectedDate]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Calendar
        current={selectedDate}
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        onMonthChange={(month: DateData) => setCurrentMonth(month.dateString.slice(0, 7))}
        markedDates={markedDates}
        theme={{
          todayTextColor: '#4CAF50',
          arrowColor: '#1A1A1A',
          textMonthFontWeight: '700',
          textDayFontWeight: '500',
          textDayHeaderFontWeight: '600',
        }}
        firstDay={1}
      />

      <View style={styles.divider} />

      {isPastDate && (
        <View style={styles.pastBanner}>
          <Ionicons name="lock-closed-outline" size={14} color="#888" />
          <Text style={styles.pastBannerText}>Past dates are read-only.</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { flex: 1 }]}>Your meals</Text>
        <Text style={[styles.sectionLabel, { width: 80, textAlign: 'center' }]}>Available</Text>
        <Text style={[styles.sectionLabel, { width: 110, textAlign: 'right' }]}>Time slot</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color="#4CAF50" />
          </View>
        ) : listings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={32} color="#bbb" />
            <Text style={styles.emptyText}>
              Add dishes from the Menu tab before scheduling availability.
            </Text>
          </View>
        ) : (
          listings.map(listing => {
            const on = !!isOnFor(listing.id, selectedDate);
            const key = `${listing.id}_${selectedDate}`;
            const busy = pending.has(key);
            const notApproved = listing.status !== 'approved';
            const locked = isPastDate || notApproved;
            return (
              <View key={listing.id} style={[styles.row, notApproved && styles.rowMuted]}>
                <View style={styles.mealCell}>
                  {listing.image_url ? (
                    <Image source={{ uri: listing.image_url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Ionicons name="image-outline" size={16} color="#bbb" />
                    </View>
                  )}
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.mealTitle} numberOfLines={1}>
                      {listing.title}
                    </Text>
                    {notApproved && (
                      <Text style={styles.pendingHint} numberOfLines={1}>
                        {listing.status === 'rejected' ? 'Rejected' : 'Pending review'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.toggleCell}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#4CAF50" />
                  ) : (
                    <Switch
                      value={on}
                      onValueChange={v => handleToggle(listing, v)}
                      trackColor={{ false: '#E0E0E0', true: '#4CAF50' }}
                      thumbColor="#fff"
                      disabled={locked}
                    />
                  )}
                </View>
                <View style={styles.slotCell}>
                  <TouchableOpacity
                    style={[styles.slotPill, (!on || locked) && styles.slotPillDisabled]}
                    onPress={() => on && !locked && openSlotEditor(listing)}
                    disabled={!on || locked}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.slotText, !on && styles.slotTextDisabled]}
                      numberOfLines={1}
                    >
                      {(() => {
                        const row = isOnFor(listing.id, selectedDate);
                        return row ? formatSlotRange(row.start_time, row.end_time) : 'Set time';
                      })()}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={on ? '#666' : '#BBB'} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Slot picker */}
      <Modal
        visible={slotEditing != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSlotEditing(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSlotEditing(null)}
        />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Edit availability</Text>
          <Text style={styles.modalSubtitle}>
            {slotEditing?.title} · {selectedDate}
          </Text>

          {/* Start / End time pickers */}
          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Start</Text>
              <TouchableOpacity style={styles.timeButton} onPress={() => setShowStartPicker(true)}>
                <Text style={styles.timeButtonText}>{formatTime(draftStart)}</Text>
                <Ionicons name="time-outline" size={16} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>End</Text>
              <TouchableOpacity style={styles.timeButton} onPress={() => setShowEndPicker(true)}>
                <Text style={styles.timeButtonText}>{formatTime(draftEnd)}</Text>
                <Ionicons name="time-outline" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Max orders */}
          <Text style={styles.timeLabel}>Max orders for this slot</Text>
          <View style={styles.maxOrdersRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => {
                const n = parseInt(draftMaxOrders, 10);
                if (!isNaN(n) && n > 1) setDraftMaxOrders(String(n - 1));
              }}
            >
              <Ionicons name="remove" size={18} color="#1A1A1A" />
            </TouchableOpacity>
            <TextInput
              style={styles.maxOrdersInput}
              value={draftMaxOrders}
              onChangeText={t => setDraftMaxOrders(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => {
                const n = parseInt(draftMaxOrders, 10);
                setDraftMaxOrders(String((isNaN(n) ? 0 : n) + 1));
              }}
            >
              <Ionicons name="add" size={18} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, slotSaving && styles.saveBtnDisabled]}
            onPress={handleSlotSave}
            disabled={slotSaving}
          >
            {slotSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.weekBtn, slotSaving && styles.weekBtnDisabled]}
            onPress={handleApplyToWeek}
            disabled={slotSaving}
          >
            <Ionicons name="repeat" size={16} color="#2E7D32" />
            <Text style={styles.weekBtnText}>Apply to next 7 days</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalCancel} onPress={() => setSlotEditing(null)}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <DateTimePickerModal
          isVisible={showStartPicker}
          mode="time"
          date={draftStart}
          onConfirm={t => {
            setDraftStart(t);
            setShowStartPicker(false);
          }}
          onCancel={() => setShowStartPicker(false)}
        />
        <DateTimePickerModal
          isVisible={showEndPicker}
          mode="time"
          date={draftEnd}
          onConfirm={t => {
            setDraftEnd(t);
            setShowEndPicker(false);
          }}
          onCancel={() => setShowEndPicker(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  divider: { height: 1, backgroundColor: '#F0F0F0' },
  pastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
  },
  pastBannerText: { fontSize: 12, color: '#666', fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  mealCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 28, height: 28, borderRadius: 14 },
  thumbPlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: { fontSize: 14, color: '#1A1A1A', flexShrink: 1 },
  rowMuted: { opacity: 0.55 },
  pendingHint: { fontSize: 11, color: '#B26B00', fontWeight: '600', marginTop: 2 },
  toggleCell: { width: 80, alignItems: 'center', justifyContent: 'center' },
  slotCell: { width: 110, alignItems: 'flex-end' },
  slotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  slotPillDisabled: { opacity: 0.5 },
  slotText: { fontSize: 12, color: '#1A1A1A', fontWeight: '500' },
  slotTextDisabled: { color: '#888' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  modalSubtitle: { fontSize: 12, color: '#888', marginBottom: 12, marginTop: 2 },
  slotOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  slotOptionSelected: { borderColor: '#4CAF50', backgroundColor: '#F1F8F4' },
  slotOptionText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  slotOptionTextSelected: { color: '#2E7D32' },
  modalCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#666' },

  timeRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16 },
  timeCol: { flex: 1, gap: 6 },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  timeButtonText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },

  maxOrdersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 16,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxOrdersInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },

  saveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { backgroundColor: '#A5D6A7' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  weekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    marginTop: 8,
  },
  weekBtnDisabled: { opacity: 0.5 },
  weekBtnText: { color: '#2E7D32', fontSize: 14, fontWeight: '700' },
});
