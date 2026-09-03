export type DeliveryEstimate = {
  distanceBand: string;
  travelMinMinutes: number;
  travelMaxMinutes: number;
  estimatedArrivalStart: string;
  estimatedArrivalEnd: string;
};

export const normalizeDistanceMeters = (
  distance: { value?: string | number; unit?: string } | null | undefined
): number | null => {
  const value = Number(distance?.value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (distance?.unit === 'km') return Math.round(value * 1000);
  return distance?.unit === 'm' ? Math.round(value) : null;
};

/** Conservative Klang Valley MVP bands, including rider handoff and traffic allowance. */
export const getDeliveryTravelBand = (distanceMeters: number) => {
  if (distanceMeters < 3_000) return { label: 'Under 3 km', min: 15, max: 25 };
  if (distanceMeters < 7_000) return { label: '3–7 km', min: 20, max: 35 };
  if (distanceMeters < 12_000) return { label: '7–12 km', min: 30, max: 45 };
  return { label: '12 km+', min: 40, max: 60 };
};

export const estimateDeliveryArrival = (
  preparationReadyAt: string,
  distanceMeters: number
): DeliveryEstimate => {
  const readyMs = new Date(preparationReadyAt).getTime();
  if (Number.isNaN(readyMs)) throw new Error('A valid preparation-ready time is required.');
  const band = getDeliveryTravelBand(distanceMeters);
  return {
    distanceBand: band.label,
    travelMinMinutes: band.min,
    travelMaxMinutes: band.max,
    estimatedArrivalStart: new Date(readyMs + band.min * 60_000).toISOString(),
    estimatedArrivalEnd: new Date(readyMs + band.max * 60_000).toISOString(),
  };
};
