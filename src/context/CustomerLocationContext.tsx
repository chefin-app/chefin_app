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

import { useAuth } from '@/src/services/auth-context';

export type CustomerLocationSource = 'device' | 'manual';

export interface CustomerLocationPreference {
  latitude: number;
  longitude: number;
  label: string;
  source: CustomerLocationSource;
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
  refresh: () => Promise<void>;
  selectCurrentLocation: () => Promise<boolean>;
  saveManualLocation: (query: string) => Promise<boolean>;
  dismissPrompt: () => Promise<boolean>;
  clearLocation: () => Promise<boolean>;
  clearError: () => void;
}

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

const CustomerLocationContext = createContext<CustomerLocationContextValue | undefined>(undefined);

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
  const refreshSequence = useRef(0);

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
      setLocation(toSavedLocation(payload.preference ?? null));
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
        const payload = await request('/api/account/location', {
          method: 'PUT',
          body: JSON.stringify(next),
        });
        setLocation(toSavedLocation(payload.preference ?? null));
        setPrompted(true);
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
        throw new Error(
          'Location permission was not granted. Enter your neighbourhood or postcode instead.'
        );
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = current.coords;
      const label = await getDeviceLocationLabel(latitude, longitude);
      const payload = await request('/api/account/location', {
        method: 'PUT',
        body: JSON.stringify({ latitude, longitude, label, source: 'device' }),
      });
      setLocation(toSavedLocation(payload.preference ?? null));
      setPrompted(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Current location is unavailable.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [request]);

  const saveManualLocation = useCallback(
    async (query: string): Promise<boolean> => {
      const search = query.trim();
      if (search.length < 3) {
        setError('Enter a neighbourhood, town or postcode.');
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        // Explicit submit only—this is not a keystroke-driven autocomplete.
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          search
        )}&format=json&limit=1&countrycodes=my`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!response.ok) throw new Error('The entered area could not be searched.');
        const results = (await response.json()) as NominatimResult[];
        const match = results[0];
        const latitude = Number(match?.lat);
        const longitude = Number(match?.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('We could not find that area. Try a postcode or nearby town.');
        }
        return await saveLocation({
          latitude,
          longitude,
          label: match.display_name?.trim() || search,
          source: 'manual',
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The entered area is unavailable.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [saveLocation]
  );

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
      refresh,
      selectCurrentLocation,
      saveManualLocation,
      dismissPrompt,
      clearLocation,
      clearError: () => setError(null),
    }),
    [
      clearLocation,
      dismissPrompt,
      error,
      loading,
      location,
      prompted,
      refresh,
      saving,
      selectCurrentLocation,
      saveManualLocation,
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
