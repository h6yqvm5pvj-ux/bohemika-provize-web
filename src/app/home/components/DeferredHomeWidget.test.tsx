// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeferredHomeWidget } from "./DeferredHomeWidget";
import { DataFreshness } from "./DataFreshness";
import { ExpectedPayoutSection } from "./ExpectedPayoutSection";

vi.mock("next/image", () => ({ default: () => null }));
describe("home data visibility and freshness", () => {
  let root: Root, element: HTMLDivElement;
  let notify: IntersectionObserverCallback;
  const mounted = vi.fn(), disconnected = vi.fn();
  function Child() { useEffect(() => { mounted(); }, []); return <p>Výsledek</p>; }
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
        notify = callback; expect(options.rootMargin).toBe("240px 0px");
      }
      observe = vi.fn(); disconnect = disconnected;
    });
    element = document.createElement("div"); root = createRoot(element);
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
  const renderDeferred = () => act(async () => root.render(<DeferredHomeWidget placeholder={<p>Čeká na zobrazení</p>}><Child /></DeferredHomeWidget>));
  const intersect = (visible: boolean) => act(async () => notify([{ isIntersecting: visible }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  it("mounts a widget once near the viewport, and keeps it mounted after scrolling away", async () => {
    await renderDeferred(); expect(mounted).not.toHaveBeenCalled(); expect(element.textContent).toContain("Čeká");
    await intersect(false); expect(mounted).not.toHaveBeenCalled();
    await intersect(true); expect(mounted).toHaveBeenCalledOnce(); expect(element.textContent).toBe("Výsledek");
    await intersect(false); await renderDeferred(); expect(mounted).toHaveBeenCalledOnce();
    expect(disconnected).toHaveBeenCalled();
  });
  it("loads immediately when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined); await renderDeferred(); expect(mounted).toHaveBeenCalledOnce();
  });
  it("ignores late observer notifications after unmount", async () => {
    await renderDeferred(); await act(async () => root.unmount()); await intersect(true);
    expect(mounted).not.toHaveBeenCalled(); root = createRoot(element);
  });
  it("labels a stale payout and retains its amount and original timestamp through refresh and failure", async () => {
    const updatedAt = Date.parse("2026-09-27T08:15:00Z");
    for (const error of [null, "Výpis selhal"]) {
      await act(async () => root.render(<ExpectedPayoutSection language="cs" loading={!error} error={error} updatedAt={updatedAt}
        grossAmount={100} stornoFundAmount={10} netAmount={90} periodLabel="září" isLiteUI />));
      expect(element.querySelector("time")?.dateTime).toBe("2026-09-27T08:15:00.000Z");
      expect(element.textContent).toContain(error ? "Poslední známé údaje" : "Aktualizuji");
      expect(element.textContent).toMatch(/90.*Kč/);
    }
  });
  it("does not show a fake zero without a successful result", async () => {
    await act(async () => root.render(<ExpectedPayoutSection language="cs" loading={false} error="Výpis selhal"
      grossAmount={0} stornoFundAmount={0} netAmount={0} periodLabel="září" isLiteUI />));
    expect(element.textContent).toContain("Výpis selhal"); expect(element.textContent).not.toContain("Kč");
  });
  it("ignores invalid freshness dates", async () => {
    await act(async () => root.render(<DataFreshness updatedAt={1e30} />)); expect(element.textContent).toBe("");
  });
});
