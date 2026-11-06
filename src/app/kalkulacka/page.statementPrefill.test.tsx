// @vitest-environment happy-dom
// @vitest-environment-options {"url":"http://localhost:3000/"}

import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/app/firebase", () => ({ auth: { currentUser: { uid: "test-adviser", email: "adviser@example.test" } } }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (auth: { currentUser: unknown }, callback: (user: unknown) => void) => { callback(auth.currentUser); return () => {}; } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn(async () => ({ ok: true, profile: {}, contracts: [], names: [] })) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
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
import { StatementCalculatorIframePanel } from "../_provizni-vypisy/StatementEmbeddedModals";
import { statementCalculatorPrefill } from "../_provizni-vypisy/statementPresentation";
import { resolveStatementProduct } from "../_provizni-vypisy/statementParsing";
import { detectProductFromPdfLazy, parseContractPdfByProduct } from "./calculatorPdfImport";

describe("statement prefill in the contract calculator", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
    window.localStorage.clear();
    vi.mocked(detectProductFromPdfLazy).mockReset().mockResolvedValue({ product: "cppAuto", confidence: "high", reason: "Synthetic product detection" });
    vi.mocked(parseContractPdfByProduct).mockReset().mockResolvedValue({ contractNumber: "TEST-123", amount: 1899.5, frequency: "annual" });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it.each(["CPP_ACPIV", "CPP_N_LIFE", "CPP_DOMX", "MAX_CIZIN", "CPP_CS6"])("fills the actual calculator from the %s statement panel", async productCode => {
    const prefill = statementCalculatorPrefill({ product: resolveStatementProduct(productCode),
      clientName: "Testovací Jan", contractNumber: "TEST-123", signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 1899.5,
    })!;
    await act(async () => root.render(<StatementCalculatorIframePanel prefill={prefill} onClose={() => {}} />));
    const href = container.querySelector("iframe")!.getAttribute("src")!;
    await act(async () => root.render(null));
    window.history.replaceState(null, "", href);
    await act(async () => root.render(<StrictMode><CalculatorPage /></StrictMode>));
    expect(container.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe("Jan Testovací");
    expect([...container.querySelectorAll<HTMLInputElement>("input")].some(input => input.value === "TEST-123")).toBe(true);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => input.value)).toContain("2026-09-01");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => input.value)).toContain("2026-09-02");
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
