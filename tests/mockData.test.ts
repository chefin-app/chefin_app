import { mockDb, resetMockDb, NASI_LEMAK_ID, DEMO_PROFILE_ID } from '@/src/mocks/fixtures';
import { handleMockRequest } from '@/src/mocks/api';

describe('mock data', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('joins a dish to its cook and reviews', async () => {
    const { data, error } = await mockDb
      .from('listings')
      .select('id, title, profiles(full_name, restaurant_name), reviews(rating)')
      .eq('id', NASI_LEMAK_ID)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: NASI_LEMAK_ID,
      title: 'Nasi lemak ayam',
      profiles: { full_name: 'Aisha Rahman', restaurant_name: "Aisha's Kitchen" },
    });
    expect((data as { reviews: Array<{ rating: number }> }).reviews[0].rating).toBe(5);
  });

  it('serves the home feed without a backend', async () => {
    const response = await handleMockRequest('http://127.0.0.1:8000/api/listings/all-listings');
    const listings = (await response.json()) as Array<{
      title: string;
      profiles: { restaurant_name: string };
    }>;

    expect(response.ok).toBe(true);
    expect(listings.map(listing => listing.title)).toContain('Nasi lemak ayam');
    expect(listings[0].profiles.restaurant_name).toBeTruthy();
  });

  it('places an order into the local store', async () => {
    const before = mockDb.rows('orders').length;
    const response = await handleMockRequest('http://127.0.0.1:8000/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        fulfillmentType: 'pickup',
        paymentMethod: 'pay_on_collection',
        items: [
          {
            listingId: NASI_LEMAK_ID,
            quantity: 1,
            pickupDate: '2026-10-19',
            pickupTime: '2026-10-19T08:00:00.000Z',
            priceAtOrder: 14,
          },
        ],
      }),
    });
    const body = (await response.json()) as { orders: Array<{ id: string; listing_id: string }> };

    expect(response.status).toBe(201);
    expect(body.orders[0].id).toEqual(expect.any(String));
    expect(body.orders[0].listing_id).toBe(NASI_LEMAK_ID);
    expect(mockDb.rows('orders')).toHaveLength(before + 1);
    expect(mockDb.rows('listings').find(listing => listing.id === NASI_LEMAK_ID)?.cook_id).toBe(
      DEMO_PROFILE_ID
    );
  });
});
