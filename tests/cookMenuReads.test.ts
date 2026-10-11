import { getCookMenu } from '../backend/availabilityService';
import { supabase } from '../backend/supabaseClient';

jest.mock('../backend/supabaseClient', () => ({ supabase: { from: jest.fn() } }));

const tables: Record<string, unknown[]> = {
  listings: [
    {
      id: 'dish',
      title: 'Rice',
      price: 12,
      status: 'approved',
      menu_category: 'Lunch',
      is_active: true,
    },
  ],
  restaurant_opening_hours: [
    {
      id: 'hours',
      cook_id: 'cook',
      iso_weekday: 2,
      opens_at: '09:00:00',
      closes_at: '18:00:00',
      enabled: true,
    },
  ],
  selling_schedules: [{ id: 'schedule', cook_id: 'cook', name: 'Lunch', specific_dates: false }],
  selling_schedule_windows: [
    {
      id: 'window',
      schedule_id: 'schedule',
      iso_weekday: 2,
      all_day: false,
      opens_at: '11:00:00',
      closes_at: '14:00:00',
    },
  ],
  listing_selling_schedules: [{ listing_id: 'dish', schedule_id: 'schedule' }],
  listing_availability_settings: [
    { listing_id: 'dish', enabled: true, daily_stock_limit: 5, max_orders_per_window: 5 },
  ],
  listing_daily_capacity: [{ listing_id: 'dish', orders_taken: 2 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const query = Object.assign(Promise.resolve({ data: tables[table] ?? [], error: null }), {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
      gte: jest.fn(),
      lte: jest.fn(),
      limit: jest.fn(),
    });
    [query.select, query.eq, query.in, query.order, query.gte, query.lte, query.limit].forEach(
      method => method.mockReturnValue(query)
    );
    return query;
  });
});

it('shares schedule reads while preserving schedule intersections and stock counts', async () => {
  const menu = await getCookMenu('cook', new Date('2026-07-21T04:00:00Z'));
  expect(menu.dishes[0]).toMatchObject({
    sellingScheduleId: 'schedule',
    sellingScheduleName: 'Lunch',
    state: 'available',
    remainingStockToday: 3,
    portionsReservedToday: 2,
  });
  expect(menu.sellingSchedules[0]).toMatchObject({ id: 'schedule', listingIds: ['dish'] });
  for (const table of [
    'selling_schedules',
    'selling_schedule_windows',
    'listing_selling_schedules',
  ]) {
    expect((supabase.from as jest.Mock).mock.calls.filter(([name]) => name === table)).toHaveLength(
      1
    );
  }
});

it('keeps dishes closed outside their assigned selling window', async () => {
  const menu = await getCookMenu('cook', new Date('2026-07-21T07:00:00Z'));
  expect(menu.dishes[0]).toMatchObject({
    state: 'closed',
    currentlyAvailable: false,
    remainingStockToday: 3,
  });
});
