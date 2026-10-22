import { handleMockRequest } from '@/src/mocks/api';

let installed = false;

/** Answers `/api/...` calls locally. Image and map requests still use the network. */
export const installMockFetch = (): void => {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/')) {
      return handleMockRequest(url, init) as unknown as Response;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
};
