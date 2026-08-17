import type { Listing } from '@/src/types/models';

export type DietaryPreference = 'vegetarian' | 'non-pork';

const normalizeDietaryTag = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[–—_\s]+/g, '-');

/**
 * Dietary declarations belong to dishes, not entire home restaurants. A
 * restaurant qualifies when at least one of its customer-visible dishes meets
 * every selected preference. Vegetarian also satisfies a non-pork selection.
 */
export const listingMatchesDietaryPreferences = (
  listing: Pick<Listing, 'dietary_tags'>,
  selected: string[]
): boolean => {
  if (selected.length === 0) return true;
  const declarations = new Set((listing.dietary_tags ?? []).map(normalizeDietaryTag));

  return selected.every(value => {
    const preference = normalizeDietaryTag(value);
    if (preference === 'non-pork' && declarations.has('vegetarian')) return true;
    return declarations.has(preference);
  });
};
