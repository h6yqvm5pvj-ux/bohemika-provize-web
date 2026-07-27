"use client";

import { useEffect, useLayoutEffect } from "react";

import { firebaseApp } from "@/app/firebase-app";

type ForegroundPushPayload = {
  data?: Record<string, string>;
  fcmOptions?: {
    link?: string;
  };
  notification?: {
    title?: string;
    body?: string;
    icon?: string;
  };
};

function resolveForegroundPushTarget(payload: ForegroundPushPayload): string {
  const candidate =
    payload.data?.deepLink ||
    payload.data?.url ||
    payload.data?.link ||
    payload.fcmOptions?.link ||
    "/nastaveni";

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/nastaveni";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/nastaveni";
  }
}

export function PwaBootstrap() {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const body = document.body;
    body.classList.remove("simple-bg", "simple-bg-blue", "simple-bg-black", "simple-bg-white");
    body.classList.add("simple-bg");
    body.classList.add("simple-bg-white");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.warn("[PWA] Registrace service workeru selhala:", error);
      }
    };

    void register();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const registerForegroundMessages = async () => {
      try {
        const messagingModule = await import("firebase/messaging");
        if (!(await messagingModule.isSupported())) return;
        if (cancelled || Notification.permission !== "granted") return;

        const messaging = messagingModule.getMessaging(firebaseApp);
        unsubscribe = messagingModule.onMessage(messaging, (payload) => {
          if (Notification.permission !== "granted") return;

          const typedPayload = payload as ForegroundPushPayload;
          const title =
            typedPayload.notification?.title ||
            typedPayload.data?.title ||
            "Bohemika SmartApp";
          const body =
            typedPayload.notification?.body ||
            typedPayload.data?.message ||
            typedPayload.data?.body ||
            "Máš novou notifikaci.";
          const target = resolveForegroundPushTarget(typedPayload);
          const notification = new Notification(title, {
            body,
            icon: typedPayload.notification?.icon || "/pwa/icon-192.png",
            badge: "/pwa/icon-192.png",
            tag: typedPayload.data?.tag || typedPayload.data?.reportId || `bohemika-${Date.now()}`,
            data: { target },
          });

          notification.onclick = () => {
            notification.close();
            window.focus();
            window.location.assign(target);
          };
        });
      } catch (error) {
        console.warn("[PWA] Foreground push listener selhal:", error);
      }
    };

    void registerForegroundMessages();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}
