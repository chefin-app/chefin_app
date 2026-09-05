import {
  buildAvailabilitySummaries,
  buildListingAvailabilitySummaries,
  buildMenuListingAvailabilitySummaries,
  buildNextAvailableDates,
  formatAvailabilityLabel,
  getAvailabilitySummary,
  getEarliestAvailableDate,
  getLocalDateKey,
  isAvailableNow,
  isSummaryAvailableNow,
  rollUpRestaurantAvailableDates,
} from '@/src/utils/listingAvailability';

describe('listing availability', () => {
  it('uses the Malaysian service date regardless of device timezone', () => {
    expect(getLocalDateKey(new Date('2026-07-21T15:59:00.000Z'))).toBe('2026-07-21');
    expect(getLocalDateKey(new Date('2026-07-21T16:15:00.000Z'))).toBe('2026-07-22');
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

  it('marks a dish as closed with its opening time before its window starts', () => {
    const records = [
      {
        available_date: '2026-07-22',
        start_time: '2026-07-22T03:00:00.000Z', // 11:00 MYT
        end_time: '2026-07-22T06:00:00.000Z',
        is_available: true,
        max_orders: 4,
        orders_taken: 0,
      },
    ];

    const now = new Date('2026-07-22T02:59:00.000Z');
    expect(getAvailabilitySummary(records, '2026-07-22', now)).toEqual({
      nextAvailableAt: '2026-07-22T03:00:00.000Z',
      state: 'opensLater',
    });
    expect(formatAvailabilityLabel(getAvailabilitySummary(records, '2026-07-22', now), now)).toBe(
      'Closed · Opens at 11:00 AM'
    );
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

  it('rolls the earliest upcoming opening onto the restaurant card', () => {
    const now = new Date('2026-07-21T01:00:00.000Z'); // 9:00 AM in Malaysia
    const result = buildAvailabilitySummaries(
      [
        {
          id: 'representative-dish',
          cook_id: 'cook-1',
          restaurant_listing_ids: ['representative-dish', 'lunch-dish'],
        },
      ],
      [
        {
          listing_id: 'representative-dish',
          available_date: '2026-07-22',
          start_time: '09:00:00',
          end_time: '12:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 0,
        },
        {
          listing_id: 'lunch-dish',
          available_date: '2026-07-21',
          start_time: '12:00:00',
          end_time: '14:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 0,
        },
      ],
      '2026-07-21',
      now
    );

    expect(result['cook-1']).toEqual({
      nextAvailableAt: '2026-07-21T04:00:00.000Z',
      state: 'opensLater',
    });
    expect(formatAvailabilityLabel(result['cook-1'], now)).toBe('Closed · Opens at 12:00 PM');
    expect(isSummaryAvailableNow('cook-1', result, '2026-07-21')).toBe(false);
  });

  it('prefers an open dish over another dish that opens later', () => {
    const now = new Date('2026-07-21T02:00:00.000Z'); // 10:00 AM in Malaysia
    const result = buildAvailabilitySummaries(
      [
        { id: 'open-dish', cook_id: 'cook-1' },
        { id: 'lunch-dish', cook_id: 'cook-1' },
      ],
      [
        {
          listing_id: 'open-dish',
          available_date: '2026-07-21',
          start_time: '09:00:00',
          end_time: '11:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 0,
        },
        {
          listing_id: 'lunch-dish',
          available_date: '2026-07-21',
          start_time: '12:00:00',
          end_time: '14:00:00',
          is_available: true,
          max_orders: 5,
          orders_taken: 0,
        },
      ],
      '2026-07-21',
      now
    );

    expect(result['cook-1']).toEqual({
      nextAvailableDate: '2026-07-21',
      state: 'available',
    });
    expect(isSummaryAvailableNow('cook-1', result, '2026-07-21')).toBe(true);
  });

  it('keeps sibling dish availability independent before restaurant roll-up', () => {
    const listings = [
      {
        id: 'representative-dish',
        cook_id: 'cook-1',
        restaurant_listing_ids: [
          'representative-dish',
          'available-dish',
          'disabled-dish',
          'unscheduled-dish',
        ],
      },
    ];
    const records = [
      {
        listing_id: 'available-dish',
        available_date: '2026-07-21',
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_available: true,
        max_orders: 5,
        orders_taken: 1,
      },
      {
        listing_id: 'disabled-dish',
        available_date: '2026-07-21',
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_available: false,
        max_orders: 5,
        orders_taken: 0,
      },
    ];
    const now = new Date('2026-07-21T04:00:00.000Z'); // 12:00 MYT

    const perDish = buildListingAvailabilitySummaries(listings, records, '2026-07-21', now);
    const restaurant = buildAvailabilitySummaries(listings, records, '2026-07-21', now);

    expect(perDish).toEqual({
      'representative-dish': { state: 'unavailable' },
      'available-dish': { nextAvailableDate: '2026-07-21', state: 'available' },
      'disabled-dish': { state: 'unavailable' },
      'unscheduled-dish': { state: 'unavailable' },
    });
    expect(restaurant['representative-dish']).toEqual({
      nextAvailableDate: '2026-07-21',
      state: 'available',
    });
  });

  it('keeps a dish grayed for today after the cook marks it sold out', () => {
    const listings = [{ id: 'sold-out-dish', cook_id: 'cook-1' }];
    const records = [
      {
        listing_id: 'sold-out-dish',
        available_date: '2026-07-21',
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_available: false,
        max_orders: 5,
        orders_taken: 0,
      },
      {
        listing_id: 'sold-out-dish',
        available_date: '2026-07-22',
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_available: true,
        max_orders: 5,
        orders_taken: 0,
      },
    ];
    const now = new Date('2026-07-21T04:00:00.000Z');

    expect(buildListingAvailabilitySummaries(listings, records, '2026-07-21', now)).toEqual({
      'sold-out-dish': { nextAvailableDate: '2026-07-22', state: 'available' },
    });
    expect(buildMenuListingAvailabilitySummaries(listings, records, '2026-07-21', now)).toEqual({
      'sold-out-dish': { state: 'unavailable' },
    });
  });

  it('uses explicit labels for expired and missing availability', () => {
    expect(formatAvailabilityLabel({ state: 'noLongerAvailable' })).toBe(
      'No longer available today'
    );
    expect(formatAvailabilityLabel({ state: 'unavailable' })).toBe('Currently not available');
  });
});
