// TappedIn has no service worker. Another project once registered /sw.js on localhost:3000, and
// Chrome kept serving its cached pages here (stale pages, a theme choice that wouldn't stick). The
// browser re-downloads this file to check for updates; this version deletes its caches, removes
// itself and reloads open tabs so they come straight from the app.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })(),
  );
});
