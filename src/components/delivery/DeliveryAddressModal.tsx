import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type DeliveryAddress = {
  recipientName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  locality?: string | null;
  city: string;
  state: string;
  postcode: string;
  countryCode: 'MY';
  latitude: number;
  longitude: number;
  deliveryInstructions?: string | null;
};

type Draft = Omit<DeliveryAddress, 'latitude' | 'longitude'> & {
  latitude: number | null;
  longitude: number | null;
};

const emptyDraft = (defaults?: Partial<DeliveryAddress>): Draft => ({
  recipientName: defaults?.recipientName ?? '',
  phoneNumber: defaults?.phoneNumber ?? '',
  addressLine1: defaults?.addressLine1 ?? '',
  addressLine2: defaults?.addressLine2 ?? '',
  locality: defaults?.locality ?? '',
  city: defaults?.city ?? '',
  state: defaults?.state ?? 'Selangor',
  postcode: defaults?.postcode ?? '',
  countryCode: 'MY',
  latitude: defaults?.latitude ?? null,
  longitude: defaults?.longitude ?? null,
  deliveryInstructions: defaults?.deliveryInstructions ?? '',
});

export function DeliveryAddressModal({
  visible,
  initialAddress,
  defaults,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialAddress: DeliveryAddress | null;
  defaults?: Partial<DeliveryAddress>;
  onClose: () => void;
  onSave: (address: DeliveryAddress) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialAddress ?? defaults));
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(emptyDraft(initialAddress ?? defaults));
  }, [visible, initialAddress, defaults]);

  const setField = (key: keyof Draft, value: string) => {
    const changes: Partial<Draft> = { [key]: value };
    if (['addressLine1', 'addressLine2', 'locality', 'city', 'state', 'postcode'].includes(key)) {
      changes.latitude = null;
      changes.longitude = null;
    }
    setDraft(current => ({ ...current, ...changes }));
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error('Allow location access to use your current position.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const matches = await Location.reverseGeocodeAsync(position.coords);
      const match = matches[0];
      setDraft(current => ({
        ...current,
        addressLine1:
          match?.streetNumber && match?.street
            ? `${match.streetNumber} ${match.street}`
            : match?.name || match?.street || current.addressLine1,
        locality: match?.district || match?.subregion || current.locality,
        city: match?.city || match?.region || current.city,
        state: match?.region || current.state,
        postcode: match?.postalCode || current.postcode,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }));
    } catch (error: unknown) {
      Alert.alert(
        'Location unavailable',
        error instanceof Error ? error.message : 'Try entering your address manually.'
      );
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (
      !draft.recipientName.trim() ||
      !draft.phoneNumber.trim() ||
      !draft.addressLine1.trim() ||
      !draft.city.trim() ||
      !draft.state.trim() ||
      !/^\d{5}$/.test(draft.postcode.trim())
    ) {
      Alert.alert(
        'Complete your address',
        'Enter the recipient, phone, street address, city, state and 5-digit postcode.'
      );
      return;
    }
    setSaving(true);
    try {
      let latitude = draft.latitude;
      let longitude = draft.longitude;
      if (latitude == null || longitude == null) {
        const query = [
          draft.addressLine1,
          draft.addressLine2,
          draft.locality,
          draft.postcode,
          draft.city,
          draft.state,
          'Malaysia',
        ]
          .filter(Boolean)
          .join(', ');
        const matches = await Location.geocodeAsync(query);
        latitude = matches[0]?.latitude ?? null;
        longitude = matches[0]?.longitude ?? null;
      }
      if (latitude == null || longitude == null) {
        Alert.alert(
          'Pinpoint your address',
          'We could not locate this address. Check it or tap “Use my current location”.'
        );
        return;
      }
      onSave({
        recipientName: draft.recipientName.trim(),
        phoneNumber: draft.phoneNumber.trim(),
        addressLine1: draft.addressLine1.trim(),
        addressLine2: draft.addressLine2?.trim() || null,
        locality: draft.locality?.trim() || null,
        city: draft.city.trim(),
        state: draft.state.trim(),
        postcode: draft.postcode.trim(),
        countryCode: 'MY',
        latitude,
        longitude,
        deliveryInstructions: draft.deliveryInstructions?.trim() || null,
      });
    } catch {
      Alert.alert('Address lookup unavailable', 'Try again or use your current location.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof Draft,
    options?: {
      keyboardType?: 'phone-pad' | 'number-pad';
      multiline?: boolean;
      placeholder?: string;
    }
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, options?.multiline && styles.multiline]}
        value={String(draft[key] ?? '')}
        onChangeText={value => setField(key, value)}
        placeholder={options?.placeholder}
        keyboardType={options?.keyboardType}
        multiline={options?.multiline}
        maxLength={key === 'deliveryInstructions' ? 500 : 200}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.title}>Exact delivery address</Text>
          <View style={styles.iconButton} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.privacyCard}>
            <Ionicons name="lock-closed-outline" size={20} color="#216E39" />
            <Text style={styles.privacyText}>
              Only your cook and assigned Lalamove rider receive this address for the order.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.locationButton}
            onPress={useCurrentLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator color="#216E39" />
            ) : (
              <Ionicons name="locate-outline" size={20} color="#216E39" />
            )}
            <Text style={styles.locationText}>Use my current location</Text>
          </TouchableOpacity>
          {field('Recipient name', 'recipientName')}
          {field('Mobile number', 'phoneNumber', {
            keyboardType: 'phone-pad',
            placeholder: '+60 12-345 6789',
          })}
          {field('Unit and street address', 'addressLine1')}
          {field('Building / floor (optional)', 'addressLine2')}
          {field('Neighbourhood (optional)', 'locality')}
          <View style={styles.row}>
            <View style={styles.flex}>{field('City', 'city')}</View>
            <View style={styles.postcode}>
              {field('Postcode', 'postcode', { keyboardType: 'number-pad' })}
            </View>
          </View>
          {field('State', 'state')}
          {field('Delivery instructions (optional)', 'deliveryInstructions', {
            multiline: true,
            placeholder: 'Gate, landmark or handoff note',
          })}
          <Text style={styles.areaNote}>Delivery is available in Klang Valley at launch.</Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Save and get Lalamove quote</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
  },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  content: { padding: 20, paddingBottom: 32 },
  privacyCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EDF7EF',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#315A3A' },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#85B48F',
    borderRadius: 14,
    minHeight: 48,
    marginBottom: 18,
  },
  locationText: { color: '#216E39', fontWeight: '700' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#4D554F', marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D7DDD8',
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FAFBFA',
  },
  multiline: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  postcode: { width: 115 },
  areaNote: { fontSize: 12, color: '#777', textAlign: 'center' },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD' },
  saveButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#216E39',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});
