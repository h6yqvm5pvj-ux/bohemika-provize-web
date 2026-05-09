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
const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

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
  if (IS_LOCAL_DEV) return;

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

  const notificationPayload =
    payload?.notification && typeof payload.notification === "object"
      ? payload.notification
      : {};
  const dataPayload =
    payload?.data && typeof payload.data === "object" ? payload.data : {};

  const title = notificationPayload.title || payload?.title || "Bohemika SmartApp";
  const body =
    notificationPayload.body ||
    payload?.message ||
    payload?.body ||
    "Máš novou notifikaci.";
  const icon = notificationPayload.icon || "/pwa/icon-192.png";
  const badge = notificationPayload.badge || "/pwa/icon-192.png";
  const tag =
    notificationPayload.tag || payload?.tag || `bohemika-push-${Date.now()}`;
  const url =
    dataPayload.deepLink ||
    dataPayload.link ||
    payload?.deepLink ||
    payload?.link ||
    "/nastaveni";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.url || "/nastaveni";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const matching = clients.find((client) => client.url === targetUrl);
        if (matching) return matching.focus();

        const sameOriginClient = clients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (sameOriginClient) {
          try {
            const navigatedClient = await sameOriginClient.navigate(targetUrl);
            return (navigatedClient || sameOriginClient).focus();
          } catch {
            const openedClient = await self.clients.openWindow(targetUrl);
            if (openedClient) return openedClient.focus();
            return sameOriginClient.focus();
          }
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});
