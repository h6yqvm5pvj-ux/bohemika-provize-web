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

  it("imports distinct Neuron locations and clears previous scoped details before the next PDF", async () => {
    const { options, values } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockResolvedValue({ ...parsed,
      domexPropertyAddress: " Stavba 1 ", domexHouseholdAddress: " Domácnost 2 ",
      domexPropertyAssistance: "basic", domexHouseholdAssistance: "plus",
    });
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ domexPropertyAddress: "Stavba 1", domexHouseholdAddress: "Domácnost 2",
      domexPropertyAssistance: "basic", domexHouseholdAssistance: "plus" });
    mocks.parse.mockResolvedValue({ ...parsed, domexHouseholdSumInsured: 500_000 });
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ domexPropertyAddress: "", domexHouseholdAddress: "",
      domexPropertyAssistance: null, domexHouseholdAssistance: null, domexHouseholdSumInsured: 500_000 });
  });

  it.each([[true, "domexneuron"], [false, "domex"]] as const)("asks about an ambiguous DOMEX before parsing (%s)", async (answer, expectedProduct) => {
    const { options, ui, values } = harness();
    mocks.detect.mockResolvedValue({ product: "domex", confidence: "medium", requiresDomexNeuronConfirmation: true });
    options.confirmDomexNeuron = vi.fn(async () => answer);
    mocks.parse.mockResolvedValue({ ...parsed, automaticRenewal: true, policyTermEndDate: "2027-10-31", policyEndDate: null });
    await importSingleContractPdf(file(), options);
    expect(options.confirmDomexNeuron).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    expect(mocks.parse).toHaveBeenCalledWith(expectedProduct, expect.any(File), expect.any(Object));
    expect(ui.setProduct).toHaveBeenCalledWith(expectedProduct);
    if (answer) expect(values).toMatchObject({ automaticRenewal: true, policyEndDate: "", policyTermEndDate: "2027-10-31" });
  });

  it("keeps an ambiguous DOMEX unparsed when the user cancels", async () => {
    const { options, ui, input } = harness();
    mocks.detect.mockResolvedValue({ product: "domex", confidence: "medium", requiresDomexNeuronConfirmation: true });
    options.confirmDomexNeuron = vi.fn(async () => null);
    await importSingleContractPdf(file(), options);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(ui.setProduct).not.toHaveBeenCalled();
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
    expect(input.value).toBe("");
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
    values.clientName = "Předchozí Klient";
    values.contractNumber = "0090000001";
    mocks.parse.mockResolvedValue(null);
    const pdf = file();
    await importSingleContractPdf(pdf, options);
    expect(values).toMatchObject({ autoCarPlate: "", autoCarAddonGlass: false });
    expect(values).toMatchObject({ clientName: "", contractNumber: "", policyStartDate: "", contractSignedDate: "" });
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
  });

  it("does not retain a previous client's name when the next CPP PDF contains other fields but no readable policyholder", async () => {
    const { options, ui, values } = harness();
    values.clientName = "Předchozí Klient";
    mocks.parse.mockResolvedValue({ ...parsed, clientName: undefined });
    await importSingleContractPdf(file(), options);
    expect(values.clientName).toBe("");
    expect(values.contractNumber).toBe(parsed.contractNumber);
    expect(ui.setPdfClientNameLoaded).toHaveBeenLastCalledWith(false);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.stringContaining("pojistníka"));
  });

  it("fills unreadable identity fields from the statement only for the same identified contract", async () => {
    const { options, ui, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: "123 4567890", clientName: "Klient z výpisu",
      contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    mocks.parse.mockResolvedValue({ contractNumber: parsed.contractNumber, amount: 704 });
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ contractNumber: parsed.contractNumber, clientName: "Klient z výpisu",
      contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02" });
    expect(ui.setStatementClientNamePrefillActive).toHaveBeenLastCalledWith(true);
    expect(ui.setPdfClientNameLoaded).toHaveBeenLastCalledWith(false);
  });

  it.each([
    { product: "cppAuto", contractNumber: "9999999999" },
    { product: "cppAuto", contractNumber: "" },
    { product: "cppAuto", contractNumber: "01234567890" },
    { product: "csobAuto", contractNumber: parsed.contractNumber },
  ] as const)("does not reuse statement identity for $product / $contractNumber", async ({ product, contractNumber }) => {
    const { options, ui, values } = harness();
    options.statementPrefill = { product, values: {
      contractNumber, clientName: "Klient jiné smlouvy", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    mocks.parse.mockResolvedValue({ contractNumber: parsed.contractNumber, amount: 704 });
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ contractNumber: parsed.contractNumber, clientName: "", contractSignedDate: "", policyStartDate: "" });
    expect(ui.setStatementClientNamePrefillActive).toHaveBeenLastCalledWith(false);
  });

  it.each([null, {}, { clientName: "Neověřené jméno z OCR", amount: 704 }])("preserves statement fields when a scan cannot identify the contract (%s)", async (result) => {
    const { options, ui, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: parsed.contractNumber, clientName: "Klient z výpisu", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    Object.assign(values, options.statementPrefill.values, { amountText: "1899.5" });
    mocks.parse.mockResolvedValue(result);
    const pdf = file();
    await importSingleContractPdf(pdf, options);
    expect(values).toMatchObject({ ...options.statementPrefill.values, amountText: "1899.5" });
    expect(ui.setStatementClientNamePrefillActive).toHaveBeenLastCalledWith(true);
    expect(ui.setPdfClientNameLoaded).toHaveBeenLastCalledWith(false);
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
  });

  it("keeps readable PDF identity fields ahead of the statement fallback", async () => {
    const { options, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: parsed.contractNumber, clientName: "Klient z výpisu", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ clientName: parsed.clientName, contractSignedDate: parsed.contractSignedDate, policyStartDate: parsed.policyStartDate });
  });

  it.each(["failed", "timeout"])("keeps statement fields and the attachment when reading a scan ends with %s", async outcome => {
    const { options, ui, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: parsed.contractNumber, clientName: "Klient z výpisu", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    Object.assign(values, options.statementPrefill.values, { amountText: "1899.5" });
    const pdf = file();
    if (outcome === "timeout") {
      vi.useFakeTimers();
      mocks.parse.mockImplementation(() => new Promise(() => {}));
      const running = importSingleContractPdf(pdf, options);
      await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(15000);
      await running;
    } else {
      mocks.parse.mockRejectedValue(new Error("Synthetic scan read failure"));
      await importSingleContractPdf(pdf, options);
    }
    expect(values).toMatchObject({ ...options.statementPrefill.values, amountText: "1899.5" });
    expect(ui.setImportedContractPdfFile).toHaveBeenLastCalledWith(pdf);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
    expect(ui.setPdfImportStatus).toHaveBeenLastCalledWith(expect.stringContaining("Údaje z výpisu zůstaly zachované"));
    expect(ui.setPdfImporting).toHaveBeenLastCalledWith(false);
  });

  it("keeps the statement product when an unreadable scan was detected as another product", async () => {
    const { options, ui, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: parsed.contractNumber, clientName: "Klient z výpisu", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    Object.assign(values, options.statementPrefill.values);
    mocks.detect.mockResolvedValue({ product: "csobAuto", confidence: "high" });
    mocks.parse.mockResolvedValue(null);
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject(options.statementPrefill.values);
    expect(ui.setProduct).not.toHaveBeenCalled();
    expect(ui.setPdfImportStatus).toHaveBeenLastCalledWith(expect.stringContaining("Údaje z výpisu zůstaly zachované"));
  });

  it("invalidates statement data before importing an identified different policy", async () => {
    const { options, values } = harness();
    options.statementPrefill = { product: "cppAuto", values: {
      contractNumber: "9999999999", clientName: "Klient z výpisu", contractSignedDate: "2026-09-01", policyStartDate: "2026-09-02",
    } };
    Object.assign(values, options.statementPrefill.values);
    options.onStatementPrefillInvalidated = vi.fn(() => { options.statementPrefill = null; });
    mocks.parse.mockResolvedValue({ contractNumber: parsed.contractNumber, amount: 704 });
    await importSingleContractPdf(file(), options);
    expect(options.onStatementPrefillInvalidated).toHaveBeenCalledOnce();
    expect(values).toMatchObject({ clientName: "", contractNumber: parsed.contractNumber, contractSignedDate: "", policyStartDate: "" });
    mocks.parse.mockResolvedValue(null);
    await importSingleContractPdf(file(), options);
    expect(values).toMatchObject({ clientName: "", contractNumber: "", contractSignedDate: "", policyStartDate: "" });
  });

  it("allows a successful retry after a failed parser and keeps raw errors out of logs", async () => {
    const { options, ui, values } = harness();
    mocks.parse.mockRejectedValueOnce(new Error("Sensitive synthetic PDF contents"));
    await importSingleContractPdf(file(), options);
    expect(ui.setPdfImportError).toHaveBeenLastCalledWith(expect.any(String));
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("PDF import selhal", { product: "cppAuto", reason: "read_failed" });
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
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not report a cancelled import as an error or change the form feedback", async () => {
    const { options, ui } = harness();
    mocks.parse.mockImplementation(() => new Promise(() => {}));
    const running = importSingleContractPdf(file(), options);
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled());
    options.refs.pdfImportAbortRef.current?.abort();
    await running;
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(ui.setPdfImportError).toHaveBeenCalledExactlyOnceWith(null);
    expect(options.notifyPdfParserFailure).not.toHaveBeenCalled();
  });

  it("does not report cancelled product detection as a failed import", async () => {
    const { options, ui } = harness();
    mocks.detect.mockImplementation(() => new Promise(() => {}));
    const running = importSingleContractPdf(file(), options);
    await vi.waitFor(() => expect(mocks.detect).toHaveBeenCalled());
    options.refs.pdfImportAbortRef.current?.abort();
    await running;
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(ui.setPdfImportError).toHaveBeenCalledExactlyOnceWith(null);
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

  it.each([true, undefined])("opens a DOMEX Neuron replacement from the original number (refresh flag: %s)", async (isRefresh) => {
    const { options, ui, values } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockResolvedValue({
      ...parsed, contractNumber: "0090000088", contractSignedDate: "2026-11-02",
      isRefresh, refreshOriginalContractNumber: " 0020000077 ",
    });
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).toHaveBeenLastCalledWith(true);
    expect(ui.setRefreshOriginalContractNumber).toHaveBeenLastCalledWith("0020000077");
    expect(ui.setRefreshOriginalMissingInSystem).toHaveBeenLastCalledWith(false);
    expect(values).toMatchObject({ contractNumber: "0090000088", contractSignedDate: "2026-11-02" });
    expect(options.handlePrepareEndorsement).not.toHaveBeenCalled();
  });

  it("clears the previous DOMEX Neuron replacement before importing an ordinary policy", async () => {
    const { options, ui } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockResolvedValueOnce({ ...parsed, isRefresh: true, refreshOriginalContractNumber: "0020000077" });
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).toHaveBeenLastCalledWith(true);
    expect(ui.setRefreshOriginalContractNumber).toHaveBeenLastCalledWith("0020000077");
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).toHaveBeenLastCalledWith(false);
    expect(ui.setRefreshOriginalContractNumber).toHaveBeenLastCalledWith("");
    expect(ui.setRefreshOriginalMissingInSystem).toHaveBeenLastCalledWith(false);
    expect(ui.setRefreshOriginalLookup).toHaveBeenLastCalledWith({ status: "idle", progress: 0, adviserName: null, original: null });
  });

  it("does not carry indexation consent from one DOMEX Neuron PDF into the next", async () => {
    const { options, values } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockResolvedValueOnce({ ...parsed, premiumIndexationEnabled: true });
    await importSingleContractPdf(file(), options);
    expect(values.premiumIndexationEnabled).toBe(true);
    mocks.parse.mockResolvedValueOnce({ ...parsed, premiumIndexationEnabled: false });
    await importSingleContractPdf(file(), options);
    expect(values.premiumIndexationEnabled).toBe(false);
    await importSingleContractPdf(file(), options);
    expect(values.premiumIndexationEnabled).toBeNull();
  });

  it("keeps a DOMEX Neuron replacement open for manual correction when its original number is missing", async () => {
    const { options, ui } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockResolvedValue({ ...parsed, isRefresh: true });
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).toHaveBeenLastCalledWith(true);
    expect(ui.setRefreshOriginalContractNumber).toHaveBeenLastCalledWith("");
  });

  it.each(["failed", "unreadable"])("preserves the previous DOMEX Neuron replacement after an %s import", async (outcome) => {
    const { options, ui } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    if (outcome === "failed") mocks.parse.mockRejectedValue(new Error("Synthetic parser error"));
    else mocks.parse.mockResolvedValue(null);
    await importSingleContractPdf(file(), options);
    expect(ui.setRefreshOriginalOpen).not.toHaveBeenCalled();
    expect(ui.setRefreshOriginalContractNumber).not.toHaveBeenCalled();
    expect(ui.setRefreshOriginalLookup).not.toHaveBeenCalled();
  });

  it("does not change replacement state after a DOMEX Neuron import is cancelled", async () => {
    const { options, ui } = harness();
    mocks.detect.mockResolvedValue({ product: "domexneuron", confidence: "high" });
    mocks.parse.mockImplementation(() => new Promise(() => {}));
    const running = importSingleContractPdf(file(), options);
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalled());
    options.refs.pdfImportAbortRef.current?.abort();
    await running;
    expect(ui.setRefreshOriginalOpen).not.toHaveBeenCalled();
    expect(ui.setRefreshOriginalContractNumber).not.toHaveBeenCalled();
    expect(ui.setRefreshOriginalLookup).not.toHaveBeenCalled();
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
