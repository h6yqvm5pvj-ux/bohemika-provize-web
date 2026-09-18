import type { User } from "firebase/auth";

/** Pause the connection while hidden and ignore unchanged reconnect snapshots. */
export function subscribeMailboxStream(user: User, onChange: () => Promise<unknown>): () => void {
  let stopped = false;
  let abortController: AbortController | null = null;
  let reconnectTimer: number | null = null;
  let refreshTimer: number | null = null;
  let retryDelay = 1500;
  let lastRevision: string | null = null;

  const scheduleRefresh = () => {
    if (document.visibilityState === "hidden") return;
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (document.visibilityState !== "hidden") void onChange();
    }, 120);
  };

  const isMailboxTabHidden = () => document.visibilityState === "hidden";
  const connect = async () => {
    if (stopped || document.visibilityState === "hidden" || abortController) return;
    const controller = new AbortController();
    abortController = controller;
    try {
      const request = async (forceRefresh: boolean) => {
        const token = await user.getIdToken(forceRefresh);
        return fetch("/api/mailbox/stream", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
      };
      let response = await request(false);
      if (response.status === 401) response = await request(true);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped && !controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        events.forEach((event) => {
          if (event.split("\n").some((line) => line.trim() === "event: mailbox")) {
            retryDelay = 1500;
            const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
            let revision: string | null = null;
            try { revision = JSON.parse(dataLine?.slice(5) || "{}").revision ?? null; } catch { /* Older streams still trigger a refresh. */ }
            if (!revision || revision !== lastRevision) scheduleRefresh();
            lastRevision = revision;
          }
        });
      }
    } catch (streamError) {
      if (!stopped && !(streamError instanceof DOMException && streamError.name === "AbortError")) {
        console.warn("Realtime pošty se znovu připojí:", streamError);
      }
    } finally {
      if (abortController === controller) abortController = null;
      if (!stopped && !isMailboxTabHidden()) {
        reconnectTimer = window.setTimeout(() => void connect(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    }
  };

  const onVisibility = () => {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    if (document.visibilityState === "hidden") abortController?.abort();
    else void connect();
  };
  document.addEventListener("visibilitychange", onVisibility);
  void connect();
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    stopped = true;
    abortController?.abort();
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  };
}
