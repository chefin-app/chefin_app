import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

type Evidence = { base64: string; uri: string; contentType: string };
type RefundState = {
  request: {
    id: string;
    reason_code: string;
    status: string;
    decision_note: string | null;
    created_at: string;
  } | null;
  policy: {
    windowMinutes: number;
    deadline: string | null;
    eligible: boolean;
    photoRequired: boolean;
  };
};

const REASONS = [
  ['never_arrived', 'Order never arrived'],
  ['missing_items', 'Missing items'],
  ['incorrect_item', 'Incorrect item'],
  ['food_quality', 'Food quality issue'],
  ['damaged_order', 'Damaged order'],
  ['other', 'Other'],
] as const;

const humanize = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

export default function CustomerRefundRequestCard({
  orderId,
  accessToken,
  completed,
}: {
  orderId: string;
  accessToken?: string | null;
  completed: boolean;
}) {
  const [state, setState] = useState<RefundState | null>(null);
  const [visible, setVisible] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>('other');
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async (method: 'GET' | 'POST', body?: Record<string, unknown>) => {
      if (!accessToken) throw new Error('Sign in again to manage this order.');
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}/refund-request`,
        {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as RefundState & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'The refund request could not be processed.');
      return payload;
    },
    [accessToken, orderId]
  );

  const load = useCallback(async () => {
    if (!completed || !accessToken) return;
    setLoading(true);
    try {
      setState(await request('GET'));
    } catch (caught: unknown) {
      console.warn('Could not load refund policy', caught);
    } finally {
      setLoading(false);
    }
  }, [accessToken, completed, request]);

  useEffect(() => {
    load();
  }, [load]);

  if (!completed) return null;

  const pickEvidence = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access or select a photo instead.');
        return;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo permission needed', 'Allow photo access to attach evidence.');
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
    Alert.alert('Add photo evidence', undefined, [
      { text: 'Take photo', onPress: () => pickEvidence(true) },
      { text: 'Choose photo', onPress: () => pickEvidence(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const submit = async () => {
    if (saving) return;
    if (details.trim().length < 10) {
      setError('Describe what happened in at least 10 characters.');
      return;
    }
    if (state?.policy.photoRequired && !evidence) {
      setError('Add a photo of the collected dish before submitting.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request('POST', {
        reasonCode,
        reasonDetails: details.trim(),
        ...(evidence ? { imageBase64: evidence.base64, contentType: evidence.contentType } : {}),
      });
      setVisible(false);
      await load();
      Alert.alert(
        'Refund request submitted',
        'Chefin will review your request manually. Submitting a request does not guarantee approval.'
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !state) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#4CAF50" />
      </View>
    );
  }

  if (state?.request) {
    return (
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={20} color="#9A6700" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Refund request: {humanize(state.request.status)}</Text>
          <Text style={styles.body}>
            Chefin is manually reviewing your {humanize(state.request.reason_code).toLowerCase()}{' '}
            claim.
          </Text>
          {state.request.decision_note ? (
            <Text style={styles.note}>{state.request.decision_note}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (!state?.policy.eligible) {
    return (
      <View style={styles.closedCard}>
        <Ionicons name="time-outline" size={18} color="#7A847D" />
        <Text style={styles.closedText}>
          The {state?.policy.windowMinutes ?? 120}-minute refund request window has closed. Contact
          support for exceptional cases.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#237A3B" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Something wrong with your order?</Text>
          <Text style={styles.body}>
            Submit a request within {state.policy.windowMinutes} minutes of completion. Every
            request is reviewed by a person.
          </Text>
          <TouchableOpacity style={styles.openButton} onPress={() => setVisible(true)}>
            <Text style={styles.openButtonText}>Request a refund review</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.backdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Request refund review</Text>
                <Text style={styles.modalSubtitle}>
                  Requests are assessed manually and may be rejected if evidence does not support
                  the claim.
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color="#344039" />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>WHAT WENT WRONG?</Text>
              <View style={styles.reasonList}>
                {REASONS.map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.reasonButton, reasonCode === key && styles.reasonButtonActive]}
                    onPress={() => setReasonCode(key)}
                  >
                    <Text
                      style={[styles.reasonText, reasonCode === key && styles.reasonTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>DETAILS</Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                style={styles.textArea}
                multiline
                textAlignVertical="top"
                placeholder="Explain what happened and which items were affected…"
                placeholderTextColor="#9AA29D"
                maxLength={2000}
              />
              <Text style={styles.label}>
                PHOTO EVIDENCE {state.policy.photoRequired ? '(REQUIRED FOR PICKUP)' : '(OPTIONAL)'}
              </Text>
              <TouchableOpacity style={styles.evidenceButton} onPress={chooseEvidence}>
                {evidence ? (
                  <Image source={{ uri: evidence.uri }} style={styles.evidenceImage} />
                ) : (
                  <Ionicons name="camera-outline" size={22} color="#56635B" />
                )}
                <Text style={styles.evidenceText}>
                  {evidence ? 'Replace photo' : 'Take or choose a photo'}
                </Text>
              </TouchableOpacity>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.disclaimer}>
                Delivery “never arrived” claims are checked against rider/drop-off confirmation. No
                request is automatically approved.
              </Text>
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>Submit for review</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#D7E7DB',
    borderRadius: 16,
    backgroundColor: '#F6FBF7',
    marginTop: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4F4E8',
  },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: '#26372B' },
  body: { fontSize: 12, lineHeight: 18, color: '#657067', marginTop: 4 },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5D5540',
    marginTop: 8,
    padding: 9,
    borderRadius: 9,
    backgroundColor: '#FFF6D8',
  },
  openButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#E3F4E7',
    marginTop: 10,
  },
  openButtonText: { fontSize: 12, fontWeight: '800', color: '#237A3B' },
  closedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 13,
    backgroundColor: '#F5F6F5',
    marginTop: 14,
  },
  closedText: { flex: 1, fontSize: 11, lineHeight: 16, color: '#7A847D' },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(18, 28, 22, 0.5)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 19,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E9E7',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1F2923' },
  modalSubtitle: { fontSize: 11, lineHeight: 17, color: '#7A847D', marginTop: 4 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F2',
  },
  modalBody: { padding: 19, gap: 10 },
  label: { fontSize: 10, fontWeight: '800', color: '#69746D', letterSpacing: 0.5, marginTop: 5 },
  reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reasonButton: {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 9,
  },
  reasonButtonActive: { borderColor: '#4CAF50', backgroundColor: '#EAF8EE' },
  reasonText: { fontSize: 11, fontWeight: '600', color: '#657067' },
  reasonTextActive: { color: '#237A3B' },
  textArea: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    padding: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#29342D',
  },
  evidenceButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    backgroundColor: '#FAFBFA',
  },
  evidenceImage: { width: 40, height: 40, borderRadius: 9 },
  evidenceText: { fontSize: 12, fontWeight: '700', color: '#56635B' },
  error: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#B42318',
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#FFF3F2',
  },
  disclaimer: { fontSize: 10, lineHeight: 15, color: '#7B857E', marginTop: 3 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    padding: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E9E7',
  },
  cancelButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 10,
  },
  cancelText: { fontSize: 12, fontWeight: '700', color: '#5F6A63' },
  submitButton: {
    minHeight: 42,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
  },
  submitText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
});
