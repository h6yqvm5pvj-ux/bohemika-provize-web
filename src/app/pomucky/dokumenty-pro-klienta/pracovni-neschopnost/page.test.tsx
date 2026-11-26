// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "advisor" } },
  profile: vi.fn(),
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../dokumenty/DocumentsUi", () => ({ DocumentsHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));

import SickLeavePage from "./page";

it("porovná zadané krytí a umožní upravit vizitku přímo v tiskovém náhledu", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.profile.mockResolvedValue({ profile: { onlineCard: {
    enabled: true, slug: "testovaci-poradce", fullName: "Původní poradce", email: "poradce@example.test",
  } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SickLeavePage />));
    const exportButton = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Náhled a tisk"))!;
    expect(exportButton.disabled).toBe(true);

    const selectProduct = async (selector: string, productName: string) => {
      const select = container.querySelector<HTMLSelectElement>(`${selector} select`)!;
      const option = [...select.options].find(item => item.text.includes(productName))!;
      await act(async () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await selectProduct('[data-variant="current"]', "FLEXI");
    await selectProduct('[data-variant="proposed"]', "NEON");
    await act(async () => {
      for (const input of container.querySelectorAll<HTMLInputElement>('[data-variant] input[inputmode="decimal"]')) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "500");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const normalizeMoney = (value: string | null | undefined) => value?.replace(/\s/g, " ");
    const thirtyDays = [...container.querySelectorAll("tbody tr")].find(row => row.querySelector("th")?.textContent === "30 dní");
    expect([...thirtyDays!.querySelectorAll("td")].map(cell => normalizeMoney(cell.textContent))).toEqual(["1 000 Kč", "15 000 Kč"]);

    await act(async () => {
      exportButton.click();
      await vi.dynamicImportSettled();
    });
    const preview = container.querySelector("iframe")!;
    expect(preview?.srcdoc).toContain("30 dní");
    expect(preview.getAttribute("sandbox")).toBe("allow-same-origin allow-modals");
    expect(normalizeMoney(preview.srcdoc)).toContain("<strong>15 000 Kč</strong>");
    expect(preview.srcdoc).toContain("Původní poradce");

    const dialogButton = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("dialog button")]
      .find(button => button.textContent?.trim() === text)!;
    const enter = async (input: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await act(async () => dialogButton("Upravit vizitku").click());
    const nameInput = () => container.querySelector<HTMLInputElement>('dialog form input[type="text"]')!;
    expect(nameInput().value).toBe("Původní poradce");
    await enter(nameInput(), "Zahozená úprava");
    await act(async () => dialogButton("Zrušit úpravy").click());
    expect(container.querySelector("iframe")?.srcdoc).toContain("Původní poradce");

    await act(async () => dialogButton("Upravit vizitku").click());
    const emailInput = container.querySelector<HTMLInputElement>('dialog form input[type="email"]')!;
    await enter(emailInput, "neplatny-email");
    await act(async () => dialogButton("Použít v PDF").click());
    expect(container.querySelector('dialog [role="alert"]')?.textContent).toContain("Zkontroluj e-mail");
    await enter(nameInput(), "Poradce do PDF");
    await enter(emailInput, "pdf@example.test");
    await act(async () => {
      dialogButton("Použít v PDF").click();
      await vi.dynamicImportSettled();
    });
    const edited = container.querySelector("iframe")?.srcdoc;
    expect(edited).toContain("Poradce do PDF");
    expect(edited).toContain("pdf@example.test");
    expect(edited).toContain('href="https://bohemka.app/vizitka/testovaci-poradce"');
    expect(edited).not.toContain("Původní poradce");
    expect(mocks.profile).toHaveBeenCalledTimes(1);

    await act(async () => dialogButton("Upravit vizitku").click());
    expect(nameInput().value).toBe("Poradce do PDF");
    await act(async () => {
      mocks.auth.currentUser = { uid: "other-advisor" };
      window.dispatchEvent(new Event("storage"));
    });
    expect(container.querySelector("dialog")?.open).toBeFalsy();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
