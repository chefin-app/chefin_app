import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { getLocalDateKey, isAvailabilityRecordBookable } from '@/src/utils/listingAvailability';

interface AvailabilityRecord {
  id: string;
  listing_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  orders_taken: number | null;
  is_available: boolean | null;
}

interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  remainingSlots: number;
  isFull: boolean;
}

interface AvailabilityPickerProps {
  listingId: string;
  onSelect: (date: string, slot: TimeSlot) => void;
}

/** Imperative API exposed via ref so parents can trigger a refetch
 *  (e.g. on pull-to-refresh). */
export interface AvailabilityPickerHandle {
  refresh: () => Promise<void>;
}

const formatTime = (isoString: string): string => {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

/** Expand a single availability row into hour-aligned pickup slots between
 *  start_time and end_time. Each emitted slot shares the row's remaining
 *  capacity, since max_orders applies to the whole window. Slots that have
 *  already started (relative to `now`) are disabled — you can't pick up
 *  food in the past — even if capacity is still open. */
const expandToHourSlots = (record: AvailabilityRecord, now: Date): TimeSlot[] => {
  const start = new Date(record.start_time);
  const end = new Date(record.end_time);
  const remaining = Math.max(0, record.max_orders - (record.orders_taken ?? 0));
  const isFull = record.is_available === false || remaining <= 0;

  const slots: TimeSlot[] = [];
  const cursor = new Date(start);
  while (true) {
    const slotEnd = new Date(cursor);
    slotEnd.setHours(slotEnd.getHours() + 1);
    if (slotEnd > end) break;
    const isPast = cursor < now;
    slots.push({
      id: `${record.id}_${cursor.getTime()}`,
      startTime: cursor.toISOString(),
      endTime: slotEnd.toISOString(),
      remainingSlots: remaining,
      isFull: isFull || isPast,
    });
    cursor.setHours(cursor.getHours() + 1);
  }
  return slots;
};

const AvailabilityPicker = forwardRef<AvailabilityPickerHandle, AvailabilityPickerProps>(
  ({ listingId, onSelect }, ref) => {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AvailabilityRecord[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

    // Right-edge "more slots" arrow — shown while the chip row can still
    // scroll further right, hidden once the user reaches the end.
    const slotsScrollRef = useRef<ScrollView>(null);
    const slotsContentWidth = useRef(0);
    const slotsContainerWidth = useRef(0);

    const handleSlotsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {};

    const fetchAvailability = useCallback(
      async (showLoading = true) => {
        try {
          if (showLoading) setLoading(true);
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_API_URL}/api/availability/${listingId}`
          );
          const data = await res.json();
          const entries: AvailabilityRecord[] =
            data.availability ?? (Array.isArray(data) ? data : []);
          setRecords(entries);
        } catch (err) {
          console.error('Error fetching availability:', err);
          setRecords([]);
        } finally {
          if (showLoading) setLoading(false);
        }
      },
      [listingId]
    );

    useEffect(() => {
      fetchAvailability();
    }, [fetchAvailability]);

    useImperativeHandle(
      ref,
      () => ({
        // Parent-triggered refresh — silent (no spinner), so it pairs nicely
        // with a pull-to-refresh control on the parent ScrollView.
        refresh: () => fetchAvailability(false),
      }),
      [fetchAvailability]
    );

    // Build marked dates for the calendar
    const markedDates = useMemo(() => {
      const marks: Record<string, any> = {};
      const now = new Date();
      const today = getLocalDateKey(now);

      records.forEach(record => {
        const dateStr = record.available_date.split('T')[0];
        if (dateStr < today) return; // skip past dates

        const isOpen = isAvailabilityRecordBookable(record, today, now);

        // Only mark if not already marked, or if this slot is open
        if (!marks[dateStr]) {
          marks[dateStr] = {
            marked: true,
            dotColor: isOpen ? '#4CAF50' : '#CCC',
            disabled: !isOpen,
            disableTouchEvent: !isOpen,
            selectedColor: '#4CAF50',
          };
        } else if (isOpen) {
          // If ANY slot on this date is open, the date is available
          marks[dateStr].dotColor = '#4CAF50';
          marks[dateStr].disabled = false;
          marks[dateStr].disableTouchEvent = false;
        }
      });

      if (selectedDate && marks[selectedDate]) {
        marks[selectedDate] = {
          ...marks[selectedDate],
          selected: true,
          selectedColor: '#4CAF50',
          selectedTextColor: '#fff',
        };
      }

      return marks;
    }, [records, selectedDate]);

    // Hour-by-hour pickup slots for the selected date. Recomputed whenever the
    // date changes so slots that just moved into the past get disabled.
    const timeSlots: TimeSlot[] = useMemo(() => {
      if (!selectedDate) return [];
      const now = new Date();
      return records
        .filter(r => r.available_date.split('T')[0] === selectedDate)
        .flatMap(r => expandToHourSlots(r, now))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [records, selectedDate]);

    // max_orders is a window-wide budget. Sum across any rows for this date
    // and report a single remaining count above the chips.
    const dayCapacity = useMemo(() => {
      if (!selectedDate) return { remaining: 0, isFull: true };
      const rowsToday = records.filter(r => r.available_date.split('T')[0] === selectedDate);
      if (rowsToday.length === 0) return { remaining: 0, isFull: true };
      const remaining = rowsToday.reduce(
        (sum, r) => sum + Math.max(0, r.max_orders - (r.orders_taken ?? 0)),
        0
      );
      const anyOpen = rowsToday.some(r => r.is_available !== false);
      return { remaining, isFull: !anyOpen || remaining <= 0 };
    }, [records, selectedDate]);

    // Reset the scroll-arrow affordance whenever the slot list changes (new
    // date picked) — otherwise it can show stale state from the prior date.
    useEffect(() => {
      slotsScrollRef.current?.scrollTo({ x: 0, animated: false });
    }, [timeSlots]);

    const handleDateSelect = (day: DateData) => {
      setSelectedDate(day.dateString);
      setSelectedSlot(null);
    };

    const handleSlotSelect = (slot: TimeSlot) => {
      if (slot.isFull) return;
      setSelectedSlot(slot);
      onSelect(selectedDate!, slot);
    };

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading availability...</Text>
        </View>
      );
    }

    if (records.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={32} color="#CCC" />
          <Text style={styles.emptyText}>No availability set by the cook.</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {/* Calendar */}
        <Calendar
          markedDates={markedDates}
          onDayPress={handleDateSelect}
          minDate={getLocalDateKey()}
          theme={{
            selectedDayBackgroundColor: '#4CAF50',
            todayTextColor: '#4CAF50',
            dotColor: '#4CAF50',
            arrowColor: '#1A1A1A',
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
            textDayHeaderFontWeight: '600',
            textDayFontSize: 15,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 13,
          }}
          style={styles.calendar}
        />

        {/* Time Slots */}
        {selectedDate && (
          <View style={styles.timeSlotsSection}>
            <Text style={styles.timeSlotsTitle}>
              Pick your collection time for{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <Text style={[styles.capacityNote, dayCapacity.isFull && styles.capacityNoteFull]}>
              {dayCapacity.isFull
                ? 'Window full — all orders taken for this day.'
                : `${dayCapacity.remaining} order${dayCapacity.remaining === 1 ? '' : 's'} left across this window.`}
            </Text>

            {timeSlots.length === 0 ? (
              <Text style={styles.noSlotsText}>No time slots for this date.</Text>
            ) : (
              <View style={styles.slotsWrap}>
                <ScrollView
                  ref={slotsScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.slotsRow}
                  onScroll={handleSlotsScroll}
                  scrollEventThrottle={32}
                  onLayout={e => {
                    slotsContainerWidth.current = e.nativeEvent.layout.width;
                  }}
                  onContentSizeChange={w => {
                    slotsContentWidth.current = w;
                  }}
                >
                  {timeSlots.map(slot => (
                    <TouchableOpacity
                      key={slot.id}
                      disabled={slot.isFull}
                      style={[
                        styles.slotChip,
                        slot.isFull && styles.slotChipDisabled,
                        selectedSlot?.id === slot.id && styles.slotChipSelected,
                      ]}
                      onPress={() => handleSlotSelect(slot)}
                    >
                      <Text
                        style={[
                          styles.slotTime,
                          slot.isFull && styles.slotTimeDisabled,
                          selectedSlot?.id === slot.id && styles.slotTimeSelected,
                        ]}
                      >
                        {formatTime(slot.startTime)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
);

AvailabilityPicker.displayName = 'AvailabilityPicker';

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  calendar: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  timeSlotsSection: {
    marginTop: 4,
  },
  timeSlotsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  noSlotsText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  slotsWrap: {
    position: 'relative',
  },
  slotsRow: {
    gap: 5,
    paddingBottom: 4,
    paddingRight: 28,
  },
  slotsScrollHint: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 4,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,125,50,0.55)',
    borderRadius: 14,
  },
  capacityNote: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: -6,
    marginBottom: 12,
  },
  capacityNoteFull: {
    color: '#C62828',
  },
  slotChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F0F7F1',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    alignItems: 'center',
    minWidth: 96,
  },
  slotChipDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  slotChipSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 2,
  },
  slotTimeDisabled: {
    color: '#BBB',
  },
  slotTimeSelected: {
    color: '#fff',
  },
  slotCapacity: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
  },
  slotCapacityDisabled: {
    color: '#CCC',
  },
  slotCapacitySelected: {
    color: 'rgba(255,255,255,0.85)',
  },
});

export default AvailabilityPicker;
