"use strict";
const CACHE_NAME = "firetong-mvp-v16";
const CACHE_PREFIX = "firetong-mvp-";
const APP_SHELL = [
    "/",
    "/index.html",
    "/icon.svg",
    "/icon-maskable.svg",
    "/manifest.webmanifest",
];
const serviceWorker = self;
serviceWorker.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => serviceWorker.skipWaiting()));
});
serviceWorker.addEventListener("activate", (event) => {
    event.waitUntil(caches
        .keys()
        .then((cacheNames) => Promise.all(cacheNames
        .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))))
        .then(() => serviceWorker.clients.claim()));
});
serviceWorker.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET")
        return;
    const url = new URL(event.request.url);
    if (url.origin !== serviceWorker.location.origin || url.pathname.startsWith("/api/"))
        return;
    if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
        event.respondWith(fetch(event.request)
            .then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
        })
            .catch(() => caches
            .match(event.request)
            .then((cached) => cached || caches.match("/index.html"))
            .then((cached) => cached || new Response("Offline", { status: 503 }))));
        return;
    }
    event.respondWith(caches.match(event.request).then((cached) => {
        if (cached)
            return cached;
        return fetch(event.request).then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
        });
    }));
});
