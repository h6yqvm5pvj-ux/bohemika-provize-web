// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMailboxRefresh } from "./useMailboxRefresh";

function Harness({ enabled = true, refresh }: { enabled?: boolean; refresh: () => Promise<unknown> }) { useMailboxRefresh(enabled, refresh); return null; }
describe("mail refresh schedule", () => {
  let root: Root;
  let visible: boolean;
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    visible = true;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("suspends background polling and combines visibility/focus into one refresh on return", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(<Harness refresh={refresh} />));
    expect(refresh).toHaveBeenCalledOnce();
    visible = false; document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(600_000));
    expect(refresh).toHaveBeenCalledOnce();
    visible = true;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });
  it("shares a pending request and removes all triggers on logout", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    await act(async () => root.render(<Harness refresh={refresh} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(240_000); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => finish());
    await act(async () => root.render(<Harness enabled={false} refresh={refresh} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(240_000); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("waits to load an initially hidden tab and recovers after request errors", async () => {
    visible = false;
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    await act(async () => root.render(<Harness refresh={refresh} />));
    expect(refresh).not.toHaveBeenCalled();
    visible = true; await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
