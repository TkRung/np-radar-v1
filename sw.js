const CACHE = "np-radar-v1-shell-v2-water";
const SHELL = ["/","/water.css","/water-layer.js","/lib/water-data.js","/manifest.webmanifest","/icon-192.png","/icon-512.png"];

self.addEventListener("install",event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch",event => {
  const u = new URL(event.request.url);

  // Keep time-sensitive observations and third-party tiles out of the shell cache.
  if (event.request.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(event.request,clone));
        return r;
      })
      .catch(() => caches.match(event.request))
  );
});
