"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mount once near the viewport; keep the height stable before loading. */
export function DeferredHomeWidget({ children, placeholder }: { children: ReactNode; placeholder: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    let active = true;
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => { if (active) setVisible(true); });
      return () => { active = false; };
    }
    const observer = new IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "240px 0px" });
    if (container.current) observer.observe(container.current);
    return () => { active = false; observer.disconnect(); };
  }, [visible]);
  return <div ref={container} style={{ minHeight: 260, minWidth: 0, height: "100%", display: "grid" }}>{visible ? children : placeholder}</div>;
}
