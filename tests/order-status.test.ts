import { formatPickupEta, getBuyerOrderTimingLabel } from '../src/utils/orderStatus';

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

  it('hides pickup timing until the cook accepts the order', () => {
    expect(
      getBuyerOrderTimingLabel({
        status: 'pending',
        fulfillmentType: 'pickup',
        pickupTime: '2026-09-03T04:00:00.000Z',
      })
    ).toBe('Waiting for the cook to accept');
  });

  it('hides a quoted delivery window until the cook accepts the order', () => {
    expect(
      getBuyerOrderTimingLabel({
        status: 'pending',
        fulfillmentType: 'delivery',
        pickupTime: '2026-09-03T04:00:00.000Z',
        estimatedArrivalStart: '2026-09-03T04:15:00.000Z',
        estimatedArrivalEnd: '2026-09-03T04:30:00.000Z',
      })
    ).toBe('Waiting for the cook to accept');
  });

  it('shows pickup and delivery timing after acceptance', () => {
    expect(
      getBuyerOrderTimingLabel({
        status: 'confirmed',
        fulfillmentType: 'pickup',
        pickupTime: '2026-09-03T04:00:00.000Z',
      })
    ).toBe('Pickup in 10 min');
    expect(
      getBuyerOrderTimingLabel({
        status: 'confirmed',
        fulfillmentType: 'delivery',
        pickupTime: '2026-09-03T04:00:00.000Z',
        estimatedArrivalStart: '2026-09-03T04:15:00.000Z',
        estimatedArrivalEnd: '2026-09-03T04:30:00.000Z',
      })
    ).toBe('Estimated arrival 12:15 PM–12:30 PM');
  });

  it('uses fulfillment-specific copy when the food is ready', () => {
    expect(
      getBuyerOrderTimingLabel({
        status: 'ready',
        fulfillmentType: 'pickup',
        pickupTime: '2026-09-03T04:00:00.000Z',
      })
    ).toBe('Ready for pickup');
    expect(
      getBuyerOrderTimingLabel({
        status: 'ready',
        fulfillmentType: 'delivery',
        pickupTime: '2026-09-03T04:00:00.000Z',
      })
    ).toBe('Food is ready · delivery being arranged');
  });
});
