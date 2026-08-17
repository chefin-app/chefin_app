import { supabase } from './supabaseClient';
import { getEligibleCookUserIds } from './cookEligibility';

export const AVAILABILITY_TIME_ZONE = 'Asia/Kuala_Lumpur';
const MALAYSIA_UTC_OFFSET = '+08:00';
const DEFAULT_HORIZON_DAYS = 30;
const UNLIMITED_DAILY_STOCK_SENTINEL = 1_000_000;

export type AvailabilitySource = 'recurring' | 'legacy';
export type CookDishAvailabilityState = 'available' | 'sold_out' | 'closed' | 'unconfigured';

export interface AvailabilityRecord {
  id: string;
  listing_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  orders_taken: number;
  is_available: boolean;
  source: AvailabilitySource;
}

export interface OpeningHoursWindow {
  id: string;
  isoWeekday: number;
  opensAt: string;
  closesAt: string;
  enabled: boolean;
}

export interface SpecialHoursWindow {
  id: string;
  serviceDate: string;
  description: string | null;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface AvailabilitySettings {
  listingId: string;
  enabled: boolean;
  scheduleMode: 'restaurant_hours';
  maxOrdersPerWindow: number;
  dailyStockLimit: number | null;
  configuredAt: string;
  updatedAt: string;
}

type ListingIdentity = {
  id: string;
  cook_id: string;
};

type PublicListingIdentity = ListingIdentity & {
  status: string;
  is_active: boolean | null;
};

type AvailabilitySettingRow = {
  listing_id: string;
  enabled: boolean;
  schedule_mode: string;
  max_orders_per_window: number;
  daily_stock_limit: number | null;
  configured_at: string;
  updated_at: string;
};

type OpeningHoursRow = {
  id: string;
  cook_id: string;
  iso_weekday: number;
  opens_at: string;
  closes_at: string;
  enabled: boolean;
};

type SpecialHoursRow = {
  id: string;
  cook_id: string;
  service_date: string;
  description: string | null;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

type OverrideRow = {
  listing_id: string;
  service_date: string;
  state: 'available' | 'sold_out';
};

type CapacityRow = {
  listing_id: string;
  service_date: string;
  window_start: string;
  orders_taken: number;
};

type SellingScheduleRow = {
  id: string;
  cook_id: string;
  name: string;
  specific_dates: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

type SellingScheduleWindowRow = {
  id: string;
  schedule_id: string;
  iso_weekday: number;
  all_day: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

type ListingScheduleAssignmentRow = {
  listing_id: string;
  schedule_id: string;
};

export interface SellingSchedule {
  id: string;
  name: string;
  specificDates: boolean;
  startsOn: string | null;
  endsOn: string | null;
  windows: Array<{
    id: string;
    isoWeekday: number;
    allDay: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  listingIds: string[];
}

type LegacyAvailabilityRow = {
  id: string;
  listing_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  orders_taken: number | null;
  is_available: boolean | null;
};

const missingRelation = (error: { code?: string; message?: string } | null): boolean =>
  Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.toLowerCase().includes('schema cache'))
  );

export const normalizeServiceDate = (value: unknown): string | null => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
};

const normalizeDate = normalizeServiceDate;

export const normalizeTime = (value: unknown): string | null => {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
};

export const getDateKeyInTimeZone = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AVAILABILITY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getTimeKeyInTimeZone = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AVAILABILITY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.hour}:${values.minute}:${values.second}`;
};

const addDays = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getIsoWeekday = (dateKey: string): number => {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

const toMalaysiaTimestamp = (dateKey: string, time: string): string =>
  new Date(`${dateKey}T${time}${MALAYSIA_UTC_OFFSET}`).toISOString();

const recordHasRemainingCapacity = (record: {
  max_orders: number;
  orders_taken: number | null;
  is_available: boolean | null;
}): boolean =>
  record.is_available !== false && Number(record.max_orders) > Number(record.orders_taken ?? 0);

const isLegacyRecordStillBookable = (
  record: LegacyAvailabilityRow,
  today: string,
  now = new Date()
): boolean => {
  const date = normalizeDate(record.available_date);
  if (!date || date < today || !recordHasRemainingCapacity(record)) return false;
  if (date > today) return true;
  const end = new Date(record.end_time);
  return !Number.isNaN(end.getTime()) && end.getTime() > now.getTime();
};

const mapSetting = (row: AvailabilitySettingRow): AvailabilitySettings => ({
  listingId: row.listing_id,
  enabled: row.enabled,
  scheduleMode: 'restaurant_hours',
  maxOrdersPerWindow: Number(row.max_orders_per_window),
  dailyStockLimit: row.daily_stock_limit == null ? null : Number(row.daily_stock_limit),
  configuredAt: row.configured_at,
  updatedAt: row.updated_at,
});

const mapOpeningHours = (row: OpeningHoursRow): OpeningHoursWindow => ({
  id: row.id,
  isoWeekday: row.iso_weekday,
  opensAt: normalizeTime(row.opens_at) ?? row.opens_at,
  closesAt: normalizeTime(row.closes_at) ?? row.closes_at,
  enabled: row.enabled,
});

const mapSpecialHours = (row: SpecialHoursRow): SpecialHoursWindow => ({
  id: row.id,
  serviceDate: normalizeDate(row.service_date) ?? row.service_date,
  description: row.description,
  isClosed: row.is_closed,
  opensAt: row.opens_at ? normalizeTime(row.opens_at) : null,
  closesAt: row.closes_at ? normalizeTime(row.closes_at) : null,
});

async function fetchSettings(listingIds: string[]): Promise<AvailabilitySettingRow[]> {
  if (listingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('listing_availability_settings')
    .select(
      'listing_id, enabled, schedule_mode, max_orders_per_window, daily_stock_limit, configured_at, updated_at'
    )
    .in('listing_id', listingIds);
  if (missingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as AvailabilitySettingRow[];
}

async function fetchOpeningHours(cookIds: string[]): Promise<OpeningHoursRow[]> {
  if (cookIds.length === 0) return [];
  const { data, error } = await supabase
    .from('restaurant_opening_hours')
    .select('id, cook_id, iso_weekday, opens_at, closes_at, enabled')
    .in('cook_id', cookIds)
    .order('iso_weekday', { ascending: true })
    .order('opens_at', { ascending: true });
  if (missingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as OpeningHoursRow[];
}

async function fetchSpecialHours(
  cookIds: string[],
  fromDate?: string,
  toDate?: string
): Promise<SpecialHoursRow[]> {
  if (cookIds.length === 0) return [];
  let query = supabase
    .from('restaurant_special_hours')
    .select('id, cook_id, service_date, description, is_closed, opens_at, closes_at')
    .in('cook_id', cookIds)
    .order('service_date', { ascending: true })
    .order('opens_at', { ascending: true });
  if (fromDate) query = query.gte('service_date', fromDate);
  if (toDate) query = query.lte('service_date', toDate);
  const { data, error } = await query;
  if (missingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as SpecialHoursRow[];
}

async function fetchSellingScheduleContext(listingIds: string[]): Promise<{
  assignments: ListingScheduleAssignmentRow[];
  schedules: SellingScheduleRow[];
  windows: SellingScheduleWindowRow[];
}> {
  if (listingIds.length === 0) return { assignments: [], schedules: [], windows: [] };
  const { data: assignmentData, error: assignmentError } = await supabase
    .from('listing_selling_schedules')
    .select('listing_id, schedule_id')
    .in('listing_id', listingIds);
  if (missingRelation(assignmentError)) return { assignments: [], schedules: [], windows: [] };
  if (assignmentError) throw assignmentError;
  const assignments = (assignmentData ?? []) as ListingScheduleAssignmentRow[];
  const scheduleIds = [...new Set(assignments.map(row => row.schedule_id))];
  if (scheduleIds.length === 0) return { assignments, schedules: [], windows: [] };
  const [scheduleResult, windowResult] = await Promise.all([
    supabase
      .from('selling_schedules')
      .select('id, cook_id, name, specific_dates, starts_on, ends_on')
      .in('id', scheduleIds),
    supabase
      .from('selling_schedule_windows')
      .select('id, schedule_id, iso_weekday, all_day, opens_at, closes_at')
      .in('schedule_id', scheduleIds),
  ]);
  if (scheduleResult.error) throw scheduleResult.error;
  if (windowResult.error) throw windowResult.error;
  return {
    assignments,
    schedules: (scheduleResult.data ?? []) as SellingScheduleRow[],
    windows: (windowResult.data ?? []) as SellingScheduleWindowRow[],
  };
}

const intersectBusinessWithSellingSchedule = (
  businessWindows: Array<{ opens_at: string | null; closes_at: string | null }>,
  schedule: SellingScheduleRow | undefined,
  scheduleWindows: SellingScheduleWindowRow[],
  serviceDate: string,
  isoWeekday: number
): Array<{ opens_at: string; closes_at: string }> => {
  const normalizedBusiness = businessWindows.flatMap(window => {
    const opensAt = normalizeTime(window.opens_at);
    const closesAt = normalizeTime(window.closes_at);
    return opensAt && closesAt ? [{ opens_at: opensAt, closes_at: closesAt }] : [];
  });
  if (!schedule) return normalizedBusiness;
  const startsOn = normalizeDate(schedule.starts_on);
  const endsOn = normalizeDate(schedule.ends_on);
  if (
    schedule.specific_dates &&
    (!startsOn || !endsOn || serviceDate < startsOn || serviceDate > endsOn)
  ) {
    return [];
  }
  const dayWindows = scheduleWindows.filter(window => window.iso_weekday === isoWeekday);
  if (dayWindows.length === 0) return [];
  if (dayWindows.some(window => window.all_day)) return normalizedBusiness;

  return normalizedBusiness.flatMap(business =>
    dayWindows.flatMap(window => {
      const opensAt = normalizeTime(window.opens_at);
      const closesAt = normalizeTime(window.closes_at);
      if (!opensAt || !closesAt) return [];
      const intersectionStart = business.opens_at > opensAt ? business.opens_at : opensAt;
      const intersectionEnd = business.closes_at < closesAt ? business.closes_at : closesAt;
      return intersectionStart < intersectionEnd
        ? [{ opens_at: intersectionStart, closes_at: intersectionEnd }]
        : [];
    })
  );
};

async function fetchLegacyAvailability(
  listingIds: string[],
  fromDate: string,
  toDate?: string
): Promise<LegacyAvailabilityRow[]> {
  if (listingIds.length === 0) return [];
  let query = supabase
    .from('availability')
    .select(
      'id, listing_id, available_date, start_time, end_time, max_orders, orders_taken, is_available'
    )
    .in('listing_id', listingIds)
    .gte('available_date', fromDate)
    .order('available_date', { ascending: true })
    .limit(5000);
  if (toDate) query = query.lte('available_date', toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LegacyAvailabilityRow[];
}

/**
 * Returns dishes that either use recurring restaurant hours or still have a
 * valid dated legacy slot. This dual read lets cooks migrate without making
 * existing menus disappear, while truly unscheduled dishes remain private.
 */
export async function filterListingsWithFutureAvailability<T extends ListingIdentity>(
  listings: T[],
  now = new Date()
): Promise<T[]> {
  if (listings.length === 0) return [];
  const availability = await getListingAvailabilityBatch(
    [...new Set(listings.map(listing => listing.id))],
    90,
    now
  );
  return listings.filter(listing => (availability[listing.id]?.records.length ?? 0) > 0);
}

export async function listingHasFutureAvailability(
  listing: ListingIdentity,
  now = new Date()
): Promise<boolean> {
  return (await filterListingsWithFutureAvailability([listing], now)).length === 1;
}

export async function getOpeningHoursForCook(cookId: string): Promise<OpeningHoursWindow[]> {
  return (await fetchOpeningHours([cookId])).map(mapOpeningHours);
}

export async function getSpecialHoursForCook(
  cookId: string,
  fromDate = getDateKeyInTimeZone()
): Promise<SpecialHoursWindow[]> {
  return (await fetchSpecialHours([cookId], fromDate)).map(mapSpecialHours);
}

export interface ListingAvailabilityResult {
  records: AvailabilityRecord[];
  source: AvailabilitySource | null;
  currentlyAvailable: boolean;
  remainingSlots: number;
  constrainedBySellingSchedule: boolean;
}

export async function getListingAvailabilityBatch(
  requestedListingIds: string[],
  horizonDays = DEFAULT_HORIZON_DAYS,
  now = new Date()
): Promise<Record<string, ListingAvailabilityResult>> {
  const listingIds = [...new Set(requestedListingIds)];
  if (listingIds.length === 0) return {};
  const { data: listings, error: listingError } = await supabase
    .from('listings')
    .select('id, cook_id, status, is_active')
    .in('id', listingIds);
  if (listingError) throw listingError;

  const today = getDateKeyInTimeZone(now);
  const safeHorizon = Math.max(1, Math.min(horizonDays, 90));
  const lastDate = addDays(today, safeHorizon - 1);
  const activeListings = ((listings ?? []) as PublicListingIdentity[]).filter(
    listing => listing.status === 'approved' && listing.is_active === true
  );
  if (activeListings.length === 0) return {};

  // These endpoints are public and listing IDs are guessable. Do not reveal
  // opening schedules for a pending/unapproved cook or a restricted account,
  // even if an old listing row was accidentally left active.
  const activeCookIds = [...new Set(activeListings.map(listing => listing.cook_id))];
  const { data: cookProfiles, error: cookProfilesError } = await supabase
    .from('profiles')
    .select('id, user_id, account_status')
    .in('id', activeCookIds);
  if (cookProfilesError) throw cookProfilesError;
  const activeProfiles = (cookProfiles ?? []).filter(
    profile => (profile.account_status ?? 'active') === 'active'
  );
  const eligibleUserIds = await getEligibleCookUserIds(
    activeProfiles.map(profile => profile.user_id)
  );
  const eligibleCookIds = new Set(
    activeProfiles
      .filter(profile => eligibleUserIds.has(profile.user_id))
      .map(profile => profile.id)
  );
  const foundListings = activeListings.filter(listing => eligibleCookIds.has(listing.cook_id));
  if (foundListings.length === 0) return {};
  const foundListingIds = foundListings.map(listing => listing.id);
  const cookIds = [...new Set(foundListings.map(listing => listing.cook_id))];
  const [
    settings,
    hours,
    specialHours,
    legacy,
    sellingScheduleContext,
    overridesResult,
    capacityResult,
  ] = await Promise.all([
    fetchSettings(foundListingIds),
    fetchOpeningHours(cookIds),
    fetchSpecialHours(cookIds, today, lastDate),
    fetchLegacyAvailability(foundListingIds, today, lastDate),
    fetchSellingScheduleContext(foundListingIds),
    supabase
      .from('listing_availability_overrides')
      .select('listing_id, service_date, state')
      .in('listing_id', foundListingIds)
      .gte('service_date', today)
      .lte('service_date', lastDate),
    supabase
      .from('listing_daily_capacity')
      .select('listing_id, service_date, window_start, orders_taken')
      .in('listing_id', foundListingIds)
      .gte('service_date', today)
      .lte('service_date', lastDate),
  ]);
  if (overridesResult.error && !missingRelation(overridesResult.error)) {
    throw overridesResult.error;
  }
  if (capacityResult.error && !missingRelation(capacityResult.error)) {
    throw capacityResult.error;
  }

  const settingByListing = new Map(settings.map(row => [row.listing_id, row]));
  const scheduleIdByListing = new Map(
    sellingScheduleContext.assignments.map(row => [row.listing_id, row.schedule_id])
  );
  const scheduleById = new Map(sellingScheduleContext.schedules.map(row => [row.id, row]));
  const scheduleWindowsById = new Map<string, SellingScheduleWindowRow[]>();
  for (const scheduleWindow of sellingScheduleContext.windows) {
    scheduleWindowsById.set(scheduleWindow.schedule_id, [
      ...(scheduleWindowsById.get(scheduleWindow.schedule_id) ?? []),
      scheduleWindow,
    ]);
  }
  const hoursByCook = new Map<string, OpeningHoursRow[]>();
  for (const window of hours.filter(row => row.enabled)) {
    hoursByCook.set(window.cook_id, [...(hoursByCook.get(window.cook_id) ?? []), window]);
  }
  const specialByCookDate = new Map<string, SpecialHoursRow[]>();
  for (const window of specialHours) {
    const date = normalizeDate(window.service_date);
    if (!date) continue;
    const key = `${window.cook_id}_${date}`;
    specialByCookDate.set(key, [...(specialByCookDate.get(key) ?? []), window]);
  }
  const overrideByListingDate = new Map(
    ((overridesResult.data ?? []) as OverrideRow[]).map(row => [
      `${row.listing_id}_${normalizeDate(row.service_date)}`,
      row.state,
    ])
  );
  const capacityByListingDate = new Map<string, number>();
  for (const row of (capacityResult.data ?? []) as CapacityRow[]) {
    const key = `${row.listing_id}_${normalizeDate(row.service_date)}`;
    capacityByListingDate.set(
      key,
      (capacityByListingDate.get(key) ?? 0) + Number(row.orders_taken)
    );
  }
  const legacyByListing = new Map<string, LegacyAvailabilityRow[]>();
  for (const record of legacy) {
    legacyByListing.set(record.listing_id, [
      ...(legacyByListing.get(record.listing_id) ?? []),
      record,
    ]);
  }

  const results: Record<string, ListingAvailabilityResult> = {};
  for (const listing of foundListings) {
    const setting = settingByListing.get(listing.id);
    const sellingScheduleId = scheduleIdByListing.get(listing.id);
    const sellingSchedule = sellingScheduleId ? scheduleById.get(sellingScheduleId) : undefined;
    const sellingWindows = sellingScheduleId
      ? (scheduleWindowsById.get(sellingScheduleId) ?? [])
      : [];
    const recurring: AvailabilityRecord[] = [];
    const weeklyHours = hoursByCook.get(listing.cook_id) ?? [];
    const cookHasBusinessHours =
      weeklyHours.length > 0 || specialHours.some(window => window.cook_id === listing.cook_id);
    if (setting?.enabled !== false && cookHasBusinessHours) {
      for (let offset = 0; offset < safeHorizon; offset += 1) {
        const serviceDate = addDays(today, offset);
        const weekday = getIsoWeekday(serviceDate);
        const special = specialByCookDate.get(`${listing.cook_id}_${serviceDate}`);
        const businessWindows = special
          ? special.filter(row => !row.is_closed)
          : weeklyHours.filter(row => row.iso_weekday === weekday);
        const windows = intersectBusinessWithSellingSchedule(
          businessWindows,
          sellingSchedule,
          sellingWindows,
          serviceDate,
          weekday
        );
        for (const window of windows) {
          const start = normalizeTime(window.opens_at);
          const end = normalizeTime(window.closes_at);
          if (!start || !end) continue;
          const ordersTaken = capacityByListingDate.get(`${listing.id}_${serviceDate}`) ?? 0;
          const maxOrders =
            setting?.daily_stock_limit == null
              ? UNLIMITED_DAILY_STOCK_SENTINEL
              : Number(setting.daily_stock_limit);
          const isAvailable =
            overrideByListingDate.get(`${listing.id}_${serviceDate}`) !== 'sold_out' &&
            ordersTaken < maxOrders;
          recurring.push({
            id: `recurring:${listing.id}:${serviceDate}:${start}`,
            listing_id: listing.id,
            available_date: serviceDate,
            start_time: toMalaysiaTimestamp(serviceDate, start),
            end_time: toMalaysiaTimestamp(serviceDate, end),
            max_orders: maxOrders,
            orders_taken: ordersTaken,
            is_available: isAvailable,
            source: 'recurring',
          });
        }
      }
    }

    // A settings row is an explicit opt-in/out and supersedes old dated rows.
    // Legacy is only a fallback for listings not migrated yet.
    const legacyRecords: AvailabilityRecord[] = [];
    if (!setting && !cookHasBusinessHours) {
      for (const record of legacyByListing.get(listing.id) ?? []) {
        const date = normalizeDate(record.available_date);
        if (!date) continue;
        const override = overrideByListingDate.get(`${listing.id}_${date}`);
        legacyRecords.push({
          id: record.id,
          listing_id: record.listing_id,
          available_date: date,
          start_time: record.start_time,
          end_time: record.end_time,
          max_orders: Number(record.max_orders),
          orders_taken: Number(record.orders_taken ?? 0),
          is_available:
            override !== 'sold_out' &&
            record.is_available !== false &&
            Number(record.orders_taken ?? 0) < Number(record.max_orders),
          source: 'legacy',
        });
      }
    }

    const records = [...recurring, ...legacyRecords].sort(
      (left, right) =>
        left.available_date.localeCompare(right.available_date) ||
        left.start_time.localeCompare(right.start_time)
    );
    const current = records.find(
      record =>
        record.available_date === today &&
        record.is_available &&
        new Date(record.start_time).getTime() <= now.getTime() &&
        new Date(record.end_time).getTime() > now.getTime()
    );
    results[listing.id] = {
      records,
      source: recurring.length > 0 ? 'recurring' : legacyRecords.length > 0 ? 'legacy' : null,
      currentlyAvailable: Boolean(current),
      remainingSlots: current ? current.max_orders - current.orders_taken : 0,
      constrainedBySellingSchedule: Boolean(sellingScheduleId),
    };
  }
  return results;
}

export async function getListingAvailability(
  listingId: string,
  horizonDays = DEFAULT_HORIZON_DAYS,
  now = new Date()
): Promise<ListingAvailabilityResult> {
  const results = await getListingAvailabilityBatch([listingId], horizonDays, now);
  return (
    results[listingId] ?? {
      records: [],
      source: null,
      currentlyAvailable: false,
      remainingSlots: 0,
      constrainedBySellingSchedule: false,
    }
  );
}

export type CapacityReservation =
  | {
      source: 'recurring';
      listingId: string;
      serviceDate: string;
      windowStart: string;
      quantity: number;
    }
  | {
      source: 'legacy';
      availabilityId: string;
      quantity: number;
    };

export async function reserveListingCapacity(input: {
  listingId: string;
  serviceDate: string;
  pickupTime: string;
  quantity: number;
  now?: Date;
}): Promise<{ ok: true; reservation: CapacityReservation } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const pickup = new Date(input.pickupTime);
  if (
    !normalizeServiceDate(input.serviceDate) ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    Number.isNaN(pickup.getTime())
  ) {
    return { ok: false, error: 'The selected pickup slot is invalid.' };
  }
  if (getDateKeyInTimeZone(pickup) !== input.serviceDate) {
    return { ok: false, error: 'The pickup date and pickup time do not match.' };
  }
  if (pickup.getTime() <= now.getTime()) {
    return { ok: false, error: 'The selected pickup time has already passed.' };
  }

  const availability = await getListingAvailability(input.listingId, 90, now);
  const record = availability.records.find(candidate => {
    const start = new Date(candidate.start_time).getTime();
    const end = new Date(candidate.end_time).getTime();
    return (
      candidate.available_date === input.serviceDate &&
      candidate.is_available &&
      pickup.getTime() >= start &&
      pickup.getTime() < end
    );
  });
  if (!record) {
    return {
      ok: false,
      error: 'This pickup slot is no longer available. Please pick another time.',
    };
  }
  if (record.max_orders - record.orders_taken < input.quantity) {
    return {
      ok: false,
      error: `Only ${Math.max(0, record.max_orders - record.orders_taken)} portion(s) remain for this dish today.`,
    };
  }

  if (record.source === 'recurring') {
    const windowStart = getTimeKeyInTimeZone(new Date(record.start_time));
    const { data, error } = await supabase.rpc('reserve_listing_daily_capacity', {
      target_listing_id: input.listingId,
      target_service_date: input.serviceDate,
      target_window_start: windowStart,
      requested_quantity: input.quantity,
      maximum_orders: record.max_orders,
    });
    if (error) throw error;
    if (data !== true) {
      return { ok: false, error: 'This dish has just sold out. Please pick another item.' };
    }
    return {
      ok: true,
      reservation: {
        source: 'recurring',
        listingId: input.listingId,
        serviceDate: input.serviceDate,
        windowStart,
        quantity: input.quantity,
      },
    };
  }

  // Legacy rows have no reservation RPC. A compare-and-set update prevents
  // two requests that observed the same count from both claiming the last
  // capacity while those rows are phased out.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: currentError } = await supabase
      .from('availability')
      .select('id, max_orders, orders_taken, is_available')
      .eq('id', record.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.is_available === false) {
      return { ok: false, error: 'This pickup slot is no longer available.' };
    }
    const previous = Number(current.orders_taken ?? 0);
    if (previous + input.quantity > Number(current.max_orders)) {
      return {
        ok: false,
        error: `Only ${Math.max(0, Number(current.max_orders) - previous)} portion(s) remain for this dish.`,
      };
    }
    let update = supabase
      .from('availability')
      .update({ orders_taken: previous + input.quantity })
      .eq('id', record.id);
    update =
      current.orders_taken == null
        ? update.is('orders_taken', null)
        : update.eq('orders_taken', current.orders_taken);
    const { data: reserved, error: reserveError } = await update.select('id').maybeSingle();
    if (reserveError) throw reserveError;
    if (reserved) {
      return {
        ok: true,
        reservation: {
          source: 'legacy',
          availabilityId: record.id,
          quantity: input.quantity,
        },
      };
    }
  }
  return { ok: false, error: 'This pickup slot changed. Please try again.' };
}

/**
 * Decrements a previously claimed capacity counter. Callers must guarantee
 * that each successful reservation is released at most once.
 */
export async function releaseCapacityReservation(reservation: CapacityReservation): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const query =
      reservation.source === 'recurring'
        ? supabase
            .from('listing_daily_capacity')
            .select('orders_taken')
            .eq('listing_id', reservation.listingId)
            .eq('service_date', reservation.serviceDate)
            .eq('window_start', reservation.windowStart)
        : supabase.from('availability').select('orders_taken').eq('id', reservation.availabilityId);
    const { data: current, error: currentError } = await query.maybeSingle();
    if (currentError) throw currentError;
    if (!current) return;
    const previous = Number(current.orders_taken ?? 0);
    const restored = Math.max(0, previous - reservation.quantity);
    let update =
      reservation.source === 'recurring'
        ? supabase
            .from('listing_daily_capacity')
            .update({ orders_taken: restored, updated_at: new Date().toISOString() })
            .eq('listing_id', reservation.listingId)
            .eq('service_date', reservation.serviceDate)
            .eq('window_start', reservation.windowStart)
        : supabase
            .from('availability')
            .update({ orders_taken: restored })
            .eq('id', reservation.availabilityId);
    update = update.eq('orders_taken', previous);
    const { data: released, error: releaseError } = await update
      .select('orders_taken')
      .maybeSingle();
    if (releaseError) throw releaseError;
    if (released) return;
  }
  throw new Error('Capacity rollback was contended and could not be confirmed.');
}

/**
 * Atomically releases the exact reservation metadata persisted on an order.
 * The database locks the order and records capacity_released_at, so retries
 * are idempotent and can never guess or decrement another opening window.
 * Historical orders without reservation metadata return null.
 */
export async function releaseListingCapacityForOrder(
  orderId: string
): Promise<AvailabilitySource | null> {
  const { data, error } = await supabase.rpc('release_order_capacity', {
    target_order_id: orderId,
  });
  if (error) throw error;
  return data === 'recurring' || data === 'legacy' ? data : null;
}

export async function getCookMenu(cookId: string, now = new Date()) {
  const today = getDateKeyInTimeZone(now);
  const { data: dishes, error: dishesError } = await supabase
    .from('listings')
    .select('id, title, price, image_url, status, menu_category, is_active, created_at')
    .eq('cook_id', cookId)
    .order('menu_category', { ascending: true })
    .order('created_at', { ascending: false });
  if (dishesError) throw dishesError;

  const listingIds = (dishes ?? []).map(dish => dish.id);
  const [
    hours,
    specialHours,
    settings,
    scheduleContext,
    allSellingSchedules,
    overrides,
    todayCapacity,
    legacy,
  ] = await Promise.all([
    fetchOpeningHours([cookId]),
    fetchSpecialHours([cookId], today, today),
    fetchSettings(listingIds),
    fetchSellingScheduleContext(listingIds),
    getSellingSchedulesForCook(cookId),
    listingIds.length
      ? supabase
          .from('listing_availability_overrides')
          .select('listing_id, service_date, state')
          .in('listing_id', listingIds)
          .eq('service_date', today)
      : Promise.resolve({ data: [], error: null }),
    listingIds.length
      ? supabase
          .from('listing_daily_capacity')
          .select('listing_id, service_date, window_start, orders_taken')
          .in('listing_id', listingIds)
          .eq('service_date', today)
      : Promise.resolve({ data: [], error: null }),
    fetchLegacyAvailability(listingIds, today),
  ]);
  if (overrides.error && !missingRelation(overrides.error)) throw overrides.error;
  if (todayCapacity.error && !missingRelation(todayCapacity.error)) throw todayCapacity.error;

  const settingByListing = new Map(settings.map(setting => [setting.listing_id, setting]));
  const scheduleIdByListing = new Map(
    scheduleContext.assignments.map(row => [row.listing_id, row.schedule_id])
  );
  const scheduleById = new Map(scheduleContext.schedules.map(row => [row.id, row]));
  const scheduleWindowsById = new Map<string, SellingScheduleWindowRow[]>();
  for (const scheduleWindow of scheduleContext.windows) {
    scheduleWindowsById.set(scheduleWindow.schedule_id, [
      ...(scheduleWindowsById.get(scheduleWindow.schedule_id) ?? []),
      scheduleWindow,
    ]);
  }
  const overrideByListing = new Map(
    ((overrides.data ?? []) as OverrideRow[]).map(override => [override.listing_id, override.state])
  );
  const reservedTodayByListing = new Map<string, number>();
  for (const row of (todayCapacity.data ?? []) as CapacityRow[]) {
    reservedTodayByListing.set(
      row.listing_id,
      (reservedTodayByListing.get(row.listing_id) ?? 0) + Number(row.orders_taken)
    );
  }
  const enabledHours = hours.filter(window => window.enabled);
  const currentWeekday = getIsoWeekday(today);
  const currentTime = getTimeKeyInTimeZone(now);
  const todaysSpecialHours = specialHours.length ? specialHours : null;
  const todaysWindows = todaysSpecialHours
    ? todaysSpecialHours.filter(window => !window.is_closed)
    : enabledHours.filter(window => window.iso_weekday === currentWeekday);
  const hasBusinessHours =
    enabledHours.length > 0 || specialHours.some(window => !window.is_closed);

  const legacyByListing = new Map<string, LegacyAvailabilityRow[]>();
  for (const row of legacy) {
    const rows = legacyByListing.get(row.listing_id) ?? [];
    rows.push(row);
    legacyByListing.set(row.listing_id, rows);
  }

  return {
    date: today,
    openingHours: hours.map(mapOpeningHours),
    specialHours: specialHours.map(mapSpecialHours),
    sellingSchedules: allSellingSchedules,
    dishes: (dishes ?? []).map(dish => {
      const setting = settingByListing.get(dish.id);
      const sellingScheduleId = scheduleIdByListing.get(dish.id) ?? null;
      const sellingSchedule = sellingScheduleId ? scheduleById.get(sellingScheduleId) : undefined;
      const dishCurrentWindows = intersectBusinessWithSellingSchedule(
        todaysWindows,
        sellingSchedule,
        sellingScheduleId ? (scheduleWindowsById.get(sellingScheduleId) ?? []) : [],
        today,
        currentWeekday
      ).filter(
        window =>
          (normalizeTime(window.opens_at) ?? '') <= currentTime &&
          (normalizeTime(window.closes_at) ?? '') > currentTime
      );
      const legacyRows = legacyByListing.get(dish.id) ?? [];
      const hasLegacyFuture =
        !setting && legacyRows.some(row => isLegacyRecordStillBookable(row, today, now));
      const configured = Boolean(setting || hasBusinessHours || hasLegacyFuture);
      const enabled = setting?.enabled ?? (hasBusinessHours || hasLegacyFuture);
      const soldOut = overrideByListing.get(dish.id) === 'sold_out';
      const dailyStockLimit =
        setting?.daily_stock_limit == null ? null : Number(setting.daily_stock_limit);
      const portionsReservedToday = reservedTodayByListing.get(dish.id) ?? 0;
      const remainingStockToday =
        dailyStockLimit == null ? null : Math.max(0, dailyStockLimit - portionsReservedToday);
      const inventoryDepleted = remainingStockToday === 0;
      const legacyOpenNow =
        !setting &&
        legacyRows.some(row => {
          const date = normalizeDate(row.available_date);
          const start = new Date(row.start_time);
          const end = new Date(row.end_time);
          return (
            date === today &&
            recordHasRemainingCapacity(row) &&
            !soldOut &&
            start.getTime() <= now.getTime() &&
            end.getTime() > now.getTime()
          );
        });
      const recurringOpenNow = Boolean(
        enabled && dishCurrentWindows.length > 0 && !soldOut && !inventoryDepleted
      );
      const currentlyAvailable = recurringOpenNow || legacyOpenNow;
      const state: CookDishAvailabilityState = !configured
        ? 'unconfigured'
        : soldOut || inventoryDepleted
          ? 'sold_out'
          : currentlyAvailable
            ? 'available'
            : 'closed';

      const availability = {
        configured,
        enabled,
        maxOrdersPerWindow: setting?.max_orders_per_window ?? null,
        dailyStockLimit,
        portionsReservedToday,
        remainingStockToday,
        inventoryDepleted,
        state,
        availableToday: configured && enabled && !soldOut && !inventoryDepleted,
        currentlyAvailable,
        source: setting ? ('recurring' as const) : hasLegacyFuture ? ('legacy' as const) : null,
      };
      return {
        id: dish.id,
        listingId: dish.id,
        title: dish.title,
        price: Number(dish.price),
        imageUrl: dish.image_url,
        status: dish.status,
        menuCategory: dish.menu_category,
        isActive: dish.is_active,
        sellingScheduleId,
        sellingScheduleName: sellingSchedule?.name ?? null,
        ...availability,
        availability,
      };
    }),
  };
}

export async function replaceOpeningHours(
  cookId: string,
  windows: Array<{
    isoWeekday: number;
    opensAt: string;
    closesAt: string;
    enabled: boolean;
  }>,
  applyToAllListings: boolean
): Promise<{ openingHours: OpeningHoursWindow[]; configuredListingCount: number }> {
  const payload = windows.map(window => ({
    cook_id: cookId,
    iso_weekday: window.isoWeekday,
    opens_at: window.opensAt,
    closes_at: window.closesAt,
    enabled: window.enabled,
    updated_at: new Date().toISOString(),
  }));

  let retainedIds: string[] = [];
  if (payload.length > 0) {
    const { data, error } = await supabase
      .from('restaurant_opening_hours')
      .upsert(payload, { onConflict: 'cook_id,iso_weekday,opens_at,closes_at' })
      .select('id');
    if (error) throw error;
    retainedIds = (data ?? []).map(row => row.id);
  }

  let deleteQuery = supabase.from('restaurant_opening_hours').delete().eq('cook_id', cookId);
  if (retainedIds.length > 0)
    deleteQuery = deleteQuery.not('id', 'in', `(${retainedIds.join(',')})`);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  let configuredListingCount = 0;
  if (applyToAllListings) {
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .eq('cook_id', cookId);
    if (listingsError) throw listingsError;
    const ids = (listings ?? []).map(listing => listing.id);
    if (ids.length > 0) {
      const existing = await fetchSettings(ids);
      const existingByListing = new Map(existing.map(setting => [setting.listing_id, setting]));
      const now = new Date().toISOString();
      const { error } = await supabase.from('listing_availability_settings').upsert(
        ids.map(listingId => ({
          listing_id: listingId,
          // Business hours are restaurant-wide, but an indefinitely sold-out
          // dish must remain disabled when those hours are edited.
          enabled: existingByListing.get(listingId)?.enabled ?? true,
          schedule_mode: 'restaurant_hours',
          max_orders_per_window: existingByListing.get(listingId)?.max_orders_per_window ?? 5,
          configured_at: existingByListing.get(listingId)?.configured_at ?? now,
          updated_at: now,
        })),
        { onConflict: 'listing_id' }
      );
      if (error) throw error;
      configuredListingCount = ids.length;
    }
  }

  return { openingHours: await getOpeningHoursForCook(cookId), configuredListingCount };
}

export async function replaceSpecialHours(
  cookId: string,
  dates: string[],
  description: string | null,
  isClosed: boolean,
  windows: Array<{ opensAt: string; closesAt: string }>
): Promise<SpecialHoursWindow[]> {
  const uniqueDates = [...new Set(dates.map(normalizeServiceDate))].filter((date): date is string =>
    Boolean(date)
  );
  if (uniqueDates.length === 0) throw new Error('Choose at least one valid date.');

  const { error: deleteError } = await supabase
    .from('restaurant_special_hours')
    .delete()
    .eq('cook_id', cookId)
    .in('service_date', uniqueDates);
  if (deleteError && !missingRelation(deleteError)) throw deleteError;

  const timestamp = new Date().toISOString();
  type SpecialHoursInsert = {
    cook_id: string;
    service_date: string;
    description: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
    updated_at: string;
  };
  const payload: SpecialHoursInsert[] = [];
  for (const serviceDate of uniqueDates) {
    if (isClosed) {
      payload.push({
        cook_id: cookId,
        service_date: serviceDate,
        description,
        is_closed: true,
        opens_at: null,
        closes_at: null,
        updated_at: timestamp,
      });
    } else {
      payload.push(
        ...windows.map(window => ({
          cook_id: cookId,
          service_date: serviceDate,
          description,
          is_closed: false,
          opens_at: window.opensAt,
          closes_at: window.closesAt,
          updated_at: timestamp,
        }))
      );
    }
  }
  if (payload.length > 0) {
    const { error } = await supabase.from('restaurant_special_hours').insert(payload);
    if (error) throw error;
  }
  return getSpecialHoursForCook(cookId);
}

export async function deleteSpecialHours(cookId: string, serviceDate: string): Promise<void> {
  const date = normalizeServiceDate(serviceDate);
  if (!date) throw new Error('A valid service date is required.');
  const { error } = await supabase
    .from('restaurant_special_hours')
    .delete()
    .eq('cook_id', cookId)
    .eq('service_date', date);
  if (error && !missingRelation(error)) throw error;
}

export type SellingScheduleInput = {
  name: string;
  specificDates: boolean;
  startsOn: string | null;
  endsOn: string | null;
  windows: Array<{
    isoWeekday: number;
    allDay: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  listingIds: string[];
};

const mapSellingSchedule = (
  schedule: SellingScheduleRow,
  windows: SellingScheduleWindowRow[],
  assignments: ListingScheduleAssignmentRow[]
): SellingSchedule => ({
  id: schedule.id,
  name: schedule.name,
  specificDates: schedule.specific_dates,
  startsOn: normalizeDate(schedule.starts_on),
  endsOn: normalizeDate(schedule.ends_on),
  windows: windows
    .filter(window => window.schedule_id === schedule.id)
    .sort(
      (left, right) =>
        left.iso_weekday - right.iso_weekday ||
        String(left.opens_at ?? '').localeCompare(String(right.opens_at ?? ''))
    )
    .map(window => ({
      id: window.id,
      isoWeekday: window.iso_weekday,
      allDay: window.all_day,
      opensAt: window.opens_at ? normalizeTime(window.opens_at) : null,
      closesAt: window.closes_at ? normalizeTime(window.closes_at) : null,
    })),
  listingIds: assignments
    .filter(assignment => assignment.schedule_id === schedule.id)
    .map(assignment => assignment.listing_id),
});

export async function getSellingSchedulesForCook(cookId: string): Promise<SellingSchedule[]> {
  const { data: scheduleData, error: scheduleError } = await supabase
    .from('selling_schedules')
    .select('id, cook_id, name, specific_dates, starts_on, ends_on')
    .eq('cook_id', cookId)
    .order('name', { ascending: true });
  if (missingRelation(scheduleError)) return [];
  if (scheduleError) throw scheduleError;
  const schedules = (scheduleData ?? []) as SellingScheduleRow[];
  const scheduleIds = schedules.map(schedule => schedule.id);
  if (scheduleIds.length === 0) return [];

  const [windowResult, assignmentResult] = await Promise.all([
    supabase
      .from('selling_schedule_windows')
      .select('id, schedule_id, iso_weekday, all_day, opens_at, closes_at')
      .in('schedule_id', scheduleIds),
    supabase
      .from('listing_selling_schedules')
      .select('listing_id, schedule_id')
      .in('schedule_id', scheduleIds),
  ]);
  if (windowResult.error) throw windowResult.error;
  if (assignmentResult.error) throw assignmentResult.error;
  const windows = (windowResult.data ?? []) as SellingScheduleWindowRow[];
  const assignments = (assignmentResult.data ?? []) as ListingScheduleAssignmentRow[];
  return schedules.map(schedule => mapSellingSchedule(schedule, windows, assignments));
}

async function assertCookListings(cookId: string, listingIds: string[]): Promise<void> {
  if (listingIds.length === 0) return;
  const { data, error } = await supabase
    .from('listings')
    .select('id')
    .eq('cook_id', cookId)
    .in('id', listingIds);
  if (error) throw error;
  if ((data ?? []).length !== listingIds.length) {
    throw new Error('One or more selected dishes do not belong to this cook.');
  }
}

export async function saveSellingSchedule(
  cookId: string,
  input: SellingScheduleInput,
  scheduleId?: string
): Promise<SellingSchedule> {
  const uniqueListingIds = [...new Set(input.listingIds)];
  await assertCookListings(cookId, uniqueListingIds);
  const timestamp = new Date().toISOString();
  const schedulePayload = {
    cook_id: cookId,
    name: input.name,
    specific_dates: input.specificDates,
    starts_on: input.specificDates ? input.startsOn : null,
    ends_on: input.specificDates ? input.endsOn : null,
    updated_at: timestamp,
  };

  let savedId = scheduleId;
  if (scheduleId) {
    const { data, error } = await supabase
      .from('selling_schedules')
      .update(schedulePayload)
      .eq('id', scheduleId)
      .eq('cook_id', cookId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Selling schedule not found.');
  } else {
    const { data, error } = await supabase
      .from('selling_schedules')
      .insert({ ...schedulePayload, created_at: timestamp })
      .select('id')
      .single();
    if (error) throw error;
    savedId = data.id;
  }
  if (!savedId) throw new Error('Selling schedule could not be saved.');

  const { error: deleteWindowsError } = await supabase
    .from('selling_schedule_windows')
    .delete()
    .eq('schedule_id', savedId);
  if (deleteWindowsError) throw deleteWindowsError;
  if (input.windows.length > 0) {
    const { error } = await supabase.from('selling_schedule_windows').insert(
      input.windows.map(window => ({
        schedule_id: savedId,
        iso_weekday: window.isoWeekday,
        all_day: window.allDay,
        opens_at: window.allDay ? null : window.opensAt,
        closes_at: window.allDay ? null : window.closesAt,
      }))
    );
    if (error) throw error;
  }

  const { error: deleteAssignmentsError } = await supabase
    .from('listing_selling_schedules')
    .delete()
    .eq('schedule_id', savedId);
  if (deleteAssignmentsError) throw deleteAssignmentsError;
  if (uniqueListingIds.length > 0) {
    const { error } = await supabase.from('listing_selling_schedules').upsert(
      uniqueListingIds.map(listingId => ({
        listing_id: listingId,
        schedule_id: savedId,
        assigned_at: timestamp,
      })),
      { onConflict: 'listing_id' }
    );
    if (error) throw error;
  }

  const schedules = await getSellingSchedulesForCook(cookId);
  const saved = schedules.find(schedule => schedule.id === savedId);
  if (!saved) throw new Error('Selling schedule could not be reloaded.');
  return saved;
}

export async function assignListingSellingSchedule(
  cookId: string,
  listingId: string,
  scheduleId: string | null
): Promise<boolean> {
  await assertCookListings(cookId, [listingId]);
  if (!scheduleId) {
    const { error } = await supabase
      .from('listing_selling_schedules')
      .delete()
      .eq('listing_id', listingId);
    if (error) throw error;
    return true;
  }
  const { data: schedule, error: scheduleError } = await supabase
    .from('selling_schedules')
    .select('id')
    .eq('id', scheduleId)
    .eq('cook_id', cookId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule) return false;
  const { error } = await supabase.from('listing_selling_schedules').upsert(
    {
      listing_id: listingId,
      schedule_id: scheduleId,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id' }
  );
  if (error) throw error;
  return true;
}

export async function deleteSellingSchedule(cookId: string, scheduleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('selling_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('cook_id', cookId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function updateListingAvailabilitySettings(
  cookId: string,
  listingId: string,
  changes: {
    enabled?: boolean;
    maxOrdersPerWindow?: number;
    dailyStockLimit?: number | null;
  }
): Promise<AvailabilitySettings | null> {
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .eq('cook_id', cookId)
    .maybeSingle();
  if (listingError) throw listingError;
  if (!listing) return null;

  if (changes.dailyStockLimit != null) {
    const { data: futureCapacity, error: futureCapacityError } = await supabase
      .from('listing_daily_capacity')
      .select('service_date, orders_taken')
      .eq('listing_id', listingId)
      .gte('service_date', getDateKeyInTimeZone());
    if (futureCapacityError && !missingRelation(futureCapacityError)) throw futureCapacityError;
    const reservedByDate = new Map<string, number>();
    for (const row of (futureCapacity ?? []) as Array<{
      service_date: string;
      orders_taken: number;
    }>) {
      const date = normalizeDate(row.service_date) ?? row.service_date;
      reservedByDate.set(date, (reservedByDate.get(date) ?? 0) + Number(row.orders_taken));
    }
    const overLimit = [...reservedByDate.entries()].find(
      ([, reserved]) => reserved > changes.dailyStockLimit!
    );
    if (overLimit) {
      throw new Error(
        `${overLimit[1]} portions are already committed for ${overLimit[0]}. Choose a daily limit of at least ${overLimit[1]}.`
      );
    }
  }

  const existing = (await fetchSettings([listingId]))[0];
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('listing_availability_settings')
    .upsert(
      {
        listing_id: listingId,
        enabled: changes.enabled ?? existing?.enabled ?? true,
        schedule_mode: 'restaurant_hours',
        max_orders_per_window: changes.maxOrdersPerWindow ?? existing?.max_orders_per_window ?? 5,
        daily_stock_limit:
          changes.dailyStockLimit === undefined
            ? (existing?.daily_stock_limit ?? null)
            : changes.dailyStockLimit,
        configured_at: existing?.configured_at ?? now,
        updated_at: now,
      },
      { onConflict: 'listing_id' }
    )
    .select(
      'listing_id, enabled, schedule_mode, max_orders_per_window, daily_stock_limit, configured_at, updated_at'
    )
    .single();
  if (error) throw error;
  return mapSetting(data as AvailabilitySettingRow);
}

export async function setListingAvailabilityForDate(
  cookId: string,
  actorUserId: string,
  listingId: string,
  available: boolean,
  now = new Date()
): Promise<{
  listingId: string;
  date: string;
  available: boolean;
  state: 'available' | 'sold_out';
} | null> {
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .eq('cook_id', cookId)
    .maybeSingle();
  if (listingError) throw listingError;
  if (!listing) return null;

  const date = getDateKeyInTimeZone(now);
  const state = available ? 'available' : 'sold_out';
  const timestamp = now.toISOString();
  const { error } = await supabase.from('listing_availability_overrides').upsert(
    {
      listing_id: listingId,
      service_date: date,
      state,
      created_by: actorUserId,
      updated_at: timestamp,
    },
    { onConflict: 'listing_id,service_date' }
  );
  if (error) throw error;
  return { listingId, date, available, state };
}
