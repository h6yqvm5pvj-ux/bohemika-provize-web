// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CppAutoBatchQueue, cppAutoBatchQueueItemFromPrefill, cppAutoBatchQueueItemKey,
  statementBatchQueueContractEntry, validateCppAutoBatchQueueItem } from "./CppAutoBatchQueue";
import { statementCalculatorPrefill } from "./statementPresentation";
import { resolveStatementProduct } from "./statementParsing";
import { StatementCalculatorIframePanel } from "./statementLinksAndCalculator";
import { isStatementBatchQueueAddMessage, isStatementBatchQueueProduct,
  STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE } from "@/app/lib/statementBatchQueue";
import { saveContractEntry } from "../kalkulacka/useContractSave";

const mocks = vi.hoisted(() => ({ requestContractsMutationWithAuth: vi.fn(), getContractsMutationError: vi.fn(), uploadContractPdfAttachmentWithAuth: vi.fn() }));
vi.mock("../kalkulacka/calculatorApi", () => mocks);
const prefill = () => ({ ...statementCalculatorPrefill({
  product: resolveStatementProduct("KOO_NAMIRU"), contractNumber: "1234567890", clientName: "Novák Jan",
  signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 12000,
  source: { statementId: "statement-0001", statementNumber: "123", statementPeriod: "září", statementChronologyMs: 123456 },
})!, cppA101QueueEligible: true });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getContractsMutationError.mockReturnValue(null);
  mocks.requestContractsMutationWithAuth.mockResolvedValue({ response: new Response(null, { status: 200 }), data: { entryId: "entry-1" } });
  mocks.uploadContractPdfAttachmentWithAuth.mockResolvedValue(undefined);
});

describe("Kooperativa in the commission statement queue", () => {
  it("preserves the product and statement premium through form, queue and authenticated save with PDF", async () => {
    const source = prefill();
    expect(source).toMatchObject({ product: "kooperativaAuto", sourceProductCode: "KOO_NAMIRU", clientName: "Jan Novák", amountText: "12000" });
    const file = new File(["synthetic PDF"], "kooperativa.pdf", { type: "application/pdf" });
    expect(isStatementBatchQueueProduct(source.product)).toBe(true);
    expect(isStatementBatchQueueAddMessage({ ...source, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", pdfFile: file })).toBe(true);
    const item = { ...cppAutoBatchQueueItemFromPrefill(source), pdfFile: file };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(cppAutoBatchQueueItemKey(item)).toBe("kooperativaAuto:1234567890");
    const result = await saveContractEntry({ user: {} as User, ownerEmail: "represented@example.test",
      entry: statementBatchQueueContractEntry(item), pdfFile: item.pdfFile, fallbackError: "Chyba uložení" });
    expect(result).toMatchObject({ ok: true, pdfAttachment: { status: "uploaded" } });
    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      payload: { ownerEmail: "represented@example.test", entry: expect.objectContaining({
        productKey: "kooperativaAuto", inputAmount: 12000, frequencyRaw: source.frequency,
        contractNumber: "1234567890", clientName: "Jan Novák", createdFromCommissionStatement: true,
        createdFromCommissionStatementId: "statement-0001", createdFromCommissionStatementChronologyMs: 123456,
      }) }, idempotencyKey: expect.any(String),
    }));
    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: "represented@example.test", entryId: "entry-1", file }));
  });

  it.each(["cppAuto", "domex", "kooperativaAuto"] as const)("preserves %s instead of coercing it to another insurer", product => {
    const item = cppAutoBatchQueueItemFromPrefill({ ...prefill(), product });
    expect(item.product).toBe(product); expect(statementBatchQueueContractEntry(item).productKey).toBe(product);
  });
  it("rejects unsupported products and invalid message frequency", () => {
    expect(() => cppAutoBatchQueueItemFromPrefill({ ...prefill(), product: "neon" })).toThrow();
    expect(isStatementBatchQueueAddMessage({ ...prefill(), type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", frequency: {} })).toBe(false);
  });
  it("keeps queue identities separate for contracts at different insurers", () => {
    const source = prefill();
    expect(cppAutoBatchQueueItemKey(source)).not.toBe(cppAutoBatchQueueItemKey({ ...source, product: "cppAuto" }));
  });
  it("validates edited values and keeps the selected frequency and cancellation date", () => {
    const item = { ...cppAutoBatchQueueItemFromPrefill(prefill()), amountText: "3 000,50", frequency: "quarterly" as const, stornoDate: "2026-10-01" };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(statementBatchQueueContractEntry(item)).toMatchObject({ inputAmount: 3000.5, frequencyRaw: "quarterly", status: "storno", stornoDate: "2026-10-01" });
    expect(validateCppAutoBatchQueueItem({ ...item, amountText: "0" })).toContain("větší než nula");
  });

  it("enables the calculator's queue flag and shows the correct product in the mixed queue", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); // Detached to avoid iframe network requests.
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StatementCalculatorIframePanel prefill={prefill()} onClose={() => {}} />));
      const url = new URL(container.querySelector("iframe")!.getAttribute("src")!, "http://localhost");
      expect(url.searchParams.get("product")).toBe("kooperativaAuto");
      expect(url.searchParams.get("cppA101QueueEligible")).toBe("1");
      expect(url.searchParams.get("prefill")).toBe("commission-statement");
      const onRun = vi.fn();
      const items = [cppAutoBatchQueueItemFromPrefill(prefill()), cppAutoBatchQueueItemFromPrefill({ ...prefill(), product: "cppAuto" })];
      await act(async () => root.render(<CppAutoBatchQueue items={items} isRunning={false} onUpdate={() => {}}
        onRemove={() => {}} onRun={onRun} onClearSaved={() => {}} />));
      expect(container.textContent).toContain("Kooperativa Auto");
      expect(container.textContent).toContain("ČPP Auto");
      const run = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Nahrát frontu"))!;
      await act(async () => run.click()); expect(onRun).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount()); vi.unstubAllGlobals();
    }
  });
});
