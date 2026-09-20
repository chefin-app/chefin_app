import { useEffect, useMemo, useState } from 'react';
import { useCustomerLocation } from '@/src/context/CustomerLocationContext';
import {
  fetchAvailabilityRecords,
  getLocalDateKey,
  type AvailabilityRecord,
} from '@/src/utils/listingAvailability';
import { getListingScheduleMatch } from '@/src/utils/restaurantOrderSchedule';
import type { Listing } from '@/src/types/models';

/** Use the same capacity/window matching as the restaurant menu, before cook deduplication. */
export function useScheduledDiscovery<T extends Listing>(listings: T[]) {
  const { orderTimePreference } = useCustomerLocation();
  const scheduledAt =
    orderTimePreference.mode === 'scheduled' ? orderTimePreference.scheduledAt : null;
  const [result, setResult] = useState<{
    key: string;
    records: AvailabilityRecord[];
    error: string;
  } | null>(null);
  const key = JSON.stringify([
    scheduledAt,
    listings.map(item => [item.id, item.restaurant_listing_ids]),
  ]);
  useEffect(() => {
    if (!scheduledAt) return;
    let active = true;
    fetchAvailabilityRecords(listings, getLocalDateKey(new Date(scheduledAt)))
      .then(records => {
        if (active) setResult({ key, records, error: '' });
      })
      .catch(() => {
        if (active)
          setResult({
            key,
            records: [],
            error: 'Could not check scheduled availability. Please refresh.',
          });
      });
    return () => {
      active = false;
    };
    // The key includes every input used by the availability request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const filtered = useMemo(() => {
    if (!scheduledAt) return listings;
    if (result?.key !== key) return [];
    const start = new Date(scheduledAt);
    const selection = {
      mode: 'scheduled' as const,
      serviceDate: getLocalDateKey(start),
      startTime: scheduledAt,
      endTime: new Date(start.getTime() + 30 * 60_000).toISOString(),
    };
    return listings.filter(item =>
      [item.id, ...(item.restaurant_listing_ids ?? [])].some(
        id => getListingScheduleMatch(result.records, id, selection).available
      )
    );
  }, [listings, scheduledAt, result, key]);
  return {
    listings: filtered,
    loading: !!scheduledAt && result?.key !== key,
    error: result?.key === key ? result.error : '',
  };
}
