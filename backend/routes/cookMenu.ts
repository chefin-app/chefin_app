import express from 'express';
import type { NextFunction, Response } from 'express';
import type { AccountRequest } from '../accountAccess';
import { requireActiveAccount, requireReadableAccount } from '../accountAccess';
import { getDateKeyInTimeZone } from '../availabilityService';
import { getOptionAvailabilityStatus } from '../menuOptionService';
import { supabase } from '../supabaseClient';

const router = express.Router();
const SELECTION_TYPES = new Set(['single', 'multiple']);
const OPTION_STATUSES = new Set(['in_stock', 'today', 'indefinite']);
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_OPTIONS_PER_GROUP = 100;
const MAX_LINKED_LISTINGS = 500;
const MAX_PRICE_DELTA = 99_999_999.99;

type ParsedOption = {
  id?: string;
  name: string;
  price_delta: number;
  sort_order: number;
};

type ParsedGroup = {
  name: string;
  selectionType: 'single' | 'multiple';
  minSelect: number;
  maxSelect: number;
  options: ParsedOption[];
  listingIds: string[];
};

type OptionOwner = {
  id: string;
  group_id: string;
  menu_option_groups: { cook_id: string } | { cook_id: string }[] | null;
};

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
};

const requireCookWorkspace = async (req: AccountRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('cook_applications')
      .select('id')
      .eq('user_id', req.account!.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(403).json({ error: 'Complete the cook application to manage a menu.' });
      return;
    }
    next();
  } catch (error: unknown) {
    console.error('Cook workspace check failed:', error);
    res.status(503).json({ error: 'Cook access could not be verified right now.' });
  }
};

const parseGroupBody = (body: Record<string, unknown>): ParsedGroup | { error: string } => {
  const name = String(body.name ?? '').trim();
  const selectionType = String(body.selectionType ?? 'single');
  const rawOptions: unknown[] = Array.isArray(body.options) ? body.options : [];
  const rawListingIds: unknown[] = Array.isArray(body.listingIds) ? body.listingIds : [];
  const listingIds = [...new Set(rawListingIds.map(value => String(value).trim()))];

  if (name.length < 2 || name.length > 100) {
    return { error: 'Option group name must be 2–100 characters.' };
  }
  if (!SELECTION_TYPES.has(selectionType)) {
    return { error: 'Selection type must be single or multiple.' };
  }
  if (rawOptions.length === 0 || rawOptions.length > MAX_OPTIONS_PER_GROUP) {
    return { error: `Add 1–${MAX_OPTIONS_PER_GROUP} options.` };
  }
  if (listingIds.length > MAX_LINKED_LISTINGS) {
    return { error: `Link at most ${MAX_LINKED_LISTINGS} dishes at once.` };
  }
  if (listingIds.some(listingId => !UUID_PATTERN.test(listingId))) {
    return { error: 'One or more listing IDs are invalid.' };
  }

  const options: ParsedOption[] = rawOptions.map((value, index) => {
    const option = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const id = option.id == null ? undefined : String(option.id).trim();
    const priceDelta = Number(option.priceDelta ?? 0);
    return {
      ...(id ? { id } : {}),
      name: String(option.name ?? '').trim(),
      price_delta: Math.round(priceDelta * 100) / 100,
      sort_order: index,
    };
  });
  if (options.some(option => option.id && !UUID_PATTERN.test(option.id))) {
    return { error: 'One or more option IDs are invalid.' };
  }
  if (options.some(option => option.name.length < 1 || option.name.length > 100)) {
    return { error: 'Every option needs a 1–100 character name.' };
  }
  if (
    options.some(
      option =>
        !Number.isFinite(option.price_delta) ||
        option.price_delta < 0 ||
        option.price_delta > MAX_PRICE_DELTA
    )
  ) {
    return { error: 'Option surcharges must be valid, non-negative amounts.' };
  }
  const normalizedNames = options.map(option => option.name.toLocaleLowerCase('en-MY'));
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return { error: 'Option names must be unique within a group.' };
  }

  const required = body.required === true;
  const rawMin = Number(body.minSelect ?? (required ? 1 : 0));
  const rawMax = Number(body.maxSelect ?? (selectionType === 'single' ? 1 : options.length));
  const minSelect = selectionType === 'single' ? (required ? 1 : 0) : required ? rawMin : 0;
  const maxSelect = selectionType === 'single' ? 1 : rawMax;
  if (
    !Number.isInteger(minSelect) ||
    !Number.isInteger(maxSelect) ||
    minSelect < 0 ||
    maxSelect < 1 ||
    maxSelect < minSelect ||
    maxSelect > options.length ||
    (required && minSelect < 1)
  ) {
    return { error: 'Selection limits must fit the number of options in the group.' };
  }

  return {
    name,
    selectionType: selectionType as ParsedGroup['selectionType'],
    minSelect,
    maxSelect,
    options,
    listingIds,
  };
};

const verifyOwnedListings = async (cookId: string, listingIds: string[]) => {
  if (listingIds.length === 0) return true;
  const { data, error } = await supabase
    .from('listings')
    .select('id')
    .eq('cook_id', cookId)
    .in('id', listingIds);
  if (error) throw error;
  return (data ?? []).length === listingIds.length;
};

router.get(
  '/option-groups',
  requireReadableAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    try {
      const { data, error } = await supabase
        .from('menu_option_groups')
        .select(
          'id, name, selection_type, min_select, max_select, is_active, created_at, menu_options(id, name, price_delta, is_available, unavailable_until, archived_at, sort_order), listing_option_groups(listing_id, sort_order)'
        )
        .eq('cook_id', req.account!.profileId)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const today = getDateKeyInTimeZone();
      const groups = (data ?? []).map(group => ({
        ...group,
        menu_options: [...(group.menu_options ?? [])]
          .filter(option => !option.archived_at)
          .sort((left, right) => left.sort_order - right.sort_order)
          .map(option => {
            const availability_status = getOptionAvailabilityStatus(option, today);
            return {
              ...option,
              is_available: availability_status === 'in_stock',
              availability_status,
            };
          }),
        listing_option_groups: [...(group.listing_option_groups ?? [])].sort(
          (left, right) => left.sort_order - right.sort_order
        ),
      }));
      res.json({ groups });
    } catch (error: unknown) {
      console.error('Option groups could not be loaded:', error);
      res.status(500).json({ error: 'Option groups could not be loaded.' });
    }
  }
);

router.post(
  '/option-groups',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const parsed = parseGroupBody(req.body ?? {});
    if ('error' in parsed) return res.status(400).json(parsed);

    let createdGroupId: string | null = null;
    try {
      if (!(await verifyOwnedListings(req.account!.profileId, parsed.listingIds))) {
        return res.status(403).json({ error: 'One or more selected dishes are not yours.' });
      }
      const { data: group, error: groupError } = await supabase
        .from('menu_option_groups')
        .insert({
          cook_id: req.account!.profileId,
          name: parsed.name,
          selection_type: parsed.selectionType,
          min_select: parsed.minSelect,
          max_select: parsed.maxSelect,
        })
        .select('id')
        .single();
      if (groupError || !group) throw groupError ?? new Error('Option group was not created.');
      createdGroupId = group.id;

      const { error: optionsError } = await supabase.from('menu_options').insert(
        parsed.options.map(option => ({
          group_id: group.id,
          name: option.name,
          price_delta: option.price_delta,
          sort_order: option.sort_order,
        }))
      );
      if (optionsError) throw optionsError;

      if (parsed.listingIds.length > 0) {
        const { error: linksError } = await supabase.from('listing_option_groups').insert(
          parsed.listingIds.map((listingId, index) => ({
            listing_id: listingId,
            group_id: group.id,
            sort_order: index,
          }))
        );
        if (linksError) throw linksError;
      }
      res.status(201).json({ success: true, groupId: group.id });
    } catch (error: unknown) {
      if (createdGroupId) {
        const { error: cleanupError } = await supabase
          .from('menu_option_groups')
          .delete()
          .eq('id', createdGroupId)
          .eq('cook_id', req.account!.profileId);
        if (cleanupError) console.error('Partial option group cleanup failed:', cleanupError);
      }
      console.error('Option group could not be created:', error);
      if (errorCode(error) === '23505') {
        return res
          .status(409)
          .json({ error: 'An active option group with this name already exists.' });
      }
      res.status(500).json({ error: 'Option group could not be created.' });
    }
  }
);

router.put(
  '/option-groups/:groupId',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { groupId } = req.params;
    if (!UUID_PATTERN.test(groupId)) return res.status(400).json({ error: 'Invalid group ID.' });
    const parsed = parseGroupBody(req.body ?? {});
    if ('error' in parsed) return res.status(400).json(parsed);

    try {
      const { data: group, error: groupError } = await supabase
        .from('menu_option_groups')
        .select('id, menu_options(id, archived_at)')
        .eq('id', groupId)
        .eq('cook_id', req.account!.profileId)
        .is('archived_at', null)
        .maybeSingle();
      if (groupError) throw groupError;
      if (!group) return res.status(404).json({ error: 'Option group not found.' });
      if (!(await verifyOwnedListings(req.account!.profileId, parsed.listingIds))) {
        return res.status(403).json({ error: 'One or more selected dishes are not yours.' });
      }

      const existingIds = new Set(
        (group.menu_options ?? []).filter(row => !row.archived_at).map(row => row.id)
      );
      if (parsed.options.some(option => option.id && !existingIds.has(option.id))) {
        return res.status(400).json({ error: 'One or more options do not belong to this group.' });
      }

      const { error: updateGroupError } = await supabase
        .from('menu_option_groups')
        .update({
          name: parsed.name,
          selection_type: parsed.selectionType,
          min_select: parsed.minSelect,
          max_select: parsed.maxSelect,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId)
        .eq('cook_id', req.account!.profileId);
      if (updateGroupError) throw updateGroupError;

      for (const option of parsed.options.filter(row => row.id)) {
        const { error } = await supabase
          .from('menu_options')
          .update({
            name: option.name,
            price_delta: option.price_delta,
            sort_order: option.sort_order,
          })
          .eq('id', option.id!)
          .eq('group_id', groupId);
        if (error) throw error;
      }
      const newOptions = parsed.options.filter(option => !option.id);
      if (newOptions.length > 0) {
        const { error } = await supabase.from('menu_options').insert(
          newOptions.map(option => ({
            group_id: groupId,
            name: option.name,
            price_delta: option.price_delta,
            sort_order: option.sort_order,
          }))
        );
        if (error) throw error;
      }
      const keptIds = new Set(parsed.options.flatMap(option => (option.id ? [option.id] : [])));
      const removedIds = [...existingIds].filter(id => !keptIds.has(id));
      if (removedIds.length > 0) {
        const { error } = await supabase
          .from('menu_options')
          .update({ archived_at: new Date().toISOString(), is_available: false })
          .eq('group_id', groupId)
          .in('id', removedIds);
        if (error) throw error;
      }

      const { error: deleteLinksError } = await supabase
        .from('listing_option_groups')
        .delete()
        .eq('group_id', groupId);
      if (deleteLinksError) throw deleteLinksError;
      if (parsed.listingIds.length > 0) {
        const { error: linksError } = await supabase.from('listing_option_groups').insert(
          parsed.listingIds.map((listingId, index) => ({
            listing_id: listingId,
            group_id: groupId,
            sort_order: index,
          }))
        );
        if (linksError) throw linksError;
      }
      res.json({ success: true, groupId });
    } catch (error: unknown) {
      console.error('Option group could not be updated:', error);
      if (errorCode(error) === '23505') {
        return res.status(409).json({ error: 'Group and option names must be unique.' });
      }
      res.status(500).json({ error: 'Option group could not be updated.' });
    }
  }
);

router.delete(
  '/option-groups/:groupId',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { groupId } = req.params;
    if (!UUID_PATTERN.test(groupId)) return res.status(400).json({ error: 'Invalid group ID.' });
    try {
      const { data, error } = await supabase
        .from('menu_option_groups')
        .update({ is_active: false, archived_at: new Date().toISOString() })
        .eq('id', groupId)
        .eq('cook_id', req.account!.profileId)
        .is('archived_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Option group not found.' });
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Option group could not be archived:', error);
      res.status(500).json({ error: 'Option group could not be deleted.' });
    }
  }
);

const updateOptionStatus = async (optionIds: string[], status: string) => {
  const update =
    status === 'in_stock'
      ? { is_available: true, unavailable_until: null }
      : status === 'today'
        ? { is_available: false, unavailable_until: getDateKeyInTimeZone() }
        : { is_available: false, unavailable_until: null };
  const { error } = await supabase.from('menu_options').update(update).in('id', optionIds);
  if (error) throw error;
};

router.patch(
  '/options/status',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const optionIds: string[] = Array.isArray(req.body?.optionIds)
      ? [...new Set<string>(req.body.optionIds.map((value: unknown) => String(value)))]
      : [];
    const status = String(req.body?.status ?? '');
    if (!optionIds.length || optionIds.some(id => !UUID_PATTERN.test(id))) {
      return res.status(400).json({ error: 'Select at least one valid option.' });
    }
    if (!OPTION_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status.' });
    try {
      const { data, error } = await supabase
        .from('menu_options')
        .select('id, menu_option_groups!inner(cook_id)')
        .in('id', optionIds);
      if (error) throw error;
      const ownedIds = (data ?? []).filter(row => {
        const owner = Array.isArray(row.menu_option_groups)
          ? row.menu_option_groups[0]
          : row.menu_option_groups;
        return owner?.cook_id === req.account!.profileId;
      });
      if (ownedIds.length !== optionIds.length) {
        return res.status(404).json({ error: 'One or more options were not found.' });
      }
      await updateOptionStatus(optionIds, status);
      res.json({ success: true, status, optionIds });
    } catch (error: unknown) {
      console.error('Option status could not be updated:', error);
      res.status(500).json({ error: 'Option status could not be updated.' });
    }
  }
);

router.patch(
  '/options/:optionId',
  requireActiveAccount,
  requireCookWorkspace,
  async (req: AccountRequest, res) => {
    const { optionId } = req.params;
    if (!UUID_PATTERN.test(optionId)) return res.status(400).json({ error: 'Invalid option ID.' });
    const status =
      typeof req.body?.isAvailable === 'boolean'
        ? req.body.isAvailable
          ? 'in_stock'
          : 'indefinite'
        : String(req.body?.status ?? '');
    if (!OPTION_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status.' });
    try {
      const { data: option, error } = await supabase
        .from('menu_options')
        .select('id, group_id, menu_option_groups!inner(cook_id)')
        .eq('id', optionId)
        .is('archived_at', null)
        .maybeSingle();
      if (error) throw error;
      const typedOption = option as unknown as OptionOwner | null;
      const owner = Array.isArray(typedOption?.menu_option_groups)
        ? typedOption.menu_option_groups[0]
        : typedOption?.menu_option_groups;
      if (!option || owner?.cook_id !== req.account!.profileId) {
        return res.status(404).json({ error: 'Option not found.' });
      }
      await updateOptionStatus([optionId], status);
      res.json({ success: true, status });
    } catch (error: unknown) {
      console.error('Option could not be updated:', error);
      res.status(500).json({ error: 'Option could not be updated.' });
    }
  }
);

export default router;
