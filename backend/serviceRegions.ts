export type BackendServiceRegionId = 'klang-valley' | 'sandakan';

type ServiceRegionBounds = {
  id: BackendServiceRegionId;
  north: number;
  east: number;
  south: number;
  west: number;
};

// Backend-owned copy of the public discovery boundaries in
// src/constants/serviceRegions.ts. Keep these values aligned when adding or
// changing a launch region; backend code must not import app-side ESM modules.
export const SERVICE_REGION_BOUNDS: ServiceRegionBounds[] = [
  { id: 'klang-valley', north: 3.55, east: 102, south: 2.75, west: 101.2 },
  { id: 'sandakan', north: 6.2, east: 118.6, south: 5.45, west: 117.7 },
];

export const findServiceRegion = (
  latitude: number,
  longitude: number
): ServiceRegionBounds | null =>
  SERVICE_REGION_BOUNDS.find(
    region =>
      latitude >= region.south &&
      latitude <= region.north &&
      longitude >= region.west &&
      longitude <= region.east
  ) ?? null;
