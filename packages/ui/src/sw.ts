/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'gspl-paradigm-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// ─── Install: cache static shell ─────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// ─── Activate: purge old caches ──────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// ─── Fetch: cache-first for static, network-first for API ────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls, SSE, or WebSocket upgrades
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) {
    return;
  }

  // For navigation requests, try network first then fall back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // For other static assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});

// ─── Background Sync: queue mutations while offline ──
const SYNC_QUEUE_KEY = 'gspl-sync-queue';

interface SyncEntry {
  readonly url: string;
  readonly method: string;
  readonly body: string;
  readonly timestamp: number;
}

// Background sync handler — cast via addEventListener overload
self.addEventListener('sync' as any, ((event: Event & { tag?: string; waitUntil?: (p: Promise<void>) => void }) => {
  if (event.tag === 'gspl-sync' && event.waitUntil) {
    event.waitUntil(processSyncQueue());
  }
}) as EventListener);

async function processSyncQueue(): Promise<void> {
  // Read queue from IndexedDB via a simple approach
  // In production, this would use the IDB from @paradigm/store
  try {
    const cache = await caches.open('gspl-sync');
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      if (!response) continue;

      const entry: SyncEntry = await response.json() as SyncEntry;
      try {
        await fetch(entry.url, {
          method: entry.method,
          headers: { 'Content-Type': 'application/json' },
          body: entry.body,
        });
        await cache.delete(request);
      } catch {
        // Will retry on next sync event
        break;
      }
    }
  } catch {
    // Sync queue not available
  }
}

// ─── Message handling: receive commands from main thread ──
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string };
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

export {};
