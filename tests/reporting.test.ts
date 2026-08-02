import { validateReportPayload } from '../backend/reporting';
import {
  countReportCharacters,
  truncateReportDetails,
  validateReportDetails,
} from '@/src/utils/reporting';

const LISTING_ID = 'd9428888-122b-4db1-9fda-38ccb4bceea9';

describe('reporting validation', () => {
  it('accepts and normalizes a valid authenticated report payload', () => {
    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'food_safety',
        details: '  The food appeared improperly stored.  ',
      })
    ).toEqual({
      ok: true,
      value: {
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'food_safety',
        details: 'The food appeared improperly stored.',
      },
    });
  });

  it('rejects unknown targets and reasons', () => {
    expect(
      validateReportPayload({
        targetType: 'profile',
        targetId: LISTING_ID,
        reason: 'food_safety',
      }).ok
    ).toBe(false);

    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: 'not-a-uuid',
        reason: 'invented_reason',
      }).ok
    ).toBe(false);
  });

  it('requires useful details for the Other reason on both client and server', () => {
    expect(validateReportDetails('other', 'too short')).toBeTruthy();
    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'other',
        details: 'too short',
      }).ok
    ).toBe(false);

    expect(validateReportDetails('other', 'This needs a closer review.')).toBeNull();
  });

  it('counts Unicode code points consistently with the database constraint', () => {
    const fiveEmoji = '😀😀😀😀😀';

    expect(validateReportDetails('other', fiveEmoji)).toBeTruthy();
    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'other',
        details: fiveEmoji,
      }).ok
    ).toBe(false);
  });

  it('allows an omitted explanation for a predefined reason', () => {
    expect(validateReportDetails('misleading_information', '')).toBeNull();
    expect(
      validateReportPayload({
        targetType: 'restaurant',
        targetId: LISTING_ID,
        reason: 'misleading_information',
      })
    ).toMatchObject({ ok: true, value: { details: null } });
  });

  it('uses Unicode characters consistently at validation boundaries', () => {
    const nineEmoji = '🍜'.repeat(9);
    const tenEmoji = '🍜'.repeat(10);
    expect(validateReportDetails('other', nineEmoji)).toBeTruthy();
    expect(validateReportDetails('other', tenEmoji)).toBeNull();
    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'other',
        details: tenEmoji,
      }).ok
    ).toBe(true);

    const overLimit = '🍜'.repeat(1001);
    expect(validateReportDetails('food_safety', overLimit)).toBeTruthy();
    expect(
      validateReportPayload({
        targetType: 'listing',
        targetId: LISTING_ID,
        reason: 'food_safety',
        details: overLimit,
      }).ok
    ).toBe(false);
    expect(countReportCharacters(truncateReportDetails(overLimit))).toBe(1000);
  });
});
