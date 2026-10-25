import { describe, expect, it } from "vitest";
import { parsePdfParserReport, pdfParserReportMessage, PDF_PARSER_REPORT_VERSION } from "./pdfParserReport";

const report = { product: "flexi", parserVersion: PDF_PARSER_REPORT_VERSION, extraction: "native", missingFields: ["amount"] };

describe("PDF parser diagnostic metadata", () => {
  it.each([null, [], {}, { ...report, extraction: "ocr" }, { ...report, product: "unknown" },
    { ...report, product: "pillowmajetek" }, { ...report, missingFields: [] },
    { ...report, missingFields: ["__proto__"] }, { ...report, missingFields: ["policyEndDate"] },
    { ...report, missingFields: [123] }, { ...report, parserVersion: "old" },
  ])("rejects invalid diagnostics: %j", input => { expect(parsePdfParserReport(input)).toBeNull(); });

  it("keeps only allowlisted codes, normalizes their order and omits extracted personal data", () => {
    const parsed = parsePdfParserReport({ ...report, clientName: "Synthetic private value", missingFields: ["frequency", "amount", "amount"] });
    expect(parsed).toEqual({ ...report, missingFields: ["amount", "frequency"] });
    expect(JSON.stringify(pdfParserReportMessage(parsed!))).not.toContain("Synthetic private value");
    expect(pdfParserReportMessage(parsed!).text).toContain("• Nenalezené povinné údaje:");
    expect(pdfParserReportMessage(parsed!).text).toContain("  – Pojistné / příspěvek");
  });
});
