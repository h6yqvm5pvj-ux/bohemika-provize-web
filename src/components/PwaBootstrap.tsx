"use client";

import { useEffect, useLayoutEffect } from "react";

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

  return null;
}
