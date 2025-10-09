import React, { useState, useEffect, useCallback } from 'react';
import { Dimensions } from 'react-native';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import DateTimePickerModal from '../../src/components/inputs/DateTimePickerModal'; // Adjust path as needed
import type { User } from '@supabase/supabase-js';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_SIZE = SCREEN_WIDTH / 7; // exactly 7 columns

interface MenuItem {
  id: string;
  name: string;
  image_url: string;
  description?: string;
  price: number;
}

interface MenuAvailability {
  id?: string;
  menu_item_id: string;
  date: string;
  is_available: boolean;
  start_time?: string;
  end_time?: string;
  user_id: string;
}

const Calendar: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuAvailability, setMenuAvailability] = useState<MenuAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock data for demonstration
  const mockMenuItems: MenuItem[] = [
    {
      id: '1',
      name: 'The American Burger',
      image_url:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=100&h=100&fit=crop&crop=center',
      description: 'Classic American burger with cheese',
      price: 12.99,
    },
    {
      id: '2',
      name: 'The American Burger',
      image_url:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=100&h=100&fit=crop&crop=center',
      description: 'Classic American burger with cheese',
      price: 12.99,
    },
    {
      id: '3',
      name: 'The American Burger',
      image_url:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=100&h=100&fit=crop&crop=center',
      description: 'Classic American burger with cheese',
      price: 12.99,
    },
    {
      id: '4',
      name: 'The American Burger',
      image_url:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=100&h=100&fit=crop&crop=center',
      description: 'Classic American burger with cheese',
      price: 12.99,
    },
  ];
  // useEffect(() => {
  //   getCurrentUser();
  // }, []);

  const fetchMenuAvailability = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(
        `http://localhost:8000/api/menu-availability?user_id=${user.id}&date=${dateStr}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch availability');
      }
      const data = await res.json();
      setMenuAvailability(data.availability || []);
    } catch (error) {
      console.error('Error fetching menu availability:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (user && selectedDate) {
      fetchMenuAvailability();
    }
  }, [user, selectedDate, fetchMenuAvailability]);

  // const getCurrentUser = async () => {
  //   try {
  //     const res = await fetch('http://localhost:8000/api/auth/session');
  //     if (!res.ok) {
  //       throw new Error('Failed to fetch session');
  //     }
  //     const data = await res.json();
  //     setUser(data.session?.user ?? null);
  //   } catch (error) {
  //     console.error('Error fetching user session:', error);
  //   }
  // };

  // Commented out database fetch - uncomment when ready
  /*
  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items') // Assuming table name is 'menu_items'
        .select('*')
        .eq('user_id', user?.id); // Filter by current user

      if (error) {
        console.error('Error fetching menu items:', error);
        return;
      }

      setMenuItems(data || []);
    } catch (error) {
      console.error('Error fetching menu items:', error);
    }
  };
  */

  const toggleAvailability = async (menuItemId: string, currentlyAvailable: boolean) => {
    if (!user) return;

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const newAvailability = !currentlyAvailable;

      // Check if record exists
      const existingRecord = menuAvailability.find(item => item.menu_item_id === menuItemId);

      if (existingRecord) {
        const res = await fetch('http://localhost:8000/api/toggle-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingRecord.id, is_available: newAvailability }),
        });

        if (!res.ok) {
          throw new Error('Failed to update availability');
        }

        const data = await res.json();

        // Update local state
        setMenuAvailability(prev =>
          prev.map(item => (item.id === existingRecord.id ? data.availability : item))
        );
      } else {
        Alert.alert('Error', 'No availability record exists yet for this menu item');
      }
    } catch (error) {
      console.error('Error toggling availability:', error);
      Alert.alert('Error', 'Failed to update availability');
    }
  };

  const updateTimeSlot = (menuItemId: string, timeType: 'start' | 'end', time: string) => {
    // This function can be expanded to handle time slot updates
    console.log(`Updating ${timeType} time for ${menuItemId} to ${time}`);
  };

  const isItemAvailable = (menuItemId: string): boolean => {
    const availability = menuAvailability.find(item => item.menu_item_id === menuItemId);
    return availability?.is_available ?? false;
  };

  const getTimeSlot = (menuItemId: string): string => {
    const availability = menuAvailability.find(item => item.menu_item_id === menuItemId);
    if (availability && availability.start_time && availability.end_time) {
      return `${availability.start_time} - ${availability.end_time}`;
    }
    return '12 - 13:00pm';
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };

  const renderCalendarHeader = () => {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const currentMonth = monthNames[selectedDate.getMonth()];
    const currentYear = selectedDate.getFullYear();

    return (
      <View style={styles.calendarHeader}>
        <TouchableOpacity style={styles.navButton} onPress={() => navigateMonth('prev')}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.monthYearContainer}>
          <Text style={styles.monthText}>{currentMonth}</Text>
          <Text style={styles.yearText}>{currentYear}</Text>
        </View>

        <TouchableOpacity style={styles.navButton} onPress={() => navigateMonth('next')}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCalendar = () => {
    const today = new Date();
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();

    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Days of week header
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const calendarDays = [];

    // Add previous month's last days (inactive)
    const prevMonth = new Date(currentYear, currentMonth, 0);
    const startDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1; // Adjust for Monday start

    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i;
      calendarDays.push(
        <TouchableOpacity key={`prev-${day}`} style={styles.calendarDay} disabled>
          <Text style={styles.inactiveDayText}>{day}</Text>
        </TouchableOpacity>
      );
    }

    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday =
        today.getDate() === day &&
        today.getMonth() === currentMonth &&
        today.getFullYear() === currentYear;
      const isSelected =
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === currentMonth &&
        selectedDate.getFullYear() === currentYear;
      const date = new Date(currentYear, currentMonth, day);

      // Check if this date has any menu availability
      const dateStr = date.toISOString().split('T')[0];
      const hasAvailability = menuAvailability.some(
        item => item.date === dateStr && item.is_available
      );

      calendarDays.push(
        <TouchableOpacity
          key={day}
          style={[styles.calendarDay, isSelected && styles.selectedDay]}
          onPress={() => setSelectedDate(date)}
        >
          {/* <View style={[isSelected && styles.selectedDayCircle]}> */}
          <Text
            style={[
              styles.dayText,
              isSelected && styles.selectedDayText,
              isToday && styles.todayText,
            ]}
          >
            {day}
          </Text>
          {/* </View> */}
          {hasAvailability && <View style={styles.dayIndicator} />}
        </TouchableOpacity>
      );
    }

    // Add next month's first days to fill the grid
    const totalCells = Math.ceil(calendarDays.length / 7) * 7;
    let nextMonthDay = 1;
    console.log(calendarDays.length, totalCells);
    while (calendarDays.length < totalCells) {
      calendarDays.push(
        <TouchableOpacity key={`next-${nextMonthDay}`} style={styles.calendarDay} disabled>
          <Text style={styles.inactiveDayText}>{nextMonthDay}</Text>
        </TouchableOpacity>
      );
      nextMonthDay++;
    }

    return (
      <View style={styles.calendar}>
        <View style={styles.daysOfWeekHeader}>
          {daysOfWeek.map(day => (
            <Text key={day} style={styles.dayOfWeekText}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>{calendarDays}</View>
      </View>
    );
  };

  const renderMenuItem = (item: MenuItem) => {
    const isAvailable = isItemAvailable(item.id);
    const timeSlot = getTimeSlot(item.id);

    return (
      <View key={item.id} style={styles.menuItem}>
        <View style={styles.menuItemLeft}>
          <Image source={{ uri: item.image_url }} style={styles.menuItemImage} />
          <Text style={styles.menuItemName}>{item.name}</Text>
        </View>

        <View style={styles.menuItemCenter}>
          <TouchableOpacity
            style={[styles.availabilityToggle, isAvailable && styles.availabilityToggleActive]}
            onPress={() => toggleAvailability(item.id, isAvailable)}
          >
            <View style={[styles.toggleSwitch, isAvailable && styles.toggleSwitchActive]} />
          </TouchableOpacity>
          <Text style={styles.availabilityText}>Available</Text>
        </View>

        <View style={styles.menuItemRight}>
          <TouchableOpacity style={styles.timeSlotButton}>
            <Text style={[styles.timeSlotText, !isAvailable && styles.timeSlotTextInactive]}>
              {timeSlot} ▼
            </Text>
          </TouchableOpacity>
          <Text style={styles.timeSlotLabel}>Time slot</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderCalendarHeader()}

      {renderCalendar()}

      <View style={styles.menuSection}>
        <View style={styles.menuSectionHeader}>
          <Text style={styles.sectionTitle}>Your meals</Text>
          <Text style={styles.sectionTitle}>Available</Text>
          <Text style={styles.sectionTitle}>Time slot</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingTop: 0 }} style={styles.menuList}>
          {menuItems.map(renderMenuItem)}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 30,
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'flex-start',
    gap: 0, // consistent vertical gap between calendar + menu
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  navButton: {
    padding: 10,
  },
  navButtonText: {
    fontSize: 24,
    color: '#000000',
    fontWeight: '300',
  },
  monthYearContainer: {
    alignItems: 'center',
  },
  groupText: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 2,
  },
  monthText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
  },
  yearText: {
    fontSize: 16,
    color: '#999999',
  },
  calendar: {
    paddingHorizontal: 20,
    marginBottom: 0,
    height: 'auto',
  },
  daysOfWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  dayOfWeekText: {
    fontSize: 14,
    color: '#999999',
    fontWeight: '500',
    width: 40,
    textAlign: 'center',
  },
  // calendarGrid: {
  //   flexDirection: 'row',
  //   flexWrap: 'wrap',
  //   justifyContent: 'space-around',
  // },

  selectedDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '400',
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  calendarDay: {
    width: '14.28%', // exactly 100 / 7 = 14.28%
    aspectRatio: 1, // keep squares
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    position: 'relative',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start', // keep items tight
    rowGap: 5,
    height: 260,
  },

  selectedDay: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
  },

  todayText: {
    fontWeight: '600',
  },
  inactiveDayText: {
    color: '#CCCCCC',
    fontSize: 16,
  },
  dayIndicator: {
    position: 'absolute',
    bottom: -5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
  },
  menuSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  menuSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  menuItemName: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
    flex: 1,
  },
  menuItemCenter: {
    alignItems: 'center',
    flex: 1,
  },
  availabilityToggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    padding: 2,
    marginBottom: 5,
  },
  availabilityToggleActive: {
    backgroundColor: '#4CAF50',
  },
  toggleSwitch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleSwitchActive: {
    alignSelf: 'flex-end',
  },
  availabilityText: {
    fontSize: 10,
    color: '#666666',
  },
  menuItemRight: {
    alignItems: 'center',
    flex: 1,
  },
  timeSlotButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8F8F8',
    marginBottom: 5,
  },
  timeSlotText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  timeSlotTextInactive: {
    color: '#CCCCCC',
  },
  timeSlotLabel: {
    fontSize: 10,
    color: '#666666',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTabItem: {
    opacity: 1,
  },
  tabText: {
    fontSize: 10,
    color: '#999999',
    marginTop: 2,
  },
  activeTabText: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 2,
  },
});

export default Calendar;
