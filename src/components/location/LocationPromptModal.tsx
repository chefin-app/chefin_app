import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCustomerLocation } from '@/src/context/CustomerLocationContext';

interface LocationPromptModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function LocationPromptModal({ visible, onClose }: LocationPromptModalProps) {
  const {
    location,
    saving,
    error,
    selectCurrentLocation,
    saveManualLocation,
    dismissPrompt,
    clearLocation,
    clearError,
  } = useCustomerLocation();
  const [manualMode, setManualMode] = useState(false);
  const [manualQuery, setManualQuery] = useState('');

  useEffect(() => {
    if (!visible) {
      setManualMode(false);
      setManualQuery('');
      clearError();
    }
  }, [clearError, visible]);

  const handleCurrentLocation = async () => {
    if (await selectCurrentLocation()) onClose();
  };

  const handleManualLocation = async () => {
    if (await saveManualLocation(manualQuery)) onClose();
  };

  const dismiss = async () => {
    if (location) {
      onClose();
      return;
    }
    if (await dismissPrompt()) onClose();
  };

  const removeSavedLocation = async () => {
    if (await clearLocation()) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card} accessibilityViewIsModal>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Close location prompt"
          >
            <Ionicons name="close" size={22} color="#59615A" />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="location" size={30} color="#2E7D32" />
          </View>
          <Text style={styles.title}>Find food made near you</Text>
          <Text style={styles.description}>
            Choose an area to sort home restaurants by proximity. Chefin uses foreground location
            only and never shares your exact position with cooks.
          </Text>

          {manualMode ? (
            <View style={styles.manualSection}>
              <Text style={styles.fieldLabel}>NEIGHBOURHOOD, TOWN OR POSTCODE</Text>
              <View style={styles.inputRow}>
                <Ionicons name="search-outline" size={20} color="#677069" />
                <TextInput
                  value={manualQuery}
                  onChangeText={text => {
                    setManualQuery(text);
                    clearError();
                  }}
                  placeholder="e.g. Bangsar or 59200"
                  placeholderTextColor="#9AA19B"
                  style={styles.input}
                  editable={!saving}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={handleManualLocation}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={handleManualLocation}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Use this area</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.textButton}
                onPress={() => {
                  setManualMode(false);
                  clearError();
                }}
                disabled={saving}
              >
                <Text style={styles.textButtonText}>Back to location options</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={handleCurrentLocation}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="navigate" size={19} color="#fff" />
                    <Text style={styles.primaryButtonText}>Use current location</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setManualMode(true);
                  clearError();
                }}
                disabled={saving}
              >
                <Ionicons name="create-outline" size={19} color="#2E7D32" />
                <Text style={styles.secondaryButtonText}>Enter an area manually</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textButton} onPress={dismiss} disabled={saving}>
                <Text style={styles.textButtonText}>{location ? 'Cancel' : 'Not now'}</Text>
              </TouchableOpacity>
              {location && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={removeSavedLocation}
                  disabled={saving}
                >
                  <Text style={styles.removeButtonText}>Clear saved location</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#B3261E" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.privacyRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#68746A" />
            <Text style={styles.privacyText}>
              No background tracking. Change or clear this anytime.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 28, 20, 0.48)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    paddingTop: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E7F5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: '#1D2A1F' },
  description: { fontSize: 14, lineHeight: 20, color: '#5E695F', marginTop: 8 },
  actions: { gap: 10, marginTop: 22 },
  manualSection: { marginTop: 20 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#687169', letterSpacing: 0.7 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5CD',
    borderRadius: 13,
    paddingHorizontal: 13,
    marginTop: 7,
    marginBottom: 12,
  },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 9, fontSize: 15, color: '#202721' },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BDD9C2',
    backgroundColor: '#F6FBF7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: { color: '#2E7D32', fontSize: 15, fontWeight: '700' },
  textButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: '#5B655D', fontSize: 14, fontWeight: '600' },
  removeButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: '#A13932', fontSize: 12, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#FDEDEA',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  errorText: { flex: 1, color: '#9C261E', fontSize: 12, lineHeight: 17 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  privacyText: { color: '#68746A', fontSize: 10, lineHeight: 14, textAlign: 'center' },
});
