import { render, screen } from '@testing-library/react-native';
import React from 'react';

import DishOrderModal from '@/src/components/restaurant/DishOrderModal';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('DishOrderModal', () => {
  it('shows the dish ingredients', () => {
    render(
      <DishOrderModal
        visible
        dish={{
          id: 'dish-1',
          title: 'Chicken Mandi',
          price: 24,
          ingredients: ['Basmati rice', 'Chicken', 'Mandi spices'],
        }}
        scheduleLabel="Today, 6:00 PM–7:00 PM"
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('Ingredients')).toBeTruthy();
    expect(screen.getByText('Basmati rice')).toBeTruthy();
    expect(screen.getByText('Chicken')).toBeTruthy();
    expect(screen.getByText('Mandi spices')).toBeTruthy();
  });

  it('does not show an empty ingredients section', () => {
    render(
      <DishOrderModal
        visible
        dish={{ id: 'dish-2', title: 'Plain Rice', price: 5, ingredients: [] }}
        scheduleLabel="Today, 6:00 PM–7:00 PM"
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.queryByText('Ingredients')).toBeNull();
  });
});
