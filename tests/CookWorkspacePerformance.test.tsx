/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import CookMenuScreen from '../app/(cook)/(tabs)/menu';
import Orders, { OrderSubtitle } from '../app/(cook)/(tabs)/orders';
import { supabase } from '@/src/utils/supabaseClient';

let mockFocused = true;
const mockUser = { id: 'cook' };
const mockSession = { user: mockUser, access_token: 'token' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(
      () => (mockFocused ? callback() : undefined),
      [callback, mockFocused]
    );
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@/src/services/auth-context', () => ({
  useAuth: () => ({ user: mockUser, session: mockSession }),
}));
jest.mock('@/src/utils/supabaseClient', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('@/src/components/orders/PickupPinModal', () => () => null);

const originalFetch = global.fetch;
beforeEach(() => {
  mockFocused = true;
  jest.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

it('shows dishes while options are slow, avoids duplicate listings reads and retains dishes on refocus', async () => {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn().mockResolvedValue({ data: { free_delivery_threshold: 30 }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  (supabase.from as jest.Mock).mockReturnValue(query);
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/option-groups')) return new Promise(() => {});
    return {
      ok: true,
      json: async () =>
        url.endsWith('/cook/menu')
          ? {
              dishes: [
                {
                  id: 'dish',
                  title: 'Test Nasi Lemak',
                  price: 12,
                  imageUrl: null,
                  status: 'approved',
                  menuCategory: 'Lunch',
                  configured: true,
                  enabled: true,
                  availableToday: true,
                  state: 'available',
                },
              ],
            }
          : { groups: [] },
    };
  });
  const view = render(<CookMenuScreen />);
  expect(await screen.findByText('Test Nasi Lemak')).toBeTruthy();
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalledWith('profiles');
  expect(global.fetch).toHaveBeenCalledTimes(2);
  mockFocused = false;
  view.rerender(<CookMenuScreen />);
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  mockFocused = true;
  view.rerender(<CookMenuScreen />);
  expect(screen.getByText('Test Nasi Lemak')).toBeTruthy();
  view.unmount();
});

it('updates only the countdown component and stops its clock on blur and at pickup time', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-21T04:00:00Z'));
  const order = {
    id: 'order',
    quantity: 1,
    total_price: 12,
    scheduled_date: '2026-07-21',
    pickup_time: '2026-07-21T04:01:00Z',
    customer_note: null,
    fulfillment_type: 'pickup' as const,
    status: 'confirmed' as const,
    created_at: '',
    listings: null,
    profiles: null,
  };
  const parent = jest.fn(({ revision }: { revision: number }) => (
    <OrderSubtitle order={{ ...order, customer_note: String(revision) }} />
  ));
  const Parent = parent;
  const view = render(<Parent revision={0} />);
  expect(screen.getByText('Ready in: 01:00 min')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Ready in: 00:59 min')).toBeTruthy();
  expect(parent).toHaveBeenCalledTimes(1);
  mockFocused = false;
  // Change props to render the memoized child as navigation focus would.
  view.rerender(<Parent revision={1} />);
  expect(jest.getTimerCount()).toBe(0);
  mockFocused = true;
  view.rerender(<Parent revision={2} />);
  act(() => jest.advanceTimersByTime(60_000));
  expect(screen.getByText('Pickup time reached')).toBeTruthy();
  expect(jest.getTimerCount()).toBe(0);
});

it('coalesces realtime order bursts without repeating profile/listing lookups and unsubscribes on blur', async () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  (supabase.channel as jest.Mock).mockReturnValue(channel);
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const response = {
      data:
        table === 'profiles'
          ? { id: 'cook-profile' }
          : table === 'listings'
            ? [{ id: 'dish' }]
            : [],
      error: null,
    };
    const query = Object.assign(Promise.resolve(response), {
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
    });
    [query.select, query.eq, query.single, query.in, query.order, query.limit].forEach(method =>
      method.mockReturnValue(query)
    );
    return query;
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  const view = render(<Orders />);
  await waitFor(() => expect(channel.subscribe).toHaveBeenCalledTimes(1));
  jest.useFakeTimers();
  const notify = channel.on.mock.calls[0][2];
  act(() => {
    for (let i = 0; i < 3; i++) notify({ new: { listing_id: 'dish' }, old: null });
  });
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  const reads = (table: string) =>
    (supabase.from as jest.Mock).mock.calls.filter(([name]) => name === table).length;
  expect(reads('profiles')).toBe(1);
  expect(reads('listings')).toBe(1);
  expect(reads('orders')).toBe(4);
  act(() => notify({ new: { listing_id: 'dish' }, old: null }));
  mockFocused = false;
  view.rerender(<Orders />);
  expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(reads('orders')).toBe(4);
  view.unmount();
});
