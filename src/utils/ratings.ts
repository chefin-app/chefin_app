/**
 * The database stores one integer rating per verified-purchase review. There is
 * no persisted aggregate or review-approval flag, so every valid stored review
 * contributes once to the displayed average.
 */
export interface RatedReview {
  rating?: unknown;
}

export interface RatingSummary {
  /** Unrounded arithmetic mean, or null when there are no valid reviews. */
  average: number | null;
  count: number;
  total: number;
}

export interface ReviewableListing {
  reviews?: readonly RatedReview[] | null;
}

export const NO_RATING_LABEL = 'New';

export function isValidRating(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

export function hasValidReviewRating<T extends RatedReview>(
  review: T
): review is T & {
  rating: number;
} {
  return isValidRating(review.rating);
}

/**
 * Calculates a review-weighted average. Invalid, non-finite and out-of-range
 * values are ignored instead of being treated as zero.
 */
export function getRatingSummary(
  reviews: readonly RatedReview[] | null | undefined
): RatingSummary {
  const validRatings = (reviews ?? []).filter(hasValidReviewRating).map(review => review.rating);
  const total = validRatings.reduce((sum, rating) => sum + rating, 0);

  return {
    average: validRatings.length > 0 ? total / validRatings.length : null,
    count: validRatings.length,
    total,
  };
}

/** Flattens listing reviews before calculating, so dishes are never equally weighted. */
export function getListingsRatingSummary(
  listings: readonly ReviewableListing[] | null | undefined
): RatingSummary {
  return getRatingSummary((listings ?? []).flatMap(listing => listing.reviews ?? []));
}

/** Rounds only at the point of display, keeping calculations fully precise. */
export function formatRating(average: number | null | undefined): string {
  return isValidRating(average) ? average.toFixed(1) : NO_RATING_LABEL;
}

/** Normalises the denormalised string snapshot stored on favourite rows. */
export function formatPersistedRating(average: unknown): string {
  const parsedAverage =
    typeof average === 'string' && average.trim() !== '' ? Number(average) : average;
  return formatRating(typeof parsedAverage === 'number' ? parsedAverage : null);
}
