import { describe, expect, it, vi } from "vitest";

vi.mock("./pdfDocumentText", () => ({
  readPdfText: vi.fn(),
}));

import { readPdfText } from "./pdfDocumentText";
import { parseCppCestovkoPdf } from "./parseCppCestovkoPdf";

const mockPdfText = (lines: string[]) => {
  vi.mocked(readPdfText).mockResolvedValue({
    pages: [{
      items: lines.map(str => ({ str } as never)),
      width: 595,
      height: 842,
    }],
    ocrTextUsed: false,
    warnings: [],
  });
};

describe("parseCppCestovkoPdf", () => {
  it("reads the signing date from the offer creation date field", async () => {
    mockPdfText(["Datum a čas vytvoření nabídky", "03.11.2026", "19:53"]);

    await expect(parseCppCestovkoPdf({} as File)).resolves.toMatchObject({
      contractSignedDate: "2026-11-03",
    });
  });

  it("accepts the SUS Plus footer as a fallback", async () => {
    mockPdfText(["Tisk SUS Plus, 03.11.2026 19:53"]);

    await expect(parseCppCestovkoPdf({} as File)).resolves.toMatchObject({
      contractSignedDate: "2026-11-03",
    });
  });
});
