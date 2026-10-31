// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculatorPdfFormSetters } from "./calculatorPdfFormTypes";

const mocks = vi.hoisted(() => ({ detect: vi.fn(), parse: vi.fn(), fallback: vi.fn() }));
vi.mock("./calculatorPdfImport", async (importOriginal) => ({
  ...await importOriginal<typeof import("./calculatorPdfImport")>(),
  detectProductFromPdfLazy: mocks.detect,
  parseContractPdfByProduct: mocks.parse,
  parseMaxCizinKomplexPdfLazy: mocks.fallback,
}));

import { importSingleContractPdf } from "./calculatorSinglePdfImport";

type Options = Parameters<typeof importSingleContractPdf>[1];
const parsed = {
  contractNumber: "1234567890", clientName: "Jana Testovací", amount: 704,
  contractSignedDate: "2026-10-01", policyStartDate: "2026-11-01", frequency: "quarterly",
};
const file = () => new File(["synthetic PDF"], "synthetic.pdf", { type: "application/pdf" });

function harness() {
  const values: Record<string, unknown> = {};
  const ui = {
    setPdfParserReportStatus: vi.fn(), setPdfImporting: vi.fn(), setPdfImportError: vi.fn(),
    setPdfImportStatus: vi.fn(), setImportedContractPdfFile: vi.fn(),
    setStatementClientNamePrefillActive: vi.fn(), setPdfClientNameLoaded: vi.fn(),
    setProduct: vi.fn(), setHasSelectedProduct: vi.fn(), setProductPickerSectionForProduct: vi.fn(),
    setClientSuggestionsOpen: vi.fn(), setRefreshOriginalOpen: vi.fn(),
    setRefreshOriginalContractNumber: vi.fn(), setRefreshOriginalMissingInSystem: vi.fn(),
    setRefreshOriginalPdfLookupNumber: vi.fn(), setRefreshOriginalLookup: vi.fn(),
    setEndorsementWorkflowActive: vi.fn(),
  };
  const input = document.createElement("input");
  input.value = "selected";
  const options: Options = {
    product: "cppAuto", hasSelectedProduct: true, isInheritedContractMode: false,
    pdfFormSetters: new Proxy({} as CalculatorPdfFormSetters, {
      get: (_target, key: string) => (value: unknown) => { values[key] = value; },
    }),
    refs: {
      pdfImportAbortRef: { current: null }, pdfImportRunIdRef: { current: 0 },
      pdfParserReportCounts: { current: { pending: 2, sent: 1, failed: 1 } },
      fileInputRef: { current: input },
    },
    ui, handlePrepareEndorsement: vi.fn(async () => true), notifyPdfParserFailure: vi.fn(),
  };
  return { options, ui, values, input };
}

describe("single PDF import workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detect.mockReset().mockResolvedValue({ product: "cppAuto", confidence: "high" });
    mocks.parse.mockReset().mockResolvedValue(parsed);
    mocks.fallback.mockReset().mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in synthetic PDF tests"); }));
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does nothing without a file and leaves the active operation alone", async () => {
    const { options, ui, values } = harness();
    const previous = new AbortController();
    options.refs.pdfImportAbortRef.current = previous;
    await importSingleContractPdf(null, options);
    expect(previous.signal.aborted).toBe(false);
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(ui.setPdfImporting).not.toHaveBeenCalled();
    expect(values).toEqual({});
  });

  it("fills the form, keeps the attachment and releases the busy state and file input", async () => {
    const { options, ui, values, input } = harness();
    const pdf = file();
    await importSingleContractPdf(pdf, options);
    expect(mocks.parse).toHaveBeenCalledWith("cppAuto", pdf, expect.objectContaining({ allowOcr: true, signal: expect.any(AbortSignal) }));
    expect(values).toMatchObject({ contractNumber: "1234567890", clientName: "Jana Testovací", amountText: "704", frequency: "quarterly" });
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfClientNameLoaded).toHaveBeenLastCalledWith(true);
    expect(ui.setPdfImportStatus).toHaveBeenLastCalledWith(expect.stringContaining("Načteno z PDF (5 polí)"));
    expect(ui.setPdfImporting.mock.calls).toEqual([[true], [false]]);
    expect(options.refs.pdfParserReportCounts.current).toEqual({ pending: 0, sent: 0, failed: 0 });
    expect(input.value).toBe("");
    expect(options.notifyPdfParserFailure).toHaveBeenCalledWith(pdf, "cppAuto", parsed, false, expect.any(AbortSignal), expect.any(Function));
  });

  it("selects a detected product before mapping its fields", async () => {
    const { options, ui, values } = harness();
    mocks.detect.mockResolvedValue({ product: "domex", confidence: "high" });
    mocks.parse.mockResolvedValue({ ...parsed, domexAddress: " Testovací 1 " });
    await importSingleContractPdf(file(), options);
    expect(ui.setProduct).toHaveBeenCalledExactlyOnceWith("domex");
    expect(ui.setProductPickerSectionForProduct).toHaveBeenCalledExactlyOnceWith("domex");
    expect(values.domexAddress).toBe("Testovací 1");
  });

  it("uses the selected product after detection fails without logging parser input", async () => {
    const { options, ui } = harness();
    mocks.detect.mockRejectedValue(new Error("Sensitive synthetic client content"));
    await importSingleContractPdf(file(), options);
    expect(mocks.parse).toHaveBeenCalled();
    expect(ui.setPdfImportStatus).toHaveBeenLastCalledWith(expect.stringContaining("použil jsem vybraný produkt"));
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Auto-detekce produktu z PDF selhala");
  });

  it("keeps an unrecognized file available when no product is selected", async () => {
    const { options, ui, input } = harness();
    options.hasSelectedProduct = false;
    mocks.detect.mockResolvedValue(null);
    const pdf = file();
    await importSingleContractPdf(pdf, options);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.stringContaining("Vyber produkt ručně"));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
    expect(input.value).toBe("");
  });

  it("keeps manual-only products attachable without invoking a parser", async () => {
    const { options, ui } = harness();
    options.product = "pillowmajetek";
    mocks.detect.mockResolvedValue(null);
    await importSingleContractPdf(file(), options);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(ui.setPdfImportStatus).toHaveBeenLastCalledWith(expect.stringContaining("PDF"));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
  });

  it("clears old coverage before an unreadable parser result and preserves the attachment", async () => {
    const { options, ui, values } = harness();
    values.autoCarPlate = "PREVIOUS";
    values.autoCarAddonGlass = true;
    mocks.parse.mockResolvedValue(null);
    const pdf = file();
    await importSingleContractPdf(pdf, options);
    expect(values).toMatchObject({ autoCarPlate: "", autoCarAddonGlass: false });
    expect(values).not.toHaveProperty("clientName");
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
  });

  it("allows a successful retry after a failed parser and keeps raw errors out of logs", async () => {
    const { options, ui, values } = harness();
    mocks.parse.mockRejectedValueOnce(new Error("Sensitive synthetic PDF contents"));
    await importSingleContractPdf(file(), options);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
    expect(console.error).toHaveBeenCalledExactlyOnceWith("PDF import selhal");
    await importSingleContractPdf(file(), options);
    expect(values.clientName).toBe("Jana Testovací");
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(null);
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
    expect(options.refs.pdfImportRunIdRef.current).toBe(2);
  });

  it("falls back to the selected product when product detection times out", async () => {
    vi.useFakeTimers();
    const { options, ui } = harness();
    mocks.detect.mockImplementation(() => new Promise(() => {}));
    const running = importSingleContractPdf(file(), options);
    await vi.advanceTimersByTimeAsync(8000);
    await running;
    expect(mocks.parse).toHaveBeenCalled();
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
  });

  it("aborts a parser at its deadline while keeping the PDF available for manual completion", async () => {
    vi.useFakeTimers();
    const { options, ui, input } = harness();
    mocks.parse.mockImplementation(() => new Promise(() => {}));
    const pdf = file();
    const running = importSingleContractPdf(pdf, options);
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled());
    const signal = mocks.parse.mock.calls[0][2].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(15000);
    await running;
    expect(signal.aborted).toBe(true);
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.stringContaining("příliš dlouho"));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
    expect(input.value).toBe("");
  });

  it("does not let an older parser overwrite a newer import or release its busy state", async () => {
    const { options, ui, values } = harness();
    let completeOld!: (value: unknown) => void;
    mocks.parse.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
    mocks.parse.mockResolvedValueOnce({ ...parsed, clientName: "Novější klient" });
    const first = importSingleContractPdf(file(), options);
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.parse.mock.calls[0][2].signal as AbortSignal;
    const newestFile = file();
    await importSingleContractPdf(newestFile, options);
    await first;
    completeOld({ ...parsed, clientName: "Starší klient" });
    await Promise.resolve();
    expect(oldSignal.aborted).toBe(true);
    expect(values.clientName).toBe("Novější klient");
    expect(ui.setPdfImporting.mock.calls).toEqual([[true], [true], [false]]);
    expect(options.notifyPdfParserFailure).toHaveBeenCalledTimes(1);
    expect(vi.mocked(options.notifyPdfParserFailure).mock.calls[0][0]).toBe(newestFile);
  });

  it("ignores late OCR progress after the import completes and marks OCR in its report", async () => {
    const { options, ui } = harness();
    let progress!: (value: { page: number; totalPages: number; progress: number }) => void;
    mocks.parse.mockImplementation((_product, _file, settings) => {
      settings.onOcrStart();
      progress = settings.onOcrProgress;
      progress({ page: 1, totalPages: 2, progress: 0.5 });
      return Promise.resolve({ ...parsed, ocrTextUsed: true });
    });
    await importSingleContractPdf(file(), options);
    const calls = ui.setPdfImportStatus.mock.calls.length;
    progress({ page: 2, totalPages: 2, progress: 1 });
    expect(ui.setPdfImportStatus).toHaveBeenCalledTimes(calls);
    expect(vi.mocked(options.notifyPdfParserFailure).mock.calls[0][3]).toBe(true);
  });

  it.each([false, true])("prepares a NEON amendment only in the applicable mode (inherited: %s)", async (inherited) => {
    const { options, ui } = harness();
    options.isInheritedContractMode = inherited;
    mocks.detect.mockResolvedValue({ product: "neon", confidence: "high" });
    mocks.parse.mockResolvedValue({ ...parsed, isEndorsement: true });
    await importSingleContractPdf(file(), options);
    if (inherited) {
      expect(options.handlePrepareEndorsement).not.toHaveBeenCalled();
      expect(ui.setEndorsementWorkflowActive).not.toHaveBeenCalled();
    } else {
      expect(options.handlePrepareEndorsement).toHaveBeenCalledExactlyOnceWith({
        productOverride: "neon", contractNumberOverride: "1234567890", contractSignedDateOverride: "2026-10-01",
        newPremiumAmountOverride: 704, source: "pdf",
      });
      expect(ui.setEndorsementWorkflowActive).toHaveBeenCalledWith(true);
    }
  });

  it("keeps an original-contract lookup from a NEON replacement PDF", async () => {
    const { options, ui } = harness();
    mocks.detect.mockResolvedValue({ product: "neon", confidence: "high" });
    mocks.parse.mockResolvedValue({ ...parsed, isRefresh: true, refreshOriginalContractNumber: " OLD123 " });
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).toHaveBeenLastCalledWith(true);
    expect(ui.setRefreshOriginalContractNumber).toHaveBeenLastCalledWith("OLD123");
    expect(ui.setRefreshOriginalPdfLookupNumber).toHaveBeenLastCalledWith("OLD123");
  });

  it("shows the MAXIMA hint when an otherwise empty parse matches the fallback parser", async () => {
    const { options, ui } = harness();
    mocks.parse.mockResolvedValue({});
    mocks.fallback.mockResolvedValue({ maxCizinKomplexVariant: "premium" });
    await importSingleContractPdf(file(), options);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.stringContaining("MAXIMA Cizinci"));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
    expect(options.notifyPdfParserFailure).not.toHaveBeenCalled();
  });
});
