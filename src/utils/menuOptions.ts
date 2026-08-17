import type {
  CartSelectedOption,
  MenuOptionGroup,
  RequestedOptionSelection,
} from '@/src/types/menuOptions';

export type MenuOptionSelectionState = Record<string, string[]>;

export const getOptionRuleLabel = (group: MenuOptionGroup): string => {
  const prefix = group.required ? 'Required' : 'Optional';
  if (group.selectionType === 'single') return `${prefix} · Pick 1`;
  if (group.minSelect === group.maxSelect && group.minSelect > 0) {
    return `${prefix} · Pick ${group.minSelect}`;
  }
  if (group.minSelect > 0) return `${prefix} · Pick ${group.minSelect}–${group.maxSelect}`;
  return `${prefix} · Pick up to ${group.maxSelect}`;
};

export const areOptionSelectionsValid = (
  groups: MenuOptionGroup[],
  selected: MenuOptionSelectionState
): boolean =>
  groups.every(group => {
    const count = selected[group.id]?.length ?? 0;
    return count >= group.minSelect && count <= group.maxSelect;
  });

export const getSelectedOptions = (
  groups: MenuOptionGroup[],
  selected: MenuOptionSelectionState
): CartSelectedOption[] =>
  groups.flatMap(group => {
    const selectedIds = new Set(selected[group.id] ?? []);
    return group.options
      .filter(option => selectedIds.has(option.id))
      .map(option => ({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: option.priceDelta,
      }));
  });

export const getOptionSurcharge = (options: CartSelectedOption[]): number =>
  Math.round(options.reduce((sum, option) => sum + option.priceDelta, 0) * 100) / 100;

export const toRequestedOptionSelections = (
  selectedOptions: CartSelectedOption[] | undefined
): RequestedOptionSelection[] => {
  const byGroup = new Map<string, string[]>();
  for (const option of selectedOptions ?? []) {
    byGroup.set(option.groupId, [...(byGroup.get(option.groupId) ?? []), option.optionId]);
  }
  return [...byGroup].map(([groupId, optionIds]) => ({ groupId, optionIds }));
};

export const toggleOptionSelection = (
  group: MenuOptionGroup,
  optionId: string,
  selected: MenuOptionSelectionState
): MenuOptionSelectionState => {
  const current = selected[group.id] ?? [];
  const alreadySelected = current.includes(optionId);
  let next: string[];
  if (alreadySelected) {
    next = current.filter(id => id !== optionId);
  } else if (group.selectionType === 'single') {
    next = [optionId];
  } else if (current.length < group.maxSelect) {
    next = [...current, optionId];
  } else {
    next = current;
  }
  return { ...selected, [group.id]: next };
};
