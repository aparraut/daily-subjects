const CACHE_NAME = 'daily-subjects-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/main.js',
  './js/auth.js',
  './js/config.js',
  './js/data.js',
  './js/ui.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install event - caching assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clearing old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - cache-first / network fallback with dynamic CDN caching
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Do not cache Supabase API calls (network only)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Cache-First / Stale-While-Revalidate strategy
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache for local assets (Stale-While-Revalidate)
        if (url.origin === self.location.origin) {
          fetch(req).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(req, networkResponse);
              });
            }
          }).catch(() => { /* ignore network error when offline */ });
        }
        return cachedResponse;
      }

      // Fetch from network
      return fetch(req).then((networkResponse) => {
        // Check if we should cache this response (e.g. CDNs or dynamic assets)
        if (networkResponse.status === 200) {
          const isCDN = url.hostname.includes('cdn.jsdelivr.net') || 
                        url.hostname.includes('fonts.googleapis.com') || 
                        url.hostname.includes('fonts.gstatic.com');
          
          if (isCDN || url.origin === self.location.origin) {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, networkResponse.clone());
              return networkResponse;
            });
          }
        }
        return networkResponse;
      }).catch((err) => {
        // When offline and not in cache
        console.log('[Service Worker] Fetch failed:', err);
      });
    })
  );
});
