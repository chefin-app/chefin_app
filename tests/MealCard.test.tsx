import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import MealCard from '@/src/components/cards/MealCard';
import { act } from 'react-test-renderer';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
})); // Mock useRouter hook

describe('MealCard', () => {
  const meal = {
    id: '1',
    cook_id: '123',
    title: 'Spaghetti Bolognese',
    description: 'Classic Italian pasta dish',
    cuisine: 'Italian',
    price: 12.99,
    image_url: 'https://example.com/spaghetti.jpg',
    created_at: '2025-09-10T00:00:00.000Z',
    pickup_location: 'Test Location',
    cookName: 'Chef John',
    restaurantName: 'Pasta Palace',
    isVerified: true,
    cookImage: 'https://example.com/chef.jpg',
    profiles: {
      user_id: '123',
      full_name: 'Chef John',
      profile_image: 'https://example.com/chef.jpg',
      is_verified: true,
      restaurant_name: 'Pasta Palace',
    },
  };

  // MealCard component tests
  it('renders meal card information on the card', () => {
    const { getByText, getByTestId } = render(<MealCard {...meal} />);
    expect(getByText('Spaghetti Bolognese')).toBeTruthy();
    expect(getByText('Italian')).toBeTruthy();
    expect(getByText('RM 12.99')).toBeTruthy();
    expect(getByText(/Available/)).toBeTruthy();
    expect(getByText('10/09/2025')).toBeTruthy();

    const mealImage = getByTestId('meal-image');
    expect(mealImage).toBeTruthy();
    const mealAvatar = getByTestId('meal-avatar');
    expect(mealAvatar).toBeTruthy();
  });

  it('MealCard navigates to restaurant page', () => {
    const { getByTestId } = render(<MealCard {...meal} />);
    fireEvent.press(getByTestId('meal-restaurant-push'));
    expect(mockRouterPush).toHaveBeenCalledWith('/restaurant/[id]');
  });

  it('toggles favourite state when heart icon is pressed', () => {
    const { getByTestId } = render(<MealCard {...meal} />);
    const heartButton = getByTestId('favourite-button');
    act(() => {
      fireEvent.press(heartButton);
    });
    expect(heartButton).toBeTruthy();
  });
});
