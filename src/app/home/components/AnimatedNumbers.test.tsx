// @vitest-environment happy-dom
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedMoney, AnimatedNumber, useAnimatedNumber } from "./AnimatedNumbers";

describe("home animated numbers", () => {
  let root: Root;
  let element: HTMLDivElement;
  let hidden: boolean;
  let motion: MediaQueryList;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;
  let preferences: Set<MutationCallback>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    hidden = false;
    nextFrame = 0;
    frames = new Map();
    preferences = new Set();
    motion = Object.assign(new EventTarget(), { matches: false, media: "(prefers-reduced-motion: reduce)" }) as MediaQueryList;
    vi.stubGlobal("matchMedia", () => motion);
    vi.stubGlobal("MutationObserver", class {
      constructor(private callback: MutationCallback) {}
      observe() { preferences.add(this.callback); }
      disconnect() { preferences.delete(this.callback); }
    });
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    localStorage.clear();
    delete document.documentElement.dataset.motion;
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    localStorage.clear();
    delete document.documentElement.dataset.motion;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function frame(timestamp: number) {
    await act(async () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(timestamp));
    });
  }

  async function reduce(source: "root" | "system" | "storage" | "hidden") {
    await act(async () => {
      if (source === "root") {
        document.documentElement.dataset.motion = "off";
        [...preferences].forEach(callback => callback([], {} as MutationObserver));
      } else if (source === "system") {
        Object.assign(motion, { matches: true });
        motion.dispatchEvent(new Event("change"));
      } else if (source === "storage") {
        localStorage.setItem("settings.reduceMotion", "1");
        window.dispatchEvent(new StorageEvent("storage", { key: "settings.reduceMotion" }));
      } else {
        hidden = true;
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });
  }

  it("updates the displayed text without a React commit per animation frame", async () => {
    const commits = vi.fn();
    await act(async () => root.render(<Profiler id="numbers" onRender={commits}><AnimatedMoney value={1200} /></Profiler>));
    expect(element.textContent).toBe("0 Kč");
    expect(commits).toHaveBeenCalledOnce();
    await frame(0);
    await frame(400);
    expect(element.textContent).toBe("1.050 Kč");
    await frame(800);
    expect(element.textContent).toBe("1.200 Kč");
    expect(commits).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(preferences.size).toBe(0);
  });

  it.each(["root", "system", "storage", "hidden"] as const)("shows the final value immediately when %s already disables motion", async source => {
    await reduce(source);
    await act(async () => root.render(<AnimatedNumber value={1234} />));
    expect(element.textContent).toBe(new Intl.NumberFormat("cs-CZ").format(1234));
    expect(frames.size).toBe(0);
  });

  it.each(["root", "system", "storage", "hidden"] as const)("settles and cancels an active animation when %s disables motion", async source => {
    await act(async () => root.render(<AnimatedMoney value={1200} />));
    await frame(0);
    await frame(200);
    expect(frames.size).toBe(1);
    await reduce(source);
    expect(element.textContent).toBe("1.200 Kč");
    expect(frames.size).toBe(0);
    expect(preferences.size).toBe(0);
    if (source === "hidden") {
      await act(async () => {
        hidden = false;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(frames.size).toBe(0);
    }
  });

  it("supports the lite mode and a separately styled currency without scheduling frames", async () => {
    await act(async () => root.render(<AnimatedMoney value={-1234.5} animate={false} currencyClassName="currency" />));
    expect(element.textContent).toBe("-1.234 Kč");
    expect(element.querySelector(".currency")?.textContent).toBe("Kč");
    expect(frames.size).toBe(0);
    await act(async () => root.render(<AnimatedMoney value={2345} animate={false} currencyClassName="currency" />));
    expect(element.textContent).toBe("2.345 Kč");
  });

  it("retargets from the displayed value and rejects late callbacks from a cancelled animation", async () => {
    await act(async () => root.render(<AnimatedMoney value={1200} />));
    await frame(0);
    await frame(400);
    expect(element.textContent).toBe("1.050 Kč");
    const stale = [...frames.values()][0];
    await act(async () => root.render(<AnimatedMoney value={2000} />));
    await act(async () => stale(800));
    expect(element.textContent).toBe("1.050 Kč");
    expect(frames.size).toBe(1);
    await frame(1000);
    expect(element.textContent).toBe("1.050 Kč");
    await frame(1800);
    expect(element.textContent).toBe("2.000 Kč");
  });

  it("preserves the displayed value across unrelated re-renders and currency style changes", async () => {
    await act(async () => root.render(<AnimatedMoney value={1200} currencyClassName="old" />));
    await frame(0);
    await frame(400);
    await act(async () => root.render(<AnimatedMoney value={1200} currencyClassName="new" />));
    expect(element.textContent).toBe("1.050 Kč");
    expect(element.querySelector(".new")?.textContent).toBe("Kč");
    await frame(800);
    expect(element.textContent).toBe("1.200 Kč");
  });

  it("cancels pending work on unmount", async () => {
    await act(async () => root.render(<AnimatedNumber value={100} />));
    const stale = [...frames.values()][0];
    await act(async () => root.unmount());
    expect(frames.size).toBe(0);
    expect(preferences.size).toBe(0);
    await act(async () => stale(800));
    expect(frames.size).toBe(0);
    root = createRoot(element);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("settles invalid or instant duration %s", async duration => {
    await act(async () => root.render(<AnimatedNumber value={42} duration={duration} />));
    expect(element.textContent).toBe("42");
    expect(frames.size).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("does not display or animate a non-finite target %s", async value => {
    await act(async () => root.render(<AnimatedMoney value={value} />));
    expect(element.textContent).toBe("0 Kč");
    expect(frames.size).toBe(0);
  });

  it("keeps the exported numeric hook compatible and respects motion preferences", async () => {
    function Hook({ value }: { value: number }) { return <output>{useAnimatedNumber(value)}</output>; }
    await act(async () => root.render(<Hook value={1200} />));
    await frame(0);
    await frame(400);
    expect(element.textContent).toBe("1050");
    await reduce("root");
    expect(element.textContent).toBe("1200");
    await act(async () => root.render(<Hook value={2000} />));
    expect(element.textContent).toBe("2000");
    expect(frames.size).toBe(0);
  });
});
