// @vitest-environment happy-dom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Preloader from "./Preloader";

describe("opening preloader lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  let media: MediaQueryList;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const events = new EventTarget();
    media = Object.assign(events, { matches: false, media: "(prefers-reduced-motion: reduce)" }) as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "clip";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const overlay = () => container.querySelector("[data-preloader]");
  const advance = async (time: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(time); }); };

  it("keeps the server overlay inactive so content remains accessible without hydration", () => {
    const html = renderToString(<Preloader />);
    expect(html).toContain("data-preloader");
    expect(html).not.toContain('data-active="true"');
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("waits for real loading and the minimum display time, then completes once", async () => {
    const original = vi.fn();
    const latest = vi.fn();
    await act(async () => root.render(<Preloader loading onComplete={original} />));
    await advance(3_000);
    expect(overlay()).not.toBeNull();
    expect(original).not.toHaveBeenCalled();
    await act(async () => root.render(<Preloader loading={false} onComplete={latest} />));
    await advance(0);
    expect(overlay()).not.toBeNull();
    await advance(960);
    expect(overlay()).toBeNull();
    expect(latest).toHaveBeenCalledOnce();
    expect(original).not.toHaveBeenCalled();
    await act(async () => root.render(<Preloader loading onComplete={latest} />));
    await advance(3_000);
    expect(overlay()).toBeNull();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("preserves the minimum display interval and restores scrolling in Strict Mode", async () => {
    const done = vi.fn();
    await act(async () => root.render(<StrictMode><Preloader onComplete={done} /></StrictMode>));
    expect(overlay()?.getAttribute("data-active")).toBe("true");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    await advance(1_499);
    expect(done).not.toHaveBeenCalled();
    await advance(1);
    await advance(959);
    expect(overlay()).not.toBeNull();
    await advance(1);
    expect(overlay()).toBeNull();
    expect(done).toHaveBeenCalledOnce();
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("clip");
  });

  it.each(["system", "application", "stored"])("skips visual delays for the %s reduced-motion preference", async preference => {
    if (preference === "system") Object.defineProperty(media, "matches", { value: true });
    if (preference === "application") document.documentElement.dataset.motion = "off";
    if (preference === "stored") window.localStorage.setItem("settings.reduceMotion", "1");
    const done = vi.fn();
    await act(async () => root.render(<Preloader loading onComplete={done} />));
    await advance(2_000);
    expect(overlay()).not.toBeNull();
    await act(async () => root.render(<Preloader onComplete={done} />));
    await advance(0);
    expect(overlay()).toBeNull();
    expect(done).toHaveBeenCalledOnce();
  });

  it("honors a motion preference changed during the reveal", async () => {
    await act(async () => root.render(<Preloader />));
    await advance(1_500);
    await act(async () => {
      Object.defineProperty(media, "matches", { value: true });
      media.dispatchEvent(new Event("change"));
    });
    await advance(0);
    expect(overlay()).toBeNull();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("finishes a reveal even if background loading restarts", async () => {
    const done = vi.fn();
    await act(async () => root.render(<Preloader onComplete={done} />));
    await advance(1_500);
    await advance(600);
    await act(async () => root.render(<Preloader loading onComplete={done} />));
    await advance(360);
    expect(overlay()).toBeNull();
    expect(done).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("cancels timers and releases scrolling when navigation unmounts the overlay", async () => {
    const done = vi.fn();
    await act(async () => root.render(<Preloader onComplete={done} />));
    await act(async () => root.render(null));
    await advance(5_000);
    expect(done).not.toHaveBeenCalled();
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("clip");
  });

  it("keeps keyboard focus off covered controls and restores it after revealing", async () => {
    const button = document.createElement("button");
    button.textContent = "Kontakt";
    document.body.append(button);
    button.focus();
    await act(async () => root.render(<Preloader />));
    expect(document.activeElement).toBe(overlay());
    button.focus();
    expect(document.activeElement).toBe(overlay());
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    await advance(1_500);
    await advance(960);
    expect(document.activeElement).toBe(button);
    const freeTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(freeTab);
    expect(freeTab.defaultPrevented).toBe(false);
    button.remove();
  });
});
