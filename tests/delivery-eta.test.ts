import {
  estimateDeliveryArrival,
  getDeliveryTravelBand,
  normalizeDistanceMeters,
} from '../backend/deliveryEta';

describe('Klang Valley delivery ETA bands', () => {
  test.each([
    [0, 15, 25],
    [2_999, 15, 25],
    [3_000, 20, 35],
    [6_999, 20, 35],
    [7_000, 30, 45],
    [11_999, 30, 45],
    [12_000, 40, 60],
  ])('%i metres maps to %i–%i minutes', (metres, min, max) => {
    expect(getDeliveryTravelBand(metres)).toMatchObject({ min, max });
  });

  it('starts the arrival range at the end of the preparation window', () => {
    expect(estimateDeliveryArrival('2026-09-03T04:30:00.000Z', 8_000)).toMatchObject({
      estimatedArrivalStart: '2026-09-03T05:00:00.000Z',
      estimatedArrivalEnd: '2026-09-03T05:15:00.000Z',
    });
  });

  it('normalizes Lalamove metre and kilometre responses', () => {
    expect(normalizeDistanceMeters({ value: '2450', unit: 'm' })).toBe(2450);
    expect(normalizeDistanceMeters({ value: '2.45', unit: 'km' })).toBe(2450);
  });
});
