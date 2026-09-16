import { fireEvent, render, screen } from '@testing-library/react-native';

import FavouritesScreen from '@/app/(user)/favourites';

const mockPush = jest.fn();
const mockToggleFavourite = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/src/context/CustomerLocationContext', () => ({
  useCustomerLocation: () => ({ region: { id: 'klang-valley', name: 'Klang Valley' } }),
}));
jest.mock('@/src/context/FavouritesContext', () => ({
  useFavourites: () => ({
    favourites: [
      {
        profileId: 'sandakan-cook',
        restaurantName: 'Sandakan Kitchen',
        fullChefName: 'Chef Lina',
        rating: '4.8',
        reviewCount: 12,
        regionId: 'sandakan',
      },
    ],
    toggleFavourite: mockToggleFavourite,
  }),
}));

describe('FavouritesScreen region availability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps an out-of-region favourite visible but disables opening it', () => {
    render(<FavouritesScreen />);

    expect(screen.getByText('Sandakan Kitchen')).toBeTruthy();
    expect(screen.getByText('Unavailable in Klang Valley')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Sandakan Kitchen, unavailable in Klang Valley'));

    expect(mockPush).not.toHaveBeenCalled();
  });
});
