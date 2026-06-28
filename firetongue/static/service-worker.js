const CACHE_NAME = "firetongue-mvp-v8";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/app-core.js",
  "/icon.svg",
  "/icon-maskable.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
