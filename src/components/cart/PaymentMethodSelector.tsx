import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type Method = 'cook_qr' | 'pay_on_collection';
type Props = {
  qrAvailable: boolean;
  collectionAvailable: boolean;
  loading: boolean;
  error: string;
  disabled: boolean;
  value: Method;
  acknowledged: boolean;
  onSelect: (method: Method) => void;
  onAcknowledge: () => void;
  onRetry: () => void;
};

export default function PaymentMethodSelector(props: Props) {
  const [open, setOpen] = useState(false);
  const methods: {
    id: Method;
    title: string;
    subtitle: string;
    icon: 'qr-code-outline' | 'cash-outline';
  }[] = [];
  if (props.qrAvailable)
    methods.push({
      id: 'cook_qr',
      title: 'DuitNow QR',
      subtitle: 'Pay after the cook accepts your order',
      icon: 'qr-code-outline',
    });
  if (props.collectionAvailable)
    methods.push({
      id: 'pay_on_collection',
      title: 'Pay on collection',
      subtitle: 'Cash or agreed QR payment at pickup',
      icon: 'cash-outline',
    });
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.heading, styles.flex]}>Payment details</Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={props.disabled || props.loading || !!props.error || !methods.length}
          onPress={() => setOpen(true)}
          style={styles.retry}
        >
          <Text style={styles.link}>See all</Text>
        </TouchableOpacity>
      </View>
      {props.loading ? (
        <View style={styles.row}>
          <ActivityIndicator color="#216E39" />
          <Text style={styles.body}>Loading payment options…</Text>
        </View>
      ) : props.error ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.error}>
            {props.error}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={props.onRetry}
            disabled={props.disabled}
            style={styles.retry}
          >
            <Text style={styles.link}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : methods.length === 0 ? (
        <Text style={styles.error}>
          No payment method is available for this order. Try collection if offered, or choose
          another home restaurant.
        </Text>
      ) : (
        <>
          <Text style={styles.body}>Nothing is charged when you place your order.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Change payment method"
            disabled={props.disabled}
            onPress={() => setOpen(true)}
            style={styles.option}
          >
            <View style={styles.row}>
              <Ionicons
                name={props.value === 'cook_qr' ? 'qr-code-outline' : 'cash-outline'}
                size={26}
                color="#216E39"
              />
              <View style={styles.flex}>
                <Text style={styles.title}>
                  {methods.find(method => method.id === props.value)?.title ??
                    'Choose payment method'}
                </Text>
                <Text style={styles.body}>
                  {methods.find(method => method.id === props.value)?.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#64748B" />
            </View>
          </TouchableOpacity>
          <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
            <SafeAreaView style={styles.screen}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Back to cart"
                  onPress={() => setOpen(false)}
                  style={styles.retry}
                >
                  <Ionicons name="arrow-back" size={26} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.heading}>Payment Methods</Text>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <Text style={styles.body}>
                  Available for this home restaurant and fulfillment option.
                </Text>
                {methods.map(method => {
                  const selected = method.id === props.value;
                  return (
                    <TouchableOpacity
                      key={method.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${method.title}. ${method.subtitle}`}
                      accessibilityState={{ checked: selected, disabled: props.disabled }}
                      disabled={props.disabled}
                      onPress={() => {
                        props.onSelect(method.id);
                        setOpen(false);
                      }}
                      style={[styles.option, selected && styles.selected]}
                    >
                      <View style={styles.row}>
                        <Ionicons
                          name={method.icon}
                          size={25}
                          color={selected ? '#216E39' : '#64748B'}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.title}>{method.title}</Text>
                          <Text style={styles.body}>{method.subtitle}</Text>
                        </View>
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={23}
                          color={selected ? '#216E39' : '#94A3B8'}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {/* Enable only after Stripe checkout and server-side payment verification exist.
                    Never collect card numbers or treat a placeholder selection as payment. */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Debit / credit card. Coming soon"
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.option}
                >
                  <View style={styles.row}>
                    <Ionicons name="card-outline" size={25} color="#64748B" />
                    <View style={styles.flex}>
                      <Text style={styles.title}>Debit / credit card</Text>
                      <Text style={styles.body}>Coming soon</Text>
                    </View>
                    <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </Modal>
          <View style={styles.notice}>
            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={21} color="#64748B" />
              <Text style={styles.title}>You’re paying the cook directly</Text>
            </View>
            <Text style={styles.body}>
              Chefin does not hold this payment or reverse transfers. Refunds are returned by the
              cook; Chefin can only help review disputes.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: props.acknowledged, disabled: props.disabled }}
            disabled={props.disabled}
            onPress={props.onAcknowledge}
            style={styles.acknowledgement}
          >
            <Ionicons
              name={props.acknowledged ? 'checkbox' : 'square-outline'}
              size={25}
              color={props.acknowledged ? '#216E39' : '#64748B'}
            />
            <Text style={[styles.body, styles.flex]}>
              I understand that I pay the cook directly and the cook handles any approved refund.
            </Text>
          </TouchableOpacity>
          {!props.acknowledged && (
            <Text style={styles.hint}>
              Confirm the payment arrangement above to place your order.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  modalContent: { padding: 24, gap: 16 },
  container: { paddingVertical: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  option: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#fff',
    gap: 12,
  },
  selected: { borderColor: '#216E39', backgroundColor: '#F2FAF4' },
  title: { fontSize: 14, fontWeight: '600', color: '#1E293B', flexShrink: 1 },
  body: { fontSize: 13, lineHeight: 20, color: '#64748B' },
  detail: { borderTopWidth: 1, borderTopColor: '#DCEBDD', paddingTop: 12 },
  detailText: { fontSize: 13, lineHeight: 20, color: '#216E39' },
  notice: { padding: 14, borderRadius: 12, backgroundColor: '#F1F5F9', gap: 8 },
  acknowledgement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  hint: { fontSize: 12, color: '#64748B', lineHeight: 18 },
  error: { fontSize: 13, color: '#B91C1C', lineHeight: 20 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: '#216E39', fontWeight: '600' },
});
