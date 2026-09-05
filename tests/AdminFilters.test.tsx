import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import AdminDateFilter from '@/src/components/admin/AdminDateFilter';
import AdminSelect from '@/src/components/admin/AdminSelect';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-calendars', () => {
  const ReactActual = jest.requireActual('react');
  const { Text, TouchableOpacity } = jest.requireActual('react-native');
  return {
    Calendar: ({ onDayPress }: { onDayPress: (day: { dateString: string }) => void }) =>
      ReactActual.createElement(
        TouchableOpacity,
        {
          testID: 'mock-calendar-day',
          onPress: () => onDayPress({ dateString: '2026-09-04' }),
        },
        ReactActual.createElement(Text, null, '4 September 2026')
      ),
  };
});

describe('admin list filters', () => {
  it('selects a sort option from the dropdown', () => {
    const onChange = jest.fn();
    render(
      <AdminSelect
        label="Sort by"
        value="newest"
        options={[
          { key: 'newest', label: 'Newest' },
          { key: 'oldest', label: 'Oldest' },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.press(screen.getByTestId('admin-select-sort-by'));
    fireEvent.press(screen.getByTestId('admin-select-option-oldest'));

    expect(onChange).toHaveBeenCalledWith('oldest');
  });

  it('returns an exact date selected from the calendar', () => {
    const onChange = jest.fn();
    render(
      <AdminDateFilter
        range="all"
        exactDate={null}
        rangeOptions={[
          { key: 'all', label: 'All dates' },
          { key: 'today', label: 'Today' },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.press(screen.getByTestId('admin-date-filter'));
    fireEvent.press(screen.getByTestId('mock-calendar-day'));

    expect(onChange).toHaveBeenCalledWith({ range: 'all', exactDate: '2026-09-04' });
  });
});
