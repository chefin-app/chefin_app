import { getDateKeyInTimeZone } from './availabilityService';
import { supabase } from './supabaseClient';

export type OptionAvailabilityStatus = 'in_stock' | 'today' | 'indefinite';

export type PublicMenuOption = {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  availabilityStatus: OptionAvailabilityStatus;
  sortOrder: number;
};

export type PublicMenuOptionGroup = {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  minSelect: number;
  maxSelect: number;
  required: boolean;
  sortOrder: number;
  options: PublicMenuOption[];
};

export type RequestedOptionGroup = {
  groupId: string;
  optionIds: string[];
};

export type SelectedOptionSnapshot = {
  groupId: string;
  groupName: string;
  selectionType: 'single' | 'multiple';
  minSelect: number;
  maxSelect: number;
  options: Array<{
    optionId: string;
    optionName: string;
    priceDelta: number;
  }>;
};

type Relation<T> = T | T[] | null;

type RawOption = {
  id: string;
  name: string;
  price_delta: number | string;
  is_available: boolean;
  unavailable_until: string | null;
  archived_at: string | null;
  sort_order: number;
};

type RawGroup = {
  id: string;
  name: string;
  selection_type: 'single' | 'multiple';
  min_select: number;
  max_select: number;
  is_active: boolean;
  archived_at: string | null;
  menu_options: RawOption[] | null;
};

type RawLink = {
  listing_id: string;
  sort_order: number;
  menu_option_groups: Relation<RawGroup>;
};

const one = <T>(value: Relation<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export const getOptionAvailabilityStatus = (
  option: Pick<RawOption, 'is_available' | 'unavailable_until'>,
  today = getDateKeyInTimeZone()
): OptionAvailabilityStatus => {
  if (option.is_available) return 'in_stock';
  const unavailableUntil = option.unavailable_until?.slice(0, 10) ?? null;
  if (unavailableUntil && unavailableUntil >= today) return 'today';
  if (unavailableUntil && unavailableUntil < today) return 'in_stock';
  return 'indefinite';
};

/**
 * Loads the active reusable groups linked to each listing. Availability is
 * evaluated lazily, so "out of stock today" restores without a cron job.
 */
export const getListingOptionGroups = async (
  listingIds: string[]
): Promise<Record<string, PublicMenuOptionGroup[]>> => {
  const uniqueIds = [...new Set(listingIds)];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('listing_option_groups')
    .select(
      `
        listing_id,
        sort_order,
        menu_option_groups!inner (
          id,
          name,
          selection_type,
          min_select,
          max_select,
          is_active,
          archived_at,
          menu_options (
            id,
            name,
            price_delta,
            is_available,
            unavailable_until,
            archived_at,
            sort_order
          )
        )
      `
    )
    .in('listing_id', uniqueIds);
  if (error) throw error;

  const today = getDateKeyInTimeZone();
  const result: Record<string, PublicMenuOptionGroup[]> = Object.fromEntries(
    uniqueIds.map(id => [id, []])
  );

  for (const link of (data ?? []) as unknown as RawLink[]) {
    const group = one(link.menu_option_groups);
    if (!group || group.archived_at || !group.is_active) continue;
    const options = (group.menu_options ?? [])
      .filter(option => !option.archived_at)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(option => {
        const availabilityStatus = getOptionAvailabilityStatus(option, today);
        return {
          id: option.id,
          name: option.name,
          priceDelta: Number(option.price_delta),
          isAvailable: availabilityStatus === 'in_stock',
          availabilityStatus,
          sortOrder: option.sort_order,
        } satisfies PublicMenuOption;
      });
    result[link.listing_id] ??= [];
    result[link.listing_id].push({
      id: group.id,
      name: group.name,
      selectionType: group.selection_type,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      required: group.min_select > 0,
      sortOrder: link.sort_order,
      options,
    });
  }

  for (const groups of Object.values(result)) {
    groups.sort((left, right) => left.sortOrder - right.sortOrder);
  }
  return result;
};

export const validateOptionSelections = (
  groups: PublicMenuOptionGroup[],
  requested: RequestedOptionGroup[] | undefined
): { snapshot: SelectedOptionSnapshot[]; surcharge: number } | { error: string } => {
  const submitted = Array.isArray(requested) ? requested : [];
  const requestedByGroup = new Map<string, string[]>();

  for (const selection of submitted) {
    if (
      !selection ||
      typeof selection.groupId !== 'string' ||
      !Array.isArray(selection.optionIds)
    ) {
      return { error: 'One or more option selections are invalid.' };
    }
    if (requestedByGroup.has(selection.groupId)) {
      return { error: 'An option group was submitted more than once.' };
    }
    const ids = selection.optionIds.map(String);
    if (new Set(ids).size !== ids.length) {
      return { error: 'The same option cannot be selected more than once.' };
    }
    requestedByGroup.set(selection.groupId, ids);
  }

  const linkedGroupIds = new Set(groups.map(group => group.id));
  for (const groupId of requestedByGroup.keys()) {
    if (!linkedGroupIds.has(groupId)) {
      return { error: 'A selected option group is no longer linked to this dish.' };
    }
  }

  const snapshot: SelectedOptionSnapshot[] = [];
  let surcharge = 0;

  for (const group of groups) {
    const optionIds = requestedByGroup.get(group.id) ?? [];
    if (optionIds.length < group.minSelect || optionIds.length > group.maxSelect) {
      const rule =
        group.minSelect === group.maxSelect
          ? `pick ${group.minSelect}`
          : `pick ${group.minSelect}–${group.maxSelect}`;
      return { error: `${group.name}: ${rule}.` };
    }
    if (group.selectionType === 'single' && optionIds.length > 1) {
      return { error: `${group.name} allows only one selection.` };
    }

    const optionById = new Map(group.options.map(option => [option.id, option]));
    const selected = optionIds.map(optionId => optionById.get(optionId));
    if (selected.some(option => !option)) {
      return { error: `An option in ${group.name} no longer exists.` };
    }
    if (selected.some(option => !option!.isAvailable)) {
      return { error: `An option in ${group.name} is currently out of stock.` };
    }
    if (selected.length === 0) continue;

    const snapshotOptions = selected.map(option => {
      surcharge += option!.priceDelta;
      return {
        optionId: option!.id,
        optionName: option!.name,
        priceDelta: option!.priceDelta,
      };
    });
    snapshot.push({
      groupId: group.id,
      groupName: group.name,
      selectionType: group.selectionType,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: snapshotOptions,
    });
  }

  return { snapshot, surcharge: Math.round(surcharge * 100) / 100 };
};
