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
export const AVAILABILITY_TIME_ZONE = 'Asia/Kuala_Lumpur';
const MALAYSIA_UTC_OFFSET = '+08:00';

const getRestaurantListingIds = (listing: AvailabilityListing): string[] =>
  [...new Set([listing.id, ...(listing.restaurant_listing_ids ?? [])])].filter(Boolean);

/** Returns the Malaysian service-date key used by cooks and the backend. */
export function getLocalDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AVAILABILITY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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

  const todayParts = getLocalDateKey(now).split('-').map(Number);
  const diffDays = Math.round(
    (Date.UTC(year, monthIndex, day) - Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])) /
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

function getWindowBoundary(
  value: string | null | undefined,
  date: string,
  fallback: 'start' | 'end'
): Date {
  const boundary = value?.trim();

  if (boundary) {
    const timeOnly = boundary.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (timeOnly) {
      const [, hour, minute, second = '0'] = timeOnly;
      const malaysiaBoundary = new Date(
        `${date}T${hour}:${minute}:${String(second).padStart(2, '0')}${MALAYSIA_UTC_OFFSET}`
      );
      if (!Number.isNaN(malaysiaBoundary.getTime())) return malaysiaBoundary;
    }

    const timestampBoundary = new Date(boundary);
    if (!Number.isNaN(timestampBoundary.getTime())) return timestampBoundary;
  }

  if (fallback === 'start') return new Date(`${date}T00:00:00${MALAYSIA_UTC_OFFSET}`);
  // 16:00 UTC on the service date is midnight at the end of that date in MYT.
  return new Date(`${date}T16:00:00Z`);
}

function getWindowStart(record: AvailabilityRecord, date: string): Date {
  return getWindowBoundary(record.start_time, date, 'start');
}

function getWindowEnd(record: AvailabilityRecord, date: string): Date {
  return getWindowBoundary(record.end_time, date, 'end');
}

export function isAvailabilityRecordBookable(
  record: AvailabilityRecord,
  today = getLocalDateKey(),
  now = new Date()
): boolean {
  const date = getAvailabilityDate(record);
  if (date === null || date < today || !hasRemainingCapacity(record)) return false;
  if (date > today) return true;
  return (
    getWindowStart(record, date).getTime() <= now.getTime() &&
    getWindowEnd(record, date).getTime() > now.getTime()
  );
}

/** Summarises whether a listing still has a bookable time window. */
export function getAvailabilitySummary(
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummary {
  let hadExpiredWindowToday = false;
  let hasUpcomingWindowToday = false;

  const bookableRecords = records
    .map(record => ({ record, date: getAvailabilityDate(record) }))
    .filter(({ record, date }) => {
      if (date === null || date < today || !hasRemainingCapacity(record)) return false;
      if (date > today) return true;

      const windowStart = getWindowStart(record, date);
      const windowEnd = getWindowEnd(record, date);
      const isStillOpen =
        windowStart.getTime() <= now.getTime() && windowEnd.getTime() > now.getTime();
      if (!isStillOpen && windowStart.getTime() > now.getTime()) hasUpcomingWindowToday = true;
      if (!isStillOpen && windowEnd.getTime() <= now.getTime()) hadExpiredWindowToday = true;
      return isStillOpen;
    })
    .sort((a, b) => {
      const dateComparison = a.date!.localeCompare(b.date!);
      if (dateComparison !== 0) return dateComparison;
      return (a.record.start_time ?? '').localeCompare(b.record.start_time ?? '');
    });

  const nextAvailableDate = bookableRecords[0]?.date ?? undefined;
  if (nextAvailableDate === today) return { nextAvailableDate, state: 'available' };
  // A later opening window today is intentionally not "Available Now". Do
  // not skip over it and claim tomorrow is the restaurant's next opening.
  if (hasUpcomingWindowToday) return { state: 'unavailable' };
  if (nextAvailableDate) return { nextAvailableDate, state: 'available' };
  return {
    state: hadExpiredWindowToday && !hasUpcomingWindowToday ? 'noLongerAvailable' : 'unavailable',
  };
}

/**
 * Buyer-menu state keeps a dish visibly unavailable after the cook marks all
 * of today's windows sold out, even when the recurring schedule will reset on
 * a later day. Outside that explicit daily override, future bookable dates
 * continue to be shown normally.
 */
export function getMenuAvailabilitySummary(
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummary {
  const todayRecords = records.filter(record => getAvailabilityDate(record) === today);
  const unavailableForToday =
    todayRecords.length > 0 && todayRecords.every(record => !hasRemainingCapacity(record));
  return unavailableForToday
    ? { state: 'unavailable' }
    : getAvailabilitySummary(records, today, now);
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

function buildPerListingAvailabilitySummaries(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today: string,
  now: Date,
  summarize: (
    listingRecords: AvailabilityRecord[],
    serviceDate: string,
    currentTime: Date
  ) => AvailabilitySummary
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
    listingSummaries[listingId] = summarize(recordsByListing.get(listingId) ?? [], today, now);
  }

  return listingSummaries;
}

/** Builds time-aware availability for each represented dish without restaurant roll-up. */
export function buildListingAvailabilitySummaries(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummaryMap {
  return buildPerListingAvailabilitySummaries(
    listings,
    records,
    today,
    now,
    getAvailabilitySummary
  );
}

/** Builds buyer-menu states, including explicit sold-out-for-today overrides. */
export function buildMenuListingAvailabilitySummaries(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummaryMap {
  return buildPerListingAvailabilitySummaries(
    listings,
    records,
    today,
    now,
    getMenuAvailabilitySummary
  );
}

/** Builds time-aware restaurant availability from a batch of per-dish rows. */
export function buildAvailabilitySummaries(
  listings: AvailabilityListing[],
  records: AvailabilityRecord[],
  today = getLocalDateKey(),
  now = new Date()
): AvailabilitySummaryMap {
  const listingSummaries = buildListingAvailabilitySummaries(listings, records, today, now);
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
  _today: string
): Promise<AvailabilityRecord[]> {
  const uniqueListingIds = [...new Set(listings.flatMap(getRestaurantListingIds).filter(Boolean))];
  if (uniqueListingIds.length === 0) return [];

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Chefin API URL is not configured.');
  const chunks: string[][] = [];
  for (let offset = 0; offset < uniqueListingIds.length; offset += 500) {
    chunks.push(uniqueListingIds.slice(offset, offset + 500));
  }

  const responses = await Promise.all(
    chunks.map(async listingIds => {
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/api/availability/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingIds, days: 30 }),
        });
      } catch {
        throw new Error(`Chefin could not reach the backend at ${apiUrl}.`);
      }
      const payload = (await response.json().catch(() => ({}))) as {
        availability?: AvailabilityRecord[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Availability could not be loaded.');
      return Array.isArray(payload.availability) ? payload.availability : [];
    })
  );
  return responses.flat();
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
