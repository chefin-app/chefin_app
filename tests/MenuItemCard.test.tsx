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
    render(
      <MenuItemCard
        {...dish}
        onPress={onPress}
        onAddPress={onAddPress}
        onDecreasePress={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId('menu-item-add-dish-1'));

    expect(onAddPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Add Nasi Lemak to cart')).toBeTruthy();
  });

  it('labels the add action as an option picker when option groups are attached', () => {
    render(
      <MenuItemCard
        {...dish}
        hasOptionGroups
        cartQuantity={2}
        onPress={jest.fn()}
        onAddPress={jest.fn()}
        onDecreasePress={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Choose options for Nasi Lemak')).toBeTruthy();
    expect(screen.queryByTestId('menu-item-quantity-dish-1')).toBeNull();
  });

  it('shows inline quantity controls for a dish without option groups', () => {
    const onPress = jest.fn();
    const onIncreasePress = jest.fn();
    const onDecreasePress = jest.fn();
    render(
      <MenuItemCard
        {...dish}
        cartQuantity={2}
        maxQuantity={3}
        onPress={onPress}
        onAddPress={onIncreasePress}
        onDecreasePress={onDecreasePress}
      />
    );

    expect(screen.getByTestId('menu-item-quantity-value-dish-1').props.children).toBe(2);
    fireEvent.press(screen.getByTestId('menu-item-decrease-dish-1'));
    fireEvent.press(screen.getByTestId('menu-item-increase-dish-1'));

    expect(onDecreasePress).toHaveBeenCalledTimes(1);
    expect(onIncreasePress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables the inline add button at the available quantity limit', () => {
    const onIncreasePress = jest.fn();
    render(
      <MenuItemCard
        {...dish}
        cartQuantity={3}
        maxQuantity={3}
        onPress={jest.fn()}
        onAddPress={onIncreasePress}
        onDecreasePress={jest.fn()}
      />
    );

    const increaseButton = screen.getByTestId('menu-item-increase-dish-1');
    expect(increaseButton.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(increaseButton);
    expect(onIncreasePress).not.toHaveBeenCalled();
  });
});
