const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface AdminDateBounds {
  start: number;
  end: number;
}

/** Returns one Malaysian calendar day's UTC bounds, or null for invalid input. */
export const getAdminDateBounds = (value: unknown): AdminDateBounds | null => {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return null;

  const start = new Date(`${value}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(start)) return null;

  const normalized = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(start));
  if (normalized !== value) return null;

  return { start, end: start + 86_400_000 };
};
