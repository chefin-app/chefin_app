import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/src/services/auth-context';
import {
  DEFAULT_SERVICE_REGION,
  findServiceRegion,
  getRegionSearchViewbox,
  getServiceRegion,
  type LocationCandidate,
  type ServiceRegion,
  type ServiceRegionId,
} from '@/src/constants/serviceRegions';

export type CustomerLocationSource = 'device' | 'manual';

export interface CustomerLocationPreference {
  latitude: number;
  longitude: number;
  label: string;
  source: CustomerLocationSource;
}

export type CustomerFulfillmentPreference = 'delivery' | 'pickup';
export type CustomerOrderTimePreference =
  | { mode: 'asap' }
  | { mode: 'scheduled'; scheduledAt: string };

export interface RecentCustomerLocation extends CustomerLocationPreference {
  regionId: ServiceRegionId;
}

export interface SavedCustomerLocation extends RecentCustomerLocation {
  id: string;
  name: string;
}

type LocationApiPreference = {
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  source: CustomerLocationSource | null;
  promptedAt: string;
  consentedAt: string | null;
  updatedAt: string;
};

interface CustomerLocationContextValue {
  location: CustomerLocationPreference | null;
  prompted: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  region: ServiceRegion;
  recentLocations: RecentCustomerLocation[];
  savedLocations: SavedCustomerLocation[];
  fulfillmentPreference: CustomerFulfillmentPreference;
  orderTimePreference: CustomerOrderTimePreference;
  refresh: () => Promise<void>;
  selectCurrentLocation: () => Promise<boolean>;
  saveManualLocation: (query: string) => Promise<boolean>;
  selectLocation: (location: CustomerLocationPreference) => Promise<boolean>;
  selectRegion: (regionId: ServiceRegionId) => Promise<boolean>;
  searchLocations: (query: string, regionId?: ServiceRegionId) => Promise<LocationCandidate[]>;
  saveNamedLocation: (name: string) => Promise<boolean>;
  removeSavedLocation: (id: string) => void;
  setFulfillmentPreference: (preference: CustomerFulfillmentPreference) => boolean;
  setOrderTimePreference: (preference: CustomerOrderTimePreference) => void;
  dismissPrompt: () => Promise<boolean>;
  clearLocation: () => Promise<boolean>;
  clearError: () => void;
}

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

type StoredDiscoveryPreferences = {
  regionId?: ServiceRegionId;
  recentLocations?: RecentCustomerLocation[];
  savedLocations?: SavedCustomerLocation[];
  fulfillmentPreference?: CustomerFulfillmentPreference;
  orderTimePreference?: CustomerOrderTimePreference;
};

const CustomerLocationContext = createContext<CustomerLocationContextValue | undefined>(undefined);
const DISCOVERY_STORAGE_PREFIX = 'chefin.discovery-preferences.v1';
const discoveryStorageKey = (userId: string) => `${DISCOVERY_STORAGE_PREFIX}.${userId}`;

const isLocationPreference = (value: unknown): value is CustomerLocationPreference => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isFinite(Number(candidate.latitude)) &&
    Number.isFinite(Number(candidate.longitude)) &&
    typeof candidate.label === 'string' &&
    (candidate.source === 'device' || candidate.source === 'manual')
  );
};

const readStoredPreferences = (value: string | null): StoredDiscoveryPreferences => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as StoredDiscoveryPreferences;
    const regionId = parsed.regionId === 'sandakan' ? 'sandakan' : 'klang-valley';
    const recentLocations = Array.isArray(parsed.recentLocations)
      ? parsed.recentLocations
          .filter(isLocationPreference)
          .map(item => ({
            ...item,
            regionId: findServiceRegion(item.latitude, item.longitude)?.id,
          }))
          .filter((item): item is RecentCustomerLocation => Boolean(item.regionId))
          .slice(0, 10)
      : [];
    const savedLocations = Array.isArray(parsed.savedLocations)
      ? parsed.savedLocations
          .filter(
            (item): item is SavedCustomerLocation =>
              isLocationPreference(item) &&
              typeof item.id === 'string' &&
              typeof item.name === 'string'
          )
          .map(item => ({
            ...item,
            regionId: findServiceRegion(item.latitude, item.longitude)?.id,
          }))
          .filter((item): item is SavedCustomerLocation => Boolean(item.regionId))
      : [];
    const fulfillmentPreference =
      parsed.fulfillmentPreference === 'pickup' || !getServiceRegion(regionId).deliveryAvailable
        ? 'pickup'
        : 'delivery';
    const orderTimePreference =
      parsed.orderTimePreference?.mode === 'scheduled' &&
      typeof parsed.orderTimePreference.scheduledAt === 'string' &&
      new Date(parsed.orderTimePreference.scheduledAt).getTime() > Date.now()
        ? parsed.orderTimePreference
        : ({ mode: 'asap' } as const);
    return {
      regionId,
      recentLocations,
      savedLocations,
      fulfillmentPreference,
      orderTimePreference,
    };
  } catch {
    return {};
  }
};

export const formatCustomerOrderTime = (preference: CustomerOrderTimePreference): string => {
  if (preference.mode === 'asap') return 'Now';
  const scheduled = new Date(preference.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return 'Now';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(scheduled)
    .replace(/\b(am|pm)\b/i, period => period.toUpperCase());
};

const getApiUrl = (): string => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Chefin API URL is not configured.');
  return apiUrl;
};

const toSavedLocation = (
  preference: LocationApiPreference | null
): CustomerLocationPreference | null => {
  if (preference?.latitude == null || preference.longitude == null || !preference.source) {
    return null;
  }
  return {
    latitude: Number(preference.latitude),
    longitude: Number(preference.longitude),
    label: preference.label?.trim() || 'Selected area',
    source: preference.source,
  };
};

const getDeviceLocationLabel = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
    const address = addresses[0];
    const label = [
      address?.district,
      address?.city,
      address?.subregion,
      address?.region,
      address?.postalCode,
    ]
      .filter((part, index, all): part is string => Boolean(part && all.indexOf(part) === index))
      .slice(0, 3)
      .join(', ');
    return label || 'Current location';
  } catch {
    return 'Current location';
  }
};

export function CustomerLocationProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const userId = user?.id;
  const [location, setLocation] = useState<CustomerLocationPreference | null>(null);
  const [prompted, setPrompted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [regionId, setRegionId] = useState<ServiceRegionId>(DEFAULT_SERVICE_REGION.id);
  const [recentLocations, setRecentLocations] = useState<RecentCustomerLocation[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedCustomerLocation[]>([]);
  const [fulfillmentPreference, setFulfillmentPreferenceState] =
    useState<CustomerFulfillmentPreference>('delivery');
  const [orderTimePreference, setOrderTimePreferenceState] = useState<CustomerOrderTimePreference>({
    mode: 'asap',
  });
  const refreshSequence = useRef(0);

  useEffect(() => {
    let current = true;
    setPreferencesHydrated(false);
    if (!userId) {
      setRegionId(DEFAULT_SERVICE_REGION.id);
      setRecentLocations([]);
      setSavedLocations([]);
      setFulfillmentPreferenceState('delivery');
      setOrderTimePreferenceState({ mode: 'asap' });
      setPreferencesHydrated(true);
      return () => {
        current = false;
      };
    }
    AsyncStorage.getItem(discoveryStorageKey(userId))
      .then(value => {
        if (!current) return;
        const stored = readStoredPreferences(value);
        setRegionId(stored.regionId ?? DEFAULT_SERVICE_REGION.id);
        setRecentLocations(stored.recentLocations ?? []);
        setSavedLocations(stored.savedLocations ?? []);
        setFulfillmentPreferenceState(stored.fulfillmentPreference ?? 'delivery');
        setOrderTimePreferenceState(stored.orderTimePreference ?? { mode: 'asap' });
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setPreferencesHydrated(true);
      });
    return () => {
      current = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !preferencesHydrated) return;
    const stored: StoredDiscoveryPreferences = {
      regionId,
      recentLocations,
      savedLocations,
      fulfillmentPreference,
      orderTimePreference,
    };
    AsyncStorage.setItem(discoveryStorageKey(userId), JSON.stringify(stored)).catch(() =>
      console.warn('Could not save discovery preferences')
    );
  }, [
    fulfillmentPreference,
    orderTimePreference,
    preferencesHydrated,
    recentLocations,
    regionId,
    savedLocations,
    userId,
  ]);

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = session?.access_token;
      if (!token) throw new Error('Please sign in to save a location.');
      let response: Response;
      try {
        response = await fetch(`${getApiUrl()}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers ?? {}),
          },
        });
      } catch {
        throw new Error('Chefin could not reach the location service. Please try again.');
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preference?: LocationApiPreference | null;
      };
      if (!response.ok) throw new Error(payload.error ?? 'The location request failed.');
      return payload;
    },
    [session?.access_token]
  );

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (!session?.access_token) {
      setLocation(null);
      setPrompted(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await request('/api/account/location');
      if (sequence !== refreshSequence.current) return;
      const savedLocation = toSavedLocation(payload.preference ?? null);
      const savedRegion = savedLocation
        ? findServiceRegion(savedLocation.latitude, savedLocation.longitude)
        : null;
      if (savedLocation && !savedRegion) {
        setLocation(null);
        setError('Chefin is not available in your previously selected area yet.');
      } else {
        setLocation(savedLocation);
        if (savedRegion) setRegionId(savedRegion.id);
      }
      setPrompted(Boolean(payload.preference?.promptedAt));
    } catch (caught) {
      if (sequence !== refreshSequence.current) return;
      setLocation(null);
      setPrompted(false);
      setError(caught instanceof Error ? caught.message : 'Location preference is unavailable.');
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => {
    if (!userId) {
      refreshSequence.current += 1;
      setLocation(null);
      setPrompted(false);
      setError(null);
      setLoading(false);
      return;
    }
    refresh();
    return () => {
      // A response belonging to a previous account must never populate the
      // next account's location context during a fast logout/login transition.
      refreshSequence.current += 1;
    };
  }, [refresh, userId]);

  const saveLocation = useCallback(
    async (next: CustomerLocationPreference): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const serviceRegion = findServiceRegion(next.latitude, next.longitude);
        if (!serviceRegion) {
          throw new Error(
            'Chefin is not available in this area yet. Choose Klang Valley or Sandakan.'
          );
        }
        const payload = await request('/api/account/location', {
          method: 'PUT',
          body: JSON.stringify(next),
        });
        setLocation(toSavedLocation(payload.preference ?? null));
        setPrompted(true);
        setRegionId(serviceRegion.id);
        setRecentLocations(current =>
          [
            { ...next, regionId: serviceRegion.id },
            ...current.filter(
              item =>
                item.label !== next.label ||
                item.latitude !== next.latitude ||
                item.longitude !== next.longitude
            ),
          ].slice(0, 10)
        );
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Location could not be saved.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [request]
  );

  const selectCurrentLocation = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Location permission was not granted. Search for an area or postcode.');
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = current.coords;
      const label = await getDeviceLocationLabel(latitude, longitude);
      return await saveLocation({ latitude, longitude, label, source: 'device' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Current location is unavailable.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [saveLocation]);

  const searchLocations = useCallback(
    async (query: string, targetRegionId = regionId): Promise<LocationCandidate[]> => {
      const search = query.trim();
      if (search.length < 3) return [];
      // TODO(prod): to implement Google Maps API for prod. Nominatim is the
      // temporary Malaysian-area search provider for the MVP.
      const params = new URLSearchParams({
        q: search,
        format: 'json',
        limit: '8',
        countrycodes: 'my',
        viewbox: getRegionSearchViewbox(targetRegionId),
        bounded: '1',
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'en' },
      });
      if (!response.ok) throw new Error('The entered area could not be searched.');
      const results = (await response.json()) as NominatimResult[];
      return results.flatMap(match => {
        const latitude = Number(match.lat);
        const longitude = Number(match.lon);
        const serviceRegion = findServiceRegion(latitude, longitude);
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          serviceRegion?.id !== targetRegionId
        ) {
          return [];
        }
        return [
          {
            latitude,
            longitude,
            label: match.display_name?.trim() || search,
            regionId: serviceRegion.id,
          },
        ];
      });
    },
    [regionId]
  );

  const saveManualLocation = useCallback(
    async (query: string): Promise<boolean> => {
      const search = query.trim();
      if (search.length < 3) {
        setError('Enter an area, town or postcode.');
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const results = await searchLocations(search);
        const match = results[0];
        if (!match) {
          throw new Error('We could not find that area. Try a postcode or nearby town.');
        }
        return await saveLocation({
          latitude: match.latitude,
          longitude: match.longitude,
          label: match.label,
          source: 'manual',
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The entered area is unavailable.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [saveLocation, searchLocations]
  );

  const selectRegion = useCallback(
    async (nextRegionId: ServiceRegionId): Promise<boolean> => {
      const nextRegion = getServiceRegion(nextRegionId);
      const selected = await saveLocation({ ...nextRegion.centre, source: 'manual' });
      if (selected && !nextRegion.deliveryAvailable) setFulfillmentPreferenceState('pickup');
      return selected;
    },
    [saveLocation]
  );

  const saveNamedLocation = useCallback(
    async (name: string): Promise<boolean> => {
      if (!location) {
        setError('Choose an area before saving it.');
        return false;
      }
      const serviceRegion = findServiceRegion(location.latitude, location.longitude);
      if (!serviceRegion) return false;
      const cleanName = name.trim().slice(0, 40);
      if (!cleanName) return false;
      const saved: SavedCustomerLocation = {
        ...location,
        id: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || String(Date.now()),
        name: cleanName,
        regionId: serviceRegion.id,
      };
      setSavedLocations(current => [
        saved,
        ...current.filter(item => item.id !== saved.id && item.name !== saved.name),
      ]);
      return true;
    },
    [location]
  );

  const removeSavedLocation = useCallback((id: string) => {
    setSavedLocations(current => current.filter(item => item.id !== id));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const setFulfillmentPreference = useCallback(
    (preference: CustomerFulfillmentPreference): boolean => {
      if (preference === 'delivery' && !getServiceRegion(regionId).deliveryAvailable) {
        setError('Delivery is not available in Sandakan yet. Choose pickup or Klang Valley.');
        return false;
      }
      setError(null);
      setFulfillmentPreferenceState(preference);
      return true;
    },
    [regionId]
  );

  const setOrderTimePreference = useCallback((preference: CustomerOrderTimePreference) => {
    setOrderTimePreferenceState(preference);
  }, []);

  const dismissPrompt = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await request('/api/account/location/dismiss', { method: 'POST' });
      setLocation(null);
      setPrompted(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your preference could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [request]);

  const clearLocation = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await request('/api/account/location', { method: 'DELETE' });
      setLocation(null);
      setPrompted(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Location could not be cleared.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [request]);

  const value = useMemo<CustomerLocationContextValue>(
    () => ({
      location,
      prompted,
      loading,
      saving,
      error,
      region: getServiceRegion(regionId),
      recentLocations,
      savedLocations,
      fulfillmentPreference,
      orderTimePreference,
      refresh,
      selectCurrentLocation,
      saveManualLocation,
      selectLocation: saveLocation,
      selectRegion,
      searchLocations,
      saveNamedLocation,
      removeSavedLocation,
      setFulfillmentPreference,
      setOrderTimePreference,
      dismissPrompt,
      clearLocation,
      clearError,
    }),
    [
      clearLocation,
      clearError,
      dismissPrompt,
      error,
      fulfillmentPreference,
      loading,
      location,
      orderTimePreference,
      prompted,
      recentLocations,
      removeSavedLocation,
      refresh,
      saving,
      selectCurrentLocation,
      saveManualLocation,
      saveLocation,
      savedLocations,
      saveNamedLocation,
      searchLocations,
      selectRegion,
      setFulfillmentPreference,
      setOrderTimePreference,
      regionId,
    ]
  );

  return (
    <CustomerLocationContext.Provider value={value}>{children}</CustomerLocationContext.Provider>
  );
}

export function useCustomerLocation(): CustomerLocationContextValue {
  const context = useContext(CustomerLocationContext);
  if (!context) {
    throw new Error('useCustomerLocation must be used within CustomerLocationProvider');
  }
  return context;
}
