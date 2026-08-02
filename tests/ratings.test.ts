import {
  formatPersistedRating,
  formatRating,
  getListingsRatingSummary,
  getRatingSummary,
  hasValidReviewRating,
  isValidRating,
} from '@/src/utils/ratings';

describe('rating helpers', () => {
  it('uses a review-weighted mean and does not round intermediate results', () => {
    const summary = getRatingSummary([{ rating: 5 }, { rating: 4 }, { rating: 1 }]);

    expect(summary).toEqual({ average: 10 / 3, count: 3, total: 10 });
    expect(formatRating(summary.average)).toBe('3.3');
  });

  it('weights restaurant ratings by reviews rather than by dish averages', () => {
    const dishReviews = [[{ rating: 5 }], [{ rating: 1 }, { rating: 1 }, { rating: 1 }]];
    const summary = getListingsRatingSummary(dishReviews.map(reviews => ({ reviews })));

    // Averaging the two dish averages would incorrectly produce 3.0.
    expect(summary).toEqual({ average: 2, count: 4, total: 8 });
    expect(formatRating(summary.average)).toBe('2.0');
  });

  it('excludes invalid ratings instead of counting them as zero', () => {
    const reviews = [
      { rating: 5 },
      { rating: 0 },
      { rating: 6 },
      { rating: Number.NaN },
      { rating: Number.POSITIVE_INFINITY },
      { rating: '4' },
      {},
    ];

    expect(getRatingSummary(reviews)).toEqual({ average: 5, count: 1, total: 5 });
    expect(reviews.filter(hasValidReviewRating)).toEqual([{ rating: 5 }]);
  });

  it('uses the same empty-state label when no valid reviews exist', () => {
    expect(getRatingSummary(undefined)).toEqual({ average: null, count: 0, total: 0 });
    expect(formatRating(null)).toBe('New');
    expect(formatPersistedRating('-')).toBe('New');
    expect(formatPersistedRating('4.25')).toBe('4.3');
  });

  it('accepts only finite numbers in the inclusive 1–5 range', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(0.5)).toBe(false);
    expect(isValidRating(5.1)).toBe(false);
    expect(isValidRating('5')).toBe(false);
  });
});
