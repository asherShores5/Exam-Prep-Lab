/**
 * Workbox runtime-caching entry for exam banks (`/exams/*.json`), used by
 * vite.config.ts (B11).
 *
 * - NetworkFirst: a content deploy shows up on the next load; the cache is only
 *   the offline fallback.
 * - Only 200 responses whose content-type is JSON are cached, so an
 *   `index.html` SPA fallback served with a 200 never gets stored as a bank.
 *
 * Workbox serializes these functions into sw.js with toString(), so they must
 * be self-contained (no imports or outer variables).
 */

interface UrlMatchArg { url: URL }
interface CacheWillUpdateArg { request: Request; response: Response; event?: unknown; state?: unknown }

export const examBankRuntimeCaching = {
  urlPattern: ({ url }: UrlMatchArg): boolean =>
    url.pathname.startsWith('/exams/') && url.pathname.endsWith('.json'),
  handler: 'NetworkFirst' as const,
  options: {
    cacheName: 'exam-banks',
    expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
    cacheableResponse: { statuses: [200] },
    plugins: [
      {
        cacheWillUpdate: async ({ response }: CacheWillUpdateArg): Promise<Response | null> =>
          (response.headers.get('content-type') || '').toLowerCase().includes('application/json')
            ? response
            : null,
      },
    ],
  },
};
