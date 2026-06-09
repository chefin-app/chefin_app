import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { useOnboarding } from '@/src/context/OnboardingContext';

const BUCKET = 'food-safety-licenses';

type HostingType = 'private' | 'business' | null;
type LicenseAnswer = 'yes' | 'no' | null;

export default function FoodSafetyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ onboarding?: string; next?: string }>();
  const isOnboarding = params.onboarding === '1' || params.onboarding === 'true';
  const { setFoodSafety: stashFoodSafety } = useOnboarding();

  // Local-only file metadata kept while onboarding (uploaded at final commit).
  const [pendingLicenseUri, setPendingLicenseUri] = useState<string | null>(null);
  const [pendingLicenseMime, setPendingLicenseMime] = useState<string | null>(null);
  const [pendingLicenseName, setPendingLicenseName] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [hostingType, setHostingType] = useState<HostingType>(null);
  const [licenseAnswer, setLicenseAnswer] = useState<LicenseAnswer>(null);
  // The stored path (private bucket key), not a public URL — we render a
  // signed URL for preview.
  const [licensePath, setLicensePath] = useState<string | null>(null);
  const [licensePreviewUrl, setLicensePreviewUrl] = useState<string | null>(null);
  const [licenseIsPdf, setLicenseIsPdf] = useState(false);

  // Load existing values
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('hosting_type, has_food_safety_license, food_safety_license_url')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setHostingType((data.hosting_type as HostingType) ?? null);
          if (data.has_food_safety_license === true) setLicenseAnswer('yes');
          else if (data.has_food_safety_license === false) setLicenseAnswer('no');
          const path = data.food_safety_license_url ?? null;
          setLicensePath(path);
          setLicenseIsPdf(path?.toLowerCase().endsWith('.pdf') ?? false);
          if (path) {
            // Generate a signed URL for the private bucket so we can show the
            // existing upload.
            const { data: signed } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(path, 60 * 60);
            setLicensePreviewUrl(signed?.signedUrl ?? null);
          }
        }
      } catch (e: any) {
        console.warn('Could not load food safety details', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const pickAndUploadLicense = async () => {
    if (!user) return;
    // Document picker — restricts to PDF and image files (scan/photo of license).
    // Excludes the photo/video library and camera roll.
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const ext = (asset.name?.split('.').pop() ?? asset.uri.split('.').pop() ?? 'pdf').toLowerCase();
    const contentType =
      asset.mimeType ??
      (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);

    // Onboarding: hold the local file in memory; the final commit uploads it
    // along with everything else. Nothing hits Supabase yet.
    if (isOnboarding) {
      setPendingLicenseUri(asset.uri);
      setPendingLicenseMime(contentType);
      setPendingLicenseName(asset.name ?? `license.${ext}`);
      setLicenseIsPdf(ext === 'pdf');
      setLicensePreviewUrl(asset.uri); // local URI works as preview
      setLicensePath('pending'); // sentinel so canAdvance / handleNext see "uploaded"
      return;
    }

    setUploading(true);
    try {
      const path = `${user.id}/license-${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      setLicensePath(path);
      setLicenseIsPdf(ext === 'pdf');
      setLicensePreviewUrl(signed?.signedUrl ?? null);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  // Next is enabled as soon as both questions are answered. Whether the
  // license upload is required is checked in `handleNext` so we can show an
  // explanatory alert instead of silently disabling the button.
  const canAdvance = hostingType != null && licenseAnswer != null;

  const handleNext = async () => {
    if (!user || !canAdvance) return;
    if (licenseAnswer === 'yes' && !licensePath) {
      Alert.alert(
        'Upload your license',
        'Please upload a copy of your food safety license to continue, or pick "No, I don\'t have one".'
      );
      return;
    }

    // ── Onboarding path: stash to context, defer upload + DB write to the
    // final payment-methods step.
    if (isOnboarding) {
      stashFoodSafety({
        hostingType,
        hasLicense: licenseAnswer === 'yes',
        licenseUri: licenseAnswer === 'yes' ? pendingLicenseUri : null,
        licenseMimeType: licenseAnswer === 'yes' ? pendingLicenseMime : null,
        licenseFileName: licenseAnswer === 'yes' ? pendingLicenseName : null,
      });
      router.push({
        pathname: '/(user)/payment-methods',
        params: { onboarding: 'cook' },
      });
      return;
    }

    // ── Normal "edit from profile" path: write straight to DB.
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          hosting_type: hostingType,
          has_food_safety_license: licenseAnswer === 'yes',
          food_safety_license_url: licenseAnswer === 'yes' ? licensePath : null,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExit = () => {
    if (!isOnboarding) {
      router.back();
      return;
    }
    Alert.alert('Save & exit', 'Your progress will be discarded.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => router.back() },
    ]);
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
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.saveExitChip} onPress={handleSaveExit}>
          <Text style={styles.saveExitText}>Save & exit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Share food safety details</Text>

        {/* Hosting type */}
        <Text style={styles.question}>How are you hosting on Chefin?</Text>
        <RadioRow
          title="I'm hosting as a private individual"
          subtitle="Perfect for cooks sharing meals from home"
          selected={hostingType === 'private'}
          onPress={() => setHostingType('private')}
        />
        <RadioRow
          title="I'm hosting as part of a business"
          subtitle="If you run a licensed kitchen or catering business"
          selected={hostingType === 'business'}
          onPress={() => setHostingType('business')}
        />

        <View style={styles.divider} />

        {/* License */}
        <Text style={styles.question}>Do you have a valid Food Safety License?</Text>
        <Text style={styles.questionSubtitle}>
          Sharing your license helps build trust and unlocks the &ldquo;Verified Cook&rdquo; status.
        </Text>

        <RadioRow
          title="Yes, I have a license"
          selected={licenseAnswer === 'yes'}
          onPress={() => setLicenseAnswer('yes')}
        />

        {licenseAnswer === 'yes' && (
          <View style={styles.uploadWrap}>
            <Text style={styles.uploadHint}>Upload a photo or scan:</Text>
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={pickAndUploadLicense}
              disabled={uploading}
              activeOpacity={0.7}
            >
              {uploading ? (
                <ActivityIndicator color="#666" />
              ) : licensePreviewUrl ? (
                licenseIsPdf ? (
                  <View style={styles.pdfBadge}>
                    <Ionicons name="document-text-outline" size={32} color="#1A1A1A" />
                    <Text style={styles.pdfBadgeText} numberOfLines={1}>
                      License.pdf
                    </Text>
                    <Text style={styles.pdfBadgeHint}>Tap to replace</Text>
                  </View>
                ) : (
                  <Image source={{ uri: licensePreviewUrl }} style={styles.uploadPreview} />
                )
              ) : (
                <Ionicons name="add" size={32} color="#888" />
              )}
            </TouchableOpacity>
            <Text style={styles.uploadFootnote}>
              Your documents are kept secure and confidential. Need help? Read our{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL('https://chefin.app/food-safety-guide')}
              >
                food safety guide
              </Text>
              .
            </Text>
          </View>
        )}

        <RadioRow
          title="No, I don't have one"
          subtitle="Don't worry, you can still cook. We'll share simple safety guidelines for home cooks"
          selected={licenseAnswer === 'no'}
          onPress={() => {
            setLicenseAnswer('no');
            setLicensePath(null);
            setLicensePreviewUrl(null);
          }}
        />
      </ScrollView>

      <View style={styles.footer}>
        {isOnboarding && (
          <View style={styles.progressRow}>
            <View style={[styles.progressSegment, styles.progressSegmentFilled]} />
            <View style={[styles.progressSegment, styles.progressSegmentFilled]} />
            <View style={[styles.progressSegment, styles.progressSegmentFilled]} />
          </View>
        )}
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canAdvance || saving}
            style={[styles.nextBtn, (!canAdvance || saving) && styles.nextBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextBtnText}>{isOnboarding ? 'Next' : 'Save'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function RadioRow({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.radioRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.radioTitle}>{title}</Text>
        {subtitle ? <Text style={styles.radioSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topRow: { paddingHorizontal: 24, paddingTop: 8 },
  saveExitChip: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveExitText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },

  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', lineHeight: 34, marginBottom: 24 },
  question: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12, marginTop: 8 },
  questionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    marginTop: -6,
    lineHeight: 18,
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  radioTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  radioSubtitle: { fontSize: 12, color: '#888', lineHeight: 16 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: '#4CAF50' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50' },

  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 16 },

  uploadWrap: { marginLeft: 4, marginTop: 4, marginBottom: 8 },
  uploadHint: { fontSize: 13, color: '#666', marginBottom: 8 },
  uploadBox: {
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCC',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  uploadPreview: { width: '100%', height: '100%' },
  pdfBadge: { alignItems: 'center', gap: 4 },
  pdfBadgeText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  pdfBadgeHint: { fontSize: 11, color: '#888' },
  uploadFootnote: { fontSize: 12, color: '#888', lineHeight: 17 },
  link: { color: '#1A1A1A', textDecorationLine: 'underline', fontWeight: '600' },

  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  progressSegment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#E0E0E0' },
  progressSegmentFilled: { backgroundColor: '#4CAF50' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backLink: { paddingVertical: 12, paddingRight: 12 },
  backLinkText: {
    fontSize: 15,
    color: '#1A1A1A',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 36,
    minWidth: 140,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#A5D6A7' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
