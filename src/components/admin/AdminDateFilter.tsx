import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';

export interface AdminDateRangeOption<T extends string> {
  key: T;
  label: string;
}

interface AdminDateFilterProps<T extends string> {
  range: T;
  exactDate: string | null;
  rangeOptions: Array<AdminDateRangeOption<T>>;
  onChange: (selection: { range: T; exactDate: string | null }) => void;
}

const malaysiaDateKey = (): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatExactDate = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00+08:00`).toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function AdminDateFilter<T extends string>({
  range,
  exactDate,
  rangeOptions,
  onChange,
}: AdminDateFilterProps<T>) {
  const [open, setOpen] = useState(false);
  const rangeLabel = rangeOptions.find(option => option.key === range)?.label ?? 'All dates';
  const label = exactDate ? formatExactDate(exactDate) : rangeLabel;
  const today = malaysiaDateKey();

  const selectRange = (nextRange: T) => {
    onChange({ range: nextRange, exactDate: null });
    setOpen(false);
  };

  const selectDate = (day: DateData) => {
    onChange({ range: rangeOptions[0].key, exactDate: day.dateString });
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        testID="admin-date-filter"
        style={styles.button}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Filter by date, currently ${label}`}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="calendar-outline" size={16} color="#667085" />
        <Text style={styles.buttonText} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={15} color="#667085" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.popup}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>DATE FILTER</Text>
                <Text style={styles.title}>Choose a date</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setOpen(false)}
                accessibilityLabel="Close calendar"
              >
                <Ionicons name="close" size={20} color="#47544C" />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRanges}
            >
              {rangeOptions.map(option => {
                const selected = !exactDate && option.key === range;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.rangeButton, selected && styles.rangeButtonSelected]}
                    onPress={() => selectRange(option.key)}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.rangeText, selected && styles.rangeTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Calendar
              current={exactDate ?? today}
              maxDate={today}
              onDayPress={selectDate}
              markedDates={
                exactDate
                  ? {
                      [exactDate]: {
                        selected: true,
                        selectedColor: '#35A853',
                        selectedTextColor: '#FFFFFF',
                      },
                    }
                  : undefined
              }
              enableSwipeMonths
              theme={{
                todayTextColor: '#278C43',
                arrowColor: '#278C43',
                monthTextColor: '#26332B',
                textMonthFontFamily: 'mon-sb',
                textDayFontFamily: 'mon',
                textDayHeaderFontFamily: 'mon-sb',
                textDayFontSize: 13,
                textMonthFontSize: 15,
                textDayHeaderFontSize: 10,
              }}
            />
            <Text style={styles.helper}>Select a day to show records created on that date.</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    minWidth: 154,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
  },
  buttonText: { flex: 1, fontFamily: 'mon-sb', fontSize: 10, color: '#56635B' },
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(17, 26, 20, 0.28)',
  },
  popup: {
    width: '100%',
    maxWidth: 410,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: { fontFamily: 'mon-b', fontSize: 8, letterSpacing: 1.1, color: '#399C57' },
  title: { marginTop: 3, fontFamily: 'mon-b', fontSize: 19, color: '#26332B' },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F2F5F3',
  },
  quickRanges: { gap: 7, paddingBottom: 14 },
  rangeButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  rangeButtonSelected: { borderColor: '#4CAF50', backgroundColor: '#EAF8EE' },
  rangeText: { fontFamily: 'mon-sb', fontSize: 9, color: '#68736C' },
  rangeTextSelected: { color: '#237A3B' },
  helper: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'mon',
    fontSize: 9,
    color: '#7D8780',
  },
});
