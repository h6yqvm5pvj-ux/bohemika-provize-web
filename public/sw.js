/* eslint-disable no-restricted-globals */

const CACHE_NAME = "bohemika-pwa-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/favicon.ico",
];

const SAME_ORIGIN_CACHE_ALLOWLIST = [
  /^\/$/,
  /^\/(login|nastaveni|smlouvy|muj-tym|pomucky|kalkulacka|cuzk|cashflow)(\/.*)?$/,
  /^\/_next\/static\/.*/,
  /^\/icons\/.*/,
  /^\/pwa\/.*/,
  /^\/favicon\.ico$/,
];

function isSameOriginCacheCandidate(url, request) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return SAME_ORIGIN_CACHE_ALLOWLIST.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isSameOriginCacheCandidate(url, request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ||
            new Response("Offline", {
              status: 503,
              statusText: "Offline",
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned)).catch(() => undefined);
          return response;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = { message: event.data.text() };
  }

  // If FCM already carries a display notification payload, let the browser/SDK handle it
  // to avoid duplicate notifications.
  if (payload?.notification) {
    return;
  }

  const title =
    payload?.notification?.title ||
    payload?.title ||
    "Bohemika SmartApp";
  const body =
    payload?.notification?.body ||
    payload?.message ||
    "Máš novou notifikaci.";
  const url = payload?.data?.deepLink || payload?.deepLink || "/nastaveni";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      data: { url },
      tag: payload?.notification?.tag || "bohemika-push",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.url || "/nastaveni";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matching = clients.find((client) => client.url === targetUrl);
      if (matching) return matching.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
