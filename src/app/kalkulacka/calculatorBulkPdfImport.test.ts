import { describe, expect, it } from "vitest";
import {
  buildAutoBulkImportWarnings,
  formatAutoBulkImportWarnings,
  hasParsedDomexDetail,
  isBulkImportProduct,
  isBulkImportProductAllowedForSelection,
  parsedPdfBooleanOrNumberValue,
  parsedPdfBooleanValue,
  parsedPdfFrequencyValue,
  parsedPdfNumberValue,
  parsedPdfRoundedNumberValue,
  parsedPdfTextValue,
  parsedSlaviaAutoDetailValue,
} from "./calculatorBulkPdfImport";

describe("parsed PDF values", () => {
  it("trims text, preserves numeric identifiers and leaves missing text empty", () => {
    expect(parsedPdfTextValue({ clientName: "  Jana Testovací  " }, "clientName")).toBe("Jana Testovací");
    expect(parsedPdfTextValue({ contractNumber: 123456789 }, "contractNumber")).toBe("123456789");
    expect(parsedPdfTextValue({ clientName: null }, "clientName")).toBe("");
    expect(parsedPdfTextValue({}, "clientName")).toBe("");
  });

  it.each([undefined, null, "", "1200", true, NaN, Infinity, -Infinity, [], {}])(
    "does not treat an invalid numeric value as a premium: %j", (amount) => {
      expect(parsedPdfNumberValue({ amount }, "amount")).toBeNull();
      expect(parsedPdfRoundedNumberValue({ amount }, "amount")).toBeNull();
    }
  );

  it.each([[0, 0], [1200.49, 1200], [-10.75, -11]])("preserves finite amounts and rounds only on request: %s", (amount, rounded) => {
    expect(parsedPdfNumberValue({ amount }, "amount")).toBe(amount);
    expect(parsedPdfRoundedNumberValue({ amount }, "amount")).toBe(rounded);
  });

  it.each(["monthly", "quarterly", "semiannual", "annual"])("accepts the payment frequency %s", (frequency) => {
    expect(parsedPdfFrequencyValue({ frequency })).toBe(frequency);
  });

  it.each([undefined, null, "Monthly", "monthly ", "weekly", 12, {}])(
    "rejects unsupported payment frequencies: %j", (frequency) => {
      expect(parsedPdfFrequencyValue({ frequency })).toBeNull();
    }
  );

  it("requires an actual true flag, while a finite coverage limit also enables an addon", () => {
    expect(parsedPdfBooleanValue({ enabled: true }, "enabled")).toBe(true);
    for (const enabled of [false, "true", "false", 1, null, undefined]) {
      expect(parsedPdfBooleanValue({ enabled }, "enabled")).toBe(false);
    }
    expect(parsedPdfBooleanOrNumberValue({ enabled: true }, "enabled", "limit")).toBe(true);
    expect(parsedPdfBooleanOrNumberValue({ enabled: false, limit: 0 }, "enabled", "limit")).toBe(true);
    expect(parsedPdfBooleanOrNumberValue({ limit: 1000 }, "enabled", "limit")).toBe(true);
    expect(parsedPdfBooleanOrNumberValue({ enabled: "true", limit: "1000" }, "enabled", "limit")).toBe(false);
    expect(parsedPdfBooleanOrNumberValue({ limit: NaN }, "enabled", "limit")).toBe(false);
  });

  it("preserves a Slavia detail object and ignores an absent or non-object detail", () => {
    const detail = { liability: { limit: 100000000 } };
    expect(parsedSlaviaAutoDetailValue({ carSlaviaDetail: detail })).toBe(detail);
    for (const value of [undefined, null, [], "detail", true, 123]) {
      expect(parsedSlaviaAutoDetailValue({ carSlaviaDetail: value })).toBeNull();
    }
  });
});

describe("bulk PDF import eligibility and details", () => {
  it("allows mixing supported bulk products but excludes manual and single-import-only products", () => {
    expect(isBulkImportProductAllowedForSelection("cppAuto", "domex")).toBe(true);
    expect(isBulkImportProductAllowedForSelection("domex", "cppAuto")).toBe(true);
    expect(isBulkImportProductAllowedForSelection("comfortcc", "cppAuto")).toBe(false);
    expect(isBulkImportProductAllowedForSelection("cppAuto", "comfortcc")).toBe(false);
    expect(isBulkImportProductAllowedForSelection("cppAuto", null)).toBe(false);
    for (const product of ["pillowmajetek", "comfortcc", null, undefined] as const) {
      expect(isBulkImportProduct(product)).toBe(false);
    }
  });

  it("distinguishes absent Domex details from text, zero limits and explicit coverage flags", () => {
    expect(hasParsedDomexDetail({})).toBe(false);
    expect(hasParsedDomexDetail({ domexAddress: "  ", domexPropertySumInsured: "1000", domexAssistancePlus: "true" })).toBe(false);
    expect(hasParsedDomexDetail({ domexAddress: "Testovací 123" })).toBe(true);
    expect(hasParsedDomexDetail({ domexPropertySumInsured: 0 })).toBe(true);
    expect(hasParsedDomexDetail({ domexLiabilityTenant: true })).toBe(true);
    expect(hasParsedDomexDetail({ domexAssistancePlus: true })).toBe(true);
  });
});

describe("bulk PDF import warnings", () => {
  const complete = {
    clientName: "Jana Testovací", contractNumber: "1234567890",
    contractSignedDate: "2026-09-01", policyStartDate: "2026-10-01",
  };
  const input = {
    product: "cppAuto" as const, parsed: complete,
    productDetected: true, detectionConfidence: "high" as const,
  };

  it("does not warn about complete, confidently detected native PDF data", () => {
    expect(buildAutoBulkImportWarnings(input)).toEqual([]);
    expect(formatAutoBulkImportWarnings([])).toBe("");
  });

  it("keeps parser warnings and adds uncertainty and field warnings without changing parser data", () => {
    const parserWarnings = ["Ověř pojistné", 123, null];
    const warnings = buildAutoBulkImportWarnings({
      ...input, productDetected: false, detectionConfidence: null,
      parsed: {
        clientName: "Jana", contractNumber: "ABC123", contractSignedDate: "1.9.2026",
        policyStartDate: "neplatné", ocrTextUsed: true, pdfImportWarnings: parserWarnings,
      },
    });
    expect(warnings).toEqual([
      "Ověř pojistné",
      expect.stringContaining("produkt se nepodařilo rozpoznat"),
      "PDF bylo načtené přes OCR",
      "jméno klienta vypadá neúplně",
      "číslo smlouvy má nezvyklý formát",
      "datum sjednání má nezvyklý formát",
      "datum počátku má nezvyklý formát",
    ]);
    expect(parserWarnings).toEqual(["Ověř pojistné", 123, null]);
  });

  it("warns about medium detection confidence without claiming detection failed", () => {
    expect(buildAutoBulkImportWarnings({ ...input, detectionConfidence: "medium" })).toEqual([
      expect.stringContaining("střední jistotou"),
    ]);
  });

  it("leaves missing fields to required-field validation and accepts spaces inside a contract number", () => {
    expect(buildAutoBulkImportWarnings({ ...input, parsed: {} })).toEqual([]);
    expect(buildAutoBulkImportWarnings({ ...input, parsed: { ...complete, contractNumber: "123 456 7890" } })).toEqual([]);
  });

  it("trims and deduplicates warning text while keeping its order", () => {
    const warnings = [" Ověř pojistné ", "", "Ověř datum", "Ověř pojistné", "  "];
    expect(formatAutoBulkImportWarnings(warnings)).toBe("Zkontroluj: Ověř pojistné; Ověř datum.");
    expect(warnings).toHaveLength(5);
    expect(formatAutoBulkImportWarnings(["", " "])).toBe("");
  });
});
