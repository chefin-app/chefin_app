import { filterDiscoveryListings } from '@/src/utils/discoveryFilters';

const profile = {
  user_id: 'user-1',
  full_name: 'Cook One',
  is_verified: true,
  restaurant_name: 'Mixed Kitchen',
};

const listing = (id: string, cuisine: string) => ({
  id,
  cook_id: 'cook-1',
  title: `${cuisine} dish`,
  cuisine,
  price: 10,
  image_url: '',
  created_at: '2026-09-05T00:00:00.000Z',
  location: 'Kuala Lumpur',
  profiles: profile,
});

describe('discovery listing filters', () => {
  it('filters the actual dish rows before a restaurant representative is selected', () => {
    const japaneseDish = listing('dish-japanese', 'Japanese');
    const malaysianDish = listing('dish-malaysian', 'Malaysian');

    expect(
      filterDiscoveryListings([japaneseDish, malaysianDish], {
        cuisine: 'malaysian',
        certified: false,
        availableNow: false,
        dietary: [],
        availabilitySummaries: {},
        today: '2026-09-05',
      })
    ).toEqual([malaysianDish]);
  });

  it('matches cuisine values without case or surrounding-space sensitivity', () => {
    const dish = listing('dish-indian', ' Indian ');

    expect(
      filterDiscoveryListings([dish], {
        cuisine: 'indian',
        certified: false,
        availableNow: false,
        dietary: [],
        availabilitySummaries: {},
        today: '2026-09-05',
      })
    ).toEqual([dish]);
  });
});
