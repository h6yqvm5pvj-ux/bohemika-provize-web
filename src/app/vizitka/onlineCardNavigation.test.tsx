// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineCardHref } from "@/lib/onlineCardNavigation";
import Vehicle from "./[slug]/pojisteni-vozidla/VehicleInsuranceShellClient";
import Gold from "./[slug]/zlato/GoldInvestmentShellClient";
import Life from "./[slug]/zivotni-pojisteni/LifeInsuranceShellClient";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/vehicle-insurance/VehicleInsuranceContent", () => ({ VehicleInsuranceContent: ({ locale }: { locale: string }) => <p data-content-language={locale} /> }));
vi.mock("@/components/gold-investment/GoldInvestmentContent", () => ({ GoldInvestmentContent: ({ locale }: { locale: string }) => <p data-content-language={locale} /> }));
vi.mock("@/components/LifeInsuranceContent", () => ({ LifeInsuranceContent: ({ locale }: { locale: string }) => <p data-content-language={locale} /> }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({ retained: true }, "", "/vizitka/advisor/sluzba?lang=en&ref=profile#details");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("profile service language navigation", () => {
  it.each([Vehicle, Gold, Life])("keeps the inbound language, updates links and persists a language change", async Component => {
    await act(async () => root.render(<Component slug="advisor" initialLocale="en" />));
    expect(document.documentElement.lang).toBe("en");
    expect(container.querySelector("[data-content-language]")?.getAttribute("data-content-language")).toBe("en");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/vizitka/advisor?lang=en");
    const select = container.querySelector("select");
    if (select) {
      await act(async () => { select.value = "uk"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    } else {
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click());
      await act(async () => container.querySelector<HTMLButtonElement>('[role="menuitemradio"][lang="uk"]')!.click());
    }
    expect(document.documentElement.lang).toBe("uk");
    expect(container.querySelector("[data-content-language]")?.getAttribute("data-content-language")).toBe("uk");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/vizitka/advisor?lang=uk");
    expect(window.location.search).toBe("?lang=uk&ref=profile");
    expect(window.location.hash).toBe("#details");
    expect(window.history.state).toEqual({ retained: true });
  });

  it("removes only the language parameter when returning to Czech", () => {
    expect(onlineCardHref("/vizitka/advisor?lang=en&ref=profile#details", "cs")).toBe("/vizitka/advisor?ref=profile#details");
  });
});
