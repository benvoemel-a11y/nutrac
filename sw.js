// Nutrac Service Worker – hält die App-Dateien offline bereit.
// Bei jedem Update die Versionsnummer erhöhen, dann holen sich die Handys die neue Version.
const VERSION = "nutrac-v45";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Datenbank, Login und Produktsuche nie aus dem Cache
  if (url.hostname.endsWith("supabase.co") || url.hostname.includes("openfoodfacts")) return;
  // Eigene Dateien: sofort aus dem Speicher (kein weißer Bildschirm beim Start),
  // im Hintergrund frisch holen. Neue Versionen kommen über die VERSION oben.
  if (url.origin === location.origin) {
    const net = fetch(e.request, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    });
    e.respondWith(
      caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" })
        .then(hit => hit || (e.request.mode === "navigate" ? caches.match("index.html") : null))
        .then(hit => hit || net)
        .catch(() => net)
    );
    e.waitUntil(net.catch(() => {}));
    return;
  }
  // Bibliotheken und Schriften: Cache zuerst
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }))
  );
});

// Mitteilungen
self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "Nutrac", {
    body: m.body || "", tag: m.tag, renotify: !!m.tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: m.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.postMessage({ nav: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
