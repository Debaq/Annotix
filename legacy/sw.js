// Annotix Service Worker - Powered by Workbox
// Provides offline functionality and caching for PWA

// Import Workbox from CDN
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

if (workbox) {
  console.log('[SW] Workbox loaded successfully');

  // Configure Workbox
  workbox.setConfig({
    debug: false
  });

  // Skip waiting and claim clients immediately
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // Precache static assets
  workbox.precaching.precacheAndRoute([
    { url: 'index.html', revision: '1' },
    { url: 'manifest.json', revision: '1' },

    // CSS files
    { url: 'css/variables.css', revision: '1' },
    { url: 'css/base.css', revision: '1' },
    { url: 'css/layout.css', revision: '1' },
    { url: 'css/components.css', revision: '1' },
    { url: 'css/canvas.css', revision: '1' },
    { url: 'css/modals.css', revision: '1' },
    { url: 'css/gallery.css', revision: '1' },
    { url: 'css/responsive.css', revision: '1' },
    { url: 'css/utilities.css', revision: '1' },

    // Core JS files
    { url: 'js/app.js', revision: '1' },
    { url: 'js/database-manager.js', revision: '1' },
    { url: 'js/project-manager.js', revision: '1' },
    { url: 'js/canvas-manager.js', revision: '1' },
    { url: 'js/tool-manager.js', revision: '1' },
    { url: 'js/gallery-manager.js', revision: '1' },
    { url: 'js/ui-manager.js', revision: '1' },
    { url: 'js/i18n.js', revision: '1' },
    { url: 'js/utils.js', revision: '1' },
    { url: 'js/shortcuts-manager.js', revision: '1' },
    { url: 'js/export-manager.js', revision: '1' },
    { url: 'js/training-code-generator.js', revision: '1' },
    { url: 'js/image-preprocessor.js', revision: '1' },
    { url: 'js/classification-manager.js', revision: '1' },
    { url: 'js/event-bus.js', revision: '1' },

    // Skeleton presets for keypoints
    { url: 'js/skeleton-presets.js', revision: '1' },

    // Canvas architecture
    { url: 'js/canvas/canvas-base.js', revision: '1' },
    { url: 'js/canvas/canvas-bbox.js', revision: '1' },
    { url: 'js/canvas/canvas-obb.js', revision: '1' },
    { url: 'js/canvas/canvas-mask.js', revision: '1' },
    { url: 'js/canvas/canvas-keypoints.js', revision: '1' },
    { url: 'js/canvas/canvas-polygon.js', revision: '1' },
    { url: 'js/canvas/canvas-landmarks.js', revision: '1' },
    { url: 'js/canvas/canvas-factory.js', revision: '1' },

    // Locales (all languages)
    { url: 'locales/en.json', revision: '1' },
    { url: 'locales/es.json', revision: '1' },
    { url: 'locales/fr.json', revision: '1' },
    { url: 'locales/de.json', revision: '1' },
    { url: 'locales/pt.json', revision: '1' },
    { url: 'locales/it.json', revision: '1' },
    { url: 'locales/zh.json', revision: '1' },
    { url: 'locales/ja.json', revision: '1' },
    { url: 'locales/ko.json', revision: '1' },
    { url: 'locales/ru.json', revision: '1' }
  ]);

  // Cache strategy for CSS and JS files - Cache First
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'style' || request.destination === 'script',
    new workbox.strategies.CacheFirst({
      cacheName: 'annotix-assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        })
      ]
    })
  );

  // Cache strategy for CDN resources (Font Awesome, JSZip, Intro.js) - Stale While Revalidate
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://cdnjs.cloudflare.com' ||
                 url.origin === 'https://unpkg.com' ||
                 url.origin === 'https://storage.googleapis.com',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'annotix-cdn',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
        })
      ]
    })
  );

  // Cache strategy for images - Cache First with expiration
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'annotix-images',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        })
      ]
    })
  );

  // Cache strategy for fonts - Cache First
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'font',
    new workbox.strategies.CacheFirst({
      cacheName: 'annotix-fonts',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
        })
      ]
    })
  );

  // Offline fallback - return index.html for navigation requests when offline
  workbox.routing.setCatchHandler(async ({ event }) => {
    if (event.request.destination === 'document') {
      return caches.match('index.html');
    }
    return Response.error();
  });

  console.log('[SW] Workbox configured and routes registered');

} else {
  console.error('[SW] Workbox failed to load');
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
