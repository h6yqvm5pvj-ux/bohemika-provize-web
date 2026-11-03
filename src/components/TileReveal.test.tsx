// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TileReveal from "./TileReveal";

vi.mock("next/image", () => ({ default: () => null }));

const images = Array.from({ length: 9 }, (_, index) => `/images/tile-${index}.webp`);

describe("decorative tile reveal enhancement", () => {
  let root: Root;
  let container: HTMLDivElement;
  let media: MediaQueryList;
  let shortScreen: MediaQueryList;
  let intersection: IntersectionObserverCallback;
  let top: number;

  const content = <TileReveal images={images} headline={<h2>Pro vaše plány</h2>}><button>Kontakt</button></TileReveal>;
  const region = () => container.querySelector<HTMLElement>("[data-tile-reveal]")!;
  const stage = () => container.querySelector<HTMLElement>("[data-tile-stage]")!;
  const advance = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(16); }); };
  const show = async (visible: boolean) => {
    await act(async () => intersection([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver));
    await advance();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const events = new EventTarget();
    media = Object.assign(events, { matches: false }) as unknown as MediaQueryList;
    shortScreen = Object.assign(new EventTarget(), { matches: false }) as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockImplementation(query => query.includes("max-height") ? shortScreen : media);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersection = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => window.setTimeout(() => callback(performance.now()), 16));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => window.clearTimeout(id));
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    top = 90;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const render = async () => {
    await act(async () => root.render(content));
    vi.spyOn(region(), "getBoundingClientRect").mockImplementation(() => ({ top, height: 2_400 }) as DOMRect);
    Object.defineProperty(stage(), "offsetHeight", { value: 810, configurable: true });
    Object.defineProperty(stage(), "offsetWidth", { value: 1_440, configurable: true });
    stage().style.top = "90px";
  };

  it("renders readable text and an action without activating a scroll spacer in server HTML", () => {
    const html = renderToString(content);
    expect(html).toContain("Pro vaše plány");
    expect(html).toContain("Kontakt");
    expect(html).not.toContain("data-animated");
    expect(html).not.toContain('aria-hidden="true"><h2');
  });

  it("updates the decorative tiles only while visible, and leaves native scrolling alone", async () => {
    await render();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    await show(true);
    expect(region().dataset.progress).toBe("0.000");
    const tile = container.querySelector<HTMLElement>("[data-tile-stage] > div:nth-child(2) > div")!;
    const initialTransform = tile.style.transform;
    top = 90 - 795;
    window.dispatchEvent(new Event("scroll"));
    await advance();
    expect(region().dataset.progress).toBe("0.500");
    expect(tile.style.transform).not.toBe(initialTransform);
    const wheel = new WheelEvent("wheel", { deltaY: 500, bubbles: true, cancelable: true });
    container.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    await show(false);
    vi.mocked(window.requestAnimationFrame).mockClear();
    window.dispatchEvent(new Event("scroll"));
    await advance();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it.each(["system", "application", "stored"])("keeps the compact layout for the %s reduced-motion preference", async preference => {
    if (preference === "system") Object.defineProperty(media, "matches", { value: true });
    if (preference === "application") document.documentElement.dataset.motion = "off";
    if (preference === "stored") window.localStorage.setItem("settings.reduceMotion", "1");
    await render();
    await show(true);
    expect(region().dataset.animated).toBeUndefined();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector("h2")?.textContent).toBe("Pro vaše plány");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("removes transforms when reduced motion is enabled during scrolling", async () => {
    await render();
    await show(true);
    expect(region().dataset.animated).toBe("true");
    await act(async () => { document.documentElement.dataset.motion = "off"; });
    expect(region().dataset.animated).toBeUndefined();
    expect(region().dataset.progress).toBeUndefined();
    expect(Array.from(container.querySelectorAll<HTMLElement>("[data-tile-stage] > div:nth-child(2) > div")).every(tile => !tile.style.transform)).toBe(true);
  });

  it("keeps short screens compact so the full headline and action can scroll naturally", async () => {
    Object.defineProperty(shortScreen, "matches", { value: true });
    await render();
    await show(true);
    expect(region().dataset.animated).toBeUndefined();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("cancels scheduled animation work when the component unmounts", async () => {
    await render();
    await show(true);
    window.dispatchEvent(new Event("scroll"));
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(window.requestAnimationFrame).mockClear();
    window.dispatchEvent(new Event("scroll"));
    await advance();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
