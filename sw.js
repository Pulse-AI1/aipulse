// ============================================================
// AI Pulse — Service Worker
// Handles offline caching and push notifications
// ============================================================

const CACHE_NAME = 'aipulse-v1';
const OFFLINE_URL = '/';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH — Network first, fall back to cache ─────────────────
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (Stripe, analytics etc.)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache a copy of fresh responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fall back to the home page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '⚡ AI Pulse', body: 'Your daily AI update is ready!', icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', url: '/' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch(e) {}
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    tag: 'aipulse-daily',
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'read', title: '📰 Read Now' },
      { action: 'dismiss', title: 'Later' }
    ],
    data: { url: data.url }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.action === 'dismiss' ? null : (event.notification.data?.url || '/');

  if (url) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        // Open new window
        if (clients.openWindow) return clients.openWindow(url);
      })
    );
  }
});

// ── BACKGROUND SYNC ───────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(
      fetch('/').then(response => {
        console.log('[SW] Background sync complete');
      }).catch(err => {
        console.log('[SW] Background sync failed:', err);
      })
    );
  }
});
