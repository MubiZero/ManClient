// Minimal service worker: installability + basic offline tolerance.
// Intentionally does NOT precache Next.js build output (hashed chunk
// filenames make a hand-written precache list infeasible and fragile).

// Bump the cache name whenever a precached asset changes: `activate` deletes every other cache,
// so installed clients pick up the new files instead of serving the old ones forever.
const STATIC_CACHE = "manclient-static-v3";
const PRECACHE_URLS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle navigation requests specially; let everything else
  // (JS/CSS chunks, API calls, images, etc.) pass straight through to
  // the network so we never risk serving a stale app shell or bundle.
  if (request.mode !== "navigate") {
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
