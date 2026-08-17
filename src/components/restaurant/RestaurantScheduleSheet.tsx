import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  RestaurantOrderSelection,
  RestaurantOrderSlot,
} from '@/src/utils/restaurantOrderSchedule';

export interface RestaurantScheduleDay {
  serviceDate: string;
  weekdayLabel: string;
  dayNumber: string;
  isToday: boolean;
  slots: RestaurantOrderSlot[];
}

interface RestaurantScheduleSheetProps {
  visible: boolean;
  days: RestaurantScheduleDay[];
  selection: RestaurantOrderSelection;
  onSelect: (selection: RestaurantOrderSelection) => void;
  onClose: () => void;
  asapAvailable?: boolean;
  title?: string;
}

const isSelectedSlot = (selection: RestaurantOrderSelection, slot: RestaurantOrderSlot): boolean =>
  selection.mode === 'scheduled' &&
  selection.serviceDate === slot.serviceDate &&
  selection.startTime === slot.startTime;

export default function RestaurantScheduleSheet({
  visible,
  days,
  selection,
  onSelect,
  onClose,
  asapAvailable = false,
  title = 'Select order day and time',
}: RestaurantScheduleSheetProps) {
  const initialDate = useMemo(() => {
    if (selection.mode === 'scheduled') return selection.serviceDate;
    return days.find(day => day.isToday)?.serviceDate ?? days[0]?.serviceDate ?? '';
  }, [days, selection]);
  const [activeDate, setActiveDate] = useState(initialDate);

  useEffect(() => {
    if (visible) setActiveDate(initialDate);
  }, [initialDate, visible]);

  const activeDay = days.find(day => day.serviceDate === activeDate) ?? days[0];
  const canSelectAsap = Boolean(asapAvailable && activeDay?.isToday);

  const selectAndClose = (nextSelection: RestaurantOrderSelection) => {
    onSelect(nextSelection);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close order time picker"
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close order time picker"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color="#26302A" />
            </TouchableOpacity>
          </View>

          {days.length > 0 ? (
            <>
              <View style={styles.dayTabs} accessibilityRole="tablist">
                {days.map(day => {
                  const selected = day.serviceDate === activeDay?.serviceDate;
                  return (
                    <TouchableOpacity
                      key={day.serviceDate}
                      testID={`schedule-day-${day.serviceDate}`}
                      style={styles.dayTab}
                      onPress={() => setActiveDate(day.serviceDate)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${day.isToday ? 'Today, ' : ''}${day.weekdayLabel} ${day.dayNumber}`}
                    >
                      <Text style={[styles.weekday, selected && styles.dayTextSelected]}>
                        {day.isToday ? 'Best' : day.weekdayLabel}
                      </Text>
                      <View style={[styles.dayNumberCircle, selected && styles.dayNumberSelected]}>
                        <Text style={[styles.dayNumber, selected && styles.dayNumberTextSelected]}>
                          {day.dayNumber}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ScrollView
                style={styles.slotList}
                contentContainerStyle={styles.slotListContent}
                showsVerticalScrollIndicator={false}
              >
                {canSelectAsap && (
                  <TouchableOpacity
                    testID="schedule-asap"
                    style={styles.slotRow}
                    onPress={() => selectAndClose({ mode: 'asap' })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selection.mode === 'asap' }}
                    accessibilityLabel="Order as soon as possible"
                  >
                    <View style={styles.slotIcon}>
                      <Ionicons name="flash" size={18} color="#2F8F46" />
                    </View>
                    <View style={styles.slotTextContainer}>
                      <Text style={styles.slotLabel}>As soon as possible</Text>
                      <Text style={styles.slotSupportingText}>Use the earliest available time</Text>
                    </View>
                    {selection.mode === 'asap' ? (
                      <Ionicons name="checkmark-circle" size={24} color="#36B95A" />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color="#A0A8A2" />
                    )}
                  </TouchableOpacity>
                )}

                {activeDay?.slots.map(slot => {
                  const selected = isSelectedSlot(selection, slot);
                  return (
                    <TouchableOpacity
                      key={slot.id}
                      testID={`schedule-slot-${slot.id}`}
                      style={styles.slotRow}
                      onPress={() =>
                        selectAndClose({
                          mode: 'scheduled',
                          serviceDate: slot.serviceDate,
                          startTime: slot.startTime,
                          endTime: slot.endTime,
                        })
                      }
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={slot.label}
                    >
                      <View style={styles.slotIcon}>
                        <Ionicons name="time-outline" size={19} color="#39764A" />
                      </View>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={24} color="#36B95A" />
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color="#A0A8A2" />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {!canSelectAsap && activeDay?.slots.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="calendar-outline" size={30} color="#A6AEA8" />
                    <Text style={styles.emptyTitle}>No order times available</Text>
                    <Text style={styles.emptyText}>Choose another day or check back later.</Text>
                  </View>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={30} color="#A6AEA8" />
              <Text style={styles.emptyTitle}>No order times available</Text>
              <Text style={styles.emptyText}>This cook has not opened advance ordering yet.</Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(19, 25, 21, 0.5)',
  },
  sheet: {
    maxHeight: '78%',
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dragHandle: {
    width: 42,
    height: 5,
    marginTop: 10,
    marginBottom: 6,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#E0E4E1',
  },
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 14,
  },
  title: {
    flex: 1,
    paddingRight: 12,
    fontFamily: 'mon-b',
    fontSize: 22,
    lineHeight: 28,
    color: '#1E2521',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F2F5F3',
  },
  dayTabs: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E9E6',
  },
  dayTab: {
    minWidth: 78,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  weekday: {
    marginBottom: 8,
    fontFamily: 'mon-sb',
    fontSize: 13,
    color: '#717A74',
  },
  dayTextSelected: { color: '#269447' },
  dayNumberCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#F2F5F3',
  },
  dayNumberSelected: { backgroundColor: '#36B95A' },
  dayNumber: {
    fontFamily: 'mon-sb',
    fontSize: 17,
    color: '#2D3731',
  },
  dayNumberTextSelected: { color: '#FFFFFF' },
  slotList: { flexGrow: 0 },
  slotListContent: { paddingHorizontal: 20, paddingBottom: 20 },
  slotRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E9E6',
  },
  slotIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: '#ECF7EF',
  },
  slotTextContainer: { flex: 1 },
  slotLabel: {
    flex: 1,
    fontFamily: 'mon-sb',
    fontSize: 15,
    color: '#26302A',
  },
  slotSupportingText: {
    marginTop: 3,
    fontFamily: 'mon',
    fontSize: 11,
    color: '#7B847E',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 38,
  },
  emptyTitle: {
    marginTop: 10,
    fontFamily: 'mon-b',
    fontSize: 15,
    color: '#354039',
  },
  emptyText: {
    marginTop: 5,
    textAlign: 'center',
    fontFamily: 'mon',
    fontSize: 12,
    lineHeight: 18,
    color: '#7A837D',
  },
});
