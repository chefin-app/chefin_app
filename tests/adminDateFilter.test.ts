import { getAdminDateBounds } from '@/backend/adminDateFilter';

describe('admin exact-date filtering', () => {
  it('uses Malaysian midnight boundaries', () => {
    expect(getAdminDateBounds('2026-09-05')).toEqual({
      start: new Date('2026-09-05T00:00:00+08:00').getTime(),
      end: new Date('2026-09-06T00:00:00+08:00').getTime(),
    });
  });

  it('rejects malformed and impossible dates', () => {
    expect(getAdminDateBounds('2026-9-5')).toBeNull();
    expect(getAdminDateBounds('2026-02-30')).toBeNull();
    expect(getAdminDateBounds(undefined)).toBeNull();
  });
});
