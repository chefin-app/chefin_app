import { createDiscoveryCache, withDiscoveryTimeout } from '@/src/utils/discoveryCache';

describe('discovery request cache', () => {
  afterEach(() => jest.useRealTimers());

  it('coalesces concurrent reads and reuses recent results, then refreshes', async () => {
    jest.useFakeTimers();
    const cache = createDiscoveryCache<number>(30_000);
    const load = jest.fn().mockResolvedValueOnce(1).mockResolvedValue(2);
    expect(await Promise.all([cache('feed', load), cache('feed', load)])).toEqual([1, 1]);
    expect(await cache('feed', load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30_001);
    expect(await cache('feed', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('isolates locations, bounds retained entries and retries failures', async () => {
    const cache = createDiscoveryCache<number>(30_000, 1);
    const load = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(1);
    await expect(cache('KL', load)).rejects.toThrow('offline');
    await expect(cache('KL', load)).resolves.toBe(1);
    await expect(cache('Sandakan', async () => 2)).resolves.toBe(2);
    await cache('KL', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('aborts a stalled discovery request after twelve seconds', async () => {
    jest.useFakeTimers();
    const request = withDiscoveryTimeout(
      signal =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const failure = request.catch(error => error);
    jest.advanceTimersByTime(12_000);
    expect(await failure).toEqual(new Error('aborted'));
    expect(jest.getTimerCount()).toBe(0);
  });
});
