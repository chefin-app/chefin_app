import { cancelLalamoveOrder, placeLalamoveOrder, type LalamoveQuotation } from './lalamove';
import { supabase } from './supabaseClient';

export type DeliveryAddressSnapshot = {
  recipientName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  locality?: string | null;
  city: string;
  state: string;
  postcode: string;
  countryCode: 'MY';
  latitude: number;
  longitude: number;
  deliveryInstructions?: string | null;
};

export type PickupAddressSnapshot = {
  name: string;
  phoneNumber: string;
  address: string;
  latitude: number;
  longitude: number;
};

type DeliveryJobRow = {
  id: string;
  customer_id: string;
  cook_id: string;
  provider_quotation_id: string;
  provider_order_id: string | null;
  status: string;
  quoted_fee: number | string;
  cook_delivery_charge: number | string;
  pickup_address: PickupAddressSnapshot;
  dropoff_address: DeliveryAddressSnapshot;
  provider_quote: LalamoveQuotation;
};

export const normalizeMalaysianPhone = (value: string): string | null => {
  const raw = value.trim();
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  const normalized = digits.startsWith('60')
    ? `+${digits}`
    : digits.startsWith('0')
      ? `+60${digits.slice(1)}`
      : `+60${digits}`;
  return /^\+60\d{8,10}$/.test(normalized) ? normalized : null;
};

export const formatDeliveryAddress = (address: DeliveryAddressSnapshot): string =>
  [
    address.addressLine1,
    address.addressLine2,
    address.locality,
    address.postcode,
    address.city,
    address.state,
    'Malaysia',
  ]
    .filter(Boolean)
    .join(', ');

export const isInKlangValley = (latitude: number, longitude: number): boolean =>
  latitude >= 2.75 && latitude <= 3.55 && longitude >= 101.2 && longitude <= 102.0;

const getJob = async (jobId: string): Promise<DeliveryJobRow> => {
  const { data, error } = await supabase
    .from('delivery_jobs')
    .select(
      'id, customer_id, cook_id, provider_quotation_id, provider_order_id, status, quoted_fee, cook_delivery_charge, pickup_address, dropoff_address, provider_quote'
    )
    .eq('id', jobId)
    .single();
  if (error || !data) throw error ?? new Error('Delivery quote not found.');
  return data as unknown as DeliveryJobRow;
};

export async function bookQuotedDeliveryJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (job.provider_order_id) return;
  if (job.status !== 'quoted') throw new Error('The delivery quote is no longer bookable.');

  const { data: claimed, error: claimError } = await supabase
    .from('delivery_jobs')
    .update({ status: 'booking', updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'quoted')
    .select('id')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error('The delivery quote changed. Request a new quote.');

  try {
    const pickupStop = job.provider_quote.stops?.[0];
    const dropoffStop = job.provider_quote.stops?.[1];
    const senderPhone = normalizeMalaysianPhone(job.pickup_address.phoneNumber);
    const recipientPhone = normalizeMalaysianPhone(job.dropoff_address.phoneNumber);
    if (!pickupStop?.stopId || !dropoffStop?.stopId || !senderPhone || !recipientPhone) {
      throw new Error('Delivery contact details are incomplete.');
    }
    const order = await placeLalamoveOrder({
      quotationId: job.provider_quotation_id,
      sender: {
        stopId: pickupStop.stopId,
        name: job.pickup_address.name,
        phone: senderPhone,
      },
      recipient: {
        stopId: dropoffStop.stopId,
        name: job.dropoff_address.recipientName,
        phone: recipientPhone,
        remarks: job.dropoff_address.deliveryInstructions?.trim() || undefined,
      },
      deliveryJobId: job.id,
    });
    const { error: updateError } = await supabase
      .from('delivery_jobs')
      .update({
        provider_order_id: order.orderId,
        provider_status: order.status,
        status: order.status === 'ON_GOING' ? 'on_going' : 'assigning_driver',
        driver_id: order.driverId || null,
        share_link: order.shareLink || null,
        provider_payload: order,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    if (updateError) throw updateError;

    const cookCharge = Number(job.cook_delivery_charge);
    if (cookCharge > 0) {
      const { error: ledgerError } = await supabase.from('cook_payout_ledger').upsert(
        {
          cook_id: job.cook_id,
          delivery_job_id: job.id,
          amount: -cookCharge,
          currency: 'MYR',
          status: 'pending',
          description: `Lalamove delivery fee for Chefin delivery ${job.id.slice(0, 8).toUpperCase()}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'delivery_job_id' }
      );
      if (ledgerError) throw ledgerError;
    }
  } catch (error) {
    await supabase
      .from('delivery_jobs')
      .update({ status: 'booking_failed', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    throw error;
  }
}

export async function cancelDeliveryJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (['cancelled', 'delivered', 'failed', 'expired'].includes(job.status)) return;
  if (job.provider_order_id) {
    try {
      await cancelLalamoveOrder(job.provider_order_id);
    } catch (error) {
      console.error('Lalamove cancellation failed:', error);
    }
  }
  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from('delivery_jobs')
      .update({
        status: 'cancelled',
        provider_status: 'CANCELED',
        cancelled_at: now,
        updated_at: now,
      })
      .eq('id', job.id),
    supabase
      .from('cook_payout_ledger')
      .update({ status: 'reversed', updated_at: now })
      .eq('delivery_job_id', job.id),
  ]);
}

export async function cancelDeliveryJobWhenUnused(jobId: string | null): Promise<void> {
  if (!jobId) return;
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_job_id', jobId)
    .neq('status', 'cancelled');
  if (error) throw error;
  if ((count ?? 0) === 0) await cancelDeliveryJob(jobId);
}
