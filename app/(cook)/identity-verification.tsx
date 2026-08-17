import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

const BUCKET = 'cook-identity-documents';
type Citizenship = 'malaysian_citizen' | 'permanent_resident';
type Asset = { uri: string; mime: string; name: string; isPdf: boolean };

export default function IdentityVerificationScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const [citizenship, setCitizenship] = useState<Citizenship | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);

  const selectCitizenship = (value: Citizenship) => {
    setCitizenship(value);
    setAsset(null);
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    const ext = (file.name?.split('.').pop() ?? file.uri.split('.').pop() ?? 'pdf').toLowerCase();
    setAsset({
      uri: file.uri,
      mime:
        file.mimeType ??
        (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`),
      name: file.name ?? `identity.${ext}`,
      isPdf: ext === 'pdf',
    });
  };

  const submit = async () => {
    if (!user || !session?.access_token || !citizenship || !asset) return;
    setSaving(true);
    try {
      const documentType = citizenship === 'malaysian_citizen' ? 'mykad' : 'mypr';
      const ext = asset.name.split('.').pop()?.toLowerCase() ?? 'pdf';
      const storagePath = `${user.id}/${documentType}-${Date.now()}.${ext}`;
      const localResponse = await fetch(asset.uri);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, await localResponse.arrayBuffer(), {
          contentType: asset.mime,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/cook-applications/submit`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            citizenshipType: citizenship,
            documentType,
            identityStoragePath: storagePath,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Identity submission failed.');
      Alert.alert('Submitted for review', 'Your new identity document is now pending review.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error: unknown) {
      Alert.alert('Could not submit', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color="#344039" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Identity verification</Text>
        <View style={styles.closeButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.lockCallout}>
          <Ionicons name="lock-closed-outline" size={22} color="#237A3B" />
          <View style={styles.flex}>
            <Text style={styles.calloutTitle}>Private and access-controlled</Text>
            <Text style={styles.calloutBody}>
              Only an authorised identity reviewer can open a five-minute secure link. Every view
              and decision is recorded in the admin audit trail.
            </Text>
          </View>
        </View>
        <Text style={styles.label}>YOUR ELIGIBILITY</Text>
        <Choice
          label="Malaysian citizen"
          hint="MyKad required"
          selected={citizenship === 'malaysian_citizen'}
          onPress={() => selectCitizenship('malaysian_citizen')}
        />
        <Choice
          label="Malaysian permanent resident"
          hint="MyPR required"
          selected={citizenship === 'permanent_resident'}
          onPress={() => selectCitizenship('permanent_resident')}
        />
        {citizenship && (
          <>
            <Text style={styles.label}>
              {citizenship === 'malaysian_citizen' ? 'MYKAD' : 'MYPR'} DOCUMENT
            </Text>
            <TouchableOpacity style={styles.upload} onPress={pickFile}>
              {asset ? (
                asset.isPdf ? (
                  <View style={styles.fileSummary}>
                    <Ionicons name="document-lock-outline" size={36} color="#344039" />
                    <Text style={styles.fileName}>{asset.name}</Text>
                    <Text style={styles.hint}>Tap to replace</Text>
                  </View>
                ) : (
                  <Image source={{ uri: asset.uri }} style={styles.preview} />
                )
              ) : (
                <View style={styles.fileSummary}>
                  <Ionicons name="cloud-upload-outline" size={36} color="#77817B" />
                  <Text style={styles.fileName}>Upload a clear photo, scan or PDF</Text>
                  <Text style={styles.hint}>Maximum 10 MB</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[styles.submit, (!citizenship || !asset || saving) && styles.submitDisabled]}
          disabled={!citizenship || !asset || saving}
          onPress={submit}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit for review</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
      <View style={styles.flex}>
        <Text style={styles.choiceTitle}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? '#4CAF50' : '#A4ADA7'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E9E6',
  },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#26322B' },
  content: { padding: 22, gap: 12, paddingBottom: 50 },
  flex: { flex: 1 },
  lockCallout: {
    flexDirection: 'row',
    gap: 11,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#EAF7ED',
    marginBottom: 10,
  },
  calloutTitle: { fontSize: 14, fontWeight: '800', color: '#245D31' },
  calloutBody: { fontSize: 12, lineHeight: 18, color: '#4D6753', marginTop: 3 },
  label: { fontSize: 10, fontWeight: '800', color: '#7A847E', letterSpacing: 0.8, marginTop: 10 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DEE5E0',
    borderRadius: 13,
    padding: 14,
  },
  choiceSelected: { borderColor: '#4CAF50', backgroundColor: '#F3FBF5' },
  choiceTitle: { fontSize: 14, fontWeight: '700', color: '#28332C' },
  hint: { fontSize: 11, color: '#818A84', marginTop: 3 },
  upload: {
    height: 190,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C8D1CB',
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileSummary: { alignItems: 'center', gap: 6, padding: 20 },
  fileName: { fontSize: 13, fontWeight: '700', color: '#344039', textAlign: 'center' },
  preview: { width: '100%', height: '100%' },
  submit: {
    marginTop: 18,
    backgroundColor: '#4CAF50',
    borderRadius: 13,
    alignItems: 'center',
    paddingVertical: 15,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
