import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/services/auth-context';

type OpeningWindow = {
  isoWeekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
};

type SpecialWindow = {
  id: string;
  serviceDate: string;
  description: string | null;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

type Period = { opensAt: string; closesAt: string };
type TimeTarget = { scope: 'weekly' | 'special'; index: number; field: keyof Period } | null;
type HoursEditor = 'weekly' | 'special' | null;

type BusinessHoursResponse = {
  error?: string;
  openingHours?: OpeningWindow[];
  specialHours?: SpecialWindow[];
};

const DAYS = [
  { iso: 1, short: 'M', compact: 'Mon', label: 'Monday' },
  { iso: 2, short: 'T', compact: 'Tue', label: 'Tuesday' },
  { iso: 3, short: 'W', compact: 'Wed', label: 'Wednesday' },
  { iso: 4, short: 'T', compact: 'Thu', label: 'Thursday' },
  { iso: 5, short: 'F', compact: 'Fri', label: 'Friday' },
  { iso: 6, short: 'S', compact: 'Sat', label: 'Saturday' },
  { iso: 7, short: 'S', compact: 'Sun', label: 'Sunday' },
] as const;

const apiUrl = () => process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const defaultPeriod = (): Period => ({ opensAt: '09:00', closesAt: '18:00' });

const roundToQuarterHour = (date: Date): Date => {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.round(rounded.getMinutes() / 15) * 15);
  return rounded;
};

const dateFromTime = (time: string): Date => {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  const date = new Date();
  date.setHours(hour || 0, minute || 0, 0, 0);
  return roundToQuarterHour(date);
};

const timeFromDate = (date: Date): string => {
  const rounded = roundToQuarterHour(date);
  return `${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`;
};

const formatTime = (time: string | null): string => {
  if (!time) return '';
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
};

const formatDate = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const periodsAreInvalid = (periods: Period[]): boolean => {
  const sorted = [...periods].sort((left, right) => left.opensAt.localeCompare(right.opensAt));
  return sorted.some(
    (period, index) =>
      period.opensAt >= period.closesAt ||
      (index > 0 && period.opensAt < sorted[index - 1].closesAt)
  );
};

export default function BusinessHoursScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<OpeningWindow[]>([]);
  const [specialHours, setSpecialHours] = useState<SpecialWindow[]>([]);

  const [weeklyModal, setWeeklyModal] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([1]));
  const [weeklyClosed, setWeeklyClosed] = useState(false);
  const [weeklyPeriods, setWeeklyPeriods] = useState<Period[]>([defaultPeriod()]);

  const [specialModal, setSpecialModal] = useState(false);
  const [specialDescription, setSpecialDescription] = useState('');
  const [specialDates, setSpecialDates] = useState<Set<string>>(new Set());
  const [specialClosed, setSpecialClosed] = useState(true);
  const [specialPeriods, setSpecialPeriods] = useState<Period[]>([defaultPeriod()]);
  const [specialSaving, setSpecialSaving] = useState(false);
  const [timeTarget, setTimeTarget] = useState<TimeTarget>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [resumeEditor, setResumeEditor] = useState<HoursEditor>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    }),
    [session?.access_token]
  );

  const loadHours = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiUrl()}/api/availability/cook/opening-hours`, { headers });
      const payload = (await response.json().catch(() => ({}))) as BusinessHoursResponse;
      if (!response.ok) throw new Error(payload.error ?? 'Business hours could not be loaded.');
      setSchedule(
        (payload.openingHours ?? []).map(window => ({
          isoWeekday: Number(window.isoWeekday),
          enabled: window.enabled !== false,
          opensAt: String(window.opensAt).slice(0, 5),
          closesAt: String(window.closesAt).slice(0, 5),
        }))
      );
      setSpecialHours(payload.specialHours ?? []);
    } catch (error: unknown) {
      Alert.alert(
        'Business hours unavailable',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [headers, session?.access_token]);

  useEffect(() => {
    loadHours();
  }, [loadHours]);

  const dayPeriods = (isoWeekday: number): Period[] =>
    schedule
      .filter(window => window.isoWeekday === isoWeekday && window.enabled)
      .map(window => ({ opensAt: window.opensAt, closesAt: window.closesAt }));

  const openWeeklyEditor = (days: number[]) => {
    const periods = dayPeriods(days[0]);
    setSelectedDays(new Set(days));
    setWeeklyClosed(periods.length === 0);
    setWeeklyPeriods(periods.length ? periods : [defaultPeriod()]);
    setWeeklyModal(true);
  };

  const applyWeeklyDraft = () => {
    if (!weeklyClosed && periodsAreInvalid(weeklyPeriods)) {
      Alert.alert(
        'Check business hours',
        'Closing time must be later than opening time, and periods cannot overlap.'
      );
      return;
    }
    setSchedule(current => {
      const retained = current.filter(window => !selectedDays.has(window.isoWeekday));
      if (weeklyClosed) return retained;
      return [
        ...retained,
        ...[...selectedDays].flatMap(isoWeekday =>
          weeklyPeriods.map(period => ({ isoWeekday, enabled: true, ...period }))
        ),
      ].sort(
        (left, right) =>
          left.isoWeekday - right.isoWeekday || left.opensAt.localeCompare(right.opensAt)
      );
    });
    setWeeklyModal(false);
  };

  const saveWeeklyHours = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl()}/api/availability/cook/opening-hours`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ windows: schedule, applyToAllListings: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Business hours could not be saved.');
      setSchedule(payload.openingHours ?? schedule);
      Alert.alert(
        'Business hours saved',
        'Approved dishes will be available during these hours unless you mark them sold out in Menu.'
      );
    } catch (error: unknown) {
      Alert.alert('Hours not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openSpecialEditor = () => {
    setSpecialDescription('');
    setSpecialDates(new Set());
    setSpecialClosed(true);
    setSpecialPeriods([defaultPeriod()]);
    setSpecialModal(true);
  };

  const saveSpecialHours = async () => {
    if (specialDates.size === 0) {
      Alert.alert('Select a date', 'Choose at least one date for these special hours.');
      return;
    }
    if (!specialClosed && periodsAreInvalid(specialPeriods)) {
      Alert.alert(
        'Check special hours',
        'Closing time must be later than opening time, and periods cannot overlap.'
      );
      return;
    }
    setSpecialSaving(true);
    try {
      const response = await fetch(`${apiUrl()}/api/availability/cook/special-hours`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          dates: [...specialDates],
          description: specialDescription,
          isClosed: specialClosed,
          windows: specialClosed ? [] : specialPeriods,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Special hours could not be saved.');
      setSpecialHours(payload.specialHours ?? []);
      setSpecialModal(false);
      Alert.alert('Special hours saved', 'These dates now override your regular business hours.');
    } catch (error: unknown) {
      Alert.alert(
        'Special hours not saved',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const removeSpecialDate = (serviceDate: string) => {
    Alert.alert(
      'Remove special hours?',
      `Your regular hours will apply on ${formatDate(serviceDate)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(
                `${apiUrl()}/api/availability/cook/special-hours/${serviceDate}`,
                { method: 'DELETE', headers }
              );
              const payload = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(payload.error ?? 'Special hours could not be removed.');
              setSpecialHours(current =>
                current.filter(window => window.serviceDate !== serviceDate)
              );
            } catch (error: unknown) {
              Alert.alert(
                'Special hours not removed',
                error instanceof Error ? error.message : 'Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const specialByDate = useMemo(() => {
    const grouped = new Map<string, SpecialWindow[]>();
    for (const window of specialHours) {
      grouped.set(window.serviceDate, [...(grouped.get(window.serviceDate) ?? []), window]);
    }
    return [...grouped.entries()];
  }, [specialHours]);

  const updatePeriod = (scope: 'weekly' | 'special', index: number, changes: Partial<Period>) => {
    const setter = scope === 'weekly' ? setWeeklyPeriods : setSpecialPeriods;
    setter(current =>
      current.map((period, row) => (row === index ? { ...period, ...changes } : period))
    );
  };

  const openTimePicker = (target: Exclude<TimeTarget, null>) => {
    setTimeTarget(target);
    setResumeEditor(target.scope);

    // iOS cannot reliably present the native time picker on top of another
    // React Native Modal. Dismiss the editor first, then present the picker.
    if (target.scope === 'weekly') setWeeklyModal(false);
    else setSpecialModal(false);
    setTimeout(() => setTimePickerVisible(true), 300);
  };

  const restoreHoursEditor = () => {
    const editor = resumeEditor;
    setTimeTarget(null);
    setResumeEditor(null);
    if (editor === 'weekly') setWeeklyModal(true);
    if (editor === 'special') setSpecialModal(true);
  };

  const activeTime = timeTarget
    ? ((timeTarget.scope === 'weekly' ? weeklyPeriods : specialPeriods)[timeTarget.index]?.[
        timeTarget.field
      ] ?? '09:00')
    : '09:00';

  if (loading) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00B85A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={27} color="#1C211E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Hours</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.specialIntro}>
          <View style={styles.calendarIllustration}>
            <Ionicons name="calendar" size={42} color="#51CD83" />
            <View style={styles.clockBadge}>
              <Ionicons name="time" size={17} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.introTitle}>Special Hours</Text>
          <Text style={styles.introCopy}>
            Add different opening hours for public holidays, events and vacations.
          </Text>
          <TouchableOpacity style={styles.primaryWide} onPress={openSpecialEditor}>
            <Text style={styles.primaryWideText}>Schedule Special Hours</Text>
          </TouchableOpacity>
        </View>

        {specialByDate.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Upcoming special hours</Text>
            {specialByDate.map(([date, rows]) => (
              <View key={date} style={styles.specialRow}>
                <View style={styles.flex}>
                  <Text style={styles.specialDate}>{formatDate(date)}</Text>
                  <Text style={[styles.specialStatus, rows[0].isClosed && styles.closedText]}>
                    {rows[0].description ? `${rows[0].description} · ` : ''}
                    {rows[0].isClosed
                      ? 'Closed all day'
                      : rows
                          .map(row => `${formatTime(row.opensAt)}–${formatTime(row.closesAt)}`)
                          .join(', ')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeSpecialDate(date)} style={styles.iconButton}>
                  <Ionicons name="trash-outline" size={20} color="#D14D43" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Regular opening hours</Text>
              <Text style={styles.sectionHint}>Malaysia time (GMT+8)</Text>
            </View>
            <TouchableOpacity onPress={() => openWeeklyEditor(DAYS.map(day => day.iso))}>
              <Text style={styles.editText}>Edit all</Text>
            </TouchableOpacity>
          </View>
          {DAYS.map(day => {
            const periods = dayPeriods(day.iso);
            return (
              <TouchableOpacity
                key={day.iso}
                style={styles.dayRow}
                onPress={() => openWeeklyEditor([day.iso])}
              >
                <Text style={styles.dayLabel}>{day.label}</Text>
                <Text style={[styles.dayHours, periods.length === 0 && styles.closedText]}>
                  {periods.length
                    ? periods
                        .map(
                          period => `${formatTime(period.opensAt)}–${formatTime(period.closesAt)}`
                        )
                        .join('\n')
                    : 'Closed'}
                </Text>
                <Ionicons name="pencil-outline" size={19} color="#707773" />
              </TouchableOpacity>
            );
          })}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => openWeeklyEditor([1, 2, 3, 4, 5])}
            >
              <Text style={styles.quickChipText}>Edit Mon–Fri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickChip} onPress={() => openWeeklyEditor([6, 7])}>
              <Text style={styles.quickChipText}>Edit Sat–Sun</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={22} color="#237A3B" />
          <Text style={styles.infoText}>
            Approved dishes automatically follow these hours. If an item sells out, switch it off in
            Menu; it will become available again on your next open day.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          disabled={saving}
          onPress={saveWeeklyHours}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={weeklyModal} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select days & time</Text>
            <View style={styles.dayPicker}>
              {DAYS.map(day => {
                const selected = selectedDays.has(day.iso);
                return (
                  <TouchableOpacity
                    key={day.iso}
                    style={[styles.dayCircle, selected && styles.dayCircleSelected]}
                    onPress={() =>
                      setSelectedDays(current => {
                        const next = new Set(current);
                        if (next.has(day.iso) && next.size > 1) next.delete(day.iso);
                        else next.add(day.iso);
                        return next;
                      })
                    }
                  >
                    <Text style={[styles.dayCircleText, selected && styles.dayCircleTextSelected]}>
                      {day.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setWeeklyClosed(value => !value)}
            >
              <Ionicons
                name={weeklyClosed ? 'checkbox' : 'square-outline'}
                size={25}
                color={weeklyClosed ? '#00A651' : '#AEB5B0'}
              />
              <Text style={styles.checkLabel}>Closed</Text>
            </TouchableOpacity>
            {!weeklyClosed && (
              <PeriodEditor
                periods={weeklyPeriods}
                scope="weekly"
                onPick={openTimePicker}
                onAdd={() => setWeeklyPeriods(current => [...current, defaultPeriod()])}
                onRemove={index =>
                  setWeeklyPeriods(current => current.filter((_, row) => row !== index))
                }
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setWeeklyModal(false)}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={applyWeeklyDraft}>
                <Text style={styles.saveText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={specialModal} animationType="slide">
        <SafeAreaView style={styles.page}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setSpecialModal(false)} style={styles.back}>
              <Ionicons name="arrow-back" size={27} color="#1C211E" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Schedule Special Hours</Text>
          </View>
          <ScrollView contentContainerStyle={styles.specialForm}>
            <Text style={styles.fieldLabel}>Special hours description</Text>
            <TextInput
              style={styles.input}
              value={specialDescription}
              onChangeText={setSpecialDescription}
              placeholder="e.g. Chinese New Year"
              placeholderTextColor="#A2A8A4"
              maxLength={120}
            />
            <Text style={styles.fieldLabel}>Select date</Text>
            <View style={styles.calendarCard}>
              <Calendar
                minDate={new Date().toISOString().slice(0, 10)}
                markedDates={Object.fromEntries(
                  [...specialDates].map(date => [
                    date,
                    { selected: true, selectedColor: '#00A651' },
                  ])
                )}
                onDayPress={(day: DateData) =>
                  setSpecialDates(current => {
                    const next = new Set(current);
                    if (next.has(day.dateString)) next.delete(day.dateString);
                    else next.add(day.dateString);
                    return next;
                  })
                }
                theme={{ todayTextColor: '#00A651', arrowColor: '#00A651' }}
              />
            </View>
            <Text style={styles.fieldLabel}>Availability</Text>
            <TouchableOpacity style={styles.radioRow} onPress={() => setSpecialClosed(true)}>
              <Text style={styles.radioLabel}>Closed all day</Text>
              <Ionicons
                name={specialClosed ? 'radio-button-on' : 'radio-button-off'}
                size={25}
                color={specialClosed ? '#00A651' : '#AEB5B0'}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioRow} onPress={() => setSpecialClosed(false)}>
              <Text style={styles.radioLabel}>Open</Text>
              <Ionicons
                name={!specialClosed ? 'radio-button-on' : 'radio-button-off'}
                size={25}
                color={!specialClosed ? '#00A651' : '#AEB5B0'}
              />
            </TouchableOpacity>
            {!specialClosed && (
              <PeriodEditor
                periods={specialPeriods}
                scope="special"
                onPick={openTimePicker}
                onAdd={() => setSpecialPeriods(current => [...current, defaultPeriod()])}
                onRemove={index =>
                  setSpecialPeriods(current => current.filter((_, row) => row !== index))
                }
              />
            )}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (specialSaving || specialDates.size === 0) && styles.disabled,
              ]}
              disabled={specialSaving || specialDates.size === 0}
              onPress={saveSpecialHours}
            >
              {specialSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Confirm Special Hours</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <DateTimePickerModal
        isVisible={timePickerVisible}
        mode="time"
        minuteInterval={15}
        date={dateFromTime(activeTime)}
        onCancel={() => setTimePickerVisible(false)}
        onConfirm={date => {
          if (timeTarget)
            updatePeriod(timeTarget.scope, timeTarget.index, {
              [timeTarget.field]: timeFromDate(date),
            });
          setTimePickerVisible(false);
        }}
        onHide={restoreHoursEditor}
      />
    </SafeAreaView>
  );
}

function PeriodEditor({
  periods,
  scope,
  onPick,
  onAdd,
  onRemove,
}: {
  periods: Period[];
  scope: 'weekly' | 'special';
  onPick: (target: Exclude<TimeTarget, null>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.periodSection}>
      {periods.map((period, index) => (
        <View key={`${scope}-${index}`} style={styles.periodRow}>
          <TouchableOpacity
            style={styles.timeBox}
            onPress={() => onPick({ scope, index, field: 'opensAt' })}
          >
            <Text style={styles.timeLabel}>Open time</Text>
            <Text style={styles.timeValue}>{formatTime(period.opensAt)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.timeBox}
            onPress={() => onPick({ scope, index, field: 'closesAt' })}
          >
            <Text style={styles.timeLabel}>Close time</Text>
            <Text style={styles.timeValue}>{formatTime(period.closesAt)}</Text>
          </TouchableOpacity>
          {periods.length > 1 && (
            <TouchableOpacity style={styles.removePeriod} onPress={() => onRemove(index)}>
              <Ionicons name="trash-outline" size={20} color="#555D58" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity onPress={onAdd} style={styles.addPeriod}>
        <Ionicons name="add" size={19} color="#1672CE" />
        <Text style={styles.addPeriodText}>Add another period</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  header: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#1B201D', fontSize: 24, fontWeight: '800' },
  content: { paddingBottom: 120 },
  specialIntro: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    borderBottomWidth: 8,
    borderBottomColor: '#F3F4F3',
  },
  calendarIllustration: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F9EF',
  },
  clockBadge: {
    position: 'absolute',
    left: 17,
    bottom: 19,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20A8BE',
  },
  introTitle: { marginTop: 15, color: '#202521', fontSize: 20, fontWeight: '800' },
  introCopy: {
    maxWidth: 390,
    marginTop: 8,
    color: '#747B76',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryWide: {
    width: '100%',
    minHeight: 54,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#00B85A',
  },
  primaryWideText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  sectionCard: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 8,
    borderBottomColor: '#F3F4F3',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  sectionTitle: { color: '#222724', fontSize: 19, fontWeight: '800' },
  sectionHint: { marginTop: 3, color: '#8A918C', fontSize: 12 },
  editText: { color: '#1672CE', fontSize: 15, fontWeight: '700' },
  dayRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E8E6',
  },
  dayLabel: { width: 94, color: '#333A35', fontSize: 15, fontWeight: '600' },
  dayHours: { flex: 1, color: '#555D58', fontSize: 14, lineHeight: 20, textAlign: 'right' },
  closedText: { color: '#E06056' },
  quickActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  quickChip: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#EAF8F9',
  },
  quickChipText: { color: '#174E49', fontSize: 13, fontWeight: '800' },
  specialRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E8E6',
  },
  specialDate: { color: '#28302B', fontSize: 14, fontWeight: '700' },
  specialStatus: { marginTop: 4, color: '#59615C', fontSize: 13 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    margin: 20,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#EFF8F1',
  },
  infoText: { flex: 1, color: '#47604D', fontSize: 13, lineHeight: 19 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E8E6',
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#00B85A',
  },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: { color: '#202521', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  dayPicker: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginTop: 22 },
  dayCircle: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#C8CDCA',
    borderRadius: 24,
  },
  dayCircleSelected: { borderWidth: 2.5, borderColor: '#008C55', backgroundColor: '#F0FBF5' },
  dayCircleText: { color: '#252B27', fontSize: 16, fontWeight: '700' },
  dayCircleTextSelected: { color: '#008C55' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 22,
    paddingVertical: 6,
  },
  checkLabel: { color: '#303632', fontSize: 17 },
  periodSection: { marginTop: 18 },
  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, marginBottom: 12 },
  timeBox: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#C8CDCA',
    borderRadius: 14,
  },
  timeLabel: { color: '#777E79', fontSize: 11, fontWeight: '600' },
  timeValue: { marginTop: 5, color: '#252B27', fontSize: 16, fontWeight: '600' },
  removePeriod: { width: 32, height: 48, alignItems: 'center', justifyContent: 'center' },
  addPeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  addPeriodText: { color: '#1672CE', fontSize: 15, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#EAF8F9',
  },
  secondaryText: { color: '#174E49', fontSize: 16, fontWeight: '800' },
  modalSave: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#00B85A',
  },
  specialForm: { paddingHorizontal: 18, paddingBottom: 30 },
  fieldLabel: { marginTop: 18, marginBottom: 8, color: '#343A36', fontSize: 15, fontWeight: '700' },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#CDD2CF',
    borderRadius: 16,
    color: '#242A26',
    fontSize: 16,
  },
  calendarCard: { overflow: 'hidden', borderWidth: 1, borderColor: '#E1E5E2', borderRadius: 16 },
  radioRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioLabel: { color: '#282E2A', fontSize: 17 },
});
