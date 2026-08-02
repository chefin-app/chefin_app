import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';
import {
  MAX_REPORT_DETAILS_LENGTH,
  REPORT_REASONS,
  countReportCharacters,
  truncateReportDetails,
  validateReportDetails,
  type ReportReason,
  type ReportTargetType,
} from '@/src/utils/reporting';

type StatusState = 'idle' | 'checking' | 'available' | 'reported' | 'error' | 'authExpired';

type ReportApiResponse = {
  error?: string;
  code?: string;
  reported?: boolean;
  report?: {
    id?: string;
    status?: string;
    created_at?: string;
  } | null;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const parseResponse = async (response: Response): Promise<ReportApiResponse> =>
  response.json().catch(() => ({})) as Promise<ReportApiResponse>;

const buildReportReturnPath = (
  targetType: ReportTargetType,
  targetId: string,
  targetName: string
) =>
  `/report-listing?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}&targetName=${encodeURIComponent(targetName)}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ReportHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <View style={styles.header}>
    <TouchableOpacity
      style={styles.headerButton}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close report screen"
    >
      <Ionicons name="close" size={25} color="#1F2937" />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>{title}</Text>
    <View style={styles.headerButton} />
  </View>
);

export default function ReportListingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    targetType?: string | string[];
    targetId?: string | string[];
    targetName?: string | string[];
  }>();
  const { session, initializing } = useAuth();

  const rawTargetType = firstParam(params.targetType);
  const targetType: ReportTargetType = rawTargetType === 'restaurant' ? 'restaurant' : 'listing';
  const targetId = firstParam(params.targetId);
  const targetName =
    Array.from(firstParam(params.targetName).trim()).slice(0, 200).join('') || 'This listing';
  const validTarget =
    (rawTargetType === 'listing' || rawTargetType === 'restaurant') && UUID_PATTERN.test(targetId);
  const headerTitle = targetType === 'restaurant' ? 'Report a restaurant' : 'Report a dish';

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusState, setStatusState] = useState<StatusState>('idle');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [statusRetryKey, setStatusRetryKey] = useState(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (initializing || !session?.access_token || !validTarget) {
      setStatusState('idle');
      return;
    }

    const controller = new AbortController();
    const checkExistingReport = async () => {
      setStatusState('checking');
      try {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/reports/status/${targetType}/${encodeURIComponent(targetId)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            signal: controller.signal,
          }
        );
        const body = await parseResponse(response);
        if (response.status === 401) {
          setStatusState('authExpired');
          return;
        }
        if (!response.ok) throw new Error(body.error || 'Could not check report status.');
        if (body.reported) {
          setSubmittedAt(body.report?.created_at ?? null);
          setWasDuplicate(true);
          setStatusState('reported');
        } else {
          setStatusState('available');
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setStatusState('error');
      }
    };

    checkExistingReport();
    return () => controller.abort();
  }, [initializing, session?.access_token, statusRetryKey, targetId, targetType, validTarget]);

  const validationError = validateReportDetails(selectedReason, details);

  const handleSelectReason = (reason: ReportReason) => {
    setSelectedReason(reason);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    setSubmitError(null);
    if (validationError || !session?.access_token || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          targetType,
          targetId,
          reason: selectedReason,
          details: details.trim() || null,
        }),
      });
      const body = await parseResponse(response);

      if (response.status === 401) {
        setStatusState('authExpired');
        return;
      }
      if (response.status === 409 && body.code === 'DUPLICATE_REPORT') {
        setWasDuplicate(true);
        setSubmittedAt(body.report?.created_at ?? null);
        setStatusState('reported');
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'We could not submit your report. Please try again.');
      }

      setWasDuplicate(false);
      setSubmittedAt(body.report?.created_at ?? new Date().toISOString());
      setStatusState('reported');
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'We could not submit your report. Please try again.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSignIn = () => {
    const returnTo = buildReportReturnPath(targetType, targetId, targetName);
    router.push({ pathname: '/(auth)/login', params: { returnTo } });
  };

  const formattedSubmittedAt = submittedAt
    ? new Date(submittedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  if (!validTarget) {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <View style={styles.stateContainer}>
          <View style={[styles.stateIcon, styles.errorStateIcon]}>
            <Ionicons name="alert-circle-outline" size={38} color="#B42318" />
          </View>
          <Text style={styles.stateTitle}>
            {targetType === 'restaurant' ? 'Restaurant unavailable' : 'Dish unavailable'}
          </Text>
          <Text style={styles.stateText}>
            We could not identify the {targetType === 'restaurant' ? 'restaurant' : 'dish'} you want
            to report.
          </Text>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => router.back()}>
            <Text style={styles.secondaryActionText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (initializing) {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>Checking your account…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <View style={styles.stateContainer}>
          <View style={styles.stateIcon}>
            <Ionicons name="person-circle-outline" size={42} color="#2E7D32" />
          </View>
          <Text style={styles.stateTitle}>Sign in to report</Text>
          <Text style={styles.stateText}>
            Signing in helps prevent misuse and lets our moderation team follow up if needed.
          </Text>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={handleSignIn}
            accessibilityRole="button"
          >
            <Text style={styles.primaryActionText}>Sign in to continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textAction} onPress={() => router.back()}>
            <Text style={styles.textActionLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (statusState === 'authExpired') {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <View style={styles.stateContainer}>
          <View style={[styles.stateIcon, styles.errorStateIcon]}>
            <Ionicons name="lock-closed-outline" size={38} color="#B42318" />
          </View>
          <Text style={styles.stateTitle}>Your session has expired</Text>
          <Text style={styles.stateText}>
            Sign in again before submitting this report. We’ll bring you back to this form.
          </Text>
          <TouchableOpacity style={styles.primaryAction} onPress={handleSignIn}>
            <Text style={styles.primaryActionText}>Sign in again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textAction} onPress={() => router.back()}>
            <Text style={styles.textActionLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (statusState === 'checking' || statusState === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>Checking previous reports…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (statusState === 'reported') {
    return (
      <SafeAreaView style={styles.container}>
        <ReportHeader title={headerTitle} onClose={() => router.back()} />
        <ScrollView contentContainerStyle={styles.stateContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={42} color="#FFFFFF" />
          </View>
          <Text style={styles.stateEyebrow}>
            {wasDuplicate ? 'ALREADY RECEIVED' : 'REPORT SENT'}
          </Text>
          <Text style={styles.stateTitle}>
            {wasDuplicate ? 'You’ve already reported this' : 'Thank you for letting us know'}
          </Text>
          <Text style={styles.stateText}>
            Our moderation team can review {targetName}. Reports do not automatically remove a{' '}
            {targetType === 'restaurant' ? 'restaurant' : 'dish'}, and your identity is not shown to
            the cook.
          </Text>
          {formattedSubmittedAt && (
            <View style={styles.receiptPill}>
              <Ionicons name="time-outline" size={16} color="#47634A" />
              <Text style={styles.receiptText}>Received {formattedSubmittedAt}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.primaryAction} onPress={() => router.back()}>
            <Text style={styles.primaryActionText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ReportHeader title={headerTitle} onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.targetCard}>
            <View style={styles.targetIcon}>
              <Ionicons
                name={targetType === 'restaurant' ? 'storefront-outline' : 'restaurant-outline'}
                size={25}
                color="#2E7D32"
              />
            </View>
            <View style={styles.targetCopy}>
              <Text style={styles.targetType}>
                {targetType === 'restaurant' ? 'HOME RESTAURANT' : 'DISH LISTING'}
              </Text>
              <Text style={styles.targetName} numberOfLines={2}>
                {targetName}
              </Text>
            </View>
            <Ionicons name="flag-outline" size={21} color="#B42318" />
          </View>

          {statusState === 'error' && (
            <View style={styles.statusWarning} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={20} color="#8A5A00" />
              <View style={styles.statusWarningCopy}>
                <Text style={styles.statusWarningTitle}>Couldn’t check previous reports</Text>
                <Text style={styles.statusWarningText}>
                  You can still submit; duplicate protection remains active.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => setStatusRetryKey(key => key + 1)}
                accessibilityRole="button"
                accessibilityLabel="Retry report status check"
              >
                <Ionicons name="refresh" size={19} color="#6D4C00" />
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.formTitle}>What’s the issue?</Text>
          <Text style={styles.formSubtitle}>Choose the reason that fits best.</Text>

          <View style={styles.reasonList} accessibilityRole="radiogroup">
            {REPORT_REASONS.map(reason => {
              const selected = selectedReason === reason.id;
              return (
                <TouchableOpacity
                  key={reason.id}
                  style={[styles.reasonCard, selected && styles.reasonCardSelected]}
                  onPress={() => handleSelectReason(reason.id)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${reason.label}. ${reason.description}`}
                >
                  <View style={[styles.reasonIcon, selected && styles.reasonIconSelected]}>
                    <Ionicons
                      name={reason.icon}
                      size={21}
                      color={selected ? '#2E7D32' : '#59636E'}
                    />
                  </View>
                  <View style={styles.reasonCopy}>
                    <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                      {reason.label}
                    </Text>
                    <Text style={styles.reasonDescription}>{reason.description}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? '#4CAF50' : '#B9BEC4'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.detailsHeadingRow}>
            <Text style={styles.detailsLabel}>
              Additional details{' '}
              {selectedReason !== 'other' && <Text style={styles.optional}>(optional)</Text>}
            </Text>
            <Text style={styles.characterCount}>
              {countReportCharacters(details)}/{MAX_REPORT_DETAILS_LENGTH}
            </Text>
          </View>
          <TextInput
            style={styles.detailsInput}
            value={details}
            onChangeText={text => {
              setDetails(truncateReportDetails(text));
              setSubmitError(null);
            }}
            placeholder="Share specific details that will help us review this listing…"
            placeholderTextColor="#9097A0"
            multiline
            textAlignVertical="top"
            accessibilityLabel="Additional report details"
          />

          {attemptedSubmit && validationError && (
            <View style={styles.validationMessage} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle" size={18} color="#B42318" />
              <Text style={styles.validationText}>{validationError}</Text>
            </View>
          )}

          {submitError && (
            <View style={styles.submitError} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
              <Text style={styles.submitErrorText}>{submitError}</Text>
            </View>
          )}

          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={18} color="#47634A" />
            <Text style={styles.privacyText}>
              Your report goes to Chefin’s moderation team. Your identity is not shown to the cook.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flag" size={19} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Submit report</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F7',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
  },
  formContent: {
    padding: 20,
    paddingBottom: 44,
  },
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E7E3',
    borderRadius: 17,
    padding: 15,
    marginBottom: 26,
  },
  targetIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCopy: {
    flex: 1,
  },
  targetType: {
    color: '#59805E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  targetName: {
    color: '#20252B',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 13,
    padding: 13,
    marginBottom: 22,
  },
  statusWarningCopy: {
    flex: 1,
  },
  statusWarningTitle: {
    color: '#6D4C00',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusWarningText: {
    color: '#806A3A',
    fontSize: 12,
    lineHeight: 17,
  },
  retryButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    color: '#1F2937',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 5,
  },
  formSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 17,
  },
  reasonList: {
    gap: 10,
    marginBottom: 25,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E5E8',
    borderRadius: 15,
  },
  reasonCardSelected: {
    borderColor: '#66BB6A',
    backgroundColor: '#F2FAF3',
  },
  reasonIcon: {
    width: 41,
    height: 41,
    borderRadius: 12,
    backgroundColor: '#F1F3F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonIconSelected: {
    backgroundColor: '#DDF1DF',
  },
  reasonCopy: {
    flex: 1,
  },
  reasonLabel: {
    color: '#30363D',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  reasonLabelSelected: {
    color: '#205D25',
  },
  reasonDescription: {
    color: '#717982',
    fontSize: 11,
    lineHeight: 16,
  },
  detailsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  detailsLabel: {
    color: '#30363D',
    fontSize: 14,
    fontWeight: '700',
  },
  optional: {
    color: '#7A828A',
    fontWeight: '500',
  },
  characterCount: {
    color: '#8A9199',
    fontSize: 11,
  },
  detailsInput: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: '#DDE1E4',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#252A30',
    fontSize: 14,
    lineHeight: 21,
  },
  validationMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 10,
  },
  validationText: {
    flex: 1,
    color: '#B42318',
    fontSize: 12,
    lineHeight: 17,
  },
  submitError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    padding: 13,
    marginTop: 15,
  },
  submitErrorText: {
    flex: 1,
    color: '#8C221B',
    fontSize: 13,
    lineHeight: 18,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#EAF4EB',
    borderRadius: 12,
    padding: 13,
    marginTop: 20,
    marginBottom: 16,
  },
  privacyText: {
    flex: 1,
    color: '#47634A',
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#B42318',
    borderRadius: 14,
    paddingHorizontal: 18,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stateContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 36,
  },
  stateIcon: {
    width: 82,
    height: 82,
    borderRadius: 26,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  errorStateIcon: {
    backgroundColor: '#FDECEC',
  },
  successIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stateEyebrow: {
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  stateTitle: {
    color: '#1F2937',
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  stateText: {
    maxWidth: 420,
    color: '#66707A',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
  },
  loadingText: {
    color: '#66707A',
    fontSize: 14,
    marginTop: 15,
  },
  receiptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#EAF4EB',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 23,
  },
  receiptText: {
    color: '#47634A',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryAction: {
    width: '100%',
    maxWidth: 420,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryAction: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D3D8DC',
    borderRadius: 13,
    paddingHorizontal: 24,
  },
  secondaryActionText: {
    color: '#3A424A',
    fontSize: 14,
    fontWeight: '700',
  },
  textAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  textActionLabel: {
    color: '#58616B',
    fontSize: 14,
    fontWeight: '600',
  },
});
