import { renderHook, waitFor } from '@testing-library/react-native';
import { useScheduledDiscovery } from '@/src/hooks/useScheduledDiscovery';
import { fetchAvailabilityRecords } from '@/src/utils/listingAvailability';
import type { Listing } from '@/src/types/models';

let mockPreference: { mode: string; scheduledAt?: string };
jest.mock('@/src/context/CustomerLocationContext', () => ({
  useCustomerLocation: () => ({ orderTimePreference: mockPreference }),
}));
jest.mock('@/src/utils/listingAvailability', () => ({
  ...jest.requireActual('@/src/utils/listingAvailability'),
  fetchAvailabilityRecords: jest.fn(),
}));
const listings = [
  { id: 'one', cook_id: 'cook1' },
  { id: 'two', cook_id: 'cook2' },
] as Listing[];

describe('scheduled discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreference = { mode: 'scheduled', scheduledAt: '2099-09-22T03:00:00Z' };
  });
  it('excludes sold-out kitchens at the selected time', async () => {
    (fetchAvailabilityRecords as jest.Mock).mockResolvedValue(
      listings.map((item, index) => ({
        listing_id: item.id,
        available_date: '2099-09-22',
        start_time: '11:00:00',
        end_time: '12:00:00',
        is_available: true,
        max_orders: 5,
        orders_taken: index ? 5 : 0,
      }))
    );
    const { result } = renderHook(() => useScheduledDiscovery(listings));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map(item => item.id)).toEqual(['one']);
  });
  it('preserves discovery results for ASAP', () => {
    mockPreference = { mode: 'asap' };
    const { result } = renderHook(() => useScheduledDiscovery(listings));
    expect(result.current.listings).toEqual(listings);
    expect(fetchAvailabilityRecords).not.toHaveBeenCalled();
  });
});
