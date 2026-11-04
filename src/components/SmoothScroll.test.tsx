// @vitest-environment happy-dom
import type { LenisOptions, ScrollToOptions } from "lenis";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from "vitest";
import { SmoothScroll } from "./SmoothScroll";

type LenisDouble = {
  options: LenisOptions;
  animatedScroll: number;
  isScrolling: false | "native" | "smooth";
  isStopped: boolean;
  destroy: Mock;
  resize: Mock;
  stop: Mock;
  start: Mock;
  raf: Mock<(time: number) => void>;
  on: Mock<(event: "virtual-scroll", callback: () => void) => () => void>;
  virtualScrollListeners: Set<() => void>;
  emitVirtualScroll: () => void;
  scrollTo: Mock<(position: number, options?: ScrollToOptions) => void>;
};

const state = vi.hoisted(() => ({
  instances: [] as LenisDouble[],
  construct: vi.fn(),
  pathname: "/cashflow",
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("lenis", () => ({
  default: class implements LenisDouble {
    options: LenisOptions;
    animatedScroll = window.scrollY;
    isScrolling: LenisDouble["isScrolling"] = false;
    isStopped = false;
    destroy = vi.fn();
    resize = vi.fn();
    stop = vi.fn(() => {
      this.isScrolling = false;
      this.animatedScroll = window.scrollY;
      this.isStopped = true;
    });
    start = vi.fn(() => {
      this.isScrolling = false;
      this.animatedScroll = window.scrollY;
      this.isStopped = false;
    });
    raf = vi.fn((_time: number) => { void _time; });
    virtualScrollListeners = new Set<() => void>();
    on = vi.fn((_event: "virtual-scroll", callback: () => void) => {
      this.virtualScrollListeners.add(callback);
      return () => { this.virtualScrollListeners.delete(callback); };
    });
    emitVirtualScroll = () => this.virtualScrollListeners.forEach(callback => callback());
    scrollTo = vi.fn((position: number, _options?: ScrollToOptions) => {
      void _options;
      this.animatedScroll = position;
      this.isScrolling = false;
    });

    constructor(options: LenisOptions) {
      this.options = options;
      state.construct(options);
      state.instances.push(this);
    }
  },
}));

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(pointer: fine)";
const MOTION_STORAGE = "settings.reduceMotion";

class MediaQueryDouble extends EventTarget {
  constructor(readonly media: string, public matches: boolean) { super(); }

  change(matches: boolean) {
    this.matches = matches;
    const event = new Event("change");
    Object.defineProperties(event, { matches: { value: matches }, media: { value: this.media } });
    this.dispatchEvent(event);
  }
}

describe("document smooth scrolling", () => {
  let root: Root;
  let container: HTMLDivElement;
  let scrollY: number;
  let media: Map<string, MediaQueryDouble>;
  let nativeScrollTo: MockInstance<Window["scrollTo"]>;
  let nativeScrollBy: MockInstance<Window["scrollBy"]>;
  let nativeScroll: MockInstance<Window["scroll"]>;
  let nativeScrollIntoView: MockInstance<Element["scrollIntoView"]>;
  let nativeWindowDescriptors: Record<"scrollTo" | "scrollBy" | "scroll", PropertyDescriptor>;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  const render = async () => { await act(async () => root.render(<SmoothScroll />)); };
  const nativeEvent = async (event: Event, target: EventTarget = window) => {
    await act(async () => { target.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  };
  const mutate = async (action: () => void) => {
    await act(async () => {
      action();
      // MutationObserver callbacks in happy-dom are delivered on the next task.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };
  const current = () => state.instances.at(-1)!;
  const runFrame = (time: number) => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(time));
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.instances.length = 0;
    state.construct.mockClear();
    state.pathname = "/cashflow";
    frames = new Map();
    nextFrameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    scrollY = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
    nativeWindowDescriptors = {
      scrollTo: Object.getOwnPropertyDescriptor(window, "scrollTo")!,
      scrollBy: Object.getOwnPropertyDescriptor(window, "scrollBy")!,
      scroll: Object.getOwnPropertyDescriptor(window, "scroll")!,
    };
    // Vitest's global accessors ignore replacement assignments after spying; real Window methods are writable.
    for (const method of ["scrollTo", "scrollBy", "scroll"] as const) {
      Object.defineProperty(window, method, { configurable: true, writable: true, value: window[method] });
    }
    nativeScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    nativeScrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    nativeScroll = vi.spyOn(window, "scroll").mockImplementation(() => {});
    nativeScrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    media = new Map([
      [REDUCED_MOTION, new MediaQueryDouble(REDUCED_MOTION, false)],
      [FINE_POINTER, new MediaQueryDouble(FINE_POINTER, true)],
    ]);
    vi.spyOn(window, "matchMedia").mockImplementation(query => {
      if (!media.has(query)) media.set(query, new MediaQueryDouble(query, false));
      return media.get(query)! as unknown as MediaQueryList;
    });
    localStorage.removeItem(MOTION_STORAGE);
    document.documentElement.removeAttribute("data-motion");
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    // Let browser-generated hashchange from the anchor scenario finish before a new mount.
    await new Promise(resolve => setTimeout(resolve, 0));
    container.remove();
    document.documentElement.removeAttribute("data-motion");
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    localStorage.removeItem(MOTION_STORAGE);
    vi.restoreAllMocks();
    for (const method of ["scrollTo", "scrollBy", "scroll"] as const) {
      Object.defineProperty(window, method, nativeWindowDescriptors[method]);
    }
    vi.unstubAllGlobals();
  });

  it("starts one desktop controller without adding markup and cleans up every subscription", async () => {
    scrollY = 180;
    await render();
    expect(state.construct).toHaveBeenCalledOnce();
    expect(container.innerHTML).toBe("");
    const first = current();
    expect(first.animatedScroll).toBe(180);
    expect(first.scrollTo).not.toHaveBeenCalled();
    expect(nativeScrollTo).not.toHaveBeenCalled();
    expect(first.options).toMatchObject({
      autoRaf: false, smoothWheel: true, syncTouch: false, allowNestedScroll: true,
      overscroll: false, anchors: false,
    });
    expect(first.options.lerp).toBeGreaterThan(0);
    expect(first.options.lerp).toBeLessThan(1);

    for (const selector of ["textarea", "select", '[contenteditable="true"]', "[data-native-scroll]"]) {
      const element = document.createElement(selector === "textarea" || selector === "select" ? selector : "div");
      if (selector.includes("contenteditable")) element.setAttribute("contenteditable", "true");
      if (selector.includes("data-native-scroll")) element.setAttribute("data-native-scroll", "");
      expect(first.options.prevent?.(element)).toBe(true);
    }
    const plain = document.createElement("div");
    plain.setAttribute("contenteditable", "false");
    expect(first.options.prevent?.(plain)).toBe(false);
    const filter = first.options.virtualScroll;
    expect(typeof filter).toBe("function");
    if (typeof filter !== "function") throw new Error("Wheel input filter missing");
    expect(filter({ deltaX: 0, deltaY: 60, event: new WheelEvent("wheel") })).toBe(true);
    for (const modifier of ["ctrlKey", "metaKey", "shiftKey"]) {
      // happy-dom's WheelEvent constructor omits modifier-key properties.
      const event = new WheelEvent("wheel");
      Object.defineProperty(event, modifier, { value: true });
      expect(filter({ deltaX: 0, deltaY: 60, event })).toBe(false);
    }
    expect(filter({ deltaX: 80, deltaY: 20, event: new WheelEvent("wheel") })).toBe(false);

    await render();
    await mutate(() => document.documentElement.classList.add("synthetic-theme"));
    expect(state.construct).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(window.scrollTo).toBe(nativeScrollTo);
    expect(window.scrollBy).toBe(nativeScrollBy);
    expect(window.scroll).toBe(nativeScroll);
    expect(Element.prototype.scrollIntoView).toBe(nativeScrollIntoView);
    first.scrollTo.mockClear();
    first.isScrolling = "smooth";
    await nativeEvent(new Event("pointerdown", { cancelable: true }));
    await act(async () => { media.get(FINE_POINTER)!.change(false); media.get(FINE_POINTER)!.change(true); });
    await mutate(() => document.documentElement.dataset.motion = "off");
    expect(first.scrollTo).not.toHaveBeenCalled();
    expect(first.stop).not.toHaveBeenCalled();
    expect(first.start).not.toHaveBeenCalled();
    expect(state.construct).toHaveBeenCalledOnce();
    document.documentElement.classList.remove("synthetic-theme");
  });

  it("keeps idle pages free of animation frames and runs only until wheel inertia ends", async () => {
    await render();
    const controller = current();
    expect(frames.size).toBe(0);
    expect(controller.raf).not.toHaveBeenCalled();

    vi.spyOn(performance, "now").mockReturnValue(1_000);
    controller.emitVirtualScroll();
    controller.isScrolling = "smooth";
    controller.emitVirtualScroll();
    expect(controller.raf).toHaveBeenCalledExactlyOnceWith(1_000);
    expect(frames.size).toBe(1);

    runFrame(1_016);
    expect(controller.raf).toHaveBeenLastCalledWith(1_016);
    expect(frames.size).toBe(1);
    controller.raf.mockImplementationOnce(() => { controller.isScrolling = false; });
    runFrame(1_032);
    expect(frames.size).toBe(0);

    // Native nested scrolling can emit virtual input without starting inertia.
    controller.emitVirtualScroll();
    const calls = controller.raf.mock.calls.length;
    runFrame(1_048);
    expect(controller.raf).toHaveBeenCalledTimes(calls);
    expect(frames.size).toBe(0);

    vi.mocked(performance.now).mockReturnValue(100_000);
    controller.emitVirtualScroll();
    controller.isScrolling = "smooth";
    expect(controller.raf).toHaveBeenLastCalledWith(100_000);
    runFrame(100_016);
    expect(controller.raf).toHaveBeenLastCalledWith(100_016);

    await act(async () => root.render(null));
    expect(controller.virtualScrollListeners.size).toBe(0);
    controller.emitVirtualScroll();
    expect(frames.size).toBe(0);
  });

  it.each(["pointer", "navigation", "hidden", "unmount"] as const)("cancels pending frames on %s", async reason => {
    await render();
    const controller = current();
    controller.emitVirtualScroll();
    controller.isScrolling = "smooth";
    expect(frames.size).toBe(1);
    const calls = controller.raf.mock.calls.length;

    if (reason === "pointer") await nativeEvent(new Event("pointerdown"));
    if (reason === "navigation") { state.pathname = "/smlouvy"; await render(); }
    if (reason === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await nativeEvent(new Event("visibilitychange"), document);
    }
    if (reason === "unmount") await act(async () => root.render(null));
    expect(frames.size).toBe(0);
    runFrame(1_000);
    expect(controller.raf).toHaveBeenCalledTimes(calls);
  });

  it.each(["system", "document", "storage", "coarse"] as const)("keeps %s motion preferences native and responds when they change", async preference => {
    const setDisabled = (disabled: boolean) => {
      if (preference === "system") media.get(REDUCED_MOTION)!.change(disabled);
      if (preference === "coarse") media.get(FINE_POINTER)!.change(!disabled);
      if (preference === "document") document.documentElement.dataset.motion = disabled ? "off" : "on";
      if (preference === "storage") {
        localStorage.setItem(MOTION_STORAGE, disabled ? "1" : "0");
        window.dispatchEvent(new StorageEvent("storage", { key: MOTION_STORAGE }));
      }
    };
    setDisabled(true);
    await render();
    expect(state.construct).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(window.scrollTo).toBe(nativeScrollTo);
    expect(window.scrollBy).toBe(nativeScrollBy);
    expect(window.scroll).toBe(nativeScroll);
    expect(Element.prototype.scrollIntoView).toBe(nativeScrollIntoView);
    await render();
    expect(state.construct).not.toHaveBeenCalled();
    await mutate(() => setDisabled(false));
    expect(state.construct).toHaveBeenCalledOnce();
    const first = current();
    await mutate(() => setDisabled(true));
    expect(first.destroy).toHaveBeenCalledOnce();
    scrollY = 420;
    await mutate(() => setDisabled(false));
    expect(state.instances).toHaveLength(2);
    expect(current().animatedScroll).toBe(420);
    expect(container.innerHTML).toBe("");
  });

  it("releases document locks to native scrolling and resumes at the latest browser position", async () => {
    await render();
    const locks = [
      // happy-dom does not expand overflow shorthand into computed overflowY.
      { element: document.body, property: "overflowY", value: "hidden" },
      { element: document.body, property: "position", value: "fixed" },
      { element: document.documentElement, property: "overflowY", value: "clip" },
    ] as const;
    for (const [index, lock] of locks.entries()) {
      const previous = current();
      await mutate(() => lock.element.style[lock.property] = lock.value);
      expect(previous.destroy).toHaveBeenCalledOnce();
      expect(state.instances).toHaveLength(index + 1);
      scrollY = 200 + index * 300;
      await mutate(() => lock.element.style[lock.property] = "");
      expect(state.instances).toHaveLength(index + 2);
      expect(current().animatedScroll).toBe(scrollY);
    }
  });

  it("cancels inertia for keyboard, pointer, anchors and history without preventing browser defaults", async () => {
    await render();
    const controller = current();
    scrollY = 210;
    controller.scrollTo.mockClear();
    controller.isScrolling = "smooth";
    await nativeEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    await nativeEvent(new MouseEvent("click", { bubbles: true, cancelable: true }), container);
    expect(controller.isScrolling).toBe("smooth");
    expect(controller.stop).not.toHaveBeenCalled();

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "#synthetic-section");
    const anchorChild = document.createElement("span");
    anchor.appendChild(anchorChild);
    container.appendChild(anchor);
    const events: [Event, EventTarget][] = [
      ...["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].map(key =>
        [new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }), window] as [Event, EventTarget]),
      [new Event("pointerdown", { bubbles: true, cancelable: true }), container],
      [new MouseEvent("click", { bubbles: true, cancelable: true }), anchorChild],
      [new PopStateEvent("popstate", { cancelable: true }), window],
      [new HashChangeEvent("hashchange", { cancelable: true }), window],
    ];
    for (const [event, target] of events) {
      controller.stop.mockClear();
      controller.start.mockClear();
      controller.isScrolling = "smooth";
      controller.animatedScroll = 80;
      await nativeEvent(event, target);
      expect(controller.isScrolling).toBe(false);
      expect(controller.isStopped).toBe(false);
      expect(controller.animatedScroll).toBe(210);
      expect(scrollY).toBe(210);
      expect(controller.stop).toHaveBeenCalledOnce();
      expect(controller.start).toHaveBeenCalledOnce();
      expect(controller.scrollTo).not.toHaveBeenCalled();
      expect(nativeScrollTo).not.toHaveBeenCalled();
    }
  });

  it("accepts external native scrolling without interrupting matching Lenis animation frames", async () => {
    await render();
    const controller = current();
    controller.scrollTo.mockClear();
    controller.isScrolling = "smooth";
    controller.animatedScroll = 300;
    for (const position of [300, 302, 298]) {
      scrollY = position;
      await nativeEvent(new Event("scroll"));
      expect(controller.isScrolling).toBe("smooth");
      expect(controller.stop).not.toHaveBeenCalled();
      expect(controller.scrollTo).not.toHaveBeenCalled();
    }
    scrollY = 303;
    await nativeEvent(new Event("scroll"));
    expect(controller.isScrolling).toBe(false);
    expect(controller.isStopped).toBe(false);
    expect(controller.animatedScroll).toBe(303);
    expect(controller.stop).toHaveBeenCalledOnce();
    expect(controller.start).toHaveBeenCalledOnce();
    expect(controller.scrollTo).not.toHaveBeenCalled();
    expect(nativeScrollTo).not.toHaveBeenCalled();
    // Further native smooth-scroll frames retain control after inertia is cancelled.
    controller.isScrolling = "native";
    for (const position of [420, 560, 700]) {
      scrollY = position;
      await nativeEvent(new Event("scroll"));
      expect(scrollY).toBe(position);
      expect(controller.isStopped).toBe(false);
      expect(controller.stop).toHaveBeenCalledOnce();
    }
    expect(controller.scrollTo).not.toHaveBeenCalled();
    expect(nativeScrollTo).not.toHaveBeenCalled();
  });

  it("cancels inertia before native smooth requests and delegates other scrolling without changing arguments", async () => {
    await render();
    expect(window.scrollTo).not.toBe(nativeScrollTo);
    const controller = current();
    const target = document.createElement("div");
    container.appendChild(target);
    scrollY = 210;
    const smoothOptions = { top: 900, left: 0, behavior: "smooth" } as const;
    const intoViewOptions = { behavior: "smooth", block: "center", inline: "nearest" } as const;
    const smoothRequests = [
      { invoke: () => window.scrollTo(smoothOptions), original: nativeScrollTo, argument: smoothOptions, receiver: window },
      { invoke: () => window.scrollBy(smoothOptions), original: nativeScrollBy, argument: smoothOptions, receiver: window },
      { invoke: () => window.scroll(smoothOptions), original: nativeScroll, argument: smoothOptions, receiver: window },
      { invoke: () => target.scrollIntoView(intoViewOptions), original: nativeScrollIntoView, argument: intoViewOptions, receiver: target },
    ];
    for (const request of smoothRequests) {
      request.original.mockClear();
      controller.stop.mockClear();
      controller.start.mockClear();
      controller.isScrolling = "smooth";
      controller.animatedScroll = 100;
      request.invoke();
      expect(controller.isScrolling, request.original.getMockName()).toBe(false);
      expect(controller.isStopped).toBe(false);
      expect(controller.animatedScroll).toBe(210);
      expect(controller.scrollTo).not.toHaveBeenCalled();
      expect(request.original).toHaveBeenCalledExactlyOnceWith(request.argument);
      expect(request.original.mock.calls[0][0]).toBe(request.argument);
      expect(request.original.mock.contexts[0]).toBe(request.receiver);
      expect(controller.stop.mock.invocationCallOrder[0]).toBeLessThan(controller.start.mock.invocationCallOrder[0]);
      expect(controller.start.mock.invocationCallOrder[0]).toBeLessThan(request.original.mock.invocationCallOrder[0]);
    }

    const instantOptions = { top: 300, behavior: "instant" } as const;
    const autoOptions = { top: 300, behavior: "auto" } as const;
    const nativeRequests = [
      { invoke: () => window.scrollTo(instantOptions), original: nativeScrollTo, args: [instantOptions] },
      { invoke: () => window.scrollBy(autoOptions), original: nativeScrollBy, args: [autoOptions] },
      { invoke: () => window.scroll(autoOptions), original: nativeScroll, args: [autoOptions] },
      { invoke: () => window.scrollTo(10, 300), original: nativeScrollTo, args: [10, 300] },
      { invoke: () => window.scrollBy(10, 300), original: nativeScrollBy, args: [10, 300] },
      { invoke: () => window.scroll(10, 300), original: nativeScroll, args: [10, 300] },
      { invoke: () => target.scrollIntoView({ behavior: "instant" }), original: nativeScrollIntoView, args: [{ behavior: "instant" }] },
      { invoke: () => target.scrollIntoView(true), original: nativeScrollIntoView, args: [true] },
      { invoke: () => target.scrollIntoView(), original: nativeScrollIntoView, args: [] },
    ];
    for (const request of nativeRequests) {
      request.original.mockClear();
      controller.stop.mockClear();
      controller.start.mockClear();
      controller.isScrolling = "smooth";
      controller.animatedScroll = 100;
      request.invoke();
      expect(controller.isScrolling).toBe("smooth");
      expect(controller.isStopped).toBe(false);
      expect(controller.animatedScroll).toBe(100);
      expect(controller.stop).not.toHaveBeenCalled();
      expect(controller.start).not.toHaveBeenCalled();
      expect(controller.scrollTo).not.toHaveBeenCalled();
      expect(request.original).toHaveBeenCalledExactlyOnceWith(...request.args);
    }

    const otherWindow = { scrollY: 50 } as Window;
    for (const [method, original] of [
      [window.scrollTo, nativeScrollTo], [window.scrollBy, nativeScrollBy], [window.scroll, nativeScroll],
    ] as const) {
      original.mockClear();
      controller.stop.mockClear();
      controller.start.mockClear();
      controller.isScrolling = "smooth";
      Reflect.apply(method, otherWindow, [smoothOptions]);
      expect(controller.isScrolling).toBe("smooth");
      expect(controller.stop).not.toHaveBeenCalled();
      expect(controller.start).not.toHaveBeenCalled();
      expect(original).toHaveBeenCalledExactlyOnceWith(smoothOptions);
      expect(original.mock.contexts[0]).toBe(otherWindow);
    }
  });

  it("cancels stale momentum and remeasures after navigation while retaining one controller", async () => {
    await render();
    const controller = current();
    controller.scrollTo.mockClear();
    controller.resize.mockClear();
    controller.isScrolling = "smooth";
    controller.animatedScroll = 100;
    scrollY = 610;
    state.pathname = "/cashflow/detail";
    await render();
    expect(controller.isScrolling).toBe(false);
    expect(controller.isStopped).toBe(false);
    expect(controller.animatedScroll).toBe(610);
    expect(scrollY).toBe(610);
    expect(controller.scrollTo).not.toHaveBeenCalled();
    expect(nativeScrollTo).not.toHaveBeenCalled();
    expect(controller.resize).toHaveBeenCalledOnce();
    expect(state.construct).toHaveBeenCalledOnce();
    await render();
    expect(controller.resize).toHaveBeenCalledOnce();
  });
});
