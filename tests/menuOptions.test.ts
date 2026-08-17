import type { MenuOptionGroup } from '@/src/types/menuOptions';
import {
  areOptionSelectionsValid,
  getOptionSurcharge,
  getSelectedOptions,
  toggleOptionSelection,
  toRequestedOptionSelections,
} from '@/src/utils/menuOptions';

const groups: MenuOptionGroup[] = [
  {
    id: 'drink',
    name: 'Drink',
    selectionType: 'single',
    minSelect: 1,
    maxSelect: 1,
    required: true,
    options: [
      {
        id: 'water',
        name: 'Water',
        priceDelta: 0,
        isAvailable: true,
        availabilityStatus: 'in_stock',
      },
      {
        id: 'tea',
        name: 'Iced tea',
        priceDelta: 2.7,
        isAvailable: true,
        availabilityStatus: 'in_stock',
      },
    ],
  },
];

describe('menu option selections', () => {
  it('blocks incomplete required groups and accepts one selected choice', () => {
    expect(areOptionSelectionsValid(groups, {})).toBe(false);
    const selected = toggleOptionSelection(groups[0], 'tea', {});
    expect(areOptionSelectionsValid(groups, selected)).toBe(true);
  });

  it('replaces a previous choice for a single-select group', () => {
    const withTea = toggleOptionSelection(groups[0], 'tea', {});
    const withWater = toggleOptionSelection(groups[0], 'water', withTea);
    expect(withWater.drink).toEqual(['water']);
  });

  it('calculates surcharges and produces server selection IDs', () => {
    const options = getSelectedOptions(groups, { drink: ['tea'] });
    expect(getOptionSurcharge(options)).toBe(2.7);
    expect(toRequestedOptionSelections(options)).toEqual([
      { groupId: 'drink', optionIds: ['tea'] },
    ]);
  });
});
