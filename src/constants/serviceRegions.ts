export type ServiceRegionId = 'klang-valley' | 'sandakan';

export type LocationCandidate = {
  latitude: number;
  longitude: number;
  label: string;
  regionId: ServiceRegionId;
};

export type ServiceRegion = {
  id: ServiceRegionId;
  name: string;
  shortName: string;
  subtitle: string;
  deliveryAvailable: boolean;
  bounds: {
    north: number;
    east: number;
    south: number;
    west: number;
  };
  centre: LocationCandidate;
  suggestions: LocationCandidate[];
};

export const SERVICE_REGIONS: ServiceRegion[] = [
  {
    id: 'klang-valley',
    name: 'Klang Valley',
    shortName: 'Klang Valley',
    subtitle: 'Kuala Lumpur, Selangor and Putrajaya',
    deliveryAvailable: true,
    bounds: { north: 3.55, east: 102, south: 2.75, west: 101.2 },
    centre: {
      latitude: 3.139,
      longitude: 101.6869,
      label: 'Kuala Lumpur City Centre',
      regionId: 'klang-valley',
    },
    suggestions: [
      {
        latitude: 3.1579,
        longitude: 101.7116,
        label: 'Kuala Lumpur City Centre',
        regionId: 'klang-valley',
      },
      {
        latitude: 3.1291,
        longitude: 101.6797,
        label: 'Bangsar, Kuala Lumpur',
        regionId: 'klang-valley',
      },
      {
        latitude: 3.1073,
        longitude: 101.6067,
        label: 'Petaling Jaya, Selangor',
        regionId: 'klang-valley',
      },
      {
        latitude: 3.0738,
        longitude: 101.5183,
        label: 'Shah Alam, Selangor',
        regionId: 'klang-valley',
      },
    ],
  },
  {
    id: 'sandakan',
    name: 'Sandakan',
    shortName: 'Sandakan',
    subtitle: 'Sandakan, Sabah',
    deliveryAvailable: false,
    bounds: { north: 6.2, east: 118.6, south: 5.45, west: 117.7 },
    centre: {
      latitude: 5.8394,
      longitude: 118.1178,
      label: 'Sandakan Town, Sabah',
      regionId: 'sandakan',
    },
    suggestions: [
      {
        latitude: 5.8394,
        longitude: 118.1178,
        label: 'Sandakan Town, Sabah',
        regionId: 'sandakan',
      },
      {
        latitude: 5.8572,
        longitude: 118.0571,
        label: 'Bandar Indah, Sandakan',
        regionId: 'sandakan',
      },
      {
        latitude: 5.8764,
        longitude: 117.9465,
        label: 'Sepilok, Sandakan',
        regionId: 'sandakan',
      },
    ],
  },
];

export const DEFAULT_SERVICE_REGION = SERVICE_REGIONS[0];

export const getServiceRegion = (id: ServiceRegionId): ServiceRegion =>
  SERVICE_REGIONS.find(region => region.id === id) ?? DEFAULT_SERVICE_REGION;

export const findServiceRegion = (latitude: number, longitude: number): ServiceRegion | null =>
  SERVICE_REGIONS.find(
    region =>
      latitude >= region.bounds.south &&
      latitude <= region.bounds.north &&
      longitude >= region.bounds.west &&
      longitude <= region.bounds.east
  ) ?? null;

export const getRegionSearchViewbox = (id: ServiceRegionId): string => {
  const { bounds } = getServiceRegion(id);
  return `${bounds.west},${bounds.north},${bounds.east},${bounds.south}`;
};
