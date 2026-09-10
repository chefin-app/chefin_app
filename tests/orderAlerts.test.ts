import {
  getAcceptanceOverdueStage,
  getOrderMonitoringPhase,
  getOverdueStage,
} from '../backend/orderAlertPolicy';

describe('order monitoring phase', () => {
  it('tracks a never-accepted checkout against the acceptance SLA', () => {
    expect(getOrderMonitoringPhase(['pending'])).toBe('awaiting_acceptance');
  });

  it('keeps a partially accepted checkout in the acceptance phase', () => {
    expect(getOrderMonitoringPhase(['confirmed', 'pending'])).toBe('awaiting_acceptance');
  });

  it('starts fulfillment monitoring only after all live lines are accepted', () => {
    expect(getOrderMonitoringPhase(['confirmed', 'ready'])).toBe('fulfillment');
  });

  it('does not monitor terminal checkouts', () => {
    expect(getOrderMonitoringPhase(['completed'])).toBeNull();
  });
});

describe('order overdue escalation', () => {
  const now = new Date('2026-09-06T04:00:00.000Z');

  it('does not alert before thirty minutes', () => {
    expect(getOverdueStage('2026-09-06T03:30:01.000Z', now)).toBeNull();
  });

  it('creates a warning from thirty minutes', () => {
    expect(getOverdueStage('2026-09-06T03:30:00.000Z', now)).toBe('overdue_30');
  });

  it('escalates from sixty minutes', () => {
    expect(getOverdueStage('2026-09-06T03:00:00.000Z', now)).toBe('overdue_60');
  });

  it('ignores missing or invalid deadlines', () => {
    expect(getOverdueStage(null, now)).toBeNull();
    expect(getOverdueStage('not-a-date', now)).toBeNull();
  });
});

describe('order acceptance escalation', () => {
  const now = new Date('2026-09-06T04:00:00.000Z');

  it('does not alert before ten minutes', () => {
    expect(getAcceptanceOverdueStage('2026-09-06T03:50:01.000Z', now)).toBeNull();
  });

  it('creates a warning from ten minutes', () => {
    expect(getAcceptanceOverdueStage('2026-09-06T03:50:00.000Z', now)).toBe(
      'acceptance_overdue_10'
    );
  });

  it('escalates from twenty minutes', () => {
    expect(getAcceptanceOverdueStage('2026-09-06T03:40:00.000Z', now)).toBe(
      'acceptance_overdue_20'
    );
  });

  it('ignores missing or invalid creation times', () => {
    expect(getAcceptanceOverdueStage(null, now)).toBeNull();
    expect(getAcceptanceOverdueStage('not-a-date', now)).toBeNull();
  });
});
