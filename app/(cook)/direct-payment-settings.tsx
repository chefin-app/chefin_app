import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';
import {
  PaymentSettingsHeader,
  PaymentSettingsButton,
  paymentSettingsStyles,
} from '@/src/components/settings/PaymentSettingsUI';
import theme from '@/src/styles/theme';

export default function DirectPaymentSettings() {
  const { session, user } = useAuth();
  const router = useRouter();
  const [qrEnabled, setQrEnabled] = useState(false);
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user || !session) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/direct-payments/settings/${data.id}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active && body.settings) {
          setQrEnabled(body.settings.qr_enabled);
          setCollectionEnabled(body.settings.collection_enabled);
          setRecipientName(body.settings.recipient_name ?? '');
          setQrImage(body.settings.qr_image);
        }
      } catch {
        if (active) setError('Could not load payment settings. Reopen this screen to retry.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, session]);
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 1,
    });
    if (!result.canceled && result.assets[0].base64) {
      const asset = result.assets[0];
      if (
        (asset.base64?.length ?? 0) > 2_800_000 ||
        !['image/png', 'image/jpeg'].includes(asset.mimeType ?? 'image/jpeg')
      ) {
        Alert.alert('Image too large or unsupported', 'Choose a JPEG or PNG smaller than 2 MB.');
        return;
      }
      setQrImage(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/direct-payments/settings`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ qrEnabled, collectionEnabled, recipientName, qrImage }),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      Alert.alert('Saved', 'These options will apply to new orders.');
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please retry.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <SafeAreaView style={styles.container}>
      <PaymentSettingsHeader title="Customer Payment Options" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.toggleLabel}>Accept direct DuitNow QR</Text>
                <Switch
                  accessibilityLabel="Accept direct DuitNow QR"
                  disabled={saving}
                  value={qrEnabled}
                  onValueChange={setQrEnabled}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
              <Text style={styles.body}>
                Use a QR belonging to you that your bank permits for sales. Enter the exact
                recipient name buyers will see.
              </Text>
              <View>
                <Text style={styles.fieldLabel}>QR RECIPIENT NAME</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    accessibilityLabel="QR recipient name"
                    placeholder="Recipient name shown by bank"
                    value={recipientName}
                    onChangeText={setRecipientName}
                    style={styles.input}
                    maxLength={120}
                    editable={!saving}
                    placeholderTextColor={theme.colors.placeholder}
                  />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void pick()}
                  style={styles.uploadButton}
                >
                  <Text style={styles.uploadText}>
                    {qrImage ? 'Replace DuitNow QR image' : 'Upload DuitNow QR image'}
                  </Text>
                </TouchableOpacity>
              </View>
              {qrImage && (
                <Image source={{ uri: qrImage }} resizeMode="contain" style={styles.qr} />
              )}
              <View style={styles.row}>
                <Text style={styles.toggleLabel}>Allow pay on collection</Text>
                <Switch
                  accessibilityLabel="Allow pay on collection"
                  disabled={saving}
                  value={collectionEnabled}
                  onValueChange={setCollectionEnabled}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
              <Text style={styles.body}>
                Buyers pay you in cash or an agreed QR payment when collecting food. This option is
                not available for delivery.
              </Text>
              <Text style={styles.body}>
                Check your own bank account before confirming a QR payment. You are responsible for
                returning approved refunds directly to buyers.
              </Text>
              <PaymentSettingsButton
                loading={saving}
                onPress={() => void save()}
                title="Save payment options"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  ...paymentSettingsStyles,
  flex: { flex: 1 },
  content: { padding: 20, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: '#222' },
  uploadButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
  },
  uploadText: { color: theme.colors.primary, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  error: { color: theme.colors.error, fontSize: 14, lineHeight: 21 },
  qr: { width: '100%', height: 260 },
});
