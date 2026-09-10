import { supabase } from './supabaseClient';
import {
  getAcceptanceOverdueStage,
  getOrderMonitoringPhase,
  getOverdueStage,
} from './orderAlertPolicy';
import { sendAdminEmail } from './email';

export async function notifyAdminsOfCriticalOrderAlert(input: {
  checkoutId: string;
  representativeOrderId: string;
  title: string;
  message: string;
}): Promise<void> {
  try {
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    if (error) throw error;
    const dashboardUrl = process.env.ADMIN_DASHBOARD_URL?.replace(/\/$/, '');
    await Promise.all(
      (roles ?? []).map(async role => {
        const { data } = await supabase.auth.admin.getUserById(role.user_id);
        const email = data.user?.email;
        if (!email) return;
        await sendAdminEmail({
          to: email,
          subject: input.title,
          message: `${input.message}\n\nOrder: ${input.checkoutId}${
            dashboardUrl
              ? `\n${dashboardUrl}/admin/orders?orderId=${input.representativeOrderId}`
              : ''
          }`,
        });
      })
    );
  } catch (error) {
    console.error('Critical order alert email failed:', error);
  }
}

type LiveOrder = {
  id: string;
  checkout_id: string;
  fulfillment_type: string;
  status: string | null;
  created_at: string | null;
  pickup_window_end: string | null;
  delivery_jobs:
    | {
        estimated_arrival_end: string | null;
        status: string | null;
        provider_status: string | null;
      }
    | Array<{
        estimated_arrival_end: string | null;
        status: string | null;
        provider_status: string | null;
      }>
    | null;
};

const relation = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

/**
 * Finds unaccepted and overdue live checkouts and writes retry-safe alerts.
 * The unique (checkout_id, alert_type) constraint makes this safe across
 * restarts and multiple API instances.
 */
export async function runOverdueOrderSweep(now = new Date()): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, checkout_id, fulfillment_type, status, created_at, pickup_window_end, delivery_jobs(estimated_arrival_end, status, provider_status)'
    )
    .in('status', ['pending', 'confirmed', 'ready']);
  if (error) throw error;

  const byCheckout = new Map<string, LiveOrder[]>();
  for (const order of (data ?? []) as unknown as LiveOrder[]) {
    byCheckout.set(order.checkout_id, [...(byCheckout.get(order.checkout_id) ?? []), order]);
  }

  const alerts: Array<Record<string, unknown>> = [];
  for (const [checkoutId, lines] of byCheckout) {
    const representative = lines[0];
    const phase = getOrderMonitoringPhase(lines.map(line => line.status));
    const pendingLines = lines.filter(line => line.status === 'pending');
    if (phase === 'awaiting_acceptance') {
      const createdAt = pendingLines
        .map(line => line.created_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0];
      const stage = getAcceptanceOverdueStage(createdAt ?? null, now);
      if (!stage || !createdAt) continue;

      const base = {
        checkout_id: checkoutId,
        representative_order_id: representative.id,
        status: 'open',
        details: {
          fulfillmentType: representative.fulfillment_type,
          lineCount: lines.length,
          pendingLineCount: pendingLines.length,
          orderCreatedAt: createdAt,
        },
        updated_at: now.toISOString(),
      };
      alerts.push({
        ...base,
        alert_type: 'acceptance_overdue_10',
        severity: 'warning',
        due_at: new Date(new Date(createdAt).getTime() + 10 * 60_000).toISOString(),
      });
      if (stage === 'acceptance_overdue_20') {
        alerts.push({
          ...base,
          alert_type: 'acceptance_overdue_20',
          severity: 'critical',
          due_at: new Date(new Date(createdAt).getTime() + 20 * 60_000).toISOString(),
        });
      }
      continue;
    }
    if (phase !== 'fulfillment') continue;

    // A checkout is late only after every still-live line has been accepted.
    // Pending orders follow the acceptance SLA above and must never be
    // presented to admins as a fulfilment failure.
    const delivery = relation(representative.delivery_jobs);
    const dueAt =
      representative.fulfillment_type === 'delivery'
        ? delivery?.estimated_arrival_end
        : representative.pickup_window_end;
    const stage = getOverdueStage(dueAt ?? null, now);
    if (!stage || !dueAt) continue;

    const base = {
      checkout_id: checkoutId,
      representative_order_id: representative.id,
      due_at: dueAt,
      status: 'open',
      details: {
        fulfillmentType: representative.fulfillment_type,
        lineCount: lines.length,
        providerStatus: delivery?.provider_status ?? null,
      },
      updated_at: now.toISOString(),
    };
    // A critical checkout keeps both events for its escalation audit trail.
    alerts.push({ ...base, alert_type: 'overdue_30', severity: 'warning' });
    if (stage === 'overdue_60') {
      alerts.push({ ...base, alert_type: 'overdue_60', severity: 'critical' });
    }
  }

  if (alerts.length > 0) {
    const { data: createdAlerts, error: alertError } = await supabase
      .from('order_alerts')
      .upsert(alerts, { onConflict: 'checkout_id,alert_type', ignoreDuplicates: true })
      .select('checkout_id, representative_order_id, alert_type, severity');
    if (alertError) throw alertError;
    await Promise.all(
      (createdAlerts ?? [])
        .filter(alert => alert.severity === 'critical')
        .map(alert =>
          notifyAdminsOfCriticalOrderAlert({
            checkoutId: alert.checkout_id,
            representativeOrderId: alert.representative_order_id,
            title:
              alert.alert_type === 'acceptance_overdue_20'
                ? 'Critical: Chefin order has not been accepted'
                : 'Critical: Chefin order is over 60 minutes late',
            message:
              alert.alert_type === 'acceptance_overdue_20'
                ? 'A paid order is still awaiting cook acceptance after 20 minutes.'
                : 'An accepted order has not been fulfilled 60 minutes after its expected time.',
          })
        )
    );
  }

  // Resolve alerts once their condition is no longer true. An acceptance
  // alert closes as soon as all live lines are accepted; fulfilment alerts
  // remain open only during the accepted live phase, and handoff alerts close
  // once the checkout is no longer live. Resolution is intentionally
  // idempotent and keeps the original event for operations QA.
  const { data: openAlerts, error: openError } = await supabase
    .from('order_alerts')
    .select('id, checkout_id, alert_type')
    .eq('status', 'open');
  if (openError) throw openError;
  const pendingCheckoutIds = new Set(
    [...byCheckout]
      .filter(
        ([, lines]) =>
          getOrderMonitoringPhase(lines.map(line => line.status)) === 'awaiting_acceptance'
      )
      .map(([checkoutId]) => checkoutId)
  );
  const acceptedCheckoutIds = new Set(
    [...byCheckout]
      .filter(
        ([, lines]) => getOrderMonitoringPhase(lines.map(line => line.status)) === 'fulfillment'
      )
      .map(([checkoutId]) => checkoutId)
  );
  const staleAlertIds = (openAlerts ?? [])
    .filter(alert => {
      const checkoutId = String(alert.checkout_id);
      const alertType = String(alert.alert_type);
      if (alertType.startsWith('acceptance_overdue_')) {
        return !pendingCheckoutIds.has(checkoutId);
      }
      if (alertType.startsWith('overdue_')) {
        return !acceptedCheckoutIds.has(checkoutId);
      }
      return !byCheckout.has(checkoutId);
    })
    .map(alert => String(alert.id));
  if (staleAlertIds.length > 0) {
    const { error: resolveError } = await supabase
      .from('order_alerts')
      .update({ status: 'resolved', resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .in('id', staleAlertIds)
      .eq('status', 'open');
    if (resolveError) throw resolveError;
  }
}

let monitor: ReturnType<typeof setInterval> | null = null;

export function startOrderAlertMonitor(): void {
  if (monitor || process.env.DISABLE_ORDER_ALERT_MONITOR === 'true') return;
  const run = () =>
    runOverdueOrderSweep().catch(error => console.error('Order alert sweep failed:', error));
  const initial = setTimeout(run, 15_000);
  initial.unref?.();
  monitor = setInterval(run, 5 * 60_000);
  monitor.unref?.();
}
