import { fireEvent, render, screen } from '@testing-library/react-native';

import MenuItemCard from '@/src/components/cards/MenuItemCard';

const dish = {
  id: 'dish-1',
  cook_id: 'cook-1',
  title: 'Nasi Lemak',
  description: 'Coconut rice with sambal',
  price: 12,
  image_url: '',
  created_at: '2026-09-01T00:00:00.000Z',
  location: 'Kuala Lumpur',
  isAvailable: true,
  availabilityLabel: 'Available now',
};

describe('MenuItemCard add control', () => {
  it('runs the dedicated add action without opening dish details', () => {
    const onPress = jest.fn();
    const onAddPress = jest.fn();
    render(<MenuItemCard {...dish} onPress={onPress} onAddPress={onAddPress} />);

    fireEvent.press(screen.getByTestId('menu-item-add-dish-1'));

    expect(onAddPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Add Nasi Lemak to cart')).toBeTruthy();
  });

  it('labels the add action as an option picker when option groups are attached', () => {
    render(<MenuItemCard {...dish} hasOptionGroups onPress={jest.fn()} onAddPress={jest.fn()} />);

    expect(screen.getByLabelText('Choose options for Nasi Lemak')).toBeTruthy();
  });
});
