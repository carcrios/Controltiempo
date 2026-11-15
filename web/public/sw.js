// Service worker: deja la aplicación instalable y usable sin señal.
// La API (Apps Script) nunca se guarda en caché: las marcaciones sin señal las maneja la bandeja de salida de la app.
const VERSION = 'jornada-v1.0.0';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', './config.js', './manifest.webmanifest', './icono-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const esPagina = r.mode === 'navigate' || u.pathname.endsWith('/config.js');
  if (esPagina) { // red primero: las actualizaciones llegan de inmediato; sin señal, la copia guardada
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(VERSION).then((k) => k.put(r, c)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('./'))));
  } else { // archivos con huella en el nombre: caché primero
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then((k) => k.put(r, c)); } return res; })));
  }
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
