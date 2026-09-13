// @vitest-environment happy-dom

import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeMailboxActivity } from "./mailboxActivity";

describe("mailbox activity visibility", () => {
  const user = { getIdToken: vi.fn(async () => "test-token") } as unknown as User;
  const recipientEmail = "recipient+test@example.test";
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let visibility: DocumentVisibilityState;
  let stops: (() => void)[];
  const onActivity = vi.fn();
  const onError = vi.fn();
  const response = (typing = false) => Response.json({
    ok: true, lastActiveAtMs: 1000, typing, serverNowMs: 2000,
  });
  const start = (email = recipientEmail) => {
    const stop = subscribeMailboxActivity({ user, recipientEmail: email, onActivity, onError });
    stops.push(stop);
    return stop;
  };
  const changeVisibility = async (next: DocumentVisibilityState) => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    visibility = "visible";
    stops = [];
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    stops.forEach(stop => stop());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("refreshes immediately and every four seconds while visible", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/mailbox/activity?email=${encodeURIComponent(recipientEmail)}`);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
    expect(onActivity).toHaveBeenLastCalledWith({ lastActiveAtMs: 1000, typing: false, checkedAtMs: 2000 });
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not make even the initial request in a hidden tab, then resumes immediately", async () => {
    visibility = "hidden";
    start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await changeVisibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await changeVisibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await changeVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await changeVisibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not pile up requests on a slow connection", async () => {
    const slow = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(slow.promise);
    start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    slow.resolve(response());
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a hidden read and ignores its late result without unlocking the resumed read", async () => {
    const old = Promise.withResolvers<Response>();
    const fresh = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    start();
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = fetchMock.mock.calls[0][1]!.signal!;
    await changeVisibility("hidden");
    expect(oldSignal.aborted).toBe(true);
    await changeVisibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    old.resolve(response(true)); // Some response/body work can outlive cancellation.
    await vi.advanceTimersByTimeAsync(8000);
    expect(onActivity).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fresh.resolve(response(false));
    await vi.advanceTimersByTimeAsync(0);
    expect(onActivity).toHaveBeenCalledExactlyOnceWith({ lastActiveAtMs: 1000, typing: false, checkedAtMs: 2000 });
  });

  it("disposes timers and the visibility listener when leaving the conversation", async () => {
    const pending = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const stop = start();
    await vi.advanceTimersByTimeAsync(0);
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    stop();
    expect(signal.aborted).toBe(true);
    pending.reject(new DOMException("Aborted", "AbortError"));
    await changeVisibility("hidden");
    await changeVisibility("visible");
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onActivity).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not let a late response from the previous recipient replace current activity", async () => {
    const old = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    const stop = start();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    start("other@example.test");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.lastCall![0]).toBe("/api/mailbox/activity?email=other%40example.test");
    old.resolve(response(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity.mock.lastCall![0].typing).toBe(false);
  });

  it("keeps retrying visible reads after a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
