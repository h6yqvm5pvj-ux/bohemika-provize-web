import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { MailboxActivityResponse } from "./postaTypes";

export type MailboxActivity = {
  lastActiveAtMs: number | null;
  typing: boolean;
  checkedAtMs: number;
};

/** Poll only while the conversation is visible; disposal also cancels its read. */
export function subscribeMailboxActivity({
  user, recipientEmail, onActivity, onError,
}: {
  user: User;
  recipientEmail: string;
  onActivity: (activity: MailboxActivity) => void;
  onError: () => void;
}): () => void {
  let stopped = false;
  let intervalId: number | null = null;
  let request: AbortController | null = null;

  const pause = () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
    request?.abort();
    request = null;
  };

  const load = async () => {
    if (stopped || document.visibilityState !== "visible" || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxActivityResponse>(
        user,
        `/api/mailbox/activity?email=${encodeURIComponent(recipientEmail)}`,
        { method: "GET", signal: controller.signal }
      );
      if (stopped || controller.signal.aborted || document.visibilityState !== "visible") return;
      onActivity({
        lastActiveAtMs:
          typeof payload.lastActiveAtMs === "number" && Number.isFinite(payload.lastActiveAtMs)
            ? payload.lastActiveAtMs
            : null,
        typing: payload.typing === true,
        checkedAtMs:
          typeof payload.serverNowMs === "number" && Number.isFinite(payload.serverNowMs)
            ? payload.serverNowMs
            : Date.now(),
      });
    } catch {
      if (!stopped && !controller.signal.aborted && document.visibilityState === "visible") onError();
    } finally {
      // An older aborted read must not unlock a newer read after returning to the tab.
      if (request === controller) request = null;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      pause();
      return;
    }
    if (stopped || intervalId !== null) return;
    void load();
    intervalId = window.setInterval(() => void load(), 4_000);
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  onVisibilityChange();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    pause();
  };
}
