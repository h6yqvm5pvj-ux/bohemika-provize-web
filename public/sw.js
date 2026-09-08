/* eslint-disable no-restricted-globals */

const CACHE_PREFIX = "bohemika-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/favicon.ico",
];

const STATIC_ASSET_ALLOWLIST = [
  /^\/_next\/image$/,
  /^\/_next\/static\/.*/,
  /^\/demos\/.*/,
  /^\/fonts\/.*/,
  /^\/icons\/.*/,
  /^\/provize\/.*/,
  /^\/pwa\/.*/,
  /^\/favicon\.ico$/,
];
const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

function normalizePushLinkCandidate(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePushEmail(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

function normalizePushEntryId(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:-]{6,200}$/.test(raw) ? raw : null;
}

function parseObjectFromUnknown(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isAppNavigationPath(pathname) {
  return (
    pathname === "/" ||
    /^\/(admin\/zadosti|login|nastaveni|smlouvy|muj-tym|pomucky|kalkulacka|cuzk|cashflow|intranet|posta|tipy|vizitka|jakubrauscher)(\/.*)?$/.test(
      pathname
    )
  );
}

function buildContractDetailPathFromParts(ownerEmail, entryId) {
  const email = normalizePushEmail(ownerEmail);
  const normalizedEntryId = normalizePushEntryId(entryId);
  if (!email || !normalizedEntryId) return null;
  return `/smlouvy/${encodeURIComponent(`${email}___${normalizedEntryId}`)}?from=list&source=push`;
}

function buildContractDeepLinkFromPayload(payload) {
  const row = parseObjectFromUnknown(payload);
  if (!row) return null;

  const nestedData = parseObjectFromUnknown(row.data) || {};
  const fcmWrapped = parseObjectFromUnknown(row.FCM_MSG) || {};
  const fcmWrappedData = parseObjectFromUnknown(fcmWrapped.data) || {};

  const sources = [row, nestedData, fcmWrapped, fcmWrappedData];
  for (const source of sources) {
    const slugCandidate = normalizePushLinkCandidate(source.contractSlug || source.slug);
    if (slugCandidate && slugCandidate.includes("___")) {
      return `/smlouvy/${encodeURIComponent(slugCandidate)}?from=list&source=push`;
    }
  }

  for (const source of sources) {
    const direct = buildContractDetailPathFromParts(
      source.ownerEmail ||
        source.userEmail ||
        source.adviserEmail ||
        source.authorEmail ||
        source.email,
      source.entryId || source.contractEntryId || source.contractId || source.id
    );
    if (direct) return direct;
  }

  return null;
}

function pickPushTargetFromPayload(payload) {
  const row = parseObjectFromUnknown(payload);
  if (!row) return null;
  const nestedData =
    row.data && typeof row.data === "object" ? row.data : {};
  const nestedNotification =
    row.notification && typeof row.notification === "object"
      ? row.notification
      : {};
  const nestedFcmOptions =
    row.fcmOptions && typeof row.fcmOptions === "object"
      ? row.fcmOptions
      : row.fcm_options && typeof row.fcm_options === "object"
        ? row.fcm_options
        : {};

  const candidates = [
    row.deepLink,
    nestedData.deepLink,
    row.url,
    nestedData.url,
    row.link,
    nestedData.link,
    row.click_action,
    nestedData.click_action,
    nestedNotification.click_action,
    nestedNotification.link,
    nestedFcmOptions.link,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePushLinkCandidate(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function resolveNotificationTargetPath(notification) {
  const data = parseObjectFromUnknown(notification?.data);
  const direct =
    pickPushTargetFromPayload(data) || buildContractDeepLinkFromPayload(data);
  if (direct) return direct;

  const fcmWrapped = data && typeof data === "object" ? parseObjectFromUnknown(data.FCM_MSG) : null;
  const fromWrapped =
    pickPushTargetFromPayload(fcmWrapped) || buildContractDeepLinkFromPayload(fcmWrapped);
  if (fromWrapped) return fromWrapped;

  return "/nastaveni";
}

function resolveSameOriginTargetUrl(targetPath) {
  try {
    const parsed = new URL(targetPath, self.location.origin);
    const normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!isAppNavigationPath(parsed.pathname)) {
      return new URL("/nastaveni", self.location.origin).href;
    }
    if (parsed.origin !== self.location.origin) {
      return new URL(normalizedPath, self.location.origin).href;
    }
    return parsed.href;
  } catch {
    return new URL("/nastaveni", self.location.origin).href;
  }
}

function isPageDataRequest(url, request) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-Segment-Prefetch") ||
    request.headers.get("Accept")?.includes("text/x-component")
  );
}

function shouldCacheResponse(response) {
  if (!response || response.status !== 200 || response.redirected) return false;
  if (response.type !== "basic" && response.type !== "default") return false;
  const directives = (response.headers.get("Cache-Control") || "")
    .split(",")
    .map((directive) => directive.split("=", 1)[0].trim().toLowerCase());
  return !directives.some((directive) =>
    ["no-store", "private", "no-cache"].includes(directive)
  ) && !response.headers.get("Content-Type")?.includes("text/x-component");
}

async function readCachedResponse(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(request);
    return shouldCacheResponse(response) ? response : undefined;
  } catch {
    return undefined;
  }
}

async function fetchStaticAsset(request, immutable) {
  const response = await fetch(request, { cache: immutable ? "default" : "no-cache" });
  try {
    const cache = await caches.open(CACHE_NAME);
    if (shouldCacheResponse(response) && !response.headers.get("Content-Type")?.includes("text/html")) {
      await cache.put(request, response.clone());
    } else {
      // A new private/no-store response or a removed file invalidates the old copy.
      await cache.delete(request);
    }
  } catch {
    // Cache storage can be unavailable or full; still return the network response.
  }
  return response;
}

async function serveStaticAsset(request, immutable) {
  if (immutable) {
    const cached = await readCachedResponse(request);
    if (cached) return cached;
  }
  try {
    return await fetchStaticAsset(request, immutable);
  } catch {
    return (await readCachedResponse(request)) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
      PRECACHE_URLS.map(async (url) => {
        const response = await fetch(url, { cache: "reload" });
        if (shouldCacheResponse(response)) await cache.put(url, response);
      })
    )).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.cache === "no-store" ||
    request.headers.has("Authorization") ||
    request.headers.has("Range") ||
    isPageDataRequest(url, request)
  ) return;

  // Documents always come from the server; offline never exposes a cached page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(async () => {
          const offline = await readCachedResponse(OFFLINE_URL);
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

  if (!STATIC_ASSET_ALLOWLIST.some((pattern) => pattern.test(url.pathname))) return;

  // Build-versioned Next assets are immutable. Other assets are revalidated online.
  event.respondWith(serveStaticAsset(request, url.pathname.startsWith("/_next/static/")));
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

  const title =
    notificationPayload.title ||
    dataPayload.title ||
    payload?.title ||
    "Bohemika SmartApp";
  const body =
    notificationPayload.body ||
    dataPayload.message ||
    dataPayload.body ||
    payload?.message ||
    payload?.body ||
    "Máš novou notifikaci.";
  const icon = notificationPayload.icon || "/pwa/icon-192.png";
  const badge = notificationPayload.badge || "/pwa/icon-192.png";
  const tag =
    notificationPayload.tag || payload?.tag || `bohemika-push-${Date.now()}`;
  const url =
    pickPushTargetFromPayload(payload) ||
    pickPushTargetFromPayload(dataPayload) ||
    buildContractDeepLinkFromPayload(payload) ||
    buildContractDeepLinkFromPayload(dataPayload) ||
    "/nastaveni";

  const looksLikeLegacyTeamContractPush =
    !pickPushTargetFromPayload(payload) &&
    !buildContractDeepLinkFromPayload(payload) &&
    /nov[áa]\s+smlouva\s+v\s+t[ýy]mu/i.test(String(title)) &&
    /sepsal?\(?.*smlouvu/i.test(String(body));
  if (looksLikeLegacyTeamContractPush) {
    return;
  }

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
  const targetPath = resolveNotificationTargetPath(event.notification);
  const targetUrl = resolveSameOriginTargetUrl(targetPath);

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
