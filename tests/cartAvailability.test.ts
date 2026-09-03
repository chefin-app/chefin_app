import { checkCartAvailability } from '@/src/utils/cartAvailability';
import type { CartItem } from '@/src/context/CartContext';

const makeItem = (overrides: Partial<CartItem>): CartItem => ({
  lineId: 'dish-1',
  listingId: 'dish-1',
  cookId: 'cook-1',
  title: 'Nasi lemak',
  price: 12,
  quantity: 1,
  selectedDate: new Date('2026-09-03T04:00:00.000Z'),
  serviceDate: '2026-09-03',
  pickupSlotStart: '2026-09-03T04:00:00.000Z',
  ...overrides,
});

describe('cart availability client', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    jest.restoreAllMocks();
  });

  it('checks independently saved restaurant baskets in one request', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        baskets: [
          {
            cookId: 'cook-1',
            restaurantName: 'Aunty May Kitchen',
            restaurantImage: null,
            status: 'ready',
            message: null,
            items: [{ listingId: 'dish-1', status: 'ready', reason: null }],
          },
          {
            cookId: 'cook-2',
            restaurantName: 'Dapur Ibu',
            restaurantImage: null,
            status: 'out_of_stock',
            message: 'Curry puff is sold out for the selected time.',
            items: [
              {
                listingId: 'dish-2',
                status: 'out_of_stock',
                reason: 'Curry puff is sold out for the selected time.',
              },
            ],
          },
        ],
      }),
    } as Response);

    const result = await checkCartAvailability([
      makeItem({}),
      makeItem({ lineId: 'dish-2', listingId: 'dish-2', cookId: 'cook-2', title: 'Curry puff' }),
    ]);

    expect(result.map(basket => [basket.cookId, basket.status])).toEqual([
      ['cook-1', 'ready'],
      ['cook-2', 'out_of_stock'],
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/cart-status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              listingId: 'dish-1',
              cookId: 'cook-1',
              quantity: 1,
              serviceDate: '2026-09-03',
              pickupTime: '2026-09-03T04:00:00.000Z',
            },
            {
              listingId: 'dish-2',
              cookId: 'cook-2',
              quantity: 1,
              serviceDate: '2026-09-03',
              pickupTime: '2026-09-03T04:00:00.000Z',
            },
          ],
        }),
      })
    );
  });

  it('fails closed when the server cannot validate baskets', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Availability service is offline.' }),
    } as Response);

    await expect(checkCartAvailability([makeItem({})])).rejects.toThrow(
      'Availability service is offline.'
    );
  });
});
