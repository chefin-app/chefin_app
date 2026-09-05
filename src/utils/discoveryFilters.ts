import type { Listing, Profile } from '@/src/types/models';
import type { AvailabilitySummaryMap } from '@/src/utils/listingAvailability';
import { isSummaryAvailableNow } from '@/src/utils/listingAvailability';
import { listingMatchesDietaryPreferences } from '@/src/utils/dietary';

export interface DiscoveryFilterState {
  cuisine: string;
  certified: boolean;
  availableNow: boolean;
  dietary: string[];
  availabilitySummaries: AvailabilitySummaryMap;
  today: string;
}

type DiscoveryListing = Listing & { profiles: Profile };

/** Applies dish-level filters before callers collapse results by restaurant. */
export function filterDiscoveryListings<T extends DiscoveryListing>(
  listings: T[],
  filters: DiscoveryFilterState
): T[] {
  return listings.filter(listing => {
    if (
      filters.cuisine !== 'all' &&
      listing.cuisine?.trim().toLowerCase() !== filters.cuisine.trim().toLowerCase()
    ) {
      return false;
    }
    if (filters.certified && !listing.profiles?.is_verified) return false;
    if (filters.dietary.length > 0 && !listingMatchesDietaryPreferences(listing, filters.dietary)) {
      return false;
    }
    if (
      filters.availableNow &&
      !isSummaryAvailableNow(listing.cook_id, filters.availabilitySummaries, filters.today)
    ) {
      return false;
    }
    return true;
  });
}
