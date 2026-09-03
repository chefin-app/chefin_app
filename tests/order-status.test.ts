import { formatPickupEta } from '../src/utils/orderStatus';

describe('order timing labels', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-03T03:50:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('formats pickup countdowns without implying a delivery ETA', () => {
    expect(formatPickupEta('2026-09-03T04:00:00.000Z')).toBe('Pickup in 10 min');
    expect(formatPickupEta('2026-09-03T05:20:00.000Z')).toBe('Pickup in 1h 30m');
    expect(formatPickupEta(null)).toBe('Pickup time TBC');
  });
});
