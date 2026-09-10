import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function BuyerPickupCodeCard({
  orderId,
  accessToken,
}: {
  orderId: string;
  accessToken?: string | null;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [canRegenerate, setCanRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}/pickup-handoff`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        handoff?: { code?: string | null; canRegenerate?: boolean };
      };
      if (response.ok) {
        setCode(payload.handoff?.code ?? null);
        setCanRegenerate(payload.handoff?.canRegenerate === true);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const regenerate = async () => {
    if (!accessToken || !canRegenerate || regenerating) return;
    setRegenerating(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/orders/${orderId}/pickup-handoff/regenerate`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'A new code could not be generated.');
      setCode(payload.code ?? null);
      setCanRegenerate(false);
    } catch (error: unknown) {
      Alert.alert('Could not generate code', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Ionicons name="keypad-outline" size={22} color="#175CD3" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Pickup confirmation code</Text>
          <Text style={styles.body}>
            Give this code to the cook only after you receive all your food.
          </Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color="#175CD3" style={styles.loader} />
      ) : code ? (
        <>
          <TouchableOpacity
            style={styles.codeRow}
            onPress={copy}
            accessibilityLabel={`Pickup code ${code}`}
          >
            <Text style={styles.code}>{code}</Text>
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy-outline'}
              size={20}
              color="#175CD3"
            />
          </TouchableOpacity>
          {canRegenerate ? (
            <TouchableOpacity
              style={styles.regenerateButton}
              disabled={regenerating}
              onPress={regenerate}
            >
              {regenerating ? (
                <ActivityIndicator size="small" color="#175CD3" />
              ) : (
                <Text style={styles.regenerateText}>Generate a new code once</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <Text style={styles.pending}>
          Your code is being prepared. Pull to refresh if it does not appear.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#C9D9F6',
    backgroundColor: '#F5F8FF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  heading: { flexDirection: 'row', gap: 11 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4EDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: '#20304D' },
  body: { marginTop: 4, fontSize: 13, lineHeight: 18, color: '#56657C' },
  loader: { marginTop: 16 },
  codeRow: {
    marginTop: 14,
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#B9CCEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 10, color: '#173F83', paddingLeft: 10 },
  pending: { marginTop: 12, fontSize: 13, color: '#6B7482' },
  regenerateButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  regenerateText: { fontSize: 12, fontWeight: '700', color: '#175CD3' },
});
