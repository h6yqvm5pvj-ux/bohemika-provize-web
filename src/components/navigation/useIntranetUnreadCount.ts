"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { INTRANET_UNREAD_EVENT, INTRANET_UNREAD_STORAGE_KEY } from "@/app/intranet/unreadEvents";

const REFRESH_MS = 60_000;
type CountSnapshot = { key: string; count: number; checkedAt: number };
let cached: CountSnapshot | null = null;

export function useIntranetUnreadCount(user: User | null, email: string, enabled: boolean) {
  const key = enabled && user && email ? `${user.uid}:${email.trim().toLowerCase()}` : "";
  const [snapshot, setSnapshot] = useState<CountSnapshot | null>(null);

  useEffect(() => {
    if (!key || !user) return;
    let disposed = false;
    let request: AbortController | null = null;
    let lastAttempt = 0;

    const refresh = async (force = false) => {
      if (disposed || document.visibilityState === "hidden") return;
      if (!force && cached?.key === key && Date.now() - cached.checkedAt < REFRESH_MS) {
        setSnapshot(cached);
        return;
      }
      if (!force && (request || Date.now() - lastAttempt < REFRESH_MS)) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      lastAttempt = Date.now();
      try {
        const result = await fetchAuthedJsonOrThrow<{ ok: boolean; unreadCount: number }>(user,
          "/api/intranet/wall/unread-count", { signal: controller.signal });
        if (disposed || controller.signal.aborted || !result?.ok ||
            !Number.isSafeInteger(result.unreadCount) || result.unreadCount < 0) return;
        cached = { key, count: result.unreadCount, checkedAt: Date.now() };
        setSnapshot(cached);
      } catch {
        // Keep the last known count; a failed request must not mean "all read".
      } finally {
        if (request === controller) request = null;
      }
    };
    const invalidate = () => {
      if (cached?.key === key) cached = null;
      lastAttempt = 0;
      request?.abort();
      request = null;
      void refresh(true);
    };
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === email) invalidate();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== INTRANET_UNREAD_STORAGE_KEY || !event.newValue) return;
      try {
        if (JSON.parse(event.newValue).email === email) invalidate();
      } catch { /* Ignore unrelated or malformed storage data. */ }
    };
    const onVisible = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(onVisible, REFRESH_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(INTRANET_UNREAD_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(INTRANET_UNREAD_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, user, email]);

  return key && snapshot?.key === key ? snapshot.count : null;
}
