// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), download: vi.fn(), email: "advisor@example.test" }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: (user: unknown) => void) => { callback({ uid: "advisor", email: mocks.email }); return () => undefined; } }));
vi.mock("@/app/firebase-auth", () => ({ auth: { currentUser: { uid: "advisor", email: "advisor@example.test" } } }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ useEffectiveUserEmail: () => mocks.email }));
vi.mock("./comparisonPdf", () => ({ downloadLiabilityPdf: mocks.download }));

import { ComparisonExport } from "./ComparisonExport";
import { LIABILITY_SECTIONS } from "./sections";
import { LIABILITY_PRODUCTS } from "./products";
import { SCREENSHOT_PRODUCT_IDS } from "./screenshotData";

const products = LIABILITY_PRODUCTS.filter((product) => SCREENSHOT_PRODUCT_IDS.some((id) => id === product.id));
let container: HTMLDivElement, root: Root;
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === name)!;
const checkbox = (label: string) => [...container.querySelectorAll<HTMLInputElement>("input")].find((element) => element.getAttribute("aria-label") === label || element.closest("label")?.textContent?.trim() === label)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const render = async () => { await act(async () => root.render(<ComparisonExport sections={LIABILITY_SECTIONS} products={products} activeSection="breeder" />)); };
beforeEach(() => {
  vi.clearAllMocks(); mocks.email = "advisor@example.test";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.profile.mockResolvedValue({ profile: { fullName: "Štěpán Dvořák", phone: "777123456", onlineCard: { enabled: true, slug: "stepan" } } });
  mocks.download.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("dialog exportu odpovědnosti", () => {
  it("předá pouze zvolená kritéria spolu s vizitkou a uchová výběr po zavření", async () => {
    await render(); await click(button("PDF / tisk"));
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.textContent).toContain("Štěpán Dvořák");
    await click(button("Zrušit výběr")); expect(button("Stáhnout PDF").disabled).toBe(true);
    await click(checkbox("Zařadit sekci: Chovatel"));
    const sectionButton = container.querySelector<HTMLButtonElement>('button[aria-controls="export-criteria-breeder"]')!;
    await click(sectionButton);
    await click(checkbox("Zařadit kritérium: Chovatel – Chov psa"));
    expect(checkbox("Zařadit sekci: Chovatel").indeterminate).toBe(true);
    await click(button("Zrušit")); await click(button("PDF / tisk"));
    await click(button("Stáhnout PDF"));
    const payload = mocks.download.mock.calls[0][0];
    expect(payload.report.sections.map((section: { id: string }) => section.id)).toEqual(["breeder"]);
    expect(payload.report.sections[0].rows).toHaveLength(5);
    expect(payload.report.sections[0].rows.some((row: { id: string }) => row.id === "dog")).toBe(false);
    expect(payload.advisor.fullName).toBe("Štěpán Dvořák"); expect(payload.advisor.cardUrl).toContain("/vizitka/stepan");
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("umožní přidat podkritéria, vynechat podrobnosti a použít aktuální sekci", async () => {
    await render(); await click(button("PDF / tisk"));
    expect(checkbox("Zahrnout podkritéria").checked).toBe(false);
    await click(checkbox("Zahrnout podkritéria")); await click(checkbox("Včetně podrobností a výjimek"));
    await click(button("Stáhnout PDF"));
    expect(mocks.download.mock.calls[0][0].report.sections.flatMap((section: { rows: unknown[] }) => section.rows)).toHaveLength(83);
    expect(mocks.download.mock.calls[0][0].report.includeDetails).toBe(false);
    await click(button("PDF / tisk")); await click(button("Jen aktuální sekce")); await click(button("Stáhnout PDF"));
    expect(mocks.download.mock.calls[1][0].report.sections.map((section: { id: string }) => section.id)).toEqual(["breeder"]);
  });

  it("při chybě profilu nebo PDF zachová výběr a umožní opakovat pokus", async () => {
    mocks.profile.mockRejectedValueOnce(new Error("Offline"));
    await render(); await click(button("PDF / tisk"));
    expect(button("Stáhnout PDF").disabled).toBe(true);
    await click(button("Zkusit znovu")); expect(button("Stáhnout PDF").disabled).toBe(false);
    await click(button("Jen aktuální sekce")); mocks.download.mockRejectedValueOnce(new Error("Font unavailable"));
    await click(button("Stáhnout PDF"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("PDF se nepodařilo vytvořit");
    await click(button("Stáhnout PDF")); expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(mocks.download.mock.calls[1][0].report.sections).toHaveLength(1);
  });

  it("během exportu zablokuje duplicitní stažení", async () => {
    let finish!: () => void;
    mocks.download.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render(); await click(button("PDF / tisk")); await click(button("Stáhnout PDF"));
    expect(button("Vytvářím PDF…").disabled).toBe(true);
    await click(button("Vytvářím PDF…")); expect(mocks.download).toHaveBeenCalledTimes(1);
    await act(async () => finish()); expect(container.querySelector("dialog")).toBeNull();
  });

  it("při změně účtu zavře dialog se starou vizitkou", async () => {
    await render(); await click(button("PDF / tisk"));
    mocks.email = "second@example.test";
    mocks.profile.mockResolvedValue({ profile: { fullName: "Druhý poradce" } });
    await render(); expect(container.querySelector("dialog")).toBeNull();
    await click(button("PDF / tisk")); await click(button("Stáhnout PDF"));
    expect(mocks.download.mock.calls[0][0].advisor.fullName).toBe("Druhý poradce");
    expect(mocks.download.mock.calls[0][0].advisor.email).toBe("second@example.test");
  });
});
