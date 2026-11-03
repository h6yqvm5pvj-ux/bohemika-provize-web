// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeInsuranceContent } from "@/components/LifeInsuranceContent";
import { OnlineCardMeetingForm } from "@/components/OnlineCardMeetingForm";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/life-insurance/LifeInsuranceHeroMedia", () => ({ LifeInsuranceHeroMedia: () => null }));
vi.mock("@/components/TileReveal", () => ({
  default: ({ headline, children }: { headline: ReactNode; children: ReactNode }) => <section>{headline}{children}</section>,
}));
vi.mock("@/components/OnlineCardMeetingForm", () => ({
  OnlineCardMeetingForm: vi.fn(() => <form aria-label="Meeting request" />),
}));

const RISK_DIALOGS = [
  "death", "disability", "care", "serious-illness", "daily-accident", "permanent-injury", "sick-leave", "hospitalisation",
].map(risk => `${risk}-dialog`);

const EDUCATION = [
  "Jsem závislý/á na svém příjmu?",
  "Proč životní pojištění sjednat co nejdříve?",
  "Kolik invalidních důchodců je v ČR evidováno?",
  "2 000 Kč měsíčně",
  "Nejdříve vy. Potom pojištění.",
];

describe("life insurance audience choices", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Animation observation is unrelated to content selection and is optional in the component.
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    vi.mocked(OnlineCardMeetingForm).mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const render = async (locale: OnlineCardLocale = "cs", theme: "light" | "dark" = "light", presentationEffects = true) => {
    await act(async () => root.render(<LifeInsuranceContent
      advisorSlug="test-advisor"
      locale={locale}
      theme={theme}
      presentationEffects={presentationEffects}
    />));
  };

  const choice = (name: string) => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
      .find(candidate => candidate.textContent === name);
    expect(button, `Missing audience choice: ${name}`).toBeDefined();
    return button!;
  };

  const select = async (name: string) => {
    await act(async () => choice(name).click());
  };

  const expectAllRisks = () => {
    const riskButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"][aria-controls$="-dialog"]'));
    expect(riskButtons.map(button => button.getAttribute("aria-controls"))).toEqual(RISK_DIALOGS);
    expect(riskButtons.every(button => Boolean(button.textContent?.trim()))).toBe(true);
  };

  it("starts with educational content and two named, mutually exclusive choices", async () => {
    await render();

    const group = container.querySelector('[role="group"]');
    expect(group).not.toBeNull();
    const labelId = group!.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe("Začněme vaší situací");
    expect(group!.querySelectorAll("button")).toHaveLength(2);
    const uninsured = choice("Ještě nemám životní pojištění");
    const insured = choice("Již mám životní pojištění");
    expect(uninsured.getAttribute("aria-pressed")).toBe("true");
    expect(insured.getAttribute("aria-pressed")).toBe("false");
    for (const button of [uninsured, insured]) {
      expect(document.getElementById(button.getAttribute("aria-controls")!)).not.toBeNull();
    }
    EDUCATION.forEach(text => expect(container.textContent).toContain(text));
    expect(container.querySelector("#life-review-title")).toBeNull();
    expectAllRisks();
  });

  it("replaces irrelevant arguments with the policy review and restores them when switching back", async () => {
    await render();
    const originalStatistics = container.querySelector("#life-statistics-title");
    await select("Již mám životní pojištění");

    expect(choice("Již mám životní pojištění").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Ještě nemám životní pojištění").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("#life-review-title")?.textContent).toContain("Víte, co opravdu kryje?");
    EDUCATION.forEach(text => expect(container.textContent).not.toContain(text));
    expect(originalStatistics?.isConnected).toBe(false);
    expect(container.querySelector("#life-statistics-title")).toBeNull();
    expectAllRisks();

    await select("Ještě nemám životní pojištění");
    EDUCATION.forEach(text => expect(container.textContent).toContain(text));
    expect(container.querySelector("#life-review-title")).toBeNull();
    expectAllRisks();
  });

  it.each([
    ["en", "dark", "I already have life insurance", "Do you know what it covers?"],
    ["uk", "light", "У мене вже є страхування життя", "Чи знаєте ви, що воно покриває?"],
  ] as const)("retains the selected audience when locale changes to %s and theme to %s", async (locale, theme, selectedLabel, reviewTitle) => {
    await render();
    await select("Již mám životní pojištění");
    await render(locale, theme);

    expect(choice(selectedLabel).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("#life-review-title")?.textContent).toContain(reviewTitle);
    expect(container.querySelector("#life-statistics-title")).toBeNull();
    expect(container.querySelector("main")?.getAttribute("data-theme")).toBe(theme);
    expectAllRisks();
  });

  it("opens a review request with the advisor, life-insurance topic and review message", async () => {
    await render();
    await select("Již mám životní pojištění");
    const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]'))
      .find(button => button.textContent === "Zkontrolovat moji smlouvu");
    expect(trigger).toBeDefined();
    await act(async () => trigger!.click());

    expect(container.querySelector('dialog[open][aria-labelledby="life-meeting-title"]')).not.toBeNull();
    expect(vi.mocked(OnlineCardMeetingForm).mock.lastCall?.[0]).toMatchObject({
      slug: "test-advisor",
      locale: "cs",
      initialSelectedTopics: ["life-accident"],
      initialMessage: "Chci zkontrolovat svou stávající smlouvu životního pojištění.",
    });

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Zavřít formulář"]')!.click());
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(choice("Již mám životní pojištění").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the embedded presentation educational without audience or review controls", async () => {
    await render("cs", "light", false);

    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.querySelector("#life-review-title")).toBeNull();
    EDUCATION.forEach(text => expect(container.textContent).toContain(text));
    expect(container.querySelector("h1")?.textContent).toBe("Proč mít životní pojištění?");
    expectAllRisks();
  });

  it("server-renders the default education without nonfunctional audience buttons", () => {
    const markup = renderToString(<LifeInsuranceContent advisorSlug="test-advisor" locale="cs" theme="light" presentationEffects />);
    const serverContent = document.createElement("div");
    serverContent.innerHTML = markup;

    expect(serverContent.querySelector('[role="group"]')).toBeNull();
    expect(serverContent.querySelector("#life-review-title")).toBeNull();
    EDUCATION.forEach(text => expect(serverContent.textContent).toContain(text));
  });
});
