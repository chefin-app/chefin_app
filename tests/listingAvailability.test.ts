import {
  buildAvailabilitySummaries,
  buildNextAvailableDates,
  formatAvailabilityLabel,
  getAvailabilitySummary,
  getEarliestAvailableDate,
  getLocalDateKey,
  isAvailableNow,
  rollUpRestaurantAvailableDates,
} from '@/src/utils/listingAvailability';

describe('listing availability', () => {
  it('uses the device-local calendar date', () => {
    expect(getLocalDateKey(new Date(2026, 6, 21, 23, 59))).toBe('2026-07-21');
    // In positive UTC offsets, toISOString() would incorrectly return July 21.
    expect(getLocalDateKey(new Date(2026, 6, 22, 0, 15))).toBe('2026-07-22');
  });

  it('chooses the earliest enabled future slot with remaining capacity', () => {
    const records = [
      {
        available_date: '2026-07-20',
        start_time: '09:00:00',
        is_available: true,
        max_orders: 10,
        orders_taken: 0,
      },
      {
        available_date: '2026-07-21',
        start_time: '08:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 4,
      },
      {
        available_date: '2026-07-22T00:00:00.000Z',
        start_time: '18:00:00',
        is_available: false,
        max_orders: 4,
        orders_taken: 0,
      },
      {
        available_date: '2026-07-24',
        start_time: '12:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 0,
      },
      {
        available_date: '2026-07-23',
        start_time: '19:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 1,
      },
    ];

    expect(getEarliestAvailableDate(records, '2026-07-21')).toBe('2026-07-23');
  });

  it('returns undefined when every slot is invalid or full', () => {
    expect(
      getEarliestAvailableDate(
        [
          {
            available_date: 'not-a-date',
            is_available: true,
            max_orders: 2,
            orders_taken: 0,
          },
          {
            available_date: '2026-07-21',
            is_available: true,
            max_orders: 2,
            orders_taken: 2,
          },
        ],
        '2026-07-21'
      )
    ).toBeUndefined();
  });

  it('expires a same-day meal after its pickup window ends', () => {
    const records = [
      {
        // 11:00–13:00 Malaysia pickup window, checked at 17:00 Malaysia time.
        available_date: '2026-07-22',
        start_time: '2026-07-22T03:00:00+00:00',
        end_time: '2026-07-22T05:00:00+00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 0,
      },
    ];

    const now = new Date('2026-07-22T09:00:00+00:00');
    expect(getEarliestAvailableDate(records, '2026-07-22', now)).toBeUndefined();
    expect(getAvailabilitySummary(records, '2026-07-22', now)).toEqual({
      state: 'noLongerAvailable',
    });
  });

  it('keeps a same-day meal available before its pickup window ends', () => {
    const records = [
      {
        available_date: '2026-07-22',
        start_time: '11:00:00',
        end_time: '14:00:00',
        is_available: true,
        max_orders: 4,
        orders_taken: 0,
      },
    ];

    const now = new Date(2026, 6, 22, 13, 59);
    expect(getEarliestAvailableDate(records, '2026-07-22', now)).toBe('2026-07-22');
  });

  it('supports legacy rows without an enabled flag but excludes explicit false', () => {
    expect(
      getEarliestAvailableDate(
        [
          {
            available_date: '2026-07-21',
            is_available: false,
            max_orders: 4,
            orders_taken: 0,
          },
          {
            available_date: '2026-07-22',
            is_available: null,
            max_orders: 4,
            orders_taken: 1,
          },
        ],
        '2026-07-21'
      )
    ).toBe('2026-07-22');
  });

  it('marks only listings whose earliest valid slot is today as Available Now', () => {
    const dates = {
      today: '2026-07-21',
      tomorrow: '2026-07-22',
    };

    expect(isAvailableNow('today', dates, '2026-07-21')).toBe(true);
    expect(isAvailableNow('tomorrow', dates, '2026-07-21')).toBe(false);
    expect(isAvailableNow('missing', dates, '2026-07-21')).toBe(false);
  });

  it('uses the earliest meal across the whole restaurant for a feed card', () => {
    const result = rollUpRestaurantAvailableDates(
      [
        {
          id: 'representative-dish',
          cook_id: 'cook-1',
          restaurant_listing_ids: ['representative-dish', 'available-dish'],
        },
      ],
      {
        'representative-dish': '2026-07-24',
        'available-dish': '2026-07-21',
      }
    );

    expect(result['representative-dish']).toBe('2026-07-21');
    expect(result['available-dish']).toBe('2026-07-21');
    expect(result['cook-1']).toBe('2026-07-21');
  });

  it('uses visible sibling dishes when restaurant listing ids are missing', () => {
    const result = rollUpRestaurantAvailableDates(
      [
        { id: 'representative-dish', cook_id: 'cook-1' },
        { id: 'available-dish', cook_id: 'cook-1' },
      ],
      { 'available-dish': '2026-07-21' }
    );

    expect(result['cook-1']).toBe('2026-07-21');
    expect(result['representative-dish']).toBe('2026-07-21');
  });

  it('loads a sibling dish date onto the stable cook key', () => {
    const result = buildNextAvailableDates(
      [
        {
          id: 'representative-dish',
          cook_id: 'cook-1',
          restaurant_listing_ids: ['representative-dish', 'available-dish'],
        },
      ],
      [
        {
          listing_id: 'available-dish',
          available_date: '2026-07-21',
          is_available: true,
          max_orders: 5,
          orders_taken: 1,
        },
      ],
      '2026-07-21',
      new Date(2026, 6, 21, 12)
    );

    expect(result['cook-1']).toBe('2026-07-21');
    expect(result['representative-dish']).toBe('2026-07-21');
  });

  it('rolls an expired sibling meal up to the restaurant status', () => {
    const result = buildAvailabilitySummaries(
      [
        {
          id: 'representative-dish',
          cook_id: 'cook-1',
          restaurant_listing_ids: ['representative-dish', 'expired-dish'],
        },
      ],
      [
        {
          listing_id: 'expired-dish',
          available_date: '2026-07-21',
          end_time: '14:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 1,
        },
      ],
      '2026-07-21',
      new Date(2026, 6, 21, 17)
    );

    expect(result['cook-1']).toEqual({ state: 'noLongerAvailable' });
    expect(result['representative-dish']).toEqual({ state: 'noLongerAvailable' });
  });

  it('uses explicit labels for expired and missing availability', () => {
    expect(formatAvailabilityLabel({ state: 'noLongerAvailable' })).toBe(
      'No longer available today'
    );
    expect(formatAvailabilityLabel({ state: 'unavailable' })).toBe('Currently not available');
  });
});
