import { formatScheduledOrderTime } from '../src/utils/formatScheduledOrderTime';

describe('scheduled order label', () => {
  it('formats the date and thirty-minute window in Malaysia time', () => {
    expect(formatScheduledOrderTime('2026-09-22T03:00:00Z')).toBe('Tue, 22 Sep, 11:00 - 11:30 AM');
  });
  it('keeps both periods when crossing noon', () => {
    expect(formatScheduledOrderTime('2026-09-22T03:45:00Z')).toBe(
      'Tue, 22 Sep, 11:45 AM - 12:15 PM'
    );
  });
  it('includes the next date when crossing midnight', () => {
    expect(formatScheduledOrderTime('2026-09-22T15:45:00Z')).toBe(
      'Tue, 22 Sep, 11:45 PM - Wed, 23 Sep, 12:15 AM'
    );
  });
  it('handles invalid stored values', () => {
    expect(formatScheduledOrderTime('invalid')).toBe('Choose a time');
  });
});
