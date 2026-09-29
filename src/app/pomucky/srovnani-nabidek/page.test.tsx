// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "advisor", email: "poradce@example.test", displayName: "Jan Poradce" },
  auth: { currentUser: null as { uid: string; email: string; displayName?: string } | null },
  onAuth: (user: unknown) => { void user; }, impersonation: null as { email: string } | null,
  profile: vi.fn(), pdf: vi.fn(), getDocument: vi.fn(), destroyPdf: vi.fn(),
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: (user: unknown) => void) => { mocks.onAuth = callback; callback(mocks.auth.currentUser); return () => {}; } }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ useAdminImpersonationState: () => mocks.impersonation }));
vi.mock("@/app/lib/adminImpersonation", () => ({ readAdminImpersonationState: () => mocks.impersonation }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("./pdf", () => ({ createComparisonPdf: mocks.pdf }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: { workerSrc: "/pdf.worker.mjs" } }));
vi.mock("../tvorba/ContactQrCode", () => ({ ContactQrCode: ({ payload }: { payload: string }) => <span data-qr={payload}>QR</span> }));

import ComparisonPage from "./page";
let container: HTMLDivElement, root: Root;
const button = (name: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
const click = async (name: string) => { const target = button(name); expect(target, name).toBeTruthy(); await act(async () => target.click()); };
function field(label: string) {
  return container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`) ?? Array.from(container.querySelectorAll("label")).find(item => Array.from(item.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim() === label)?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select");
}
const select = async (label: string, value: string) => {
  const node = field(label) as HTMLSelectElement; expect(node, label).toBeTruthy();
  await act(async () => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); });
};
const enter = async (label: string, value: string) => {
  const node = field(label)!; expect(node, label).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const fill = async () => {
  await enter("Jméno klienta", "Žaneta"); await enter("Příjmení klienta", "Černá");
  await click("Vybrat pojišťovnu: Současná smlouva"); await click("Allianz");
  await click("Vybrat pojišťovnu: Navrhované řešení"); await click("ČPP");
  await enter("Název položky 1", "Invalidita"); await enter("Invalidita — Navrhované řešení", "2 000 000 Kč");
};
beforeEach(async () => {
  vi.clearAllMocks(); mocks.auth.currentUser = mocks.user; mocks.impersonation = null;
  mocks.profile.mockResolvedValue({ profile: { fullName: "Jan Poradce", phone: "+420 777 123 456", onlineCard: { enabled: true, slug: "jan" } } });
  mocks.pdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mocks.getDocument.mockReturnValue({ destroy: mocks.destroyPdf, promise: Promise.resolve({
    numPages: 2, destroy: mocks.destroyPdf,
    getPage: async () => ({ getViewport: () => ({ width: 842, height: 595 }), render: () => ({ promise: Promise.resolve() }) }),
  }) });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cGFnZQ==");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:comparison-pdf");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ComparisonPage />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("comparison editor", () => {
  it("switches the recommended proposal and preserves it through undo, saving, reopening and PDF export", async () => {
    await fill();
    expect(container.querySelector('thead [data-recommended="true"]')).toBeNull();
    await click("Doporučit nabídku: Navrhované řešení");
    expect(container.querySelector('thead [data-recommended="true"]')?.textContent).toContain("DOPORUČENO");
    expect(button("Zrušit doporučení: Navrhované řešení").getAttribute("aria-pressed")).toBe("true");
    await click("Přidat nabídku"); await click("Vybrat pojišťovnu: Nabídka 2"); await click("Kooperativa");
    await click("Doporučit nabídku: Nabídka 2");
    expect(container.querySelectorAll('thead [data-recommended="true"]')).toHaveLength(1);
    await click("Vrátit změnu");
    expect(button("Zrušit doporučení: Navrhované řešení").getAttribute("aria-pressed")).toBe("true");
    await click("Zopakovat změnu"); await click("Uložit koncept");
    const raw = await (vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob).text();
    const saved = JSON.parse(raw);
    expect(saved.recommendedOfferId).toBe(saved.offers[2].id);
    await click("Nové srovnání"); await click("Vytvořit prázdné srovnání");
    expect(container.querySelector('thead [data-recommended="true"]')).toBeNull();
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File([raw], "srovnani.json", { type: "application/json" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button("Zrušit doporučení: Nabídka 2").getAttribute("aria-pressed")).toBe("true");
    await click("Stáhnout PDF");
    expect(mocks.pdf.mock.calls.at(-1)![0].doc.recommendedOfferId).toBe(saved.offers[2].id);
    await click("Odebrat nabídku 2");
    expect(container.querySelector('thead [data-recommended="true"]')).toBeNull();
    await click("Vrátit změnu"); await click("Zrušit doporučení: Nabídka 2");
    expect(container.querySelector('thead [data-recommended="true"]')).toBeNull();
  });

  it("formats currency inputs and premiums while keeping percentages and years unchanged", async () => {
    await select("Druh pojištění", "auto"); await click("Přidat základní sadu");
    await enter("Pojistná částka (Kč) — Havarijní pojištění — Současná smlouva", "1045");
    expect(field("Pojistná částka (Kč) — Havarijní pojištění — Současná smlouva")?.value).toBe("1 045 Kč");
    await select("Spoluúčast — Havarijní pojištění — Současná smlouva", "percent-min");
    await enter("Minimální spoluúčast (Kč) — Havarijní pojištění — Současná smlouva", "12345 Kč");
    expect(field("Minimální spoluúčast (Kč) — Havarijní pojištění — Současná smlouva")?.value).toBe("12 345");
    await enter("Procentní spoluúčast (%) — Havarijní pojištění — Současná smlouva", "5,5");
    expect(field("Procentní spoluúčast (%) — Havarijní pojištění — Současná smlouva")?.value).toBe("5,5");
    await enter("Ročník: Současná smlouva", "2020");
    expect(field("Ročník: Současná smlouva")?.value).toBe("2020");
    await enter("Pojistné: Současná smlouva", "12345 Kč / rok");
    await act(async () => { field("Pojistné: Současná smlouva")!.focus(); field("Pojistné: Současná smlouva")!.blur(); });
    expect(field("Pojistné: Současná smlouva")?.value).toBe("12 345 Kč / rok");
    await enter("Pojistná částka (Kč) — Havarijní pojištění — Současná smlouva", "");
    expect(field("Pojistná částka (Kč) — Havarijní pojištění — Současná smlouva")?.value).toBe("");
    await click("Stručný přehled");
    expect(container.querySelector("tbody")?.textContent).toContain("Spoluúčast: 5,5 %, min. 12 345 Kč");
  });

  it("selects products inline for each insurer and exports their exact versions", async () => {
    await fill();
    const productSelect = field("Vybrat produkt: Současná smlouva") as HTMLSelectElement;
    expect(productSelect.tagName).toBe("SELECT");
    expect(Array.from(productSelect.options).map(option => option.value)).toEqual(["", "Život", "Partners Život"]);
    await select("Vybrat produkt: Současná smlouva", "Partners Život");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(field("Produkt: Současná smlouva")?.value).toBe("Partners Život");
    expect(field("Produkt: Navrhované řešení")?.value).toBe("");
    await click("Vybrat pojišťovnu: Navrhované řešení"); await click("MetLife");
    const metlifeProducts = Array.from((field("Vybrat produkt: Navrhované řešení") as HTMLSelectElement).options).map(option => option.value);
    for (const product of ["Vision 6.0", "Vision 6.1", "Vision 6.2"]) expect(metlifeProducts).toContain(product);
    expect(metlifeProducts).not.toContain("Partners Život");
    await select("Vybrat produkt: Navrhované řešení", "Vision 6.1"); await click("Stáhnout PDF");
    const doc = mocks.pdf.mock.calls[0][0].doc;
    expect(doc.offers.map((offer: { product: string }) => offer.product)).toEqual(["Partners Život", "Vision 6.1"]);
    await click("Uložit koncept");
    const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
    const raw = await blob.text();
    await click("Nové srovnání"); await click("Vytvořit prázdné srovnání");
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File([raw], "srovnani.json", { type: "application/json" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field("Produkt: Navrhované řešení")?.value).toBe("Vision 6.1");
    expect(field("Vybrat produkt: Navrhované řešení")?.value).toBe("Vision 6.1");
  });

  it("clears the old product only when changing an existing insurer and restores both with undo", async () => {
    await fill(); await enter("Ročník: Současná smlouva", "2020");
    await select("Vybrat produkt: Současná smlouva", "Život");
    await click("Vybrat pojišťovnu: Současná smlouva"); await click("Allianz");
    expect(field("Produkt: Současná smlouva")?.value).toBe("Život");
    await click("Vybrat pojišťovnu: Současná smlouva"); await click("Generali Česká pojišťovna");
    expect(field("Produkt: Současná smlouva")?.value).toBe("");
    expect(field("Ročník: Současná smlouva")?.value).toBe("2020");
    const generaliProducts = Array.from((field("Vybrat produkt: Současná smlouva") as HTMLSelectElement).options).map(option => option.value);
    expect(generaliProducts).toContain("Můj Život 2"); expect(generaliProducts).not.toContain("Partners Život");
    await click("Vrátit změnu");
    expect(field("Produkt: Současná smlouva")?.value).toBe("Život");
    expect(field("Vybrat produkt: Současná smlouva")?.value).toBe("Život");
  });

  it("keeps custom product names editable and limits life suggestions to life or an unspecified insurance type", async () => {
    await enter("Produkt: Současná smlouva", "Historický produkt");
    await click("Vybrat pojišťovnu: Současná smlouva"); await click("Allianz");
    expect(field("Produkt: Současná smlouva")?.value).toBe("Historický produkt");
    expect(field("Vybrat produkt: Současná smlouva")?.value).toBe("");
    await enter("Produkt: Současná smlouva", "Individuální produkt");
    await select("Druh pojištění", "auto");
    expect(field("Vybrat produkt: Současná smlouva")).toBeFalsy();
    expect(field("Produkt: Současná smlouva")?.value).toBe("Individuální produkt");
    await select("Druh pojištění", "life");
    expect(field("Vybrat produkt: Současná smlouva")).toBeTruthy();
    await click("Vybrat pojišťovnu: Současná smlouva"); await click("Direct");
    expect(field("Vybrat produkt: Současná smlouva")).toBeFalsy();
    await enter("Produkt: Současná smlouva", "Vlastní název bez katalogu");
    expect(field("Produkt: Současná smlouva")?.value).toBe("Vlastní název bez katalogu");
  });

  it("keeps disability as one risk in compact view and preserves its degree amounts through editing and undo", async () => {
    await select("Druh pojištění", "life"); await click("Přidat: Invalidita");
    await select("Stupně invalidity — Invalidita — Navrhované řešení", "123");
    await enter("I. stupeň (Kč) — Invalidita — Navrhované řešení", "500 000");
    await enter("II. stupeň (Kč) — Invalidita — Navrhované řešení", "1 000 000");
    for (const value of ["2", "20", "200", "2000", "20000", "200000", "2000000"]) await enter("III. stupeň (Kč) — Invalidita — Navrhované řešení", value);
    await click("Vrátit změnu");
    expect(field("III. stupeň (Kč) — Invalidita — Navrhované řešení")?.value).toBe("");
    expect(field("II. stupeň (Kč) — Invalidita — Navrhované řešení")?.value).toBe("1 000 000 Kč");
    await click("Zopakovat změnu");
    await click("Stručný přehled");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(field("III. stupeň (Kč) — Invalidita — Navrhované řešení")).toBeFalsy();
    for (const text of ["I. stupeň: 500 000 Kč", "II. stupeň: 1 000 000 Kč", "III. stupeň: 2 000 000 Kč"]) expect(container.querySelector("tbody")?.textContent).toContain(text);
    await click("Uložit koncept");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob, doc = JSON.parse(await blob.text());
    expect(doc.rows).toHaveLength(1); expect(doc.rows[0].coverage).toBe("disability");
    expect(doc.rows[0].cells[doc.offers[1].id].details.amounts).toEqual({ 1: "500 000", 2: "1 000 000", 3: "2 000 000" });
    await click("Rozbalit parametry řádku 1");
    expect(field("III. stupeň (Kč) — Invalidita — Navrhované řešení")?.value).toBe("2 000 000 Kč");
  });

  it("finds supplemental risks without accents and saves their independent parameters", async () => {
    await select("Druh pojištění", "life");
    await enter("Hledat riziko nebo připojištění", "pomucky");
    await click("Přidat: Příspěvek na pořízení zvláštní pomůcky");
    await enter("Limit plnění (Kč) — Příspěvek na pořízení zvláštní pomůcky — Současná smlouva", "50 000");
    await enter("Limit plnění (Kč) — Příspěvek na pořízení zvláštní pomůcky — Navrhované řešení", "100 000");
    await enter("Hledat riziko nebo připojištění", "cukrovka");
    await click("Přidat: Cukrovka a její komplikace");
    await enter("Pojistná částka (Kč) — Cukrovka a její komplikace — Navrhované řešení", "300 000");
    await select("Sjednání — Cukrovka a její komplikace — Současná smlouva", "excluded");
    await click("Uložit koncept");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const raw = await blob.text(), doc = JSON.parse(raw);
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0].cells[doc.offers[0].id].details.values.limit).toBe("50 000");
    expect(doc.rows[0].cells[doc.offers[1].id].details.values.limit).toBe("100 000");
    await click("Nové srovnání"); await click("Vytvořit prázdné srovnání");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(input, "files", { value: [new File([raw], "srovnani.json", { type: "application/json" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field("Pojistná částka (Kč) — Cukrovka a její komplikace — Navrhované řešení")?.value).toBe("300 000 Kč");
    expect(field("Pojistná částka (Kč) — Cukrovka a její komplikace — Současná smlouva")).toBeFalsy();
  });

  it("edits liability, combined deductibles and assistance fields per offer", async () => {
    await select("Druh pojištění", "auto"); await click("Přidat základní sadu");
    const limits = field("Limity odpovědnosti — Povinné ručení — Současná smlouva") as HTMLSelectElement;
    expect(limits.tagName).toBe("SELECT");
    expect(Array.from(limits.options).slice(1).map(option => option.textContent)).toEqual(["35/35 mil. Kč", "50/50 mil. Kč", "60/60 mil. Kč", "70/70 mil. Kč", "100/100 mil. Kč", "150/150 mil. Kč", "200/200 mil. Kč", "250/250 mil. Kč"]);
    expect(field("Limit újmy na zdraví (mil. Kč) — Povinné ručení — Současná smlouva")).toBeFalsy();
    expect(field("Limit majetkových škod (mil. Kč) — Povinné ručení — Současná smlouva")).toBeFalsy();
    await select("Limity odpovědnosti — Povinné ručení — Současná smlouva", "100");
    await select("Limity odpovědnosti — Povinné ručení — Navrhované řešení", "200");
    await select("Spoluúčast — Havarijní pojištění — Současná smlouva", "percent-min");
    await enter("Procentní spoluúčast (%) — Havarijní pojištění — Současná smlouva", "5");
    await enter("Minimální spoluúčast (Kč) — Havarijní pojištění — Současná smlouva", "5 000");
    await select("Spoluúčast — Havarijní pojištění — Současná smlouva", "none");
    expect(field("Minimální spoluúčast (Kč) — Havarijní pojištění — Současná smlouva")).toBeFalsy();
    await select("Spoluúčast — Havarijní pojištění — Současná smlouva", "percent-min");
    expect(field("Minimální spoluúčast (Kč) — Havarijní pojištění — Současná smlouva")?.value).toBe("5 000");
    await act(async () => (field("Porucha — Asistenční služby — Navrhované řešení") as HTMLInputElement).click());
    await enter("Odtah v zahraničí — Asistenční služby — Navrhované řešení", "Bez limitu");
    await enter("Náhradní vozidlo / počet dnů — Asistenční služby — Navrhované řešení", "10 dní");
    await click("Uložit koncept");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob, doc = JSON.parse(await blob.text());
    expect(doc.insuranceType).toBe("auto");
    const liability = doc.rows.find((row: { coverage: string }) => row.coverage === "auto-liability");
    expect(liability.cells[doc.offers[0].id].details.values).toMatchObject({ healthLimit: "100", propertyLimit: "100" });
    expect(liability.cells[doc.offers[1].id].details.values).toMatchObject({ healthLimit: "200", propertyLimit: "200" });
    expect(doc.rows.find((row: { coverage: string }) => row.coverage === "auto-assistance").cells[doc.offers[1].id].details.values).toMatchObject({ events: "breakdown", towingAbroad: "Bez limitu", replacement: "10 dní" });
    await click("Přidat nabídku");
    expect(field("Odtah v zahraničí — Asistenční služby — Nabídka 2")?.value).toBe("");
  });

  it("exports the latest values, icons, highlights and notes; can undo a deleted row", async () => {
    await fill(); await click("Vybrat ikonu řádku 1"); await click("Zdraví");
    const tones = container.querySelector('[aria-label="Zvýraznění: Invalidita — Navrhované řešení"]')!;
    await act(async () => tones.querySelector<HTMLButtonElement>('[aria-label="Výhoda / zahrnuto"]')!.click());
    await enter("Poznámky a doporučení", "Důležitá poznámka klientovi.");
    await click("Duplikovat řádek 1"); await click("Smazat řádek 1"); await click("Vrátit změnu");
    await click("Stáhnout PDF");
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    const { doc, contact, advisor } = mocks.pdf.mock.calls[0][0];
    expect(doc.rows).toHaveLength(2); expect(doc.rows[0].icon).toBe("heart");
    expect(doc.rows[0].cells[doc.offers[1].id]).toEqual({ text: "2 000 000 Kč", tone: "positive" });
    expect(doc.notes).toBe("Důležitá poznámka klientovi.");
    expect(contact.href).toContain("/vizitka/jan"); expect(advisor.fullName).toBe("Jan Poradce");
  });

  it("keeps values attached to their offer after reordering, then removes only that offer", async () => {
    await fill(); await click("Přidat nabídku");
    await enter("Invalidita — Nabídka 2", "3 000 000 Kč");
    await click("Posunout nabídku 2 doleva");
    expect(field("Invalidita — Nabídka 2")?.value).toBe("3 000 000 Kč");
    expect(field("Invalidita — Navrhované řešení")?.value).toBe("2 000 000 Kč");
    await click("Odebrat nabídku 1");
    expect(field("Invalidita — Nabídka 2")).toBeFalsy();
    expect(field("Invalidita — Navrhované řešení")?.value).toBe("2 000 000 Kč");
  });

  it("validates missing input, recovers from PDF errors and provides a downloadable preview", async () => {
    await click("Stáhnout PDF"); expect(mocks.pdf).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("jméno a příjmení");
    await fill(); mocks.pdf.mockRejectedValueOnce(new Error("Logo nelze načíst."));
    await click("Náhled PDF"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Logo nelze načíst");
    expect(field("Invalidita — Navrhované řešení")?.value).toBe("2 000 000 Kč");
    await click("Náhled PDF");
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.querySelectorAll('img[alt^="Strana "]')).toHaveLength(2);
    expect(dialog.querySelector("iframe, object, embed")).toBeNull();
    expect(dialog.textContent).toContain("na poslední stránce");
    const pdfBlob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
    expect(mocks.getDocument.mock.calls.at(-1)![0].data).toEqual(new Uint8Array(await pdfBlob.arrayBuffer()));
    expect(dialog.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("blob:comparison-pdf");
    await act(async () => dialog.querySelector<HTMLButtonElement>(`button[class*="primary"]`)!.click());
    expect(vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0]).toBe(pdfBlob);
    await click("Zavřít dialog"); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:comparison-pdf");
    expect(mocks.destroyPdf).toHaveBeenCalled();
    await click("Náhled PDF");
    expect(container.querySelectorAll('[role="dialog"] img[alt^="Strana "]')).toHaveLength(2);
  });

  it("changes orientation inside the preview, downloads that version and retains the selection after closing", async () => {
    await fill();
    mocks.pdf.mockImplementation(({ orientation }: { orientation: string }) => Promise.resolve(new Blob([orientation], { type: "application/pdf" })));
    await click("Náhled PDF");
    expect(field("Orientace PDF")?.value).toBe("portrait");
    await select("Orientace PDF", "landscape");
    expect(mocks.pdf.mock.calls.at(-1)![0].orientation).toBe("landscape");
    expect(field("Orientace PDF")?.value).toBe("landscape");
    expect(mocks.getDocument.mock.calls.at(-1)![0].data).toEqual(new TextEncoder().encode("landscape"));
    const dialog = container.querySelector('[role="dialog"]')!;
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[class*="primary"]')!.click());
    expect(await (vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob).text()).toBe("landscape");
    mocks.pdf.mockRejectedValueOnce(new Error("Náhled nelze aktualizovat."));
    await select("Orientace PDF", "portrait");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Náhled nelze aktualizovat");
    expect(field("Orientace PDF")?.value).toBe("landscape");
    await click("Zavřít dialog"); await click("Stáhnout PDF");
    expect(mocks.pdf.mock.calls.at(-1)![0].orientation).toBe("landscape");
    await click("Náhled PDF");
    expect(field("Orientace PDF")?.value).toBe("landscape");
  });

  it("does not reopen a preview closed while its orientation is updating", async () => {
    await fill(); await click("Náhled PDF");
    let finish!: (blob: Blob) => void;
    mocks.pdf.mockReturnValueOnce(new Promise<Blob>(resolve => { finish = resolve; }));
    await select("Orientace PDF", "landscape");
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
    expect(dialog.querySelector<HTMLButtonElement>('button[class*="primary"]')!.disabled).toBe(true);
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    await click("Zavřít dialog");
    await act(async () => finish(new Blob(["landscape"])));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not persist client data to browser storage and clears the workspace on account changes", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem"); await fill();
    expect(local).not.toHaveBeenCalled();
    await act(async () => { mocks.auth.currentUser = { uid: "second", email: "second@example.test" }; mocks.onAuth(mocks.auth.currentUser); });
    expect(field("Jméno klienta")?.value).toBe("");
    await act(async () => { mocks.auth.currentUser = null; mocks.onAuth(null); });
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toContain("Žaneta");
  });

  it("discards an in-flight export after sign-out", async () => {
    await fill(); let finish!: (blob: Blob) => void;
    mocks.pdf.mockReturnValueOnce(new Promise<Blob>(resolve => { finish = resolve; }));
    await click("Náhled PDF");
    await act(async () => { mocks.auth.currentUser = null; mocks.onAuth(null); });
    await act(async () => finish(new Blob(["private pdf"])));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Náhled srovnání v PDF"]')).toBeNull();
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("saves and reopens an editable file, including rows and notes", async () => {
    await fill(); await enter("Poznámky a doporučení", "Poznámka uložená v konceptu.");
    await click("Uložit koncept");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const raw = await blob.text();
    await click("Nové srovnání"); await click("Vytvořit prázdné srovnání");
    expect(field("Jméno klienta")?.value).toBe("");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(input, "files", { value: [new File([raw], "srovnani.bohemika.json", { type: "application/json" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field("Jméno klienta")?.value).toBe("Žaneta");
    expect(field("Invalidita — Navrhované řešení")?.value).toBe("2 000 000 Kč");
    expect(field("Poznámky a doporučení")?.value).toBe("Poznámka uložená v konceptu.");
  });

  it("keeps manually edited contact fields when a slower profile response arrives", async () => {
    await act(async () => root.unmount());
    let finish!: (value: unknown) => void;
    mocks.profile.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    root = createRoot(container); await act(async () => root.render(<ComparisonPage />));
    await enter("Jméno poradce", "Moje upravené jméno");
    await act(async () => finish({ profile: { fullName: "Původní jméno", phone: "777123456" } }));
    expect(field("Jméno poradce")?.value).toBe("Moje upravené jméno");
    expect(field("Telefon")?.value).toBe("777123456");
  });

  it("offers the four insurance types and captures different death-cover parameters for each contract", async () => {
    expect(Array.from((field("Druh pojištění") as HTMLSelectElement).options).map(option => option.text)).toEqual([
      "Vyber druh pojištění", "Pojištění vozidel", "Pojištění majetku a odpovědnosti", "Životní pojištění", "Pojištění odpovědnosti zaměstnance",
    ]);
    await fill(); await select("Druh pojištění", "life"); await select("Typ položky 1", "death");
    await enter("Pojistná částka (Kč) — Smrt — Současná smlouva", "1 000 000");
    await select("Průběh pojistné částky — Smrt — Současná smlouva", "constant");
    await enter("Pojistná částka (Kč) — Smrt — Navrhované řešení", "2 000 000");
    await select("Průběh pojistné částky — Smrt — Navrhované řešení", "loan");
    await enter("Úrok z úvěru (%) — Smrt — Navrhované řešení", "4,5");
    await click("Stáhnout PDF");
    const doc = mocks.pdf.mock.calls[0][0].doc;
    expect(doc.insuranceType).toBe("life"); expect(doc.rows[0].coverage).toBe("death");
    expect(doc.rows[0].cells[doc.offers[0].id].details).toMatchObject({ amount: "1 000 000", amountType: "constant" });
    expect(doc.rows[0].cells[doc.offers[1].id].details).toMatchObject({ amount: "2 000 000", amountType: "loan", interestRate: "4,5" });
    expect(doc.rows[0].cells[doc.offers[1].id].text).toBe("2 000 000 Kč");
  });

  it("keeps hidden disability amounts when switching degrees and gives added offers empty parameters", async () => {
    await select("Druh pojištění", "life"); await click("Přidat: Invalidita");
    await select("Stupně invalidity — Invalidita — Současná smlouva", "123");
    for (const [degree, amount] of [["I.", "500 000"], ["II.", "1 000 000"], ["III.", "2 000 000"]]) await enter(`${degree} stupeň (Kč) — Invalidita — Současná smlouva`, amount);
    await select("Stupně invalidity — Invalidita — Současná smlouva", "3");
    expect(field("I. stupeň (Kč) — Invalidita — Současná smlouva")).toBeFalsy();
    await select("Stupně invalidity — Invalidita — Současná smlouva", "123");
    expect(field("I. stupeň (Kč) — Invalidita — Současná smlouva")?.value).toBe("500 000 Kč");
    await select("Stupně invalidity — Invalidita — Navrhované řešení", "23");
    expect(field("I. stupeň (Kč) — Invalidita — Navrhované řešení")).toBeFalsy();
    await click("Přidat nabídku");
    expect(field("Stupně invalidity — Invalidita — Nabídka 2")?.value).toBe("");
    await click("Duplikovat řádek 1"); await enter("Název položky 2", "Další invalidita");
    await enter("I. stupeň (Kč) — Další invalidita — Současná smlouva", "900 000");
    expect(field("I. stupeň (Kč) — Invalidita — Současná smlouva")?.value).toBe("500 000 Kč");
  });

  it("offers the comparator progressions and exact injury thresholds, and retains them through file reopening", async () => {
    await select("Druh pojištění", "life"); await click("Přidat: Trvalé následky úrazu");
    const context = "Trvalé následky úrazu — Navrhované řešení";
    const options = Array.from((field(`Progrese — ${context}`) as HTMLSelectElement).options).map(option => option.text);
    for (const label of ["4× progrese", "5× progrese", "TOP progrese 5×", "6× progrese", "8× progrese", "8,5× progrese", "10× progrese"]) expect(options).toContain(label);
    await select(`Progrese — ${context}`, "8.5x"); await select(`Plnění od — ${context}`, "0.001");
    await enter(`Pojistná částka (Kč) — ${context}`, "500 000");
    await click("Uložit koncept");
    const raw = await (vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob).text();
    await click("Nové srovnání"); await click("Vytvořit prázdné srovnání");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { Object.defineProperty(input, "files", { value: [new File([raw], "zivot.json")] }); input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(field("Druh pojištění")?.value).toBe("life");
    expect(field(`Progrese — ${context}`)?.value).toBe("8.5x");
    expect(field(`Plnění od — ${context}`)?.value).toBe("0.001");
    expect(field(`Pojistná částka (Kč) — ${context}`)?.value).toBe("500 000 Kč");
  });

  it("keeps rows when the insurance category changes and converts structured values into custom text with undo", async () => {
    await select("Druh pojištění", "life"); await click("Přidat: Terminální stadium");
    const context = "Terminální stadium — Současná smlouva";
    await enter(`Pojistná částka (Kč) — ${context}`, "200 000");
    await select("Druh pojištění", "employee");
    expect(field(`Pojistná částka (Kč) — ${context}`)?.value).toBe("200 000 Kč");
    await select("Typ položky 1", "custom");
    expect(field(context)?.value).toContain("Pojistná částka: 200 000 Kč");
    await click("Vrátit změnu");
    expect(field(`Pojistná částka (Kč) — ${context}`)?.value).toBe("200 000 Kč");
  });
});
