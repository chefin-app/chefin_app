import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Evidence = { base64: string; uri: string; contentType: string };

export default function PickupPinModal({
  visible,
  orderId,
  accessToken,
  onClose,
  onCompleted,
}: {
  visible: boolean;
  orderId: string | null;
  accessToken?: string | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'pin' | 'exception'>('pin');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode('pin');
    setCode('');
    setReason('');
    setEvidence(null);
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [visible]);

  const request = async (path: string, body: Record<string, unknown>) => {
    if (!orderId || !accessToken) throw new Error('Your session has expired.');
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}${path}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'The pickup could not be updated.');
    return payload;
  };

  const verify = async () => {
    if (code.length !== 4 || saving) return;
    setSaving(true);
    try {
      await request('/pickup-handoff/verify', { code });
      onCompleted();
      onClose();
    } catch (error: unknown) {
      Alert.alert(
        'Code not accepted',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const pickEvidence = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access or select a photo instead.');
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          base64: true,
        });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    setEvidence({
      base64: asset.base64,
      uri: asset.uri,
      contentType:
        asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
          ? asset.mimeType
          : 'image/jpeg',
    });
  };

  const chooseEvidence = () =>
    Alert.alert('Add handoff evidence', undefined, [
      { text: 'Take photo', onPress: () => pickEvidence(true) },
      { text: 'Choose photo', onPress: () => pickEvidence(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const submitException = async () => {
    if (reason.trim().length < 10 || saving) return;
    setSaving(true);
    try {
      await request('/pickup-handoff/exception', {
        reason: reason.trim(),
        ...(evidence ? { imageBase64: evidence.base64, contentType: evidence.contentType } : {}),
      });
      Alert.alert(
        'Sent to Chefin support',
        'The order remains open while an administrator reviews the handoff.',
        [{ text: 'Done', onPress: onClose }]
      );
    } catch (error: unknown) {
      Alert.alert(
        'Could not request review',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.icon}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#237A3B" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>
                {mode === 'pin' ? 'Confirm food handoff' : 'Request handoff review'}
              </Text>
              <Text style={styles.subtitle}>
                {mode === 'pin'
                  ? 'Ask the buyer for the four-digit code shown in their Chefin app.'
                  : 'Call or message the buyer and wait at least 10 minutes first. The pickup stays open until Chefin support reviews it.'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#4B554F" />
            </TouchableOpacity>
          </View>

          {mode === 'pin' ? (
            <>
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={4}
                style={styles.codeInput}
                placeholder="0000"
                placeholderTextColor="#C3CAC6"
                accessibilityLabel="Four-digit buyer pickup code"
              />
              <TouchableOpacity
                style={[styles.primary, code.length !== 4 && styles.disabled]}
                disabled={code.length !== 4 || saving}
                onPress={verify}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Verify and complete pickup</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={() => setMode('exception')}>
                <Text style={styles.linkText}>Unable to get the code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={1000}
                placeholder="Explain what happened and how you attempted to contact the buyer…"
                placeholderTextColor="#98A19B"
                style={styles.reasonInput}
              />
              <TouchableOpacity style={styles.evidenceButton} onPress={chooseEvidence}>
                {evidence ? (
                  <Image source={{ uri: evidence.uri }} style={styles.evidenceThumb} />
                ) : (
                  <Ionicons name="camera-outline" size={21} color="#237A3B" />
                )}
                <Text style={styles.evidenceText}>
                  {evidence ? 'Replace evidence photo' : 'Add evidence photo (optional)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primary, reason.trim().length < 10 && styles.disabled]}
                disabled={reason.trim().length < 10 || saving}
                onPress={submitException}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Send to support</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkButton} onPress={() => setMode('pin')}>
                <Text style={styles.linkText}>Back to code entry</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,28,23,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 24, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#1F2923' },
  subtitle: { marginTop: 5, fontSize: 14, lineHeight: 20, color: '#68736C' },
  codeInput: {
    height: 72,
    borderWidth: 1.5,
    borderColor: '#A9CBB3',
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 14,
    color: '#1E2922',
    paddingLeft: 14,
    backgroundColor: '#F8FBF9',
  },
  primary: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 26,
    backgroundColor: '#258B50',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.42 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  linkText: { color: '#356C49', fontSize: 14, fontWeight: '700' },
  reasonInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#D4DBD6',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
    color: '#253129',
  },
  evidenceButton: {
    minHeight: 50,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#CAD8CE',
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  evidenceThumb: { width: 34, height: 34, borderRadius: 7 },
  evidenceText: { color: '#237A3B', fontSize: 14, fontWeight: '700' },
});
