import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MealCard from '@/src/components/cards/MealCard';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
const mockToggleFavourite = jest.fn();
jest.mock('@/src/context/FavouritesContext', () => ({
  useFavourites: () => ({ toggleFavourite: mockToggleFavourite, isFavourite: () => false }),
}));
jest.mock('@/src/services/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'buyer-1' } } }),
}));

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
    location: 'Test Location',
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
    expect(getByText('Pasta Palace')).toBeTruthy();
    expect(getByText('Italian')).toBeTruthy();
    expect(getByText(/available/i)).toBeTruthy();
    expect(getByTestId('meal-image')).toBeTruthy();
  });

  it('MealCard navigates to restaurant page', () => {
    const { getByTestId } = render(<MealCard {...meal} />);
    fireEvent.press(getByTestId('meal-restaurant-push'));
    expect(mockRouterPush).toHaveBeenCalledWith('/restaurant/123');
  });

  it('toggles favourite state when heart icon is pressed', () => {
    const { getByTestId } = render(<MealCard {...meal} />);
    const heartButton = getByTestId('favourite-button');
    fireEvent.press(heartButton);
    expect(mockToggleFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: '123', restaurantName: 'Pasta Palace' })
    );
  });

  it('renders the modern vertical feed layout', () => {
    const { getByLabelText, getByText } = render(<MealCard {...meal} layout="feed" />);
    expect(getByLabelText('View Pasta Palace')).toBeTruthy();
    expect(getByText('Italian')).toBeTruthy();
    expect(getByText('New')).toBeTruthy();
  });
});
