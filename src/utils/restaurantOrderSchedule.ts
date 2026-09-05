import {
  AVAILABILITY_TIME_ZONE,
  getLocalDateKey,
  type AvailabilityRecord,
} from '@/src/utils/listingAvailability';

export type RestaurantOrderSelection =
  | { mode: 'asap' }
  | {
      mode: 'scheduled';
      serviceDate: string;
      startTime: string;
      endTime: string;
    };

export interface RestaurantOrderSlot {
  id: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  label: string;
}

export interface RestaurantScheduleDay {
  serviceDate: string;
  weekdayLabel: string;
  dayNumber: string;
  isToday: boolean;
  slots: RestaurantOrderSlot[];
}

export interface ListingScheduleMatch {
  available: boolean;
  serviceDate?: string;
  startTime?: string;
  endTime?: string;
  remainingSlots: number;
}

export interface ClosedRestaurantOrderCopy {
  bannerDetail: string;
  promptDetail: string;
}

const MALAYSIA_UTC_OFFSET = '+08:00';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_INTERVAL_MINUTES = 30;

function getServiceDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const check = new Date(Date.UTC(year, monthIndex, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== monthIndex ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function addServiceDays(serviceDate: string, days: number): string {
  const [year, month, day] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function getDayStart(serviceDate: string): Date {
  return new Date(`${serviceDate}T00:00:00${MALAYSIA_UTC_OFFSET}`);
}

function parseBoundary(
  value: string | null | undefined,
  serviceDate: string,
  fallback: 'start' | 'end'
): Date {
  const boundary = value?.trim();
  if (boundary) {
    const timeOnly = boundary.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
    if (timeOnly) {
      const [, hourText, minuteText, secondText = '0'] = timeOnly;
      const date = new Date(
        `${serviceDate}T${hourText.padStart(2, '0')}:${minuteText}:${secondText.padStart(2, '0')}${MALAYSIA_UTC_OFFSET}`
      );
      if (!Number.isNaN(date.getTime())) return date;
    }

    const timestamp = new Date(boundary);
    if (!Number.isNaN(timestamp.getTime())) return timestamp;
  }

  const dayStart = getDayStart(serviceDate);
  return fallback === 'start' ? dayStart : new Date(dayStart.getTime() + DAY_MS);
}

function getRemainingCapacity(record: AvailabilityRecord): number {
  const maxOrders = Number(record.max_orders);
  const ordersTaken = Number(record.orders_taken ?? 0);
  if (
    record.is_available === false ||
    !Number.isFinite(maxOrders) ||
    !Number.isFinite(ordersTaken)
  ) {
    return 0;
  }
  return Math.max(0, maxOrders - ordersTaken);
}

function getTimeParts(date: Date): { hour: number; minute: string; period: 'AM' | 'PM' } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AVAILABILITY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00';
  const period =
    parts.find(part => part.type === 'dayPeriod')?.value.toUpperCase() === 'PM' ? 'PM' : 'AM';
  return { hour, minute, period };
}

function formatTimeRange(start: Date, end: Date): string {
  const startParts = getTimeParts(start);
  const endParts = getTimeParts(end);
  const startClock = `${startParts.hour}:${startParts.minute}`;
  const endClock = `${endParts.hour}:${endParts.minute}`;
  return startParts.period === endParts.period
    ? `${startClock} – ${endClock} ${endParts.period}`
    : `${startClock} ${startParts.period} – ${endClock} ${endParts.period}`;
}

function getDayDisplayParts(serviceDate: string): { weekdayLabel: string; dayNumber: string } {
  const parts = new Intl.DateTimeFormat('en-MY', {
    timeZone: AVAILABILITY_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(getDayStart(serviceDate));
  return {
    weekdayLabel: parts.find(part => part.type === 'weekday')?.value ?? '',
    dayNumber: parts.find(part => part.type === 'day')?.value ?? '',
  };
}

function getLongDateLabel(serviceDate: string): string {
  const parts = new Intl.DateTimeFormat('en-MY', {
    timeZone: AVAILABILITY_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(getDayStart(serviceDate));
  const weekday = parts.find(part => part.type === 'weekday')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return weekday && day && month ? `${weekday}, ${day} ${month}` : serviceDate;
}

function formatSingleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: AVAILABILITY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/\b(am|pm)\b/i, period => period.toUpperCase());
}

/**
 * Whether the restaurant's configured service window is open right now.
 * Capacity is deliberately ignored so a sold-out open restaurant is not
 * incorrectly described as closed.
 */
export function isRestaurantWithinOrderingWindow(
  records: AvailabilityRecord[],
  now = new Date()
): boolean {
  const today = getLocalDateKey(now);
  return records.some(record => {
    const serviceDate = getServiceDate(record.available_date);
    if (serviceDate !== today) return false;
    const start = parseBoundary(record.start_time, serviceDate, 'start');
    const end = parseBoundary(record.end_time, serviceDate, 'end');
    return start.getTime() <= now.getTime() && now.getTime() < end.getTime();
  });
}

/** Builds day-aware closed-state copy from the earliest actually bookable slot. */
export function getClosedRestaurantOrderCopy(
  days: RestaurantScheduleDay[],
  now = new Date()
): ClosedRestaurantOrderCopy | null {
  const nextDay = days.find(day => day.slots.length > 0);
  const nextSlot = nextDay?.slots[0];
  if (!nextDay || !nextSlot) return null;

  const time = formatSingleTime(nextSlot.startTime);
  if (!time) return null;
  const tomorrow = addServiceDays(getLocalDateKey(now), 1);
  const dayLabel = nextDay.isToday
    ? 'today'
    : nextDay.serviceDate === tomorrow
      ? 'tomorrow'
      : getLongDateLabel(nextDay.serviceDate);
  return {
    bannerDetail: `Order for ${dayLabel}, ${time} or later`,
    promptDetail: `${dayLabel} at ${time}`,
  };
}

/**
 * Builds the restaurant-wide union of selectable pickup windows. The default
 * horizon includes today, tomorrow, and the following day.
 */
export function buildRestaurantScheduleDays(
  records: AvailabilityRecord[],
  now = new Date(),
  horizonDays = 2,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES
): RestaurantScheduleDay[] {
  const today = getLocalDateKey(now);
  const safeHorizon = Number.isFinite(horizonDays) ? Math.max(0, Math.floor(horizonDays)) : 2;
  const safeInterval =
    Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? Math.floor(intervalMinutes)
      : DEFAULT_INTERVAL_MINUTES;
  const intervalMs = safeInterval * MINUTE_MS;
  const slotsByDate = new Map<string, Map<string, RestaurantOrderSlot>>();

  for (let offset = 0; offset <= safeHorizon; offset += 1) {
    slotsByDate.set(addServiceDays(today, offset), new Map());
  }

  for (const record of records) {
    const serviceDate = getServiceDate(record.available_date);
    const slots = serviceDate ? slotsByDate.get(serviceDate) : undefined;
    if (!serviceDate || !slots || getRemainingCapacity(record) <= 0) continue;

    const windowStart = parseBoundary(record.start_time, serviceDate, 'start');
    const windowEnd = parseBoundary(record.end_time, serviceDate, 'end');
    if (windowEnd.getTime() <= windowStart.getTime()) continue;

    for (
      let slotStartMs = windowStart.getTime();
      slotStartMs + intervalMs <= windowEnd.getTime();
      slotStartMs += intervalMs
    ) {
      // Checkout rejects pickup timestamps that are equal to or before now.
      if (slotStartMs <= now.getTime()) continue;
      const slotEndMs = slotStartMs + intervalMs;
      const start = new Date(slotStartMs);
      const end = new Date(slotEndMs);
      const startTime = start.toISOString();
      const endTime = end.toISOString();
      const id = `${serviceDate}|${startTime}|${endTime}`;
      if (!slots.has(id)) {
        slots.set(id, {
          id,
          serviceDate,
          startTime,
          endTime,
          label: formatTimeRange(start, end),
        });
      }
    }
  }

  return [...slotsByDate].map(([serviceDate, slots]) => {
    const display = getDayDisplayParts(serviceDate);
    return {
      serviceDate,
      ...display,
      isToday: serviceDate === today,
      slots: [...slots.values()].sort(
        (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
      ),
    };
  });
}

/**
 * Resolves a restaurant-wide order selection against one dish. This is what
 * lets the menu keep dishes visible while disabling only those that cannot be
 * fulfilled at the chosen time.
 */
export function getListingScheduleMatch(
  records: AvailabilityRecord[],
  listingId: string,
  selection: RestaurantOrderSelection,
  now = new Date()
): ListingScheduleMatch {
  const listingRecords = records
    .filter(record => record.listing_id === listingId)
    .map(record => {
      const serviceDate = getServiceDate(record.available_date);
      if (!serviceDate) return null;
      return {
        serviceDate,
        start: parseBoundary(record.start_time, serviceDate, 'start'),
        end: parseBoundary(record.end_time, serviceDate, 'end'),
        remainingSlots: getRemainingCapacity(record),
      };
    })
    .filter(
      (
        record
      ): record is {
        serviceDate: string;
        start: Date;
        end: Date;
        remainingSlots: number;
      } => Boolean(record && record.remainingSlots > 0 && record.end > record.start)
    );

  if (selection.mode === 'scheduled') {
    const selectedServiceDate = getServiceDate(selection.serviceDate);
    if (!selectedServiceDate) return { available: false, remainingSlots: 0 };
    const selectedStart = parseBoundary(selection.startTime, selectedServiceDate, 'start');
    const selectedEnd = parseBoundary(selection.endTime, selectedServiceDate, 'end');
    if (
      selectedStart.getTime() <= now.getTime() ||
      getLocalDateKey(selectedStart) !== selectedServiceDate
    ) {
      return { available: false, remainingSlots: 0 };
    }

    const matches = listingRecords.filter(
      record =>
        record.serviceDate === selectedServiceDate &&
        record.start.getTime() <= selectedStart.getTime() &&
        selectedStart.getTime() < record.end.getTime()
    );
    if (matches.length === 0) return { available: false, remainingSlots: 0 };

    return {
      available: true,
      serviceDate: selectedServiceDate,
      startTime: selectedStart.toISOString(),
      endTime:
        selectedEnd.getTime() > selectedStart.getTime()
          ? selectedEnd.toISOString()
          : new Date(selectedStart.getTime() + DEFAULT_INTERVAL_MINUTES * MINUTE_MS).toISOString(),
      remainingSlots: Math.max(...matches.map(match => match.remainingSlots)),
    };
  }

  const today = getLocalDateKey(now);
  const intervalMs = DEFAULT_INTERVAL_MINUTES * MINUTE_MS;
  let pickupMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
  if (pickupMs <= now.getTime()) pickupMs += intervalMs;

  const matches = listingRecords.filter(
    record =>
      record.serviceDate === today &&
      record.start.getTime() <= now.getTime() &&
      now.getTime() < record.end.getTime() &&
      pickupMs >= record.start.getTime() &&
      pickupMs < record.end.getTime()
  );
  if (matches.length === 0) return { available: false, remainingSlots: 0 };

  const matchingWindowEnd = Math.max(...matches.map(match => match.end.getTime()));
  return {
    available: true,
    serviceDate: today,
    startTime: new Date(pickupMs).toISOString(),
    endTime: new Date(Math.min(pickupMs + intervalMs, matchingWindowEnd)).toISOString(),
    remainingSlots: Math.max(...matches.map(match => match.remainingSlots)),
  };
}

/** Formats the active restaurant ordering context for banners and chips. */
export function formatOrderSelectionLabel(selection: RestaurantOrderSelection): string {
  if (selection.mode === 'asap') return 'As soon as possible';

  const serviceDate = getServiceDate(selection.serviceDate);
  if (!serviceDate) return 'Scheduled order';
  const start = parseBoundary(selection.startTime, serviceDate, 'start');
  const end = parseBoundary(selection.endTime, serviceDate, 'end');
  if (end.getTime() <= start.getTime()) return getLongDateLabel(serviceDate);
  return `${getLongDateLabel(serviceDate)}, ${formatTimeRange(start, end)}`;
}
