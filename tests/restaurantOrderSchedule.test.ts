import {
  buildRestaurantScheduleDays,
  formatOrderSelectionLabel,
  getListingScheduleMatch,
} from '@/src/utils/restaurantOrderSchedule';

describe('restaurant order scheduling', () => {
  const now = new Date('2026-08-09T02:10:00.000Z'); // 10:10 AM in Malaysia

  it('builds a deduplicated restaurant-wide slot union for today plus two days', () => {
    const days = buildRestaurantScheduleDays(
      [
        {
          listing_id: 'dish-1',
          available_date: '2026-08-09',
          start_time: '10:00:00',
          end_time: '12:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 1,
        },
        {
          listing_id: 'dish-2',
          available_date: '2026-08-09',
          start_time: '10:00:00',
          end_time: '11:30:00',
          is_available: true,
          max_orders: 3,
          orders_taken: 0,
        },
        {
          listing_id: 'dish-1',
          available_date: '2026-08-10',
          start_time: '17:00:00',
          end_time: '18:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 0,
        },
      ],
      now
    );

    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({
      serviceDate: '2026-08-09',
      weekdayLabel: 'Sun',
      dayNumber: '9',
      isToday: true,
    });
    expect(days[1]).toMatchObject({
      serviceDate: '2026-08-10',
      weekdayLabel: 'Mon',
      dayNumber: '10',
      isToday: false,
    });
    expect(days[2].serviceDate).toBe('2026-08-11');
    expect(days[0].slots.map(slot => slot.label)).toEqual([
      '10:30 – 11:00 AM',
      '11:00 – 11:30 AM',
      '11:30 AM – 12:00 PM',
    ]);
    expect(days[1].slots.map(slot => slot.label)).toEqual(['5:00 – 5:30 PM', '5:30 – 6:00 PM']);
    expect(days[2].slots).toEqual([]);
  });

  it('filters disabled, full, past, malformed, and out-of-horizon rows', () => {
    const days = buildRestaurantScheduleDays(
      [
        {
          listing_id: 'past',
          available_date: '2026-08-09',
          start_time: '08:00:00',
          end_time: '10:00:00',
          is_available: true,
          max_orders: 3,
          orders_taken: 0,
        },
        {
          listing_id: 'disabled',
          available_date: '2026-08-10',
          start_time: '12:00:00',
          end_time: '13:00:00',
          is_available: false,
          max_orders: 3,
          orders_taken: 0,
        },
        {
          listing_id: 'full',
          available_date: '2026-08-10',
          start_time: '13:00:00',
          end_time: '14:00:00',
          is_available: true,
          max_orders: 3,
          orders_taken: 3,
        },
        {
          listing_id: 'outside',
          available_date: '2026-08-12',
          start_time: '10:00:00',
          end_time: '11:00:00',
          is_available: true,
          max_orders: 3,
          orders_taken: 0,
        },
        {
          listing_id: 'malformed',
          available_date: 'not-a-date',
          is_available: true,
          max_orders: 3,
          orders_taken: 0,
        },
      ],
      now
    );

    expect(days.every(day => day.slots.length === 0)).toBe(true);
  });

  it('uses an inclusive record start and exclusive record end', () => {
    const days = buildRestaurantScheduleDays(
      [
        {
          listing_id: 'dish-1',
          available_date: '2026-08-10',
          start_time: '09:00:00',
          end_time: '10:00:00',
          is_available: true,
          max_orders: 2,
          orders_taken: 0,
        },
      ],
      now
    );

    expect(days[1].slots.map(slot => slot.label)).toEqual(['9:00 – 9:30 AM', '9:30 – 10:00 AM']);
  });

  it('matches a scheduled restaurant slot independently for each dish', () => {
    const records = [
      {
        listing_id: 'lunch',
        available_date: '2026-08-10',
        start_time: '12:00:00',
        end_time: '14:00:00',
        is_available: true,
        max_orders: 5,
        orders_taken: 2,
      },
      {
        listing_id: 'dinner',
        available_date: '2026-08-10',
        start_time: '17:00:00',
        end_time: '19:00:00',
        is_available: true,
        max_orders: 5,
        orders_taken: 0,
      },
    ];
    const selection = {
      mode: 'scheduled' as const,
      serviceDate: '2026-08-10',
      startTime: '2026-08-10T04:30:00.000Z', // 12:30 PM MYT
      endTime: '2026-08-10T05:00:00.000Z',
    };

    expect(getListingScheduleMatch(records, 'lunch', selection, now)).toEqual({
      available: true,
      serviceDate: '2026-08-10',
      startTime: '2026-08-10T04:30:00.000Z',
      endTime: '2026-08-10T05:00:00.000Z',
      remainingSlots: 3,
    });
    expect(getListingScheduleMatch(records, 'dinner', selection, now)).toEqual({
      available: false,
      remainingSlots: 0,
    });
  });

  it('chooses the next future half-hour pickup inside a currently open window for ASAP', () => {
    const records = [
      {
        listing_id: 'open',
        available_date: '2026-08-09',
        start_time: '09:00:00',
        end_time: '12:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 1,
      },
      {
        listing_id: 'later',
        available_date: '2026-08-09',
        start_time: '11:00:00',
        end_time: '13:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 0,
      },
    ];

    expect(getListingScheduleMatch(records, 'open', { mode: 'asap' }, now)).toEqual({
      available: true,
      serviceDate: '2026-08-09',
      startTime: '2026-08-09T02:30:00.000Z',
      endTime: '2026-08-09T03:00:00.000Z',
      remainingSlots: 3,
    });
    expect(getListingScheduleMatch(records, 'later', { mode: 'asap' }, now)).toEqual({
      available: false,
      remainingSlots: 0,
    });
  });

  it('advances an exact half-hour ASAP request so checkout receives a future time', () => {
    const exactBoundary = new Date('2026-08-09T02:30:00.000Z');
    const match = getListingScheduleMatch(
      [
        {
          listing_id: 'open',
          available_date: '2026-08-09',
          start_time: '09:00:00',
          end_time: '12:00:00',
          is_available: true,
          max_orders: 4,
          orders_taken: 0,
        },
      ],
      'open',
      { mode: 'asap' },
      exactBoundary
    );

    expect(match.startTime).toBe('2026-08-09T03:00:00.000Z');
  });

  it('does not offer ASAP when the next rounded pickup is outside the open window', () => {
    expect(
      getListingScheduleMatch(
        [
          {
            listing_id: 'closing',
            available_date: '2026-08-09',
            start_time: '09:00:00',
            end_time: '10:25:00',
            is_available: true,
            max_orders: 4,
            orders_taken: 0,
          },
        ],
        'closing',
        { mode: 'asap' },
        now
      )
    ).toEqual({ available: false, remainingSlots: 0 });
  });

  it('formats ASAP and scheduled selections for restaurant UI', () => {
    expect(formatOrderSelectionLabel({ mode: 'asap' })).toBe('As soon as possible');
    expect(
      formatOrderSelectionLabel({
        mode: 'scheduled',
        serviceDate: '2026-08-11',
        startTime: '2026-08-11T12:00:00.000Z',
        endTime: '2026-08-11T12:30:00.000Z',
      })
    ).toBe('Tue, 11 Aug, 8:00 – 8:30 PM');
  });
});
