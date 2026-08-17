export type MenuOptionAvailabilityStatus = 'in_stock' | 'today' | 'indefinite';

export interface MenuOptionChoice {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  availabilityStatus: MenuOptionAvailabilityStatus;
  sortOrder?: number;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  minSelect: number;
  maxSelect: number;
  required: boolean;
  sortOrder?: number;
  options: MenuOptionChoice[];
}

export interface CartSelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface RequestedOptionSelection {
  groupId: string;
  optionIds: string[];
}
