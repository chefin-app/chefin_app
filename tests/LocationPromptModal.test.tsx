import { fireEvent, render, screen } from '@testing-library/react-native';

import LocationPromptModal from '@/src/components/location/LocationPromptModal';

const mockCustomerLocation = {
  location: {
    latitude: 3.139,
    longitude: 101.6869,
    label: 'Kuala Lumpur City Centre',
    source: 'manual' as const,
  },
  region: {
    id: 'klang-valley' as const,
    name: 'Klang Valley',
    shortName: 'Klang Valley',
    subtitle: 'Kuala Lumpur, Selangor and Putrajaya',
    deliveryAvailable: true,
    bounds: { north: 3.55, east: 102, south: 2.75, west: 101.2 },
    centre: {
      latitude: 3.139,
      longitude: 101.6869,
      label: 'Kuala Lumpur City Centre',
      regionId: 'klang-valley' as const,
    },
    suggestions: [],
  },
  recentLocations: [],
  savedLocations: [],
  fulfillmentPreference: 'delivery' as const,
  orderTimePreference: { mode: 'asap' as const },
  saving: false,
  error: null,
  selectCurrentLocation: jest.fn(async () => true),
  selectLocation: jest.fn(async () => true),
  selectRegion: jest.fn(async () => true),
  searchLocations: jest.fn(async () => []),
  saveNamedLocation: jest.fn(async () => true),
  removeSavedLocation: jest.fn(),
  setFulfillmentPreference: jest.fn(() => true),
  setOrderTimePreference: jest.fn(),
  dismissPrompt: jest.fn(async () => true),
  clearError: jest.fn(),
};

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/src/context/CustomerLocationContext', () => ({
  formatCustomerOrderTime: (preference: { mode: string }) =>
    preference.mode === 'asap' ? 'Now' : 'Later',
  useCustomerLocation: () => mockCustomerLocation,
}));

describe('LocationPromptModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens both the location and time choices from the home summary', () => {
    render(<LocationPromptModal visible onClose={jest.fn()} />);

    expect(screen.getByText('Delivery area')).toBeTruthy();
    expect(screen.getByText('Delivery time')).toBeTruthy();
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByText(/exact delivery address at checkout/i)).toBeTruthy();
  });

  it('opens the region-bounded location picker', () => {
    render(<LocationPromptModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByText('Delivery area'));

    expect(screen.getByPlaceholderText('Search in Klang Valley')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Use my current area')).toBeTruthy();
  });

  it('opens the delivery time picker with now and scheduled choices', () => {
    render(<LocationPromptModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByText('Delivery time'));

    expect(screen.getByText('As soon as possible')).toBeTruthy();
    expect(screen.getByText('Schedule for later')).toBeTruthy();
  });

  it('offers Sandakan from the service-region selector', () => {
    render(<LocationPromptModal visible onClose={jest.fn()} initialView="location" />);

    fireEvent.press(screen.getByLabelText('Choose service region'));

    expect(screen.getByText('Klang Valley')).toBeTruthy();
    expect(screen.getByText('Sandakan')).toBeTruthy();
    expect(screen.getByText('Pickup only for now')).toBeTruthy();
  });
});
