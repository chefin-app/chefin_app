import express from 'express';
import {
  requireActiveAccount,
  requireReadableAccount,
  type AccountRequest,
} from '../accountAccess';
import { supabase } from '../supabaseClient';
import { createNotification } from '../notifications';
import { DIRECT_PAYMENT_NOTICE } from '../directPaymentPolicy';
import {
  bookQuotedDeliveryJob,
  formatDeliveryAddress,
  type DeliveryAddressSnapshot,
  type PickupAddressSnapshot,
} from '../deliveryService';
import { createLalamoveQuotation } from '../lalamove';

const router = express.Router();
const UUID = /^[0-9a-f-]{36}$/i;

router.get('/settings/:cookId', requireReadableAccount, async (req: AccountRequest, res) => {
  if (!UUID.test(req.params.cookId)) return res.status(400).json({ error: 'Invalid cook.' });
  const { data, error } = await supabase
    .from('cook_payment_settings')
    .select('*')
    .eq('cook_id', req.params.cookId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Payment settings unavailable.' });
  // QR is exposed only to the owner or a buyer with an accepted order.
  res.json({
    settings: data
      ? {
          ...data,
          qr_image: req.account!.profileId === req.params.cookId ? data.qr_image : undefined,
        }
      : null,
    notice: DIRECT_PAYMENT_NOTICE,
  });
});

router.put('/settings', requireActiveAccount, async (req: AccountRequest, res) => {
  try {
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', req.account!.userId)
      .eq('role', 'cook')
      .maybeSingle();
    if (!role) return res.status(403).json({ error: 'Cook access required.' });
    const { qrEnabled, collectionEnabled, recipientName, qrImage } = req.body ?? {};
    if (typeof qrEnabled !== 'boolean' || typeof collectionEnabled !== 'boolean')
      return res.status(400).json({ error: 'Invalid payment settings.' });
    const name = typeof recipientName === 'string' ? recipientName.trim() : '';
    const image = typeof qrImage === 'string' ? qrImage : null;
    if (qrEnabled && (name.length < 2 || name.length > 120 || !image))
      return res.status(400).json({ error: 'Add the recipient name and your DuitNow QR image.' });
    if (
      image &&
      (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 2_800_000)
    )
      return res.status(400).json({ error: 'Use a JPEG or PNG QR image smaller than 2 MB.' });
    const { error } = await supabase.from('cook_payment_settings').upsert({
      cook_id: req.account!.profileId,
      qr_enabled: qrEnabled,
      collection_enabled: collectionEnabled,
      recipient_name: name || null,
      qr_image: image,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Direct payment settings:', error);
    res.status(500).json({ error: 'Could not save payment settings.' });
  }
});

async function context(orderId: string, actor: string) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('checkout_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error('Order not found.');
  const { data: payment, error: paymentError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('checkout_id', order.checkout_id)
    .single();
  if (paymentError) throw paymentError;
  if (payment.customer_id !== actor && payment.cook_id !== actor) throw new Error('Access denied.');
  const { data: lines, error: linesError } = await supabase
    .from('orders')
    .select('id,status,fulfillment_type,delivery_job_id')
    .eq('checkout_id', order.checkout_id);
  if (linesError) throw linesError;
  return { payment, lines: lines ?? [] };
}

router.get('/orders/:id', requireReadableAccount, async (req: AccountRequest, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid order.' });
    const { payment, lines } = await context(req.params.id, req.account!.profileId);
    if (payment.collection_model !== 'direct_to_cook') return res.json({ payment: null });
    const closed = lines.some(line => ['cancelled', 'completed'].includes(line.status));
    const expired =
      payment.payment_deadline && new Date(payment.payment_deadline).getTime() < Date.now();
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('status,decision_note,gateway_refund_reference')
      .eq('transaction_id', payment.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (refundError) throw refundError;
    res.set('Cache-Control', 'no-store');
    res.json({
      payment: {
        id: payment.id,
        method: payment.payment_method,
        state: payment.direct_state,
        amount: Number(payment.gross_amount),
        recipientName: payment.recipient_name,
        qrImage:
          payment.accepted_at &&
          !closed &&
          !expired &&
          !payment.buyer_claimed_at &&
          !payment.confirmed_at
            ? payment.qr_image
            : null,
        reference: payment.buyer_reference,
        acceptedAt: payment.accepted_at,
        deadline: payment.payment_deadline,
        confirmedAt: payment.confirmed_at,
        isCook: payment.cook_id === req.account!.profileId,
        closed,
        allReady: lines.every(line => line.status === 'ready'),
        delivery: lines.some(line => line.fulfillment_type === 'delivery'),
        refund,
      },
      notice: DIRECT_PAYMENT_NOTICE,
    });
  } catch (error) {
    res
      .status(403)
      .json({ error: error instanceof Error ? error.message : 'Payment unavailable.' });
  }
});

router.post('/orders/:id/:action', requireActiveAccount, async (req: AccountRequest, res) => {
  try {
    const { id, action } = req.params;
    if (
      !UUID.test(id) ||
      !['accept', 'claim', 'confirm', 'quote-delivery', 'book-delivery', 'renew'].includes(action)
    )
      return res.status(400).json({ error: 'Invalid payment action.' });
    const { payment, lines } = await context(id, req.account!.profileId);
    if (payment.collection_model !== 'direct_to_cook')
      return res.status(409).json({ error: 'This is not a direct payment.' });
    if (action === 'book-delivery' || action === 'quote-delivery') {
      if (
        payment.cook_id !== req.account!.profileId ||
        !payment.confirmed_at ||
        lines.some(line => ['pending', 'cancelled', 'completed'].includes(line.status))
      )
        return res
          .status(409)
          .json({ error: 'Confirm payment and order acceptance before booking delivery.' });
      for (const jobId of new Set(lines.map(line => line.delivery_job_id).filter(Boolean))) {
        const { data: job, error: jobError } = await supabase
          .from('delivery_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        if (jobError) throw jobError;
        if (job.provider_order_id) return res.json({ success: true, booked: true });
        if (action === 'quote-delivery') {
          if (job.status === 'booking')
            throw new Error(
              'Booking is already in progress. Contact support if it does not resolve.'
            );
          const pickup = job.pickup_address as PickupAddressSnapshot;
          const dropoff = job.dropoff_address as DeliveryAddressSnapshot;
          const quotation = await createLalamoveQuotation({
            pickup: {
              coordinates: { lat: String(pickup.latitude), lng: String(pickup.longitude) },
              address: pickup.address,
            },
            dropoff: {
              coordinates: { lat: String(dropoff.latitude), lng: String(dropoff.longitude) },
              address: formatDeliveryAddress(dropoff),
            },
            scheduleAt: new Date(
              Math.max(Date.now() + 5 * 60_000, new Date(job.scheduled_at).getTime())
            ).toISOString(),
          });
          const fee = Number(quotation.priceBreakdown?.total);
          if (!Number.isFinite(fee) || fee < 0) throw new Error('Invalid delivery quotation.');
          const cookCharge = Math.max(0, fee - Number(job.customer_delivery_fee));
          const { data: saved, error: saveError } = await supabase
            .from('delivery_jobs')
            .update({
              status: 'quoted',
              provider_quotation_id: quotation.quotationId,
              provider_quote: quotation,
              quote_expires_at: quotation.expiresAt,
              quoted_fee: fee,
              cook_delivery_charge: cookCharge,
            })
            .eq('id', jobId)
            .in('status', ['quoted', 'expired', 'booking_failed'])
            .is('provider_order_id', null)
            .select('id')
            .maybeSingle();
          if (saveError || !saved) throw new Error('Delivery changed. Refresh and try again.');
          return res.json({
            fee,
            jobId,
            quotationId: quotation.quotationId,
            message:
              'The buyer total stays unchanged. You are responsible for the courier charge; any amount collected from the buyer remains in your account.',
          });
        }
        if (
          req.body?.quotationId !== job.provider_quotation_id ||
          new Date(job.quote_expires_at).getTime() <= Date.now()
        )
          throw new Error('Refresh the delivery quote and confirm its current price.');
        await bookQuotedDeliveryJob(jobId, req.body.quotationId);
      }
      return res.json({ success: true });
    }
    if (action === 'renew') {
      if (
        payment.cook_id !== req.account!.profileId ||
        payment.direct_state !== 'awaiting_payment' ||
        lines.some(line => line.status !== 'pending')
      )
        throw new Error('This payment cannot be renewed.');
      const { error } = await supabase
        .from('payment_transactions')
        .update({ payment_deadline: new Date(Date.now() + 10 * 60_000).toISOString() })
        .eq('id', payment.id)
        .eq('direct_state', 'awaiting_payment');
      if (error) throw error;
      return res.json({ success: true });
    }
    if (action === 'confirm' && req.body?.receiptChecked !== true)
      return res
        .status(400)
        .json({ error: 'Check your bank account or count the cash before confirming.' });
    const { error } = await supabase.rpc('direct_payment_action', {
      p_order: id,
      p_actor: req.account!.profileId,
      p_action: action,
      p_reference: typeof req.body?.reference === 'string' ? req.body.reference : null,
    });
    if (error) return res.status(409).json({ error: error.message });
    const target = action === 'claim' ? payment.cook_id : payment.customer_id;
    const { data: recipient } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', target)
      .single();
    if (recipient?.user_id)
      await createNotification(recipient.user_id, {
        type: 'admin_message',
        title:
          action === 'accept'
            ? 'Cook accepted your order'
            : action === 'claim'
              ? 'Check your bank for payment'
              : 'Payment confirmed by cook',
        body:
          action === 'accept'
            ? 'Open your order to see payment instructions.'
            : action === 'claim'
              ? 'The buyer reported payment. Verify the credit in your bank account before confirming.'
              : 'Your cook has recorded receipt of your payment.',
        data: { order_id: id },
      }).catch(console.error);
    res.json({ success: true });
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : 'Payment action failed.' });
  }
});

export default router;
