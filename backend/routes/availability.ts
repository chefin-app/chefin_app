import express from 'express';
import type { NextFunction, Response } from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import {
  assignListingSellingSchedule,
  deleteSellingSchedule,
  getCookMenu,
  deleteSpecialHours,
  getListingAvailability,
  getListingAvailabilityBatch,
  getOpeningHoursForCook,
  getSellingSchedulesForCook,
  getSpecialHoursForCook,
  normalizeTime,
  replaceOpeningHours,
  replaceSpecialHours,
  saveSellingSchedule,
  setListingAvailabilityForDate,
  updateListingAvailabilitySettings,
} from '../availabilityService';
import { notifyFavouritersNewSlots } from '../notifications';
import { supabase } from '../supabaseClient';

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const requireCookWorkspace = async (req: AccountRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('cook_applications')
      .select('id')
      .eq('user_id', req.account!.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(403).json({ error: 'Complete the cook application to manage availability.' });
      return;
    }
    next();
  } catch (error: unknown) {
    console.error('Cook workspace check failed:', error);
    res.status(503).json({ error: 'Cook access could not be verified right now.' });
  }
};

type OpeningHoursInput = {
  isoWeekday?: unknown;
  opensAt?: unknown;
  closesAt?: unknown;
  enabled?: unknown;
};

const parseOpeningHours = (
  value: unknown
):
  | {
      ok: true;
      windows: Array<{
        isoWeekday: number;
        opensAt: string;
        closesAt: string;
        enabled: boolean;
      }>;
    }
  | { ok: false; error: string } => {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'windows must be an array.' };
  }

  const windows = [] as Array<{
    isoWeekday: number;
    opensAt: string;
    closesAt: string;
    enabled: boolean;
  }>;
  const uniqueWindows = new Set<string>();
  for (const raw of value) {
    const window = raw as OpeningHoursInput;
    const isoWeekday = Number(window.isoWeekday);
    const opensAt = normalizeTime(window.opensAt);
    const closesAt = normalizeTime(window.closesAt);
    const enabled = window.enabled === undefined ? true : window.enabled;
    if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
      return { ok: false, error: 'Each isoWeekday must be an integer from 1 to 7.' };
    }
    if (!opensAt || !closesAt || opensAt >= closesAt) {
      return {
        ok: false,
        error: 'Each opening window needs valid opensAt and closesAt times, with opening first.',
      };
    }
    if (typeof enabled !== 'boolean') {
      return { ok: false, error: 'Each enabled value must be a boolean.' };
    }
    const key = `${isoWeekday}_${opensAt}_${closesAt}`;
    if (uniqueWindows.has(key)) {
      return { ok: false, error: 'Opening hours cannot contain duplicate windows.' };
    }
    uniqueWindows.add(key);
    windows.push({ isoWeekday, opensAt, closesAt, enabled });
  }
  for (let isoWeekday = 1; isoWeekday <= 7; isoWeekday += 1) {
    const dayWindows = windows
      .filter(window => window.enabled && window.isoWeekday === isoWeekday)
      .sort((left, right) => left.opensAt.localeCompare(right.opensAt));
    if (
      dayWindows.some(
        (window, index) => index > 0 && window.opensAt < dayWindows[index - 1].closesAt
      )
    ) {
      return { ok: false, error: 'Opening windows on the same day cannot overlap.' };
    }
  }
  return { ok: true, windows };
};

const parseSellingSchedule = (value: unknown) => {
  const body = (value ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const specificDates = body.specificDates === true;
  const startsOn = specificDates ? String(body.startsOn ?? '') : null;
  const endsOn = specificDates ? String(body.endsOn ?? '') : null;
  const rawListingIds = Array.isArray(body.listingIds) ? body.listingIds.map(String) : [];
  const listingIds = [...new Set(rawListingIds)];
  if (name.length < 2 || name.length > 80) {
    return { ok: false as const, error: 'Name must be between 2 and 80 characters.' };
  }
  if (
    specificDates &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endsOn ?? '') ||
      (startsOn ?? '') > (endsOn ?? ''))
  ) {
    return { ok: false as const, error: 'Choose a valid start and end date.' };
  }
  if (listingIds.length > 500 || listingIds.some(id => !UUID_PATTERN.test(id))) {
    return { ok: false as const, error: 'listingIds must contain at most 500 valid dish IDs.' };
  }
  if (!Array.isArray(body.windows)) {
    return { ok: false as const, error: 'windows must be an array.' };
  }
  const windows: Array<{
    isoWeekday: number;
    allDay: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }> = [];
  for (const rawWindow of body.windows) {
    const window = rawWindow as Record<string, unknown>;
    const isoWeekday = Number(window.isoWeekday);
    const allDay = window.allDay === true;
    const opensAt = allDay ? null : normalizeTime(window.opensAt);
    const closesAt = allDay ? null : normalizeTime(window.closesAt);
    if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
      return { ok: false as const, error: 'Each schedule day must be from Monday to Sunday.' };
    }
    if (!allDay && (!opensAt || !closesAt || opensAt >= closesAt)) {
      return { ok: false as const, error: 'Each period needs a valid opening and closing time.' };
    }
    windows.push({ isoWeekday, allDay, opensAt, closesAt });
  }
  if (windows.length === 0) {
    return { ok: false as const, error: 'Enable at least one day.' };
  }
  for (let day = 1; day <= 7; day += 1) {
    const dayWindows = windows.filter(window => window.isoWeekday === day);
    if (dayWindows.some(window => window.allDay) && dayWindows.length > 1) {
      return { ok: false as const, error: 'An all-day schedule cannot have extra periods.' };
    }
    const timed = dayWindows
      .filter(window => !window.allDay)
      .sort((left, right) => String(left.opensAt).localeCompare(String(right.opensAt)));
    if (
      timed.some(
        (window, index) => index > 0 && String(window.opensAt) < String(timed[index - 1].closesAt)
      )
    ) {
      return { ok: false as const, error: 'Selling periods on the same day cannot overlap.' };
    }
  }
  return {
    ok: true as const,
    input: { name, specificDates, startsOn, endsOn, windows, listingIds },
  };
};

// Static cook routes must be registered before the public /:listingId route.
router.get(
  '/cook/menu',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      res.json(await getCookMenu(req.account!.profileId));
    } catch (error: unknown) {
      console.error('Cook menu availability failed:', error);
      res
        .status(500)
        .json({ error: errorMessage(error, 'Menu availability could not be loaded.') });
    }
  }
);

router.get(
  '/cook/opening-hours',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      const [openingHours, specialHours] = await Promise.all([
        getOpeningHoursForCook(req.account!.profileId),
        getSpecialHoursForCook(req.account!.profileId),
      ]);
      res.json({ openingHours, specialHours });
    } catch (error: unknown) {
      console.error('Business-hours lookup failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Business hours could not be loaded.') });
    }
  }
);

const STORE_STATUSES = new Set(['open', 'busy', 'paused']);
const PAUSE_MAX_MS = 31 * 24 * 60 * 60 * 1000;

router.get(
  '/cook/store-status',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('store_status, store_busy_prep_minutes, store_paused_until')
        .eq('id', req.account!.profileId)
        .single();
      if (error) throw error;
      // An expired pause reads back as open so clients never have to reason
      // about stale pause windows.
      const pauseActive =
        data.store_status === 'paused' &&
        data.store_paused_until &&
        new Date(data.store_paused_until).getTime() > Date.now();
      const storeStatus =
        data.store_status === 'paused' && !pauseActive ? 'open' : (data.store_status ?? 'open');
      res.json({
        storeStatus,
        busyPrepMinutes: data.store_busy_prep_minutes ?? 15,
        pausedUntil: storeStatus === 'paused' ? data.store_paused_until : null,
      });
    } catch (error: unknown) {
      console.error('Store-status lookup failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Store status could not be loaded.') });
    }
  }
);

router.patch(
  '/cook/store-status',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { status, busyPrepMinutes, pausedUntil } = (req.body ?? {}) as {
      status?: string;
      busyPrepMinutes?: number;
      pausedUntil?: string;
    };
    if (!status || !STORE_STATUSES.has(status)) {
      return res.status(400).json({ error: "status must be 'open', 'busy' or 'paused'." });
    }

    const patch: Record<string, unknown> = { store_status: status, store_paused_until: null };
    if (status === 'busy') {
      if (
        !Number.isInteger(busyPrepMinutes) ||
        (busyPrepMinutes as number) < 5 ||
        (busyPrepMinutes as number) > 240
      ) {
        return res
          .status(400)
          .json({ error: 'busyPrepMinutes must be a whole number from 5 to 240.' });
      }
      patch.store_busy_prep_minutes = busyPrepMinutes;
    }
    if (status === 'paused') {
      const until = pausedUntil ? new Date(pausedUntil) : null;
      if (!until || Number.isNaN(until.getTime())) {
        return res.status(400).json({ error: 'pausedUntil must be a valid timestamp.' });
      }
      const now = Date.now();
      if (until.getTime() <= now || until.getTime() > now + PAUSE_MAX_MS) {
        return res
          .status(400)
          .json({ error: 'pausedUntil must be in the future and within 31 days.' });
      }
      patch.store_paused_until = until.toISOString();
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', req.account!.profileId);
      if (error) throw error;
      res.json({ success: true, storeStatus: status });
    } catch (error: unknown) {
      console.error('Store-status update failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Store status could not be saved.') });
    }
  }
);

router.get(
  '/cook/selling-schedules',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      const [schedules, listings] = await Promise.all([
        getSellingSchedulesForCook(req.account!.profileId),
        supabase
          .from('listings')
          .select('id, title, image_url, menu_category, status')
          .eq('cook_id', req.account!.profileId)
          .order('title', { ascending: true }),
      ]);
      if (listings.error) throw listings.error;
      res.json({ schedules, listings: listings.data ?? [] });
    } catch (error: unknown) {
      console.error('Selling-schedule lookup failed:', error);
      res
        .status(500)
        .json({ error: errorMessage(error, 'Selling schedules could not be loaded.') });
    }
  }
);

router.post(
  '/cook/selling-schedules',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const parsed = parseSellingSchedule(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const schedule = await saveSellingSchedule(req.account!.profileId, parsed.input);
      res.status(201).json({ success: true, schedule });
    } catch (error: unknown) {
      console.error('Selling-schedule creation failed:', error);
      res
        .status(500)
        .json({ error: errorMessage(error, 'Selling schedule could not be created.') });
    }
  }
);

router.put(
  '/cook/selling-schedules/:scheduleId',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    if (!UUID_PATTERN.test(req.params.scheduleId)) {
      return res.status(400).json({ error: 'A valid scheduleId is required.' });
    }
    const parsed = parseSellingSchedule(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const schedule = await saveSellingSchedule(
        req.account!.profileId,
        parsed.input,
        req.params.scheduleId
      );
      res.json({ success: true, schedule });
    } catch (error: unknown) {
      console.error('Selling-schedule update failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Selling schedule could not be saved.') });
    }
  }
);

router.delete(
  '/cook/selling-schedules/:scheduleId',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    if (!UUID_PATTERN.test(req.params.scheduleId)) {
      return res.status(400).json({ error: 'A valid scheduleId is required.' });
    }
    try {
      const deleted = await deleteSellingSchedule(req.account!.profileId, req.params.scheduleId);
      if (!deleted) return res.status(404).json({ error: 'Selling schedule not found.' });
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Selling-schedule deletion failed:', error);
      res
        .status(500)
        .json({ error: errorMessage(error, 'Selling schedule could not be deleted.') });
    }
  }
);

router.patch(
  '/cook/listings/:listingId/selling-schedule',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    if (!UUID_PATTERN.test(req.params.listingId)) {
      return res.status(400).json({ error: 'A valid listingId is required.' });
    }
    const scheduleId = req.body.scheduleId == null ? null : String(req.body.scheduleId);
    if (scheduleId && !UUID_PATTERN.test(scheduleId)) {
      return res.status(400).json({ error: 'scheduleId must be a valid ID or null.' });
    }
    try {
      const assigned = await assignListingSellingSchedule(
        req.account!.profileId,
        req.params.listingId,
        scheduleId
      );
      if (!assigned) return res.status(404).json({ error: 'Dish or selling schedule not found.' });
      res.json({ success: true, listingId: req.params.listingId, scheduleId });
    } catch (error: unknown) {
      console.error('Dish selling-schedule assignment failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Dish schedule could not be updated.') });
    }
  }
);

router.put(
  '/cook/opening-hours',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const parsed = parseOpeningHours(req.body.windows);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (
      req.body.applyToAllListings !== undefined &&
      typeof req.body.applyToAllListings !== 'boolean'
    ) {
      return res.status(400).json({ error: 'applyToAllListings must be a boolean.' });
    }

    try {
      const result = await replaceOpeningHours(
        req.account!.profileId,
        parsed.windows,
        req.body.applyToAllListings === true
      );
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      console.error('Opening-hours update failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Opening hours could not be saved.') });
    }
  }
);

router.put(
  '/cook/special-hours',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const dates = Array.isArray(req.body.dates) ? req.body.dates.map(String) : [];
    const description =
      String(req.body.description ?? '')
        .trim()
        .slice(0, 120) || null;
    const isClosed = req.body.isClosed;
    const rawWindows: unknown[] = Array.isArray(req.body.windows) ? req.body.windows : [];
    if (dates.length === 0 || dates.length > 31) {
      return res.status(400).json({ error: 'Choose between 1 and 31 dates.' });
    }
    if (typeof isClosed !== 'boolean') {
      return res.status(400).json({ error: 'isClosed must be a boolean.' });
    }
    const windows = rawWindows.map(value => {
      const window = value as { opensAt?: unknown; closesAt?: unknown };
      return {
        opensAt: normalizeTime(window.opensAt),
        closesAt: normalizeTime(window.closesAt),
      };
    });
    if (
      !isClosed &&
      (windows.length === 0 ||
        windows.some(
          window => !window.opensAt || !window.closesAt || window.opensAt >= window.closesAt
        ))
    ) {
      return res.status(400).json({ error: 'Open special hours need valid opening windows.' });
    }
    const sortedWindows = windows
      .filter((window): window is { opensAt: string; closesAt: string } =>
        Boolean(window.opensAt && window.closesAt)
      )
      .sort((left, right) => left.opensAt.localeCompare(right.opensAt));
    if (
      !isClosed &&
      sortedWindows.some(
        (window, index) => index > 0 && window.opensAt < sortedWindows[index - 1].closesAt
      )
    ) {
      return res.status(400).json({ error: 'Special opening windows cannot overlap.' });
    }

    try {
      const specialHours = await replaceSpecialHours(
        req.account!.profileId,
        dates,
        description,
        isClosed,
        sortedWindows
      );
      res.json({ success: true, specialHours });
    } catch (error: unknown) {
      console.error('Special-hours update failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Special hours could not be saved.') });
    }
  }
);

router.delete(
  '/cook/special-hours/:serviceDate',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      await deleteSpecialHours(req.account!.profileId, req.params.serviceDate);
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Special-hours removal failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Special hours could not be removed.') });
    }
  }
);

router.patch(
  '/cook/listings/:listingId/orders',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { listingId } = req.params;
    if (!UUID_PATTERN.test(listingId)) {
      return res.status(400).json({ error: 'A valid listingId is required.' });
    }
    if (typeof req.body.available !== 'boolean') {
      return res.status(400).json({ error: 'available must be a boolean.' });
    }

    try {
      const result = await setListingAvailabilityForDate(
        req.account!.profileId,
        req.account!.userId,
        listingId,
        req.body.available
      );
      if (!result) return res.status(404).json({ error: 'Dish not found.' });
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      console.error('Today availability update failed:', error);
      res
        .status(500)
        .json({ error: errorMessage(error, 'Dish availability could not be updated.') });
    }
  }
);

router.patch(
  '/cook/listings/:listingId/settings',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { listingId } = req.params;
    if (!UUID_PATTERN.test(listingId)) {
      return res.status(400).json({ error: 'A valid listingId is required.' });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const nestedSettings =
      body.settings && typeof body.settings === 'object'
        ? (body.settings as Record<string, unknown>)
        : {};
    const readBodyField = (...keys: string[]): unknown => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
        if (Object.prototype.hasOwnProperty.call(nestedSettings, key)) return nestedSettings[key];
      }
      return undefined;
    };
    const enabled = readBodyField('enabled');
    const maxOrdersPerWindow = readBodyField('maxOrdersPerWindow', 'max_orders_per_window');
    const rawDailyStockLimit = readBodyField(
      'dailyStockLimit',
      'daily_stock_limit',
      'portionsPerDay'
    );
    const dailyStockLimit =
      rawDailyStockLimit === undefined || rawDailyStockLimit === null
        ? rawDailyStockLimit
        : typeof rawDailyStockLimit === 'string' && rawDailyStockLimit.trim() !== ''
          ? Number(rawDailyStockLimit)
          : rawDailyStockLimit;
    if (
      enabled === undefined &&
      maxOrdersPerWindow === undefined &&
      dailyStockLimit === undefined
    ) {
      return res.status(400).json({
        error: 'Provide a daily portion limit, unlimited stock, or availability setting.',
      });
    }
    if (
      dailyStockLimit !== undefined &&
      dailyStockLimit !== null &&
      (typeof dailyStockLimit !== 'number' ||
        !Number.isInteger(dailyStockLimit) ||
        dailyStockLimit < 1 ||
        dailyStockLimit > 10000)
    ) {
      return res
        .status(400)
        .json({ error: 'dailyStockLimit must be null or an integer from 1 to 10000.' });
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean.' });
    }
    if (
      maxOrdersPerWindow !== undefined &&
      (typeof maxOrdersPerWindow !== 'number' ||
        !Number.isInteger(maxOrdersPerWindow) ||
        maxOrdersPerWindow < 1 ||
        maxOrdersPerWindow > 1000)
    ) {
      return res
        .status(400)
        .json({ error: 'maxOrdersPerWindow must be an integer from 1 to 1000.' });
    }

    try {
      const settings = await updateListingAvailabilitySettings(req.account!.profileId, listingId, {
        enabled: enabled as boolean | undefined,
        maxOrdersPerWindow: maxOrdersPerWindow as number | undefined,
        dailyStockLimit: dailyStockLimit as number | null | undefined,
      });
      if (!settings) return res.status(404).json({ error: 'Dish not found.' });
      res.json({ success: true, settings });
    } catch (error: unknown) {
      console.error('Dish availability settings update failed:', error);
      const message = errorMessage(error, 'Dish availability settings could not be updated.');
      if (
        message.includes('daily_stock_limit') &&
        (message.toLowerCase().includes('column') || message.toLowerCase().includes('schema cache'))
      ) {
        return res.status(503).json({
          error:
            'Daily stock is not installed in the database yet. Apply the daily dish stock migration, then restart the backend.',
        });
      }
      res.status(message.includes('already committed') ? 409 : 500).json({ error: message });
    }
  }
);

// Transitional alias for older cook clients.
router.get(
  '/menu-availability',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      res.json(await getCookMenu(req.account!.profileId));
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: errorMessage(error, 'Menu availability could not be loaded.') });
    }
  }
);

router.post(
  '/announce-slots',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    if (req.body.userId && req.body.userId !== req.account!.userId) {
      return res
        .status(403)
        .json({ error: 'The request user does not match the signed-in account.' });
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, restaurant_name, full_name')
        .eq('id', req.account!.profileId)
        .single();
      if (profileError || !profile) return res.status(404).json({ error: 'Profile not found.' });

      const { count, error: countError } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('cook_id', req.account!.profileId);
      if (countError) throw countError;
      if (!count) return res.status(403).json({ error: 'No dishes found for this cook.' });

      await notifyFavouritersNewSlots(
        profile.id,
        profile.restaurant_name || profile.full_name || 'A cook you favourited'
      );
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Error announcing slots:', error);
      res.status(500).json({ error: errorMessage(error, 'Slots could not be announced.') });
    }
  }
);

// Legacy dated-row endpoint retained for older calendar clients, now with
// authentication and an explicit ownership check.
router.post(
  '/toggle-availability',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { id, is_available: isAvailable } = req.body as {
      id?: string;
      is_available?: boolean;
    };
    if (!id || !UUID_PATTERN.test(id) || typeof isAvailable !== 'boolean') {
      return res.status(400).json({ error: 'A valid id and boolean is_available are required.' });
    }

    try {
      const { data: availability, error: lookupError } = await supabase
        .from('availability')
        .select('id, listing_id, listings(cook_id)')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      const owner = Array.isArray(availability?.listings)
        ? availability.listings[0]
        : availability?.listings;
      if (!availability || owner?.cook_id !== req.account!.profileId) {
        return res.status(404).json({ error: 'Availability row not found.' });
      }

      const { data, error } = await supabase
        .from('availability')
        .update({ is_available: isAvailable })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      res.json({ availability: data });
    } catch (error: unknown) {
      console.error('Legacy availability update failed:', error);
      res.status(500).json({ error: errorMessage(error, 'Availability could not be updated.') });
    }
  }
);

router.post('/batch', async (req, res) => {
  const rawListingIds: unknown[] = Array.isArray(req.body.listingIds) ? req.body.listingIds : [];
  const listingIds: string[] = [...new Set(rawListingIds.map((value: unknown) => String(value)))];
  if (
    listingIds.length === 0 ||
    listingIds.length > 500 ||
    listingIds.some(listingId => !UUID_PATTERN.test(listingId))
  ) {
    return res.status(400).json({ error: 'Provide between 1 and 500 valid listingIds.' });
  }
  const requestedDays = Number(req.body.days ?? 30);
  const horizonDays = Number.isInteger(requestedDays)
    ? Math.min(Math.max(requestedDays, 1), 90)
    : 30;

  try {
    const results = await getListingAvailabilityBatch(listingIds, horizonDays);
    res.json({
      availability: Object.values(results).flatMap(result => result.records),
      summaries: Object.fromEntries(
        Object.entries(results).map(([listingId, result]) => [
          listingId,
          {
            currentlyAvailable: result.currentlyAvailable,
            remainingSlots: result.remainingSlots,
            source: result.source,
            constrainedBySellingSchedule: result.constrainedBySellingSchedule,
          },
        ])
      ),
    });
  } catch (error: unknown) {
    console.error('Batch availability failed:', error);
    res.status(500).json({ error: errorMessage(error, 'Availability could not be loaded.') });
  }
});

// Public customer endpoint. The generated recurring windows and legacy rows
// share the old response fields so existing date/time pickers keep working.
router.get('/:listingId', async (req, res) => {
  const { listingId } = req.params;
  if (!UUID_PATTERN.test(listingId)) {
    return res.status(400).json({ error: 'A valid listingId is required.' });
  }
  const requestedDays = Number(req.query.days ?? 30);
  const horizonDays = Number.isInteger(requestedDays)
    ? Math.min(Math.max(requestedDays, 1), 90)
    : 30;

  try {
    const result = await getListingAvailability(listingId, horizonDays);
    res.json({
      available: result.currentlyAvailable,
      currentlyAvailable: result.currentlyAvailable,
      remainingSlots: result.remainingSlots,
      source: result.source,
      constrainedBySellingSchedule: result.constrainedBySellingSchedule,
      availability: result.records,
    });
  } catch (error: unknown) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: errorMessage(error, 'Availability could not be loaded.') });
  }
});

export default router;
