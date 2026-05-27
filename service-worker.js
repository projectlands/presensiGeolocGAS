/**
 * Progressive Web App Service Worker - Network-First Strategy
 */

const CACHE_NAME = 'presensi-geoloc-cache-v1.4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './admin.html',
  './laporan.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/api.js',
  './assets/js/attendance.js',
  './assets/js/admin.js',
  './assets/js/helper.js'
];

// Install trigger: open caches and seed resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Memasang cache shell static...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate trigger: clean obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Menghapus cache usang:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch trigger: Network-First with Cache-Fallback pattern
self.addEventListener('fetch', (event) => {
  // Only handle standard GET requests (e.g. static assets, images)
  if (event.request.method !== 'GET') return;

  // Ignore non-http/https requests (like chrome-extension://)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If successful, open cache and clone response
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Network failed, lookup from cache shell
        console.log('[Service Worker] Perangkat Offline. Mencari aset di cache:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Absolute fallback if index matches
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
