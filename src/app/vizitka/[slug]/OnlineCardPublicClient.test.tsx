// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PremiumOnlineCardValue } from "@/components/PremiumOnlineCardPreview";
import { ONLINE_CARD_COPY, type OnlineCardLocale } from "@/lib/onlineCardI18n";
import OnlineCardPublicClient from "./OnlineCardPublicClient";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/AdvisorProfileSections", () => ({ AdvisorProfileSections: () => null }));
vi.mock("@/components/OnlineCardTestimonials", () => ({ OnlineCardTestimonials: () => null }));
vi.mock("@/components/OnlineCardMeetingForm", () => ({ OnlineCardMeetingForm: () => null }));
vi.mock("@/components/OnlineCardHeroVisual", () => ({ OnlineCardHeroVisual: () => null }));
vi.mock("@/lib/onlineCardTracking", () => ({
  trackOnlineCardEvent: vi.fn(),
  trackOnlineCardVisit: vi.fn(),
}));

const card: PremiumOnlineCardValue = {
  fullName: "Jana Testovací",
  title: "Finanční poradkyně",
  phone: "",
  email: "",
  website: "",
  ico: "",
  bio: "",
  location: "Praha",
  officeLabel: "",
  officePhotos: [],
};

describe("online card opening animation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    window.history.replaceState({}, "", "/vizitka/test-advisor");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const render = async (locale: OnlineCardLocale = "cs", slug = "test-advisor") => {
    await act(async () => {
      root.render(<OnlineCardPublicClient slug={slug} card={card} initialLocale={locale} />);
    });
  };

  const finishAnimation = async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  };

  it.each(["cs", "en", "uk"] as const)("localizes the opening in %s and retains public content", async locale => {
    await render(locale);

    expect(container.textContent).toContain(ONLINE_CARD_COPY[locale].public.loading);
    expect(container.querySelector("h1")?.textContent).toBe(card.fullName);

    await finishAnimation();

    expect(container.textContent).not.toContain(ONLINE_CARD_COPY[locale].public.loading);
    expect(container.querySelector("h1")?.textContent).toBe(card.fullName);
  });

  it("does not replay when language or theme changes, and opens again for another advisor", async () => {
    await render();
    await finishAnimation();

    const languageSelect = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      languageSelect.value = "en";
      languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Dark"]')!.click();
    });

    expect(document.documentElement.lang).toBe("en");
    expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
    expect(container.textContent).not.toContain(ONLINE_CARD_COPY.en.public.loading);

    await render("en", "another-advisor");

    expect(container.textContent).toContain(ONLINE_CARD_COPY.en.public.loading);
    await finishAnimation();
    expect(container.textContent).not.toContain(ONLINE_CARD_COPY.en.public.loading);
  });
});
