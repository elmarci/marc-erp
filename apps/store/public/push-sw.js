// Se inyecta dentro del service worker que genera vite-plugin-pwa (ver
// workbox.importScripts en vite.config.ts) — el precacheo del app shell lo
// maneja Workbox solo; esto sólo agrega el manejo de push/click de
// notificación, que Workbox no hace por su cuenta.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* payload no era JSON */ }

  const title = data.title || 'Tienda Marc';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: si ya hay una pestaña de la tienda abierta, la
// enfoca y navega ahí en vez de abrir una pestaña nueva de más.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
