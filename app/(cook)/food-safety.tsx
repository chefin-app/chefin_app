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
import {
  TIER1_DOCUMENTS,
  VERIFICATION_BUCKET,
  VerificationDocStatus,
  VerificationDocType,
} from '@/src/constants/verification';
import { FoodComplianceAcknowledgement } from '@/src/components/food-safety/FoodComplianceAcknowledgement';
import { FOOD_SAFETY_WAIVER_VERSION } from '@/src/constants/foodSafetyWaiver';
import {
  getCurrentFoodComplianceAcceptance,
  recordFoodComplianceAcceptance,
} from '@/src/utils/foodCompliance';

type HostingType = 'private' | 'business' | null;

/** A doc row already submitted to the DB. */
interface SubmittedDoc {
  id: string;
  status: VerificationDocStatus;
  reviewer_note: string | null;
  storage_path: string;
}

/** A freshly picked local file, not yet uploaded. */
interface PendingAsset {
  uri: string;
  mime: string;
  name: string;
  isPdf: boolean;
}

const STATUS_META: Record<VerificationDocStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending review', color: '#B26A00', bg: '#FFF3E0' },
  approved: { label: 'Verified', color: '#2E7D32', bg: '#E8F5E9' },
  rejected: { label: 'Rejected', color: '#C62828', bg: '#FFEBEE' },
  more_info_requested: { label: 'More information needed', color: '#175CD3', bg: '#EFF8FF' },
};

export default function FoodSafetyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ onboarding?: string; next?: string }>();
  const isOnboarding = params.onboarding === '1' || params.onboarding === 'true';
  const { setFoodSafety: stashFoodSafety } = useOnboarding();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [complianceAccepted, setComplianceAccepted] = useState(false);
  const [complianceAcceptedAt, setComplianceAcceptedAt] = useState<string | null>(null);

  const [hostingType, setHostingType] = useState<HostingType>(null);
  // Latest submitted row per doc type (if any).
  const [submittedDocs, setSubmittedDocs] = useState<
    Partial<Record<VerificationDocType, SubmittedDoc>>
  >({});
  // Locally picked files awaiting upload (uploaded on Save / final commit).
  const [pendingAssets, setPendingAssets] = useState<
    Partial<Record<VerificationDocType, PendingAsset>>
  >({});

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
          .select('hosting_type')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) setHostingType((data.hosting_type as HostingType) ?? null);

        const { data: docs, error: docsErr } = await supabase
          .from('verification_documents')
          .select('id, doc_type, status, reviewer_note, storage_path')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false });
        if (docsErr) throw docsErr;

        const latest: Partial<Record<VerificationDocType, SubmittedDoc>> = {};
        for (const d of docs ?? []) {
          const t = d.doc_type as VerificationDocType;
          if (!latest[t]) {
            latest[t] = {
              id: d.id,
              status: d.status as VerificationDocStatus,
              reviewer_note: d.reviewer_note,
              storage_path: d.storage_path,
            };
          }
        }
        setSubmittedDocs(latest);

        const acceptance = await getCurrentFoodComplianceAcceptance(user.id);
        if (acceptance) {
          setComplianceAccepted(true);
          setComplianceAcceptedAt(acceptance.acceptedAt);
        }
      } catch (e: any) {
        console.warn('Could not load food safety details', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const pickDoc = async (docType: VerificationDocType) => {
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

    setPendingAssets(prev => ({
      ...prev,
      [docType]: {
        uri: asset.uri,
        mime: contentType,
        name: asset.name ?? `${docType}.${ext}`,
        isPdf: ext === 'pdf',
      },
    }));
  };

  const removePendingDoc = (docType: VerificationDocType) => {
    setPendingAssets(prev => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  // Documents remain optional, but every cook must acknowledge their legal
  // responsibilities before continuing past this step.
  const canAdvance = hostingType != null && complianceAccepted;

  const handleNext = async () => {
    if (!user || !canAdvance) return;

    // ── Onboarding path: stash to context, defer upload + DB write to the
    // final payment-methods step.
    if (isOnboarding) {
      stashFoodSafety({
        hostingType,
        complianceAccepted,
        complianceVersion: FOOD_SAFETY_WAIVER_VERSION,
        documents: (Object.entries(pendingAssets) as [VerificationDocType, PendingAsset][]).map(
          ([docType, a]) => ({
            docType,
            uri: a.uri,
            mimeType: a.mime,
            fileName: a.name,
          })
        ),
      });
      router.push({
        pathname: '/(cook)/payout-details',
        params: { onboarding: 'cook' },
      });
      return;
    }

    // ── Normal "edit from profile" path: upload new docs + write to DB.
    setSaving(true);
    try {
      // Record the exact, versioned terms before any profile or document
      // mutation. The database supplies the acceptance timestamp.
      await recordFoodComplianceAcceptance(user.id, 'food_safety_screen');

      let certificatePath: string | null = null;
      for (const [docType, asset] of Object.entries(pendingAssets) as [
        VerificationDocType,
        PendingAsset,
      ][]) {
        const ext = asset.name.split('.').pop()?.toLowerCase() ?? 'pdf';
        const path = `${user.id}/${docType}-${Date.now()}.${ext}`;
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from(VERIFICATION_BUCKET)
          .upload(path, arrayBuffer, { contentType: asset.mime, upsert: false });
        if (uploadErr) throw uploadErr;

        const { error: docErr } = await supabase.from('verification_documents').insert({
          user_id: user.id,
          doc_type: docType,
          storage_path: path,
          status: 'pending',
        });
        if (docErr) throw docErr;
        if (docType === 'food_handler_certificate') certificatePath = path;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          hosting_type: hostingType,
          // Legacy columns kept coherent for older read paths.
          ...(certificatePath
            ? { has_food_safety_license: true, food_safety_license_url: certificatePath }
            : {}),
        })
        .eq('user_id', user.id);
      if (error) throw error;

      if (Object.keys(pendingAssets).length > 0) {
        Alert.alert(
          'Documents submitted',
          "Thanks! We'll review your documents and grant your Verified badge once approved."
        );
      }
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

        {/* Optional Tier 1 verification documents */}
        <View style={styles.tierCallout}>
          <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
          <View style={{ flex: 1 }}>
            <Text style={styles.tierCalloutTitle}>Get a platform Verified badge (optional)</Text>
            <Text style={styles.tierCalloutBody}>
              Upload any credential below for review. This badge is not a licence or proof of full
              regulatory compliance. You can skip every upload and add documents later.
            </Text>
          </View>
        </View>

        <FoodComplianceAcknowledgement
          accepted={complianceAccepted}
          onAcceptedChange={setComplianceAccepted}
          acceptedAt={complianceAcceptedAt}
        />

        {TIER1_DOCUMENTS.map(doc => {
          const submitted = submittedDocs[doc.type];
          const pending = pendingAssets[doc.type];
          // A rejected document or one needing more information can be replaced.
          const canResubmit =
            submitted?.status === 'rejected' || submitted?.status === 'more_info_requested';
          const locked = submitted != null && !canResubmit && !pending;

          return (
            <View key={doc.type} style={styles.docBlock}>
              <View style={styles.docHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.question}>{doc.title}</Text>
                  <Text style={styles.questionSubtitle}>{doc.subtitle}</Text>
                </View>
                {submitted && !pending && (
                  <View
                    style={[
                      styles.statusChip,
                      { backgroundColor: STATUS_META[submitted.status].bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: STATUS_META[submitted.status].color },
                      ]}
                    >
                      {STATUS_META[submitted.status].label}
                    </Text>
                  </View>
                )}
              </View>

              {canResubmit && submitted?.reviewer_note && !pending && (
                <Text style={styles.rejectionNote}>
                  {submitted.status === 'more_info_requested'
                    ? 'Information requested'
                    : 'Reviewer note'}
                  : {submitted.reviewer_note}
                </Text>
              )}

              {!locked && (
                <>
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={() => pickDoc(doc.type)}
                    activeOpacity={0.7}
                  >
                    {pending ? (
                      pending.isPdf ? (
                        <View style={styles.pdfBadge}>
                          <Ionicons name="document-text-outline" size={32} color="#1A1A1A" />
                          <Text style={styles.pdfBadgeText} numberOfLines={1}>
                            {pending.name}
                          </Text>
                          <Text style={styles.pdfBadgeHint}>Tap to replace</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: pending.uri }} style={styles.uploadPreview} />
                      )
                    ) : (
                      <View style={styles.pdfBadge}>
                        <Ionicons name="add" size={32} color="#888" />
                        <Text style={styles.pdfBadgeHint}>Upload a photo, scan or PDF</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {pending && (
                    <TouchableOpacity onPress={() => removePendingDoc(doc.type)}>
                      <Text style={styles.removeDocText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })}

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
              <Text style={styles.nextBtnText}>
                {complianceAcceptedAt
                  ? isOnboarding
                    ? 'Continue'
                    : 'Save'
                  : isOnboarding
                    ? 'Agree & continue'
                    : 'Agree & save'}
              </Text>
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

  tierCallout: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  tierCalloutTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  tierCalloutBody: { fontSize: 12, color: '#555', lineHeight: 17 },

  docBlock: { marginBottom: 8 },
  docHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusChip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  rejectionNote: { fontSize: 12, color: '#C62828', marginBottom: 8, lineHeight: 17 },
  removeDocText: {
    fontSize: 13,
    color: '#FF5252',
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: -2,
    marginBottom: 6,
  },

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
  uploadFootnote: { fontSize: 12, color: '#888', lineHeight: 17, marginTop: 8 },
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
