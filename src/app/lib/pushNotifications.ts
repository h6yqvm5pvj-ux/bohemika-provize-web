"use client";

import { firebaseApp } from "@/app/firebase-app";

const PUSH_DEVICE_ID_KEY = "bohemika.push.deviceId";

type MessagingModule = typeof import("firebase/messaging");

type MessagingRuntime = {
  module: MessagingModule;
  registration: ServiceWorkerRegistration;
  vapidKey?: string;
};

function trimOptionalQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, "");
}

function resolveVapidKey(): string {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!raw) return "";
  return trimOptionalQuotes(raw.trim());
}

function randomChunk(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return [...bytes]
      .map((byte) => alphabet[byte % alphabet.length])
      .join("");
  }
  return Math.random().toString(36).slice(2, 2 + length);
}

export function getPushDeviceId(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (stored && /^[a-z0-9_-]{12,120}$/.test(stored)) return stored;

  const generated = `web_${Date.now().toString(36)}_${randomChunk(12)}`.slice(0, 120);
  window.localStorage.setItem(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function isPushSupportedInBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  return true;
}

async function ensurePwaServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker není v tomto prohlížeči dostupný.");
  }

  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function resolveMessagingRuntime(): Promise<MessagingRuntime> {
  if (!isPushSupportedInBrowser()) {
    throw new Error("Web push notifikace nejsou v tomto prohlížeči podporované.");
  }

  const messagingModule = await import("firebase/messaging");
  const supported = await messagingModule.isSupported();
  if (!supported) {
    throw new Error("Tento prohlížeč nepodporuje Firebase Messaging API.");
  }

  const registration = await ensurePwaServiceWorkerRegistration();
  const vapidKey = resolveVapidKey();
  return {
    module: messagingModule,
    registration,
    vapidKey: vapidKey || undefined,
  };
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupportedInBrowser()) {
    throw new Error("Notifikace nejsou v tomto prohlížeči podporované.");
  }
  return Notification.requestPermission();
}

export async function getBrowserFcmToken(): Promise<string> {
  const permission = getPushPermission();
  if (permission === "denied") {
    throw new Error("Notifikace jsou v prohlížeči zablokované.");
  }

  const nextPermission = permission === "granted" ? permission : await requestPushPermission();
  if (nextPermission !== "granted") {
    throw new Error("Bez povolení notifikací nelze aktivovat push.");
  }

  const runtime = await resolveMessagingRuntime();
  const messaging = runtime.module.getMessaging(firebaseApp);
  const token = await runtime.module.getToken(messaging, {
    serviceWorkerRegistration: runtime.registration,
    vapidKey: runtime.vapidKey,
  });

  if (!token) {
    throw new Error("FCM token se nepodařilo získat.");
  }
  return token;
}

export async function deleteBrowserFcmToken(): Promise<{ removed: boolean; previousToken: string | null }> {
  const runtime = await resolveMessagingRuntime();
  const messaging = runtime.module.getMessaging(firebaseApp);

  let previousToken: string | null = null;
  try {
    previousToken = await runtime.module.getToken(messaging, {
      serviceWorkerRegistration: runtime.registration,
      vapidKey: runtime.vapidKey,
    });
  } catch {
    previousToken = null;
  }

  const removed = await runtime.module.deleteToken(messaging);
  return { removed, previousToken: previousToken || null };
}
