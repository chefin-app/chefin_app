import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import theme from '@/src/styles/theme';

type Payment = {
  refund?: {
    status: string;
    decision_note: string | null;
    gateway_refund_reference: string | null;
  } | null;
  method: string;
  state: string;
  amount: number;
  recipientName: string;
  qrImage: string | null;
  reference: string | null;
  acceptedAt: string | null;
  deadline: string | null;
  confirmedAt: string | null;
  isCook: boolean;
  closed: boolean;
  allReady: boolean;
  delivery: boolean;
};

export default function DirectPaymentCard({
  orderId,
  accessToken,
  onChange,
}: {
  orderId: string;
  accessToken?: string;
  onChange?: () => void;
}) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [notice, setNotice] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ fee: number; quotationId: string; message: string } | null>(
    null
  );
  const endpoint = `${process.env.EXPO_PUBLIC_API_URL}/api/direct-payments/orders/${orderId}`;
  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setPayment(body.payment);
      setNotice(body.notice ?? '');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payment.');
    }
  }, [endpoint, accessToken]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  const action = async (name: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${endpoint}/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference,
          receiptChecked: name === 'confirm',
          quotationId: quote?.quotationId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (name === 'quote-delivery' && body.quotationId) setQuote(body);
      else if (body.booked || name === 'book-delivery') {
        setQuote(null);
        Alert.alert('Delivery booked', 'Open the order delivery details to track the courier.');
      }
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update payment.');
    } finally {
      setBusy(false);
    }
  };
  const button = (label: string, name: string) => (
    <TouchableOpacity
      accessibilityRole="button"
      style={styles.button}
      disabled={busy}
      onPress={() => {
        if (name === 'confirm')
          Alert.alert(
            'Confirm actual receipt',
            'Only confirm after checking the credit in your own bank account, or receiving the collection payment. A screenshot alone does not prove payment.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Payment received', onPress: () => void action(name) },
            ]
          );
        else void action(name);
      }}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
  if (!payment) return error ? <Text style={styles.error}>{error}</Text> : null;
  const expired = Boolean(payment.deadline && new Date(payment.deadline).getTime() < Date.now());
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {payment.method === 'cook_qr' ? 'Pay cook with DuitNow QR' : 'Pay on collection'}
      </Text>
      <Text style={styles.title}>RM {payment.amount.toFixed(2)}</Text>
      <Text>{notice}</Text>
      {payment.refund && (
        <Text style={styles.status}>
          Refund review: {payment.refund.status}. {payment.refund.decision_note}{' '}
          {['approved', 'processing', 'failed'].includes(payment.refund.status)
            ? 'The cook must transfer the refund directly to the buyer and provide the transfer reference to Chefin support. Chefin will verify receipt before closing the case.'
            : ''}
        </Text>
      )}
      <Text style={styles.status}>
        {payment.confirmedAt
          ? 'Payment recorded by cook'
          : payment.state === 'verification_pending'
            ? 'Buyer reported payment · awaiting cook verification'
            : payment.state === 'due_on_collection'
              ? 'Payment due when you collect your food'
              : payment.acceptedAt
                ? 'Awaiting direct payment'
                : 'Waiting for cook acceptance · do not pay yet'}
      </Text>
      {payment.reference ? <Text>Buyer reference: {payment.reference}</Text> : null}
      {!payment.closed && !payment.confirmedAt && (
        <>
          {payment.isCook && !payment.acceptedAt && button('Accept checkout', 'accept')}
          {payment.isCook &&
            payment.acceptedAt &&
            ((payment.method === 'cook_qr' && payment.state === 'verification_pending') ||
              (payment.method === 'pay_on_collection' && payment.allReady)) &&
            button('Confirm payment received', 'confirm')}
          {payment.isCook &&
            expired &&
            payment.state === 'awaiting_payment' &&
            button('Allow another 10 minutes to pay', 'renew')}
          {!payment.isCook &&
            payment.acceptedAt &&
            payment.method === 'cook_qr' &&
            payment.state === 'awaiting_payment' && (
              <>
                <Text>
                  Recipient: {payment.recipientName}. Check this name in your banking app before
                  paying.
                </Text>
                {expired ? (
                  <Text style={styles.error}>
                    Payment time has passed. Ask the cook to reopen payment before sending money. If
                    you already paid, report it below.
                  </Text>
                ) : (
                  <>
                    {payment.qrImage && (
                      <Image
                        source={{ uri: payment.qrImage }}
                        style={styles.qr}
                        resizeMode="contain"
                      />
                    )}
                    <Text>
                      Pay before {new Date(payment.deadline!).toLocaleTimeString()}. On the same
                      phone, capture this QR and import it in your banking app if supported.
                    </Text>
                  </>
                )}
                <TextInput
                  accessibilityLabel="Bank transaction reference"
                  style={styles.input}
                  value={reference}
                  onChangeText={setReference}
                  maxLength={120}
                  placeholder="Bank transaction reference"
                />
                {button('I have paid · ask cook to verify', 'claim')}
              </>
            )}
          {payment.method === 'pay_on_collection' && (
            <Text>
              Pay the cook at collection. Give your pickup PIN only when receiving your food.
              Payment and handoff are recorded separately.
            </Text>
          )}
        </>
      )}
      {payment.isCook && payment.confirmedAt && payment.delivery && !payment.closed && (
        <>
          <Text>
            Payment is confirmed. Review the current courier price before booking. Buyer payments
            went to your account; courier charges remain your responsibility.
          </Text>
          {button('Get current Lalamove quote', 'quote-delivery')}
          {quote && (
            <>
              <Text>
                Courier charge: RM {quote.fee.toFixed(2)}. {quote.message}
              </Text>
              {button('Accept charge and book courier', 'book-delivery')}
            </>
          )}
        </>
      )}
      {busy && <ActivityIndicator />}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginVertical: 12,
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  title: { fontSize: 18, fontWeight: '600' },
  status: { fontWeight: '600', color: '#176A36' },
  error: { color: theme.colors.error, padding: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { padding: 14, borderRadius: 10, backgroundColor: '#176A36' },
  buttonText: { color: theme.colors.textOnAction, textAlign: 'center', fontWeight: '600' },
  qr: { width: '100%', height: 260 },
});
