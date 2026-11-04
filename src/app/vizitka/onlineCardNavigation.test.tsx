// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineCardHref } from "@/lib/onlineCardNavigation";
import { ONLINE_CARD_COPY } from "@/lib/onlineCardI18n";
import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import Vehicle from "./[slug]/pojisteni-vozidla/VehicleInsuranceShellClient";
import Life from "./[slug]/zivotni-pojisteni/LifeInsuranceShellClient";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/vehicle-insurance/VehicleInsuranceContent", () => ({ VehicleInsuranceContent: ({ locale }: { locale: string }) => <p data-content-language={locale} /> }));
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
  it.each(["cs", "en", "uk"] as const)("keeps remaining service links and translations aligned in %s", locale => {
    const section = document.createElement("div");
    section.innerHTML = renderToStaticMarkup(<AdvisorProfileSections minimal locale={locale} lifeInsurancePageHref="/life" vehicleInsurancePageHref="/vehicle" travelInsurancePageHref="/travel" />);
    const services = [...section.querySelectorAll('[data-service-icon]')].map(icon => icon.parentElement!);
    expect(services).toHaveLength(7);
    expect(services.map(service => service.textContent)).toEqual([...ONLINE_CARD_COPY[locale].advisor.services]);
    expect(services.map(service => service.getAttribute("href"))).toEqual(["/life", null, "/vehicle", "/travel", null, null, null]);
    expect(section.querySelectorAll('[data-service-icon="7"]')).toHaveLength(0);
  });
  it.each([Vehicle, Life])("keeps the inbound language, updates links and persists a language change", async Component => {
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
