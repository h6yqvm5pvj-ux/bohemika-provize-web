// @vitest-environment happy-dom
// @vitest-environment-options {"url":"http://localhost:3000/"}

import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveMocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./useContractSave", () => ({ useContractSave: () => saveMocks.save }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/app/firebase", () => ({ auth: { currentUser: { uid: "test-adviser", email: "adviser@example.test" } } }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (auth: { currentUser: unknown }, callback: (user: unknown) => void) => { callback(auth.currentUser); return () => {}; } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn(async () => ({ ok: true, profile: {}, contracts: [], names: [] })) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./calculatorApi", async importOriginal => ({
  ...await importOriginal<typeof import("./calculatorApi")>(),
  requestManagerSnapshotWithAuth: vi.fn(async () => ({ managerEmail: null, managerPosition: null, managerMode: null, managerChain: [] })),
}));
vi.mock("./calculatorPdfImport", async importOriginal => ({
  ...await importOriginal<typeof import("./calculatorPdfImport")>(),
  detectProductFromPdfLazy: vi.fn(async () => ({ product: "cppAuto", confidence: "high", reason: "Synthetic product detection" })),
  parseContractPdfByProduct: vi.fn(async () => ({ contractNumber: "TEST-123", amount: 1899.5, frequency: "annual" })),
  parseMaxCizinKomplexPdfLazy: vi.fn(async () => null),
}));

import CalculatorPage from "./page";
import { formatMoneyResult } from "./calculatorHelpers";
import { calculateNeon } from "../lib/productFormulas/neon";
import { StatementCalculatorIframePanel } from "../_provizni-vypisy/StatementEmbeddedModals";
import { statementCalculatorPrefill } from "../_provizni-vypisy/statementPresentation";
import { resolveStatementProduct } from "../_provizni-vypisy/statementParsing";
import { detectProductFromPdfLazy, parseContractPdfByProduct } from "./calculatorPdfImport";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { publishStatementCalculatorDraft, receiveStatementCalculatorDraft, statementCalculatorDraftAccount } from "@/app/lib/statementCalculatorHandoff";

describe("statement prefill in the contract calculator", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    saveMocks.save.mockReset().mockResolvedValue({ ok: true, entryId: "investment-entry", linkedRefreshOriginal: false,
      linkedRefreshOriginalEntryId: null, pdfAttachment: { status: "uploaded" } });
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {}, contracts: [], names: [] });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
    window.localStorage.clear();
    vi.mocked(detectProductFromPdfLazy).mockReset().mockResolvedValue({ product: "cppAuto", confidence: "high", reason: "Synthetic product detection" });
    vi.mocked(parseContractPdfByProduct).mockReset().mockResolvedValue({ contractNumber: "TEST-123", amount: 1899.5, frequency: "annual" });
  });

  const enterText = (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const waitForContractLookup = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });

  it("recalculates NEON with the selected coefficients only in commission preview", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {
      commissionMode: "standard",
      positionTimeline: [{ position: "poradce7", validFrom: "2020-01-01", validTo: null }],
    }, contracts: [], names: [] });
    const signedDate = "2026-11-17";
    const params = new URLSearchParams({ prefill: "commission-statement", product: "neon",
      contractSignedDate: signedDate, amount: "2450", frequency: "monthly" });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));

    const modeButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Režim kalkulačky"] button')]
      .find((button) => button.textContent === label)!;
    const coefficientSelect = () => [...container.querySelectorAll("label")]
      .find((label) => label.textContent?.startsWith("Sada koeficientů"))?.querySelector("select");
    const changeSelection = (select: HTMLSelectElement, value: string) => act(async () => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const results = () => container.querySelector('[aria-label="Výsledky výpočtu provizí"]')?.textContent;
    const thirdYearCommission = (date: string) => formatMoneyResult(
      calculateNeon(2450, "poradce7", 17, "standard", date).items.find(({ code }) => code === "B3601")?.amount,
    );
    const current = thirdYearCommission(signedDate);
    const historical = thirdYearCommission("2024-06-30");

    expect(coefficientSelect()).toBeUndefined();
    await act(async () => modeButton("Kalkulačka provizí").click());
    await enterText(container.querySelector<HTMLInputElement>('[aria-label="Doba trvání smlouvy v letech"]')!, "17");
    await changeSelection(container.querySelector<HTMLSelectElement>('[aria-label="Pozice"]')!, "poradce7");
    const standardMode = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent?.trim() === "Běžná")!;
    await act(async () => standardMode.click());
    expect(results()).toContain(current);

    await changeSelection(coefficientSelect()!, "historical");
    expect(results()).toContain(historical);
    expect(results()).not.toContain(current);
    expect(container.textContent).toContain("Historický NEON bez režimu");

    await changeSelection(coefficientSelect()!, "");
    expect(results()).toContain(current);
    await changeSelection(coefficientSelect()!, "historical");
    await act(async () => modeButton("Přidat smlouvu").click());
    expect(coefficientSelect()).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>('[aria-label="Datum sjednání smlouvy"]')?.value).toBe(signedDate);
    expect(results()).toContain(current);
    expect(results()).not.toContain(historical);
  });

  it("prefills the name from the exact original Neon contract after an unreadable PDF", async () => {
    const number = "9400001234";
    const original = { id: "original", entryType: "contract", productKey: "neon",
      userEmail: "adviser@example.test", contractNumber: number, clientName: "Jana Testovací" };
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async (_user, url, init) => {
      if (url === "/api/contracts/find") {
        const [{ q, scope }] = JSON.parse(String(init?.body)).requests;
        expect(scope).toBe("my");
        const contracts = q === number ? [original, { ...original, id: "amendment", entryType: "endorsement", clientName: "Jméno v dodatku" }]
          : [{ ...original, userEmail: "other@example.test", contractNumber: q }, { ...original, contractNumber: `${q}1` },
            { ...original, productKey: "flexi", contractNumber: q }];
        return { results: [{ ok: true, contracts }] };
      }
      return { ok: true, profile: {}, contracts: [], names: [] };
    });
    window.history.replaceState(null, "", "/kalkulacka?prefill=commission-statement&product=neon");
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue(null);
    vi.mocked(parseContractPdfByProduct).mockResolvedValue(null);
    const pdfInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(pdfInput, "files", { value: [new File(["synthetic"], "scan.pdf", { type: "application/pdf" })] });
    await act(async () => pdfInput.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.textContent).toContain("údaje prosím doplň ručně");

    const contractNumber = container.querySelector<HTMLInputElement>('[aria-label="Číslo smlouvy"]')!;
    const client = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await enterText(contractNumber, "940000 1234");
    await waitForContractLookup();
    expect(client.value).toBe("Jana Testovací");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Datum sjednání smlouvy"]')?.value).toBe("");

    await enterText(contractNumber, "9400005678");
    expect(client.value).toBe("");
    await waitForContractLookup();
    expect(client.value).toBe("");
  });

  it("keeps a manually entered name and ignores late Neon lookups for a previous number", async () => {
    const first = "9400001234", second = "9400005678";
    function response(number: string, clientName: string) {
      return { results: [{ ok: true, contracts: [{ id: number, entryType: "contract", productKey: "neon",
        userEmail: "adviser@example.test", contractNumber: number, clientName }] }] };
    }
    let finishOldLookup: ((value: ReturnType<typeof response>) => void) | undefined;
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async (_user, url, init) => {
      if (url === "/api/contracts/find") {
        const [{ q }] = JSON.parse(String(init?.body)).requests;
        if (q === first) return new Promise(resolve => { finishOldLookup = resolve; });
        return response(q, "Petr Testovací");
      }
      return { ok: true, profile: {}, contracts: [], names: [] };
    });
    window.history.replaceState(null, "", "/kalkulacka?prefill=commission-statement&product=neon");
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    const contractNumber = container.querySelector<HTMLInputElement>('[aria-label="Číslo smlouvy"]')!;
    const client = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await enterText(contractNumber, first);
    await waitForContractLookup();
    expect(finishOldLookup).toBeDefined();
    await enterText(contractNumber, second);
    await waitForContractLookup();
    expect(client.value).toBe("Petr Testovací");
    await act(async () => finishOldLookup?.(response(first, "Jana Testovací")));
    expect(client.value).toBe("Petr Testovací");

    await enterText(client, "Ručně Zadaný");
    await enterText(contractNumber, "9400009101");
    await waitForContractLookup();
    expect(client.value).toBe("Ručně Zadaný");
  });

  it.each([
    ["investikaRealitniFond", true], ["investikaEfektika", true], ["investikaMonetika", false],
    ["conseqInvest", false],
  ] as const)("offers PDF attachments and the applicable DIP switch for %s", async (product, dipAvailable) => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {
      positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }],
    }, contracts: [], names: [] });
    const params = new URLSearchParams({ prefill: "commission-statement", product,
      clientName: "Jan Testovací", contractNumber: "TEST-123", contractSignedDate: "2026-11-17" });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    expect(container.querySelector('[aria-label="Částka"]')).toBeNull();
    expect(container.querySelector('[aria-label="Datum počátku smlouvy"]')).toBeNull();
    expect(container.querySelector('[aria-label="Datum storna (volitelné)"]')).toBeNull();
    expect(container.textContent).not.toContain("Zobrazit koeficienty");
    const dip = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="DIP"]');
    expect(Boolean(dip)).toBe(dipAvailable);
    if (dip) {
      expect(dip.closest("section")?.querySelector("h2")?.textContent).toContain("Detaily smlouvy");
      expect(dip.getAttribute("aria-checked")).toBe("false");
      await act(async () => dip.click());
      expect(dip.getAttribute("aria-checked")).toBe("true");
    }
    const pdf = new File(["synthetic pdf"], "investment.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).not.toBeNull();
    Object.defineProperty(input, "files", { value: [pdf], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(vi.mocked(detectProductFromPdfLazy)).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jan Testovací");
    const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Uložit jako sepsáno"))!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    expect(document.body.textContent).not.toContain("Produkt zdarma");
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Souhlasí"))!;
    expect(confirm).toBeDefined();
    await act(async () => confirm.click());
    expect(saveMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({ productKey: product, isDip: dipAvailable, inputAmount: 0,
        policyStartDate: "2026-11-17", stornoDate: null, status: "active" }), pdfFile: pdf,
    }));
  });

  it("limits the statement draft to the signed-in account and selected adviser", async () => {
    const id = crypto.randomUUID();
    const owner = { id, getAccount: () => "test-scope" };
    const details = new URLSearchParams({ contractNumber: "INV-123" });
    const release = publishStatementCalculatorDraft(owner, details);
    const received = vi.fn();
    const otherAccount = vi.fn();
    const anonymous = vi.fn();
    const stopOther = receiveStatementCalculatorDraft({ id, getAccount: () => "other-scope" }, otherAccount);
    const stopOwner = receiveStatementCalculatorDraft(owner, received);
    try {
      receiveStatementCalculatorDraft({ id, getAccount: () => null }, anonymous);
      expect(anonymous).toHaveBeenCalledExactlyOnceWith(null);
      const invalid = vi.fn();
      receiveStatementCalculatorDraft({ ...owner, id: "invalid" }, invalid);
      expect(invalid).toHaveBeenCalledExactlyOnceWith(null);
      await vi.waitFor(() => expect(received).toHaveBeenCalledExactlyOnceWith(details));
      expect(otherAccount).not.toHaveBeenCalled();
    } finally {
      stopOwner();
      stopOther();
      release?.();
    }
  });

  it.each(["investikaRealitniFond", "neon", "domexneuron"])("queues %s with the complete calculator payload without saving immediately", async product => {
    const postMessage = vi.fn();
    const parentGetter = vi.spyOn(window, "parent", "get").mockReturnValue({ postMessage } as unknown as Window);
    try {
      vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {
        positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }],
      }, contracts: [], names: [] });
      const params = new URLSearchParams({ prefill: "commission-statement", product,
        cppA101QueueEligible: "1", clientName: "Jan Testovací", contractNumber: "QUEUE-123",
        contractSignedDate: "2026-11-17", policyStartDate: "2026-11-17", amount: "1000", frequency: "monthly" });
      window.history.replaceState(null, "", `/kalkulacka?${params}`);
      await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
      const queue = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Přidat do fronty"));
      expect(queue).toBeDefined();
      await act(async () => queue!.click());
      expect(saveMocks.save).not.toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        product, contractNumber: "QUEUE-123", contractEntry: expect.objectContaining({
          productKey: product, entryType: "contract", contractNumber: "QUEUE-123",
        }),
      }), window.location.origin);
    } finally {
      parentGetter.mockRestore();
    }
  });

  it("allows saving the free trailer product without premium, frequency, coefficients or commission items", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {
      positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }],
    }, contracts: [], names: [] });
    const params = new URLSearchParams({ prefill: "commission-statement", product: "cppAutoVozikZdarma",
      clientName: "Jan Testovací", contractNumber: "TEST-123", contractSignedDate: "2026-11-17", policyStartDate: "2026-11-17" });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    expect(container.textContent).toContain("ČPP Auto / Vozík ZDARMA");
    expect(container.textContent).not.toContain("Pojistné se nezadává a provize se nepočítá");
    expect(container.textContent).not.toContain("Nastavení provize");
    expect(container.querySelector('[aria-label="Pozice"]')).toBeNull();
    expect(container.querySelector('[aria-label="Částka"]')).toBeNull();
    expect(container.querySelector('[aria-label="Frekvence platby"]')).toBeNull();
    expect(container.textContent).not.toContain("Zobrazit koeficienty");
    expect(container.textContent).not.toContain("Tady uvidíš svou provizi");
    const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Uložit jako sepsáno"));
    expect(save).toBeDefined();
    expect(save?.disabled).toBe(false);
  });

  it.each(["found", "not-found", "no-number"] as const)("saves a FLEXI renovation from an imported PDF (%s)", async scenario => {
    const profile = { positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }] };
    const oldNumber = "1420000011";
    const found = scenario === "found";
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async (_user, url) => {
      if (url === "/api/contracts/original-exists") return { ok: true, exists: found, matchesProduct: found };
      if (url === "/api/contracts/find") return { ok: true, results: [{ ok: true, contracts: [{
        contractNumber: oldNumber, productKey: "flexi", userEmail: "adviser@example.test",
        inputAmount: 1000, policyStartDate: "2024-01-01",
      }] }] };
      return { ok: true, profile, contracts: [], names: [] };
    });
    const params = new URLSearchParams({ prefill: "commission-statement", product: "flexi", clientName: "Testovací Klient",
      contractNumber: "1400000089", contractSignedDate: "2026-11-12", policyStartDate: "2026-12-01" });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue({ product: "flexi", confidence: "high", reason: "Synthetic FLEXI renovation" });
    vi.mocked(parseContractPdfByProduct).mockResolvedValue({ isRefresh: true,
      refreshOriginalContractNumber: scenario === "no-number" ? null : oldNumber,
      contractNumber: "1400000089", clientName: "Testovací Klient", contractSignedDate: "2026-11-12",
      policyStartDate: "2026-12-01", amount: 1500, frequency: "monthly", durationYears: 25 });
    const pdf = new File(["synthetic pdf"], "flexi-renovation.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [pdf], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));

    const checkbox = [...container.querySelectorAll("label")]
      .find(label => label.textContent?.includes("Chybí podklady pro výpočet provize"))?.querySelector("input");
    expect(checkbox).toBeDefined();
    if (scenario !== "no-number") {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
    }
    expect(checkbox?.checked).toBe(!found);
    if (found) {
      expect(container.textContent).toContain("Doplněno původní pojistné a navýšení");
      expect(container.querySelector<HTMLSelectElement>("select")?.textContent).toBeDefined();
      expect(container.textContent).toContain("Neověřeno – orientačně s 50 %");
    } else {
      expect(container.textContent).toContain("Provizi nelze ověřit – chybí základna");
      expect(container.textContent).toContain("Číslo původní smlouvy (nepovinné)");
    }
    const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Uložit jako sepsáno"))!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Souhlasí"))!;
    expect(confirm).toBeDefined();
    await act(async () => confirm.click());
    expect(saveMocks.save).toHaveBeenCalledWith(expect.objectContaining({ pdfFile: pdf,
      entry: expect.objectContaining({ productKey: "flexi", entryType: "contract", isRefresh: true,
        inputAmount: 1500, effectiveInputAmount: 1500, calculationInputAmount: found ? 1000 : null,
        refreshOriginalContractNumber: scenario === "no-number" ? null : oldNumber,
        ...(found
          ? { flexiRenovation: { originalMonthlyPremium: 1000, premiumIncreaseMonthly: 500, guaranteeStatus: "unknown" } }
          : { flexiRenovation: null, flexiRenovationWithoutBase: true }),
      }),
    }));
  });

  it("prepares a FLEXI request as an inline change and saves its PDF with the endorsement", async () => {
    const profile = { positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }] };
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async (_user, url) => {
      if (String(url).startsWith("/api/contracts/find?")) return { ok: true, contracts: [{
        id: "flexi-original", userEmail: "adviser@example.test", productKey: "flexi", contractNumber: "1400000088",
        clientName: "Jana Původní", position: "poradce1", commissionMode: "standard", inputAmount: 1000,
        frequencyRaw: "monthly", durationYears: 30, contractSignedDate: "2020-01-01", policyStartDate: "2020-01-01",
      }] };
      return { ok: true, profile, contracts: [], names: [] };
    });
    const params = new URLSearchParams({ prefill: "commission-statement", product: "cppAuto", clientName: "Jiný Klient",
      contractNumber: "OLD123", contractSignedDate: "2026-10-01", policyStartDate: "2026-11-01", amount: "999", frequency: "annual" });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue({ product: "flexi", confidence: "high", reason: "Synthetic FLEXI change" });
    vi.mocked(parseContractPdfByProduct).mockResolvedValue({ isEndorsement: true, contractNumber: "1400000088",
      clientName: "Jana Testovací", contractSignedDate: "2026-11-12", policyStartDate: "2026-12-01", amount: 1400, frequency: "monthly" });
    const pdf = new File(["synthetic pdf"], "flexi-change.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [pdf], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.textContent).toContain("Připravená změna");
    expect(container.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jana Původní");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Datum počátku smlouvy"]')?.value).toBe("2026-12-01");
    const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Uložit dodatek jako sepsáno"))!;
    expect(save).toBeDefined();
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Souhlasí"))!;
    expect(confirm).toBeDefined();
    await act(async () => confirm.click());
    expect(saveMocks.save).toHaveBeenCalledWith(expect.objectContaining({ pdfFile: pdf,
      entry: expect.objectContaining({ productKey: "flexi", entryType: "endorsement", parentContractEntryId: "flexi-original",
        clientName: "Jana Původní", contractSignedDate: "2026-11-12", policyStartDate: "2026-12-01",
        inputAmount: 400, previousInputAmount: 1000, newInputAmount: 1400, frequencyRaw: "monthly" }),
    }));
  });

  it("opens a batch FLEXI renovation with a missing original number in the no-base mode", async () => {
    const profile = { positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }] };
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile, contracts: [], names: [] });
    window.history.replaceState(null, "", "/kalkulacka?prefill=commission-statement&product=flexi&contractNumber=1400000089");
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue({ product: "flexi", confidence: "high", reason: "Synthetic FLEXI renovation" });
    vi.mocked(parseContractPdfByProduct).mockResolvedValue({ isRefresh: true,
      contractNumber: "1400000089", clientName: "Testovací Klient", contractSignedDate: "2026-11-12",
      policyStartDate: "2026-12-01", amount: 1500, frequency: "monthly", durationYears: 25 });
    const files = ["one.pdf", "two.pdf"].map(name => new File(["synthetic pdf"], name, { type: "application/pdf" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const review = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Zkontrolovat"));
    expect(review).toBeDefined();
    await act(async () => review!.click());
    expect(container.textContent).toContain("Provizi nelze ověřit – chybí základna");
    expect(saveMocks.save).not.toHaveBeenCalled();
  });

  it("skips change requests in a batch instead of saving them as original policies", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, profile: {
      positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }],
    }, contracts: [], names: [] });
    window.history.replaceState(null, "", "/kalkulacka?prefill=commission-statement&product=flexi&contractNumber=TEST123");
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue({ product: "flexi", confidence: "high", reason: "Synthetic FLEXI change" });
    vi.mocked(parseContractPdfByProduct).mockResolvedValue({ isEndorsement: true });
    const files = ["one.pdf", "two.pdf"].map(name => new File(["synthetic pdf"], name, { type: "application/pdf" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.textContent).toContain("Žádost o změnu nahraj samostatně");
    expect(saveMocks.save).not.toHaveBeenCalled();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it.each([
    "INVESTIKA", "EFEKTIKA", "MONETIKA", "CPP_ACPIV", "CPP_N_LIFE", "CPP_DOMX", "MAX_CIZIN", "CPP_CS6",
  ])("prefills the %s calculator while keeping client details out of both panel URLs", async code => {
    const prefill = statementCalculatorPrefill({
      product: resolveStatementProduct(code),
      clientName: "Testovací Jan",
      contractNumber: "TEST-123",
      signedAt: "01.09.2026",
      validFrom: "02.09.2026",
      statementBase: 1899.5,
    })!;
    const handoff = { id: crypto.randomUUID(), getAccount: () => statementCalculatorDraftAccount("test-adviser") };
    await act(async () => root.render(
      <StatementCalculatorIframePanel handoff={handoff} prefill={prefill} onClose={() => {}} />
    ));
    const href = `/kalkulacka?prefill=commission-statement&statementDraft=${handoff.id}`;
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(href);
    expect(container.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe(href);

    const calculatorContainer = document.createElement("div");
    const calculatorRoot = createRoot(calculatorContainer);
    try {
      const api = vi.mocked(fetchAuthedJsonOrThrow).mockClear();
      window.history.replaceState(null, "", href);
      await act(async () => calculatorRoot.render(<StrictMode><CalculatorPage /></StrictMode>));
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(calculatorContainer.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jan Testovací");
      });
      expect(calculatorContainer.querySelector<HTMLInputElement>('[aria-label="Číslo smlouvy"]')?.value).toBe("TEST-123");
      expect(calculatorContainer.querySelector<HTMLInputElement>('[aria-label="Datum sjednání smlouvy"]')?.value).toBe("2026-09-01");
      if (prefill.amountText) {
        expect([...calculatorContainer.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => input.value)).toContain("2026-09-02");
        const amount = calculatorContainer.querySelector<HTMLInputElement>('[aria-label="Částka"], [aria-label="Měsíční pojistné"]');
        expect(amount?.value).toBe(prefill.amountText);
      } else {
        expect(calculatorContainer.querySelector('[aria-label="Částka"]')).toBeNull();
      }
      await waitForContractLookup();
      const lookup = api.mock.calls.find(([, url]) => url === "/api/contracts/find");
      expect(lookup?.[2]?.method).toBe("POST");
      expect(JSON.parse(String(lookup?.[2]?.body)).requests).toEqual([
        expect.objectContaining({ q: prefill.contractNumber }),
      ]);
      expect(api.mock.calls.some(([, url]) => String(url).includes(prefill.contractNumber))).toBe(false);
      expect(saveMocks.save).not.toHaveBeenCalled();
    } finally {
      await act(async () => calculatorRoot.unmount());
    }
  });

  it("keeps the statement identity when a PDF for the same contract has unreadable client and date fields", async () => {
    const params = new URLSearchParams({
      prefill: "commission-statement", product: "cppAuto", clientName: "Jan Testovací", contractNumber: "TEST-123",
      contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02", amount: "1899.5", frequency: "annual",
    });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["synthetic pdf"], "test.pdf", { type: "application/pdf" })], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jan Testovací");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => input.value)).toContain("2026-09-01");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => input.value)).toContain("2026-09-02");
  });

  it.each(["ready", "pending", "clear", "failed"])("uses the vehicle check started by the PDF when saving (%s)", async timing => {
    const profile = { positionTimeline: [{ position: "poradce1", validFrom: "2020-01-01", validTo: null }] };
    const result = { matches: [{ ownerEmail: "adviser@example.test", entryId: "prior-policy", productKey: "pillowAuto",
      contractNumber: "PRIOR-123", plate: "7Z91234", matchedBy: "plate-and-vin", vinMismatch: false,
      policyStart: "2026-01-01", policyEnd: null }], truncated: false };
    let resolvePreview!: (value: typeof result) => void;
    let rejectPreview!: (error: Error) => void;
    const response = new Promise<typeof result>((resolve, reject) => { resolvePreview = resolve; rejectPreview = reject; });
    const lookup = vi.fn(() => response);
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async (_user, url, init) => {
      if (url === "/api/contracts/vehicle-overlaps/preview") {
        expect(init?.method).toBe("POST");
        expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ ownerEmail: "adviser@example.test",
          productKey: "cppAuto", plate: "7Z91234", vin: "TEST1234567890123", contractNumber: "NEW-123",
          policyStart: "2026-12-01", policyEnd: "" });
        return lookup();
      }
      return { ok: true, profile, contracts: [], names: [] };
    });
    vi.mocked(parseContractPdfByProduct).mockResolvedValue({ contractNumber: "NEW-123", clientName: "Jan Testovací",
      contractSignedDate: "2026-11-12", policyStartDate: "2026-12-01", amount: 1900, frequency: "annual",
      carPlate: "7z9-1234", carVin: "test1234567890123" });
    window.history.replaceState(null, "", "/kalkulacka?prefill=commission-statement&product=cppAuto");
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    const pdf = new File(["synthetic pdf"], "car-policy.pdf", { type: "application/pdf" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [pdf], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.textContent).toContain("Kontroluji shodu SPZ a VIN");
    await waitForContractLookup();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(saveMocks.save).not.toHaveBeenCalled();
    if (timing === "ready") await act(async () => resolvePreview(result));
    if (timing === "clear") await act(async () => resolvePreview({ ...result, matches: [] }));

    const save = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Uložit jako sepsáno"))!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Souhlasí"))!;
    expect(document.body.textContent).toContain(timing === "ready" ? "Pillow Auto č. PRIOR-123"
      : timing === "clear" ? "nebyla nalezena shoda" : "Kontroluji shodu SPZ a VIN");
    await act(async () => confirm.click());
    expect(saveMocks.save).toHaveBeenCalledWith(expect.objectContaining({ pdfFile: pdf }));
    if (timing === "pending" || timing === "failed") {
      expect(document.body.textContent).toContain("Dokončuji kontrolu SPZ a VIN");
      expect(container.textContent).not.toContain("Smlouva byla uložena mezi sepsané");
      await act(async () => {
        if (timing === "failed") rejectPreview(new Error("Synthetic timeout"));
        else resolvePreview(result);
      });
    }
    expect(document.body.textContent).not.toContain("Dokončuji kontrolu SPZ a VIN");
    expect(container.textContent).toContain("Smlouva byla uložena mezi sepsané");
    if (timing === "failed") expect(container.textContent).toContain("Kontrolu shody SPZ a VIN se nepodařilo dokončit");
    else if (timing === "clear") expect(container.textContent).toContain("nebyla nalezena shoda");
    else expect(container.querySelector("dialog[open]")?.textContent).toContain("Pillow Auto č. PRIOR-123");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each(["unreadable", "empty", "partial", "failed"])("keeps statement fields after importing a scan whose parser result is %s", async outcome => {
    vi.mocked(detectProductFromPdfLazy).mockResolvedValue(null);
    if (outcome === "failed") vi.mocked(parseContractPdfByProduct).mockRejectedValue(new Error("Synthetic scan read failure"));
    else vi.mocked(parseContractPdfByProduct).mockResolvedValue(outcome === "unreadable" ? null
      : outcome === "empty" ? {} : { clientName: "Neověřené jméno z OCR", amount: 9999 });
    const params = new URLSearchParams({
      prefill: "commission-statement", product: "cppAuto", clientName: "Jan Testovací", contractNumber: "TEST-123",
      contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02", amount: "1899.5", frequency: "annual",
    });
    window.history.replaceState(null, "", `/kalkulacka?${params}`);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["synthetic scan"], "scan.pdf", { type: "application/pdf" })], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jan Testovací");
    const values = [...container.querySelectorAll<HTMLInputElement>("input")].map(input => input.value);
    expect(values).toContain("TEST-123");
    expect(values).toContain("2026-09-01");
    expect(values).toContain("2026-09-02");
    expect(values).toContain("1899.5");
    expect(container.textContent).toContain("PDF");
  });
});
