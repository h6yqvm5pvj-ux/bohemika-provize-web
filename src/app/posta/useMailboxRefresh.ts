import { useEffect } from "react";

/** One polling/focus schedule, suspended while the tab is hidden. */
export function useMailboxRefresh(enabled: boolean, refresh: () => Promise<unknown>, intervalMs = 120_000) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    let lastStarted = -Infinity;
    let wasHidden = document.visibilityState === "hidden";
    const run = () => {
      if (disposed || document.visibilityState === "hidden" || inFlight || Date.now() - lastStarted < 1000) return;
      inFlight = true;
      lastStarted = Date.now();
      void refresh().catch(() => undefined).finally(() => { inFlight = false; });
    };
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      if (wasHidden && !hidden) run();
      wasHidden = hidden;
    };
    run();
    const timer = window.setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, refresh]);
}
