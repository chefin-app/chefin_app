import type { Listing } from '@/src/types/models';

export interface AvailabilityRecord {
  listing_id?: string;
  available_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  is_available?: boolean | null;
  max_orders?: number | null;
  orders_taken?: number | null;
}

type AvailabilityListing = Pick<Listing, 'id' | 'cook_id' | 'restaurant_listing_ids'>;

export type AvailabilityState = 'available' | 'noLongerAvailable' | 'unavailable';

export interface AvailabilitySummary {
  nextAvailableDate?: string;
  state: AvailabilityState;
}

export type AvailabilitySummaryMap = Record<string, AvailabilitySummary>;

const getRestaurantListingIds = (listing: AvailabilityListing): string[] =>
  [...new Set([listing.id, ...(listing.restaurant_listing_ids ?? [])])].filter(Boolean);

/** Returns a YYYY-MM-DD key using the device's local calendar date. */
export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats an availability summary as a complete, user-facing message. */
export function formatAvailabilityLabel(
  availability?: AvailabilitySummary,
  now = new Date()
): string {
  if (availability?.state === 'noLongerAvailable') return 'No longer available today';

  const dateStr = availability?.nextAvailableDate;
  if (availability?.state !== 'available' || !dateStr) return 'Currently not available';

  const dateParts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateParts) return 'Currently not available';
  const [, yearText, monthText, dayText] = dateParts;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const target = new Date(year, monthIndex, day);
  if (
    target.getFullYear() !== year ||
    target.getMonth() !== monthIndex ||
    target.getDate() !== day
  ) {
    return 'Currently not available';
  }

  const diffDays = Math.round(
    (Date.UTC(year, monthIndex, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000
  );
  if (diffDays === 0) return 'Available today';
  if (diffDays === 1) return 'Available tomorrow';
  return `Available ${target.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function getAvailabilityDate(record: AvailabilityRecord): string | null {
  if (typeof record.available_date !== 'string') return null;
  const date = record.available_date.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function hasRemainingCapacity(record: AvailabilityRecord): boolean {
  const maxOrders = Number(record.max_orders);
  const ordersTaken = Number(record.orders_taken ?? 0);
  return (
    record.is_available !== false &&
    Number.isFinite(maxOrders) &&
    Number.isFinite(ordersTaken) &&
    maxOrders - ordersTaken > 0
  );
}

function getWindowEnd(record: AvailabilityRecord, date: string): Date {
  const endTime = record.end_time?.trim();

  if (endTime) {
    const timeOnly = endTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (timeOnly) {
      const [year, month, day] = date.split('-').map(Number);
      const [, hour, minute, second = '0'] = timeOnly;
      const localEnd = new Date(year, month - 1, day, Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(localEnd.getTime())) return localEnd;
    }

    const timestampEnd = new Date(endTime);
    if (!Number.isNaN(timestampEnd.getTime())) return timestampEnd;
  }

  // Legacy all-day rows without an end time remain bookable until local midnight.
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + 1);
}

export function isAvailabilityRecordBookable(
  record: AvailabilityRecord,
  today = getLocalDateKey(),
  now = new Date()
): boolean {
  const date = getAvailabilityDate(record);
  if (date === null || date < today || !hasRemainingCapacity(record)) return false;
  return date > today || getWindowEnd(record, date).getTime() > now.getTime();
}

/** Summarises whether a listing still has a bookable time window. */
export function getAvailabilitySummary(
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummary {
  let hadExpiredWindowToday = false;

  const bookableRecords = records
    .map(record => ({ record, date: getAvailabilityDate(record) }))
    .filter(({ record, date }) => {
      if (date === null || date < today || !hasRemainingCapacity(record)) return false;
      if (date > today) return true;

      const isStillOpen = isAvailabilityRecordBookable(record, today, now);
      if (!isStillOpen) hadExpiredWindowToday = true;
      return isStillOpen;
    })
    .sort((a, b) => {
      const dateComparison = a.date!.localeCompare(b.date!);
      if (dateComparison !== 0) return dateComparison;
      return (a.record.start_time ?? '').localeCompare(b.record.start_time ?? '');
    });

  const nextAvailableDate = bookableRecords[0]?.date ?? undefined;
  if (nextAvailableDate) return { nextAvailableDate, state: 'available' };
  return { state: hadExpiredWindowToday ? 'noLongerAvailable' : 'unavailable' };
}

/**
 * Finds the earliest bookable slot. Same-day slots stop being bookable once
 * their pickup window ends.
 */
export function getEarliestAvailableDate(
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): string | undefined {
  return getAvailabilitySummary(records, today, now).nextAvailableDate;
}

function rollUpRestaurantAvailabilitySummaries(
  listings: AvailabilityListing[],
  listingSummaries: AvailabilitySummaryMap
): AvailabilitySummaryMap {
  const rolledUpSummaries = { ...listingSummaries };
  const restaurants = new Map<string, { cardIds: Set<string>; listingIds: Set<string> }>();

  for (const listing of listings) {
    const restaurant = restaurants.get(listing.cook_id) ?? {
      cardIds: new Set<string>(),
      listingIds: new Set<string>(),
    };
    restaurant.cardIds.add(listing.id);
    getRestaurantListingIds(listing).forEach(listingId => restaurant.listingIds.add(listingId));
    restaurants.set(listing.cook_id, restaurant);
  }

  for (const [cookId, restaurant] of restaurants) {
    const summaries = [...restaurant.listingIds].map(
      listingId => listingSummaries[listingId] ?? { state: 'unavailable' as const }
    );
    const nextAvailableDate = summaries
      .map(summary => summary.nextAvailableDate)
      .filter((date): date is string => typeof date === 'string')
      .sort()[0];
    const restaurantSummary: AvailabilitySummary = nextAvailableDate
      ? { nextAvailableDate, state: 'available' }
      : summaries.some(summary => summary.state === 'noLongerAvailable')
        ? { state: 'noLongerAvailable' }
        : { state: 'unavailable' };

    rolledUpSummaries[cookId] = restaurantSummary;
    restaurant.cardIds.forEach(listingId => {
      rolledUpSummaries[listingId] = restaurantSummary;
    });
  }

  return rolledUpSummaries;
}

/** Builds time-aware restaurant availability from a batch of per-dish rows. */
export function buildAvailabilitySummaries(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummaryMap {
  const uniqueListingIds = [...new Set(listings.flatMap(getRestaurantListingIds).filter(Boolean))];
  const recordsByListing = new Map<string, AvailabilityRecord[]>();
  for (const record of records) {
    if (!record.listing_id) continue;
    const listingRecords = recordsByListing.get(record.listing_id) ?? [];
    listingRecords.push(record);
    recordsByListing.set(record.listing_id, listingRecords);
  }

  const listingSummaries: AvailabilitySummaryMap = {};
  for (const listingId of uniqueListingIds) {
    listingSummaries[listingId] = getAvailabilitySummary(
      recordsByListing.get(listingId) ?? [],
      today,
      now
    );
  }

  return rollUpRestaurantAvailabilitySummaries(listings, listingSummaries);
}

/**
 * Copies each cook's earliest meal date onto a stable cook key and every
 * representative card listing. Raw per-dish entries remain available for
 * callers that need them.
 */
export function rollUpRestaurantAvailableDates(
  listings: AvailabilityListing[],
  listingDates: Record<string, string>
): Record<string, string> {
  const rolledUpDates = { ...listingDates };
  const restaurants = new Map<string, { cardIds: Set<string>; listingIds: Set<string> }>();

  for (const listing of listings) {
    const restaurant = restaurants.get(listing.cook_id) ?? {
      cardIds: new Set<string>(),
      listingIds: new Set<string>(),
    };
    restaurant.cardIds.add(listing.id);
    getRestaurantListingIds(listing).forEach(listingId => restaurant.listingIds.add(listingId));
    restaurants.set(listing.cook_id, restaurant);
  }

  for (const [cookId, restaurant] of restaurants) {
    const earliestRestaurantDate = [...restaurant.listingIds]
      .map(listingId => listingDates[listingId])
      .filter((date): date is string => typeof date === 'string')
      .sort()[0];

    if (!earliestRestaurantDate) continue;
    rolledUpDates[cookId] = earliestRestaurantDate;
    restaurant.cardIds.forEach(listingId => {
      rolledUpDates[listingId] = earliestRestaurantDate;
    });
  }

  return rolledUpDates;
}

/** Builds restaurant-level availability from a batch of per-dish rows. */
export function buildNextAvailableDates(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): Record<string, string> {
  const summaries = buildAvailabilitySummaries(listings, records, today, now);
  return Object.fromEntries(
    Object.entries(summaries)
      .filter((entry): entry is [string, AvailabilitySummary & { nextAvailableDate: string }] =>
        Boolean(entry[1].nextAvailableDate)
      )
      .map(([key, summary]) => [key, summary.nextAvailableDate])
  );
}

async function fetchAvailabilityRecords(
  listings: AvailabilityListing[],
  today: string
): Promise<AvailabilityRecord[]> {
  const uniqueListingIds = [...new Set(listings.flatMap(getRestaurantListingIds).filter(Boolean))];
  if (uniqueListingIds.length === 0) return [];

  const { supabase } = await import('@/src/services/supabase');
  const { data, error } = await supabase
    .from('availability')
    .select(
      'listing_id, available_date, start_time, end_time, is_available, max_orders, orders_taken'
    )
    .in('listing_id', uniqueListingIds)
    .gte('available_date', today);

  if (error) throw error;
  return (data ?? []) as AvailabilityRecord[];
}

export async function fetchAvailabilitySummaries(
  listings: AvailabilityListing[],
  today = getLocalDateKey(),
  now = new Date()
): Promise<AvailabilitySummaryMap> {
  const records = await fetchAvailabilityRecords(listings, today);
  return buildAvailabilitySummaries(listings, records, today, now);
}

/**
 * Loads every represented dish in one query from the same Supabase project as
 * the listing search. This avoids N+1 API requests and cross-environment gaps.
 */
export async function fetchNextAvailableDates(
  listings: AvailabilityListing[],
  today = getLocalDateKey(),
  now = new Date()
): Promise<Record<string, string>> {
  const records = await fetchAvailabilityRecords(listings, today);
  return buildNextAvailableDates(listings, records, today, now);
}

export function isSummaryAvailableNow(
  restaurantKey: string,
  summaries: AvailabilitySummaryMap,
  today = getLocalDateKey()
): boolean {
  const summary = summaries[restaurantKey];
  return summary?.state === 'available' && summary.nextAvailableDate === today;
}

export function isAvailableNow(
  restaurantKey: string,
  nextAvailableDates: Record<string, string>,
  today = getLocalDateKey()
): boolean {
  return nextAvailableDates[restaurantKey] === today;
}
