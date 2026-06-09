import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { useOnboarding } from '@/src/context/OnboardingContext';

type AddressFields = {
  country: string;
  flat: string;
  property_name: string;
  street: string;
  locality: string;
  town: string;
  postcode: string;
};

const EMPTY: AddressFields = {
  country: '',
  flat: '',
  property_name: '',
  street: '',
  locality: '',
  town: '',
  postcode: '',
};

// ── Nominatim (OpenStreetMap) autocomplete ─────────────────────────
// Free, no key required. Strict 1 req/s limit on the public server, so we
// debounce + cancel in-flight requests. Per usage policy, identify the app
// via User-Agent.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'ChefinApp/1.0 (https://chefin.app)';

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  address?: NominatimAddress;
};

export default function CookAddressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  // When mounted as a gate, the caller passes ?next=/add-dish so we know
  // where to bounce the cook after they save.
  const { next, onboarding } = useLocalSearchParams<{ next?: string; onboarding?: string }>();
  const isOnboarding = onboarding === '1' || onboarding === 'true';
  const { setAddress: stashAddress } = useOnboarding();

  const [fields, setFields] = useState<AddressFields>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced Nominatim lookup.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=my`;
        const res = await fetch(url, {
          headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data: NominatimResult[] = await res.json();
        setSuggestions(data);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('Nominatim error', e.message);
          setSuggestions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const selectSuggestion = (s: NominatimResult) => {
    const a = s.address ?? {};
    const streetParts = [a.house_number, a.road ?? a.pedestrian].filter(Boolean);
    setFields(prev => ({
      ...prev,
      country: a.country ?? prev.country,
      street: streetParts.join(' ') || prev.street,
      locality: a.suburb ?? a.neighbourhood ?? a.quarter ?? prev.locality,
      town: a.city ?? a.town ?? a.village ?? prev.town,
      postcode: a.postcode ?? prev.postcode,
    }));
    setSearchQuery('');
    setSuggestions([]);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'address_country, address_flat, address_property_name, address_street, address_locality, address_town, address_postcode'
          )
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setFields({
            country: data.address_country ?? '',
            flat: data.address_flat ?? '',
            property_name: data.address_property_name ?? '',
            street: data.address_street ?? '',
            locality: data.address_locality ?? '',
            town: data.address_town ?? '',
            postcode: data.address_postcode ?? '',
          });
        }
      } catch (e: any) {
        console.warn('Failed to load address', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const isComplete =
    fields.country.trim() !== '' &&
    fields.street.trim() !== '' &&
    fields.town.trim() !== '' &&
    fields.postcode.trim() !== '';

  const handleSave = async () => {
    if (!user) return;
    if (!isComplete) {
      setShowErrors(true);
      return;
    }

    // ── Onboarding path: stash to context and continue to food safety.
    // The actual DB write happens at the final payment-methods step.
    if (isOnboarding) {
      stashAddress({
        country: fields.country.trim(),
        flat: fields.flat.trim(),
        property_name: fields.property_name.trim(),
        street: fields.street.trim(),
        locality: fields.locality.trim(),
        town: fields.town.trim(),
        postcode: fields.postcode.trim(),
      });
      router.push({ pathname: '/(cook)/food-safety', params: { onboarding: '1' } });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          address_country: fields.country.trim(),
          address_flat: fields.flat.trim() || null,
          address_property_name: fields.property_name.trim() || null,
          address_street: fields.street.trim(),
          address_locality: fields.locality.trim() || null,
          address_town: fields.town.trim(),
          address_postcode: fields.postcode.trim(),
        })
        .eq('user_id', user.id);
      if (error) throw error;

      if (next) {
        router.replace(next as any);
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Could not save address', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof AddressFields,
    label: string,
    opts?: { optional?: boolean; keyboardType?: 'default' | 'number-pad' }
  ) => {
    const isRequired = !opts?.optional;
    const showError = showErrors && isRequired && fields[key].trim() === '';

    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>
          {label} {isRequired && <Text style={styles.requiredAsterisk}>*</Text>}
        </Text>
        <TextInput
          style={[styles.fieldInput, showError && styles.fieldInputError]}
          value={fields[key]}
          onChangeText={text => {
            setFields(prev => ({ ...prev, [key]: text }));
            if (showErrors && text.trim() !== '') {
              // Re-check completion to clear errors optionally, or just clear all
            }
          }}
          placeholder={opts?.optional ? '(optional)' : ''}
          placeholderTextColor="#bbb"
          keyboardType={opts?.keyboardType ?? 'default'}
          autoCapitalize="words"
          editable={!saving}
        />
        {showError && <Text style={styles.errorText}>This field is required.</Text>}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Your Address</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {next && (
            <Text style={styles.gateNote}>
              We need your kitchen address before you can list dishes.
            </Text>
          )}

          {/* Autocomplete search (Nominatim / OpenStreetMap) */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search for your address"
              placeholderTextColor="#bbb"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator size="small" color="#888" />}
            {searchQuery.length > 0 && !searching && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>

          {suggestions.length > 0 && (
            <View style={styles.suggestionList}>
              {suggestions.map(s => (
                <TouchableOpacity
                  key={s.place_id}
                  style={styles.suggestionRow}
                  onPress={() => selectSuggestion(s)}
                >
                  <Ionicons name="location-outline" size={18} color="#666" />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {s.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.manualLabel}>Or enter manually</Text>

          {field('street', 'House No., Building, Street Name')}
          {field('flat', 'Unit No.', { optional: true })}
          {field('property_name', 'Building / Property Name', { optional: true })}
          {field('postcode', 'Postal Code', { keyboardType: 'number-pad' })}
          {field('town', 'City')}
          {field('locality', 'Area', { optional: true })}
          {field('country', 'Country / Region')}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, (!isComplete || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isComplete || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Looks good</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, gap: 12 },
  gateNote: {
    fontSize: 13,
    color: '#B26B00',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  suggestionList: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  suggestionText: { flex: 1, fontSize: 13, color: '#1A1A1A', lineHeight: 18 },
  manualLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  fieldWrap: { gap: 4, marginBottom: 8 },
  fieldLabel: { fontSize: 11, color: '#888', fontWeight: '600', letterSpacing: 0.4 },
  requiredAsterisk: { color: '#FF5252' },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
  },
  fieldInputError: {
    borderColor: '#FF5252',
    backgroundColor: '#FFEBEE',
  },
  errorText: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 4,
  },
  footer: { padding: 20, paddingBottom: 28 },
  saveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#A5D6A7' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
