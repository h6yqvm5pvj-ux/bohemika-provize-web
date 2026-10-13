// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePullToRefresh } from "./MobilePullToRefresh";

describe("mobile page gestures", () => {
  let root: Root;
  let container: HTMLDivElement;
  let touchDevice: boolean;

  beforeEach(async () => {
    touchDevice = true;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: touchDevice } as MediaQueryList));
    vi.spyOn(window.location, "reload").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<MobilePullToRefresh />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const touch = async (type: string, positions: [number, number][]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: positions.map(([clientX, clientY]) => ({ clientX, clientY })) });
    await act(async () => container.dispatchEvent(event));
    return event;
  };

  it("cancels pinch at its start and while moving instead of changing page scale", async () => {
    expect((await touch("touchstart", [[100, 200], [250, 200]])).defaultPrevented).toBe(true);
    expect((await touch("touchmove", [[140, 200], [210, 200]])).defaultPrevented).toBe(true);
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["gesturestart", "gesturechange"])("cancels the Safari %s gesture on a touch device", async type => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    await act(async () => container.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves ordinary single-finger scrolling available", async () => {
    expect((await touch("touchstart", [[150, 250]])).defaultPrevented).toBe(false);
    expect((await touch("touchmove", [[150, 180]])).defaultPrevented).toBe(false);
  });

  it("still allows pull-to-refresh with one finger", async () => {
    vi.useFakeTimers();
    await touch("touchstart", [[150, 100]]);
    await touch("touchmove", [[150, 200]]);
    expect(container.textContent).toContain("Pusť pro obnovení");
    await touch("touchend", []);
    await act(async () => vi.advanceTimersByTimeAsync(220));
    expect(window.location.reload).toHaveBeenCalledOnce();
  });

  it("does not accidentally refresh when a second finger joins a pull gesture", async () => {
    vi.useFakeTimers();
    await touch("touchstart", [[150, 100]]);
    await touch("touchmove", [[150, 200]]);
    expect(container.textContent).toContain("Pusť pro obnovení");
    await touch("touchstart", [[150, 200], [250, 200]]);
    await touch("touchend", []);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves desktop gestures available and removes mobile handlers after unmount", async () => {
    touchDevice = false;
    const desktopGesture = new Event("gesturestart", { bubbles: true, cancelable: true });
    container.dispatchEvent(desktopGesture);
    expect(desktopGesture.defaultPrevented).toBe(false);
    touchDevice = true;
    await act(async () => root.render(null));
    expect((await touch("touchmove", [[100, 200], [250, 200]])).defaultPrevented).toBe(false);
    expect(document.documentElement.classList.contains("mobile-app-shell")).toBe(false);
  });
});
