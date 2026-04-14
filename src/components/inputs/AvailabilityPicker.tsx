import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';

interface AvailabilityRecord {
  id: string;
  listing_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  orders_taken: number | null;
  is_available: boolean;
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

const formatTime = (isoString: string): string => {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const AvailabilityPicker: React.FC<AvailabilityPickerProps> = ({ listingId, onSelect }) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AvailabilityRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/availability/${listingId}`);
        const data = await res.json();
        const entries: AvailabilityRecord[] =
          data.availability ?? (Array.isArray(data) ? data : []);
        setRecords(entries);
      } catch (err) {
        console.error('Error fetching availability:', err);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAvailability();
  }, [listingId]);

  // Build marked dates for the calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const today = new Date().toISOString().split('T')[0];

    records.forEach(record => {
      const dateStr = record.available_date.split('T')[0];
      if (dateStr < today) return; // skip past dates

      const remaining = record.max_orders - (record.orders_taken ?? 0);
      const isOpen = record.is_available && remaining > 0;

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

  // Time slots for the selected date
  const timeSlots: TimeSlot[] = useMemo(() => {
    if (!selectedDate) return [];
    return records
      .filter(r => {
        const dateStr = r.available_date.split('T')[0];
        return dateStr === selectedDate;
      })
      .map(r => {
        const remaining = r.max_orders - (r.orders_taken ?? 0);
        return {
          id: r.id,
          startTime: r.start_time,
          endTime: r.end_time,
          remainingSlots: Math.max(0, remaining),
          isFull: !r.is_available || remaining <= 0,
        };
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [records, selectedDate]);

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
        minDate={new Date().toISOString().split('T')[0]}
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
            Available times for{' '}
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>

          {timeSlots.length === 0 ? (
            <Text style={styles.noSlotsText}>No time slots for this date.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.slotsRow}
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
                  <Text
                    style={[
                      styles.slotCapacity,
                      slot.isFull && styles.slotCapacityDisabled,
                      selectedSlot?.id === slot.id && styles.slotCapacitySelected,
                    ]}
                  >
                    {slot.isFull ? 'Full' : `${slot.remainingSlots} left`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

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
  slotsRow: {
    gap: 10,
    paddingBottom: 4,
  },
  slotChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F0F7F1',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    alignItems: 'center',
    minWidth: 90,
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
