import {
  geocodeRestaurantAddress,
  RestaurantLocationError,
} from '../src/utils/restaurantLocation';

describe('restaurant address geocoding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses a typed location error when no Malaysian address matches', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await expect(geocodeRestaurantAddress('1 Unknown Road, Selangor')).rejects.toBeInstanceOf(
      RestaurantLocationError
    );
  });

  it('returns the matching discovery point', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '3.1073', lon: '101.6067', display_name: 'Petaling Jaya, Selangor' },
      ],
    } as Response);

    await expect(geocodeRestaurantAddress('Petaling Jaya')).resolves.toEqual({
      latitude: 3.1073,
      longitude: 101.6067,
      label: 'Petaling Jaya, Selangor',
      source: 'manual',
    });
  });
});
