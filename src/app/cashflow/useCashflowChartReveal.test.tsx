// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCashflowChartReveal } from "./useCashflowChartReveal";

class MotionPreference extends EventTarget {
  readonly media = "(prefers-reduced-motion: reduce)";
  matches = false;
}

type ObservedChart = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function Chart({ label = "Syntetický měsíc" }: { label?: string }) {
  const ref = useCashflowChartReveal();
  return <div ref={ref} data-fixture-chart="">
    <span data-curve-reveal-mask="" />
    <button type="button">{label}</button>
  </div>;
}

describe("cashflow curve viewport reveal", () => {
  let root: Root;
  let container: HTMLDivElement;
  let preference: MotionPreference;
  let observers: ObservedChart[];
  let hidden: boolean;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    preference = new MotionPreference();
    vi.spyOn(window, "matchMedia").mockReturnValue(preference as unknown as MediaQueryList);
    hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    observers = [];
    vi.stubGlobal("IntersectionObserver", class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({ callback, options, observe: this.observe, disconnect: this.disconnect });
      }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-motion");
    window.localStorage.removeItem("settings.reduceMotion");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const chart = () => container.querySelector<HTMLDivElement>("[data-fixture-chart]")!;
  const render = async (label?: string) => {
    await act(async () => root.render(<Chart label={label} />));
  };
  const intersect = async (intersectionRatio: number, isIntersecting = intersectionRatio > 0) => {
    const observer = observers.at(-1)!;
    expect(observer).toBeDefined();
    await act(async () => observer.callback([
      { target: chart(), isIntersecting, intersectionRatio } as unknown as IntersectionObserverEntry,
    ], {} as IntersectionObserver));
  };
  const finish = async () => {
    await act(async () => chart().querySelector("[data-curve-reveal-mask]")!
      .dispatchEvent(new Event("animationend", { bubbles: true })));
  };
  const visibility = async (nextHidden: boolean) => {
    hidden = nextHidden;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  };
  const reduction = async (source: "system" | "application" | "stored", enabled: boolean) => {
    await act(async () => {
      if (source === "system") {
        preference.matches = enabled;
        preference.dispatchEvent(new Event("change"));
      } else if (source === "application") {
        if (enabled) document.documentElement.dataset.motion = "off";
        else document.documentElement.removeAttribute("data-motion");
      } else {
        if (enabled) window.localStorage.setItem("settings.reduceMotion", "1");
        else window.localStorage.removeItem("settings.reduceMotion");
        window.dispatchEvent(new StorageEvent("storage", { key: "settings.reduceMotion", newValue: enabled ? "1" : null }));
      }
      // happy-dom delivers MutationObserver notifications on the next task.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };

  it("server-renders a readable static chart without waiting for an animation", () => {
    const markup = renderToString(<Chart />);
    expect(markup).not.toContain("data-curve-reveal=");
    expect(markup).not.toContain("data-curve-paused");
    expect(markup).toContain("Syntetický měsíc");
  });

  it("keeps the static graph available when intersection observation is unsupported", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await render();
    expect(chart().dataset.curveReveal).toBeUndefined();
    expect(chart().querySelector("button")?.disabled).toBe(false);
  });

  it("waits until at least forty percent of the plotted graph is in view", async () => {
    await render();
    expect(chart().dataset.curveReveal).toBe("waiting");
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(chart());
    await intersect(0);
    await intersect(.39);
    expect(chart().dataset.curveReveal).toBe("waiting");
    await intersect(.8, false);
    expect(chart().dataset.curveReveal).toBe("waiting");
    await intersect(.4);
    expect(chart().dataset.curveReveal).toBe("running");
  });

  it("completes only on the reveal mask and does not restart after rerendering or scrolling back", async () => {
    await render();
    await intersect(.8);
    await act(async () => chart().querySelector("button")!.dispatchEvent(new Event("animationend", { bubbles: true })));
    expect(chart().dataset.curveReveal).toBe("running");
    await finish();
    expect(chart().dataset.curveReveal).toBe("complete");
    await render("Aktualizovaný syntetický měsíc");
    await intersect(0);
    await intersect(1);
    expect(chart().dataset.curveReveal).toBe("complete");
    expect(observers).toHaveLength(1);
    expect(chart().textContent).toContain("Aktualizovaný syntetický měsíc");
  });

  it("defers the first draw in a background tab and pauses a running draw while hidden", async () => {
    hidden = true;
    await render();
    await intersect(.7);
    expect(chart().dataset.curveReveal).toBe("waiting");
    await visibility(false);
    expect(chart().dataset.curveReveal).toBe("running");
    await visibility(true);
    expect(chart().dataset.curvePaused).toBe("true");
    await visibility(false);
    expect(chart().dataset.curvePaused).not.toBe("true");
    expect(chart().dataset.curveReveal).toBe("running");
  });

  it.each(["system", "application", "stored"] as const)("immediately exposes the graph for an initial %s motion reduction and never replays it", async source => {
    await reduction(source, true);
    await render();
    expect(chart().dataset.curveReveal).toBe("complete");
    await reduction(source, false);
    if (observers.length) await intersect(1);
    expect(chart().dataset.curveReveal).toBe("complete");
  });

  it.each(["system", "application", "stored"] as const)("finishes a running draw when %s reduced motion is enabled", async source => {
    await render();
    await intersect(1);
    expect(chart().dataset.curveReveal).toBe("running");
    await reduction(source, true);
    expect(chart().dataset.curveReveal).toBe("complete");
    expect(chart().dataset.curvePaused).not.toBe("true");
    await reduction(source, false);
    await intersect(1);
    expect(chart().dataset.curveReveal).toBe("complete");
  });

  it("disconnects observation and removes animation state when unmounted", async () => {
    await render();
    await intersect(.8);
    await visibility(true);
    const element = chart();
    await act(async () => root.render(null));
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(element.dataset.curveReveal).toBeUndefined();
    expect(element.dataset.curvePaused).toBeUndefined();
    await reduction("system", true);
    await visibility(false);
    expect(element.dataset.curveReveal).toBeUndefined();
  });
});
