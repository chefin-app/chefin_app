import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/services/auth-context';

type Period = { opensAt: string; closesAt: string };
type DayDraft = { enabled: boolean; allDay: boolean; periods: Period[] };
type PickerTarget =
  | { kind: 'date'; field: 'startsOn' | 'endsOn' }
  | { kind: 'time'; day: number; period: number; field: keyof Period }
  | null;

type Schedule = {
  id: string;
  name: string;
  specificDates: boolean;
  startsOn: string | null;
  endsOn: string | null;
  windows: Array<{
    isoWeekday: number;
    allDay: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  listingIds: string[];
};

type Dish = {
  id: string;
  title: string;
  image_url: string | null;
  menu_category: string | null;
  status: string;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const apiUrl = () => process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const defaultPeriod = (): Period => ({ opensAt: '08:00', closesAt: '21:00' });
const defaultDays = (): Record<number, DayDraft> =>
  Object.fromEntries(
    DAYS.map((_, index) => [
      index + 1,
      { enabled: true, allDay: false, periods: [defaultPeriod()] },
    ])
  );
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromTime = (time: string) => {
  const date = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
};
const timeKey = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const displayTime = (time: string) =>
  dateFromTime(time).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });

export default function AddSellingScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const scheduleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [specificDates, setSpecificDates] = useState(false);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [days, setDays] = useState<Record<number, DayDraft>>(defaultDays);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set());
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    }),
    [session?.access_token]
  );

  const load = useCallback(async () => {
    if (!session?.access_token) return setLoading(false);
    try {
      const response = await fetch(`${apiUrl()}/api/availability/cook/selling-schedules`, {
        headers,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        schedules?: Schedule[];
        listings?: Dish[];
      };
      if (!response.ok) throw new Error(payload.error ?? 'Selling schedules could not be loaded.');
      setDishes(payload.listings ?? []);
      const schedule = payload.schedules?.find(item => item.id === scheduleId);
      if (scheduleId && !schedule) throw new Error('Selling schedule not found.');
      if (schedule) {
        setName(schedule.name);
        setSpecificDates(schedule.specificDates);
        setStartsOn(schedule.startsOn);
        setEndsOn(schedule.endsOn);
        setSelectedDishIds(new Set(schedule.listingIds));
        const next = defaultDays();
        for (let iso = 1; iso <= 7; iso += 1) {
          const windows = schedule.windows.filter(window => window.isoWeekday === iso);
          next[iso] = {
            enabled: windows.length > 0,
            allDay: windows.some(window => window.allDay),
            periods:
              windows.length && !windows.some(window => window.allDay)
                ? windows.map(window => ({
                    opensAt: window.opensAt?.slice(0, 5) ?? '08:00',
                    closesAt: window.closesAt?.slice(0, 5) ?? '21:00',
                  }))
                : [defaultPeriod()],
          };
        }
        setDays(next);
      }
    } catch (error: unknown) {
      Alert.alert(
        'Schedule unavailable',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [headers, scheduleId, session?.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  const updateDay = (iso: number, change: Partial<DayDraft>) =>
    setDays(current => ({ ...current, [iso]: { ...current[iso], ...change } }));

  const updatePeriod = (iso: number, index: number, change: Partial<Period>) =>
    updateDay(iso, {
      periods: days[iso].periods.map((period, periodIndex) =>
        periodIndex === index ? { ...period, ...change } : period
      ),
    });

  const save = async () => {
    if (name.trim().length < 2) return Alert.alert('Add a name', 'Enter a schedule name.');
    if (specificDates && (!startsOn || !endsOn || startsOn > endsOn)) {
      return Alert.alert('Check dates', 'Choose a valid start and end date.');
    }
    const windows: Array<{
      isoWeekday: number;
      allDay: boolean;
      opensAt: string | null;
      closesAt: string | null;
    }> = [];
    for (const [iso, day] of Object.entries(days)) {
      if (!day.enabled) continue;
      if (day.allDay) {
        windows.push({ isoWeekday: Number(iso), allDay: true, opensAt: null, closesAt: null });
      } else {
        windows.push(
          ...day.periods.map(period => ({
            isoWeekday: Number(iso),
            allDay: false,
            opensAt: period.opensAt,
            closesAt: period.closesAt,
          }))
        );
      }
    }
    if (!windows.length)
      return Alert.alert('Enable a day', 'A selling schedule needs one open day.');
    setSaving(true);
    try {
      const response = await fetch(
        `${apiUrl()}/api/availability/cook/selling-schedules${scheduleId ? `/${scheduleId}` : ''}`,
        {
          method: scheduleId ? 'PUT' : 'POST',
          headers,
          body: JSON.stringify({
            name: name.trim(),
            specificDates,
            startsOn,
            endsOn,
            windows,
            listingIds: [...selectedDishIds],
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Selling schedule could not be saved.');
      Alert.alert('Selling schedule saved', 'Selected dishes now follow this schedule.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error: unknown) {
      Alert.alert(
        'Schedule not saved',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const pickerDate = (() => {
    if (!pickerTarget) return new Date();
    if (pickerTarget.kind === 'date') {
      const value = pickerTarget.field === 'startsOn' ? startsOn : endsOn;
      return value ? new Date(`${value}T12:00:00`) : new Date();
    }
    return dateFromTime(days[pickerTarget.day].periods[pickerTarget.period][pickerTarget.field]);
  })();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={27} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scheduleId ? 'Edit selling schedule' : 'Add a selling schedule'}
        </Text>
        <Ionicons name="help-circle-outline" size={26} color="#232925" />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Use this feature to manage items that are only available at specific times within your
          Business Hours.
        </Text>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="E.g. Breakfast time"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={Keyboard.dismiss}
        />
        <Text style={styles.hint}>Your selling schedule name won’t be displayed to customers.</Text>

        <TouchableOpacity style={styles.checkRow} onPress={() => setSpecificDates(value => !value)}>
          <View style={styles.checkCopy}>
            <Text style={styles.checkTitle}>Only available on specific dates</Text>
            <Text style={styles.hint}>
              Outside these dates, assigned items are completely hidden.
            </Text>
          </View>
          <Ionicons
            name={specificDates ? 'checkbox' : 'square-outline'}
            size={27}
            color={specificDates ? '#4CAF50' : '#A9B0AC'}
          />
        </TouchableOpacity>
        {specificDates && (
          <View style={styles.dateRow}>
            {(['startsOn', 'endsOn'] as const).map(field => (
              <TouchableOpacity
                key={field}
                style={styles.dateField}
                onPress={() => setPickerTarget({ kind: 'date', field })}
              >
                <Text style={styles.label}>{field === 'startsOn' ? 'From' : 'To'}</Text>
                <Text style={styles.dateValue}>
                  {(field === 'startsOn' ? startsOn : endsOn) ?? 'Select date'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Schedule details</Text>
        {DAYS.map((label, index) => {
          const iso = index + 1;
          const day = days[iso];
          return (
            <View key={label} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={styles.dayTitle}>{label}</Text>
                  <Text style={styles.hint}>{day.enabled ? 'Available' : 'Hidden all day'}</Text>
                </View>
                <Switch
                  value={day.enabled}
                  onValueChange={enabled => updateDay(iso, { enabled })}
                  trackColor={{ false: '#D6DBD8', true: '#80D8A1' }}
                />
              </View>
              {day.enabled && (
                <>
                  <TouchableOpacity
                    style={styles.allDayRow}
                    onPress={() => updateDay(iso, { allDay: !day.allDay })}
                  >
                    <Text style={styles.allDayText}>All business hours</Text>
                    <Ionicons
                      name={day.allDay ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={day.allDay ? '#4CAF50' : '#A9B0AC'}
                    />
                  </TouchableOpacity>
                  {!day.allDay &&
                    day.periods.map((period, periodIndex) => (
                      <View key={`${iso}-${periodIndex}`} style={styles.periodRow}>
                        {(['opensAt', 'closesAt'] as const).map(field => (
                          <TouchableOpacity
                            key={field}
                            style={styles.timeField}
                            onPress={() =>
                              setPickerTarget({
                                kind: 'time',
                                day: iso,
                                period: periodIndex,
                                field,
                              })
                            }
                          >
                            <Text style={styles.timeLabel}>
                              {field === 'opensAt' ? 'From' : 'To'}
                            </Text>
                            <Text style={styles.timeValue}>{displayTime(period[field])}</Text>
                          </TouchableOpacity>
                        ))}
                        {day.periods.length > 1 && (
                          <Ionicons
                            name="trash-outline"
                            size={20}
                            color="#B42318"
                            onPress={() =>
                              updateDay(iso, {
                                periods: day.periods.filter((_, i) => i !== periodIndex),
                              })
                            }
                          />
                        )}
                      </View>
                    ))}
                  {!day.allDay && (
                    <TouchableOpacity
                      onPress={() => updateDay(iso, { periods: [...day.periods, defaultPeriod()] })}
                    >
                      <Text style={styles.addPeriod}>+ Add another period</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Assign dishes</Text>
        <Text style={styles.hint}>You can also change this later from the dish editing page.</Text>
        {dishes.map(dish => {
          const selected = selectedDishIds.has(dish.id);
          return (
            <TouchableOpacity
              key={dish.id}
              style={styles.dishRow}
              onPress={() =>
                setSelectedDishIds(current => {
                  const next = new Set(current);
                  if (next.has(dish.id)) next.delete(dish.id);
                  else next.add(dish.id);
                  return next;
                })
              }
            >
              {dish.image_url ? (
                <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
              ) : (
                <View style={styles.dishImagePlaceholder}>
                  <Ionicons name="restaurant-outline" size={20} color="#8B948E" />
                </View>
              )}
              <View style={styles.dishCopy}>
                <Text style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.hint}>{dish.menu_category || 'Uncategorised'}</Text>
              </View>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={25}
                color={selected ? '#4CAF50' : '#A9B0AC'}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.save, saving && styles.disabled]}
          disabled={saving}
          onPress={save}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
      <DateTimePickerModal
        isVisible={Boolean(pickerTarget)}
        mode={pickerTarget?.kind === 'date' ? 'date' : 'time'}
        date={pickerDate}
        onCancel={() => setPickerTarget(null)}
        onConfirm={date => {
          if (pickerTarget?.kind === 'date') {
            if (pickerTarget.field === 'startsOn') setStartsOn(dateKey(date));
            else setEndsOn(dateKey(date));
          } else if (pickerTarget?.kind === 'time') {
            updatePeriod(pickerTarget.day, pickerTarget.period, {
              [pickerTarget.field]: timeKey(date),
            });
          }
          setPickerTarget(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 17,
  },
  headerTitle: { flex: 1, fontSize: 21, fontWeight: '900', color: '#1D221F' },
  content: { padding: 20, paddingBottom: 130 },
  intro: { fontSize: 15, color: '#515A54', lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 14, color: '#343B37', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#C9CFCC',
    borderRadius: 16,
    padding: 16,
    fontSize: 17,
    color: '#202522',
  },
  hint: { fontSize: 12, color: '#747D77', lineHeight: 17, marginTop: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, gap: 12 },
  checkCopy: { flex: 1 },
  checkTitle: { fontSize: 16, color: '#202522', fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  dateField: { flex: 1, borderWidth: 1, borderColor: '#D0D5D2', borderRadius: 14, padding: 13 },
  dateValue: { fontSize: 14, color: '#202522' },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#191E1B',
    marginTop: 32,
    marginBottom: 12,
  },
  dayCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE1DE',
    paddingVertical: 16,
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { fontSize: 17, fontWeight: '800', color: '#202522' },
  allDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
  },
  allDayText: { fontSize: 15, color: '#39413C' },
  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, marginTop: 14 },
  timeField: { flex: 1, borderWidth: 1, borderColor: '#C9CFCC', borderRadius: 13, padding: 11 },
  timeLabel: { fontSize: 11, color: '#747D77' },
  timeValue: { fontSize: 15, color: '#202522', marginTop: 3 },
  addPeriod: { color: '#1473E6', fontWeight: '800', marginTop: 15 },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E5E2',
    paddingVertical: 12,
  },
  dishImage: { width: 48, height: 48, borderRadius: 10 },
  dishImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#EFF2F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishCopy: { flex: 1 },
  dishTitle: { fontSize: 15, fontWeight: '800', color: '#242A26' },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE1DE',
    backgroundColor: '#fff',
  },
  save: {
    minHeight: 54,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '900' },
});
