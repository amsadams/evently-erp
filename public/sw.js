/* Evently ERP service worker.
 * Strategy:
 *  - Precache only the offline fallback + icons (no business data).
 *  - Static build assets (/_next/static, icons, fonts): cache-first.
 *  - Navigations: network-first, fall back to the offline page. HTML shells are NOT cached, so authenticated/private pages are never served stale.
 *  - Never cache API responses or anything non-GET (the demo keeps its data in the browser, a real backend's responses must stay uncached).
 */
const VERSION = "evently-v3";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API/authenticated data

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match("/offline")) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })),
    );
    return;
  }

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|jpg|svg|ico)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});

/* Web Push boundary: a real server (web-push + VAPID) would deliver these payloads while the app is closed. */
self.addEventListener("push", (event) => {
  let data = { title: "Evently", body: "You have a new notification", url: "/notifications" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { /* non-JSON payload */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    }),
  );
});
