import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard navigation inside the directory while it is open. */
export function useDirectoryDialog(panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )).filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); panel.focus(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || active === panel || !panel.contains(active))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [panelRef]);
}
