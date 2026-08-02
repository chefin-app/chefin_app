import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FOOD_SAFETY_WAIVER_ACCEPTANCE,
  FOOD_SAFETY_WAIVER_SECTIONS,
  FOOD_SAFETY_WAIVER_VERSION,
  LOCAL_AUTHORITY_GUIDANCE_URL,
  MOH_FOOD_PREMISES_GUIDANCE_URL,
} from '@/src/constants/foodSafetyWaiver';

interface FoodComplianceAcknowledgementProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  /** A server timestamp makes an existing, immutable acceptance read-only. */
  acceptedAt?: string | null;
}

/** Required acknowledgement for every cook completing the food-safety step. */
export function FoodComplianceAcknowledgement({
  accepted,
  onAcceptedChange,
  acceptedAt,
}: FoodComplianceAcknowledgementProps) {
  const [expanded, setExpanded] = useState(true);
  const isRecorded = Boolean(acceptedAt);

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Ionicons name="document-text-outline" size={20} color="#2E7D32" />
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Cook Compliance Acknowledgement and Indemnity
          </Text>
          <Text style={styles.requiredLabel}>
            {isRecorded ? 'Previously accepted' : 'Required to continue'}
          </Text>
        </View>
      </View>

      <Text style={styles.summary}>
        A Food Handler Certificate or anti-typhoid record supports platform verification. Neither
        document proves food-premises registration or a local-authority licence, and Chefin&apos;s
        review does not authorise you to operate or confirm full regulatory compliance.
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide full compliance clause' : 'Read full compliance clause'
        }
        accessibilityHint="Expands or collapses the clause on this screen"
        accessibilityState={{ expanded }}
        activeOpacity={0.7}
        onPress={() => setExpanded(current => !current)}
        style={styles.expandButton}
      >
        <Text style={styles.expandText}>{expanded ? 'Hide full clause' : 'Read full clause'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#1B5E20" />
      </TouchableOpacity>

      {expanded && (
        <View
          style={styles.clause}
          accessibilityLabel="Full cook compliance acknowledgement and indemnity"
        >
          {FOOD_SAFETY_WAIVER_SECTIONS.map(section => (
            <View key={section.title} style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                {section.title}
              </Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
          <Text style={styles.legalNote}>
            The regulatory summary is general information, while the acknowledgement and indemnity
            are terms for using Chefin as a cook. If you are unsure which rules apply, contact your
            local authority or seek independent legal advice.
          </Text>
          <View style={styles.guidanceLinks}>
            <Text
              accessibilityRole="link"
              style={styles.guidanceLink}
              onPress={() => Linking.openURL(MOH_FOOD_PREMISES_GUIDANCE_URL)}
            >
              MOH food-premises guidance
            </Text>
            <Text style={styles.linkDivider}>·</Text>
            <Text
              accessibilityRole="link"
              style={styles.guidanceLink}
              onPress={() => Linking.openURL(LOCAL_AUTHORITY_GUIDANCE_URL)}
            >
              Local-authority guidance
            </Text>
          </View>
          <Text style={styles.version}>Clause version {FOOD_SAFETY_WAIVER_VERSION}</Text>
        </View>
      )}

      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityLabel={FOOD_SAFETY_WAIVER_ACCEPTANCE}
        accessibilityHint="Required before continuing past the food-safety step"
        accessibilityState={{ checked: accepted, disabled: isRecorded }}
        activeOpacity={0.75}
        onPress={() => onAcceptedChange(!accepted)}
        disabled={isRecorded}
        hitSlop={6}
        style={[styles.checkboxRow, isRecorded && styles.checkboxRowRecorded]}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={styles.acceptanceText}>
          {isRecorded
            ? `Accepted ${new Date(acceptedAt as string).toLocaleDateString('en-MY')}. ${FOOD_SAFETY_WAIVER_ACCEPTANCE}`
            : FOOD_SAFETY_WAIVER_ACCEPTANCE}
        </Text>
      </TouchableOpacity>

      {!accepted && (
        <Text style={styles.requiredHint}>Tap the checkbox to agree and continue.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 16,
    backgroundColor: '#F5FBF5',
  },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headingCopy: { flex: 1 },
  title: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', lineHeight: 20 },
  requiredLabel: { color: '#B26A00', fontSize: 11, fontWeight: '700', marginTop: 2 },
  summary: { color: '#4A4A4A', fontSize: 12, lineHeight: 18, marginTop: 10 },
  expandButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingVertical: 4,
    paddingRight: 8,
  },
  expandText: {
    color: '#1B5E20',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  clause: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE8DD',
  },
  section: { marginBottom: 10 },
  sectionTitle: { color: '#1A1A1A', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  sectionBody: { color: '#555555', fontSize: 12, lineHeight: 18 },
  legalNote: { color: '#666666', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  guidanceLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  guidanceLink: { color: '#1B5E20', fontSize: 11, fontWeight: '700' },
  linkDivider: { color: '#888888', fontSize: 11, marginHorizontal: 6 },
  version: { color: '#888888', fontSize: 10, marginTop: 8 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    paddingVertical: 4,
  },
  checkboxRowRecorded: { opacity: 0.8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#777777',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { borderColor: '#2E7D32', backgroundColor: '#2E7D32' },
  acceptanceText: { flex: 1, color: '#2E2E2E', fontSize: 12, lineHeight: 18 },
  requiredHint: { color: '#6D5A00', fontSize: 11, lineHeight: 16, marginTop: 6, marginLeft: 32 },
});
