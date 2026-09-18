// @vitest-environment happy-dom
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeMailboxStream } from "./mailboxStream";

describe("mail realtime connection", () => {
  let visible: boolean;
  let cleanup: (() => void) | undefined;
  let connections: { controller: ReadableStreamDefaultController<Uint8Array>; signal: AbortSignal }[];
  const fetchMock = vi.fn();
  const user = { getIdToken: vi.fn().mockResolvedValue("token") } as unknown as User;
  const event = (revision?: string) => connections.at(-1)!.controller.enqueue(new TextEncoder().encode(`event: mailbox\ndata: ${JSON.stringify({ revision })}\n\n`));
  beforeEach(() => {
    vi.useFakeTimers(); visible = true; connections = []; fetchMock.mockReset();
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({ start(controller) { connections.push({ controller, signal }); signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError"))); } });
      return new Response(body);
    });
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("aborts a hidden tab, reconnects once, and removes triggers on disposal", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    cleanup = subscribeMailboxStream(user, refresh);
    await vi.advanceTimersByTimeAsync(0);
    visible = false; document.dispatchEvent(new Event("visibilitychange"));
    expect(connections[0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    visible = true; document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    cleanup(); await vi.advanceTimersByTimeAsync(120_000);
    expect(connections[1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("coalesces bursts and skips unchanged snapshots after a normal reconnect", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    cleanup = subscribeMailboxStream(user, refresh);
    await vi.advanceTimersByTimeAsync(0);
    event("first"); event("second"); event("third");
    await vi.advanceTimersByTimeAsync(120);
    expect(refresh).toHaveBeenCalledOnce();
    connections[0].controller.close(); await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    event("third"); await vi.advanceTimersByTimeAsync(120);
    expect(refresh).toHaveBeenCalledOnce();
    event("changed"); await vi.advanceTimersByTimeAsync(120);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("does not fetch an initially hidden tab and supports older servers without revisions", async () => {
    visible = false;
    const refresh = vi.fn().mockResolvedValue(undefined);
    cleanup = subscribeMailboxStream(user, refresh);
    await vi.advanceTimersByTimeAsync(5000); expect(fetchMock).not.toHaveBeenCalled();
    visible = true; document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0);
    event(); await vi.advanceTimersByTimeAsync(120);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("backs off failures and cancels retries while hidden", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanup = subscribeMailboxStream(user, vi.fn());
    await vi.advanceTimersByTimeAsync(1500); expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2999); expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(fetchMock).toHaveBeenCalledTimes(3);
    visible = false; document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
