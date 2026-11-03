"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function cancelMomentum(current: Lenis | null) {
  if (current?.isScrolling !== "smooth") return;
  // Cancel Lenis without an instant scrollTo that would abort native smooth scrolling.
  current.stop();
  current.start();
}

function motionDisabled(root: HTMLElement, media: MediaQueryList): boolean {
  if (media.matches || root.dataset.motion === "off") return true;
  try {
    return window.localStorage.getItem("settings.reduceMotion") === "1";
  } catch {
    return false;
  }
}

function pageScrollLocked(root: HTMLElement, body: HTMLElement): boolean {
  const rootStyle = getComputedStyle(root);
  const bodyStyle = getComputedStyle(body);
  return [rootStyle.overflowY, bodyStyle.overflowY].some(value => value === "hidden" || value === "clip")
    || bodyStyle.position === "fixed";
}

/** Smooth desktop wheel input while retaining the document's native scroll position. */
export function SmoothScroll() {
  const pathname = usePathname();
  const instance = useRef<Lenis | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");

    const destroy = () => {
      const current = instance.current;
      instance.current = null;
      current?.destroy();
    };
    const stopMomentum = () => cancelMomentum(instance.current);
    // A native smooth request must cancel inertia before Lenis' next instant RAF write.
    const wrapWindowScroll = (original: typeof window.scrollTo): typeof window.scrollTo =>
      function(this: Window, ...args: [options?: ScrollToOptions] | [x: number, y: number]) {
        if ((this === window || this === undefined) && typeof args[0] === "object" && args[0]?.behavior === "smooth") stopMomentum();
        Reflect.apply(original, this, args);
      };
    const originalScrollTo = window.scrollTo;
    const originalScrollBy = window.scrollBy;
    const originalScroll = window.scroll;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollTo = wrapWindowScroll(originalScrollTo);
    const scrollBy = wrapWindowScroll(originalScrollBy);
    const scroll = wrapWindowScroll(originalScroll);
    const scrollIntoView = function(this: Element, ...args: [options?: boolean | ScrollIntoViewOptions]) {
      if (typeof args[0] === "object" && args[0]?.behavior === "smooth") stopMomentum();
      Reflect.apply(originalScrollIntoView, this, args);
    };
    window.scrollTo = scrollTo;
    window.scrollBy = scrollBy;
    window.scroll = scroll;
    if (typeof originalScrollIntoView === "function") Element.prototype.scrollIntoView = scrollIntoView;

    const reconcile = () => {
      if (!finePointer.matches || motionDisabled(root, reducedMotion)
        || document.visibilityState === "hidden" || pageScrollLocked(root, body)) {
        destroy();
        return;
      }
      if (instance.current) return;
      instance.current = new Lenis({
        autoRaf: true,
        lerp: 0.15,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        overscroll: false,
        anchors: false,
        prevent: node => node.matches("textarea, select, [contenteditable]:not([contenteditable='false']), [data-native-scroll]"),
        virtualScroll: ({ event, deltaX, deltaY }) => !event.ctrlKey && !event.metaKey && !event.shiftKey
          && Math.abs(deltaY) >= Math.abs(deltaX),
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) stopMomentum();
    };
    const onClick = (event: MouseEvent) => {
      // Let the browser and Next.js retain anchor, focus, URL and history semantics.
      if (event.target instanceof Element && event.target.closest("a[href]")) stopMomentum();
    };
    const onNativeScroll = () => {
      const current = instance.current;
      // An external scrollTo/scrollIntoView or browser restoration takes priority over inertia.
      if (current?.isScrolling === "smooth" && Math.abs(window.scrollY - current.animatedScroll) > 2) stopMomentum();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "settings.reduceMotion" || event.key === null) reconcile();
    };

    const observer = new MutationObserver(reconcile);
    observer.observe(root, { attributes: true, attributeFilter: ["data-motion", "class", "style"] });
    observer.observe(body, { attributes: true, attributeFilter: ["class", "style"] });
    reducedMotion.addEventListener("change", reconcile);
    finePointer.addEventListener("change", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pointerdown", stopMomentum, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", stopMomentum);
    window.addEventListener("hashchange", stopMomentum);
    window.addEventListener("scroll", onNativeScroll, { passive: true });
    reconcile();

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", reconcile);
      finePointer.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pointerdown", stopMomentum, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", stopMomentum);
      window.removeEventListener("hashchange", stopMomentum);
      window.removeEventListener("scroll", onNativeScroll);
      if (window.scrollTo === scrollTo) window.scrollTo = originalScrollTo;
      if (window.scrollBy === scrollBy) window.scrollBy = originalScrollBy;
      if (window.scroll === scroll) window.scroll = originalScroll;
      if (Element.prototype.scrollIntoView === scrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView;
      destroy();
    };
  }, []);

  useEffect(() => {
    const current = instance.current;
    cancelMomentum(current);
    current?.resize();
  }, [pathname]);

  return null;
}
