/** Short-lived, bounded, memory-only cache for public discovery reads.
 * Never use for checkout, capacity reservations, or account data.
 */
export function createDiscoveryCache<T>(ttlMs = 30_000, maxEntries = 30) {
  const values = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const cached = values.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    values.delete(key);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve()
      .then(load)
      .then(value => {
        values.set(key, { value, expiresAt: Date.now() + ttlMs });
        while (values.size > maxEntries) values.delete(values.keys().next().value!);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}

/** Bound discovery waits, including downloading and parsing the response. */
export async function withDiscoveryTimeout<T>(
  load: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await load(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
