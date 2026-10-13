import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPdfImportIssueMessage,
  parseContractPdfByProduct,
} from "../kalkulacka/calculatorPdfImport";
import { detectProductFromPdf } from "./detectProductFromPdf";
import { parseKoopOdzamPdf } from "./parseKoopOdzamPdf";

type PdfTextItemFixture = {
  str: string;
  x?: number;
  y?: number;
  width?: number;
};

const pdfState = vi.hoisted(() => ({
  pages: [] as PdfTextItemFixture[][],
  getDocument: vi.fn(),
  destroy: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => {
    pdfState.getDocument(...args);
    return {
      destroy: pdfState.destroy,
      promise: Promise.resolve({
        get numPages() {
          return pdfState.pages.length;
        },
        getPage: async (pageNumber: number) => ({
          cleanup: pdfState.cleanup,
          getTextContent: async () => ({
            items: (pdfState.pages[pageNumber - 1] ?? []).map((item) => ({
              str: item.str,
              transform: [1, 0, 0, 1, item.x ?? 0, item.y ?? 0],
              width: item.width ?? 0,
            })),
          }),
        }),
      }),
    };
  },
}));

const makePdfFile = () =>
  new File(["synthetic PDF fixture"], "employee-liability.pdf", {
    type: "application/pdf",
  });

const proposalDateRow = (date = "13. 10. 2026"): PdfTextItemFixture[] => [
  { str: "Datum vzniku návrhu pojistné smlouvy", x: 33, y: 443, width: 156 },
  { str: date, x: 341, y: 443 },
  {
    str: "Termín pro přijetí návrhu pojistné smlouvy pojistníkem",
    x: 33,
    y: 421,
    width: 214,
  },
  { str: "28. 10. 2026", x: 341, y: 421 },
];

describe("parseKoopOdzamPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
    vi.clearAllMocks();
  });

  it("imports an employee liability proposal with a cover page through the calculator", async () => {
    // Synthetic identity and premiums; positions follow the supplied PDF.
    pdfState.pages = [
      [
        { str: "Návrh pojistné smlouvy č.", x: 174, y: 807, width: 71 },
        { str: "3950000001", x: 174, y: 789 },
        { str: "Kooperativa pojišťovna, a.s., Vienna Insurance Group", y: 750 },
      ],
      [
        { str: "Číslo návrhu", x: 174, y: 807, width: 34 },
        { str: "3950000001", x: 174, y: 789 },
        { str: "pojištění odpovědnosti za škodu způsobenou", x: 312, y: 753 },
        { str: "zaměstnavateli", x: 312, y: 739 },
        { str: "Pojistník", x: 50, y: 637 },
        { str: "Titul, jméno, příjmení", x: 33, y: 613, width: 83 },
        { str: "Jana Testovací", x: 165, y: 613 },
        { str: "Počátek pojištění", x: 33, y: 299, width: 67 },
        { str: "1. 11. 2026", x: 165, y: 299 },
        { str: "Pojistné období", x: 341, y: 299, width: 61 },
        { str: "6 měsíců", x: 429, y: 299 },
      ],
      [
        { str: "Celkové roční pojistné", x: 33, y: 776, width: 86 },
        { str: "1 200 Kč", x: 165, y: 776 },
        { str: "Pojistné za pojistné období", x: 33, y: 764, width: 106 },
        { str: "600 Kč", x: 165, y: 764 },
      ],
      [{ str: "Informace o zpracování osobních údajů" }],
      proposalDateRow(),
    ];

    const file = makePdfFile();
    await expect(detectProductFromPdf(file, { allowOcr: false })).resolves.toMatchObject({
      product: "koopodzam",
      confidence: "high",
    });
    const parsed = await parseContractPdfByProduct("koopodzam", file, { allowOcr: false });
    expect(parsed).toEqual({
      contractNumber: "3950000001",
      clientName: "Jana Testovací",
      policyStartDate: "2026-11-01",
      contractSignedDate: "2026-10-13",
      amount: 600,
      annualAmount: 1200,
      frequency: "semiannual",
    });
    expect(buildPdfImportIssueMessage({ product: "koopodzam", parsed: parsed! })).toBeNull();
    expect(pdfState.getDocument).toHaveBeenCalledOnce();
    expect(pdfState.destroy).toHaveBeenCalledOnce();
    expect(pdfState.cleanup).toHaveBeenCalledTimes(5);
  });

  it.each(["Číslo pojistné smlouvy", "Číslo návrhu", "Návrh pojistné smlouvy č."])(
    "reads a number below %s even after a cover page",
    async (label) => {
      pdfState.pages = [
        [{ str: "Průvodní strana" }, { str: "9876543210" }],
        [
          { str: label, x: 174, y: 807, width: 85 },
          { str: "3950000001", x: 174, y: 789 },
        ],
      ];
      await expect(parseKoopOdzamPdf(makePdfFile())).resolves.toEqual({
        contractNumber: "3950000001",
      });
    },
  );

  it.each(["Číslo pojistné smlouvy:", "Číslo návrhu:", "Návrh pojistné smlouvy č."])(
    "reads an inline number after %s",
    async (label) => {
      pdfState.pages = [[{ str: `${label} 3950000001` }]];
      await expect(parseKoopOdzamPdf(makePdfFile())).resolves.toEqual({
        contractNumber: "3950000001",
      });
    },
  );

  it("reads a number to the right of its label", async () => {
    pdfState.pages = [[
      { str: "Číslo návrhu", x: 33, y: 800, width: 70 },
      { str: "3950000001", x: 174, y: 800 },
    ]];
    await expect(parseKoopOdzamPdf(makePdfFile())).resolves.toEqual({
      contractNumber: "3950000001",
    });
  });

  it("keeps the explicit signing date when a proposal creation date is also present", async () => {
    pdfState.pages = [[
      ...proposalDateRow(),
      { str: "Pojistná smlouva uzavřena dne", x: 33, y: 400, width: 160 },
      { str: "14. 10. 2026", x: 341, y: 400 },
      { str: "Počátek pojištění", x: 33, y: 380, width: 70 },
      { str: "1. 11. 2026", x: 165, y: 380 },
    ]];
    await expect(parseKoopOdzamPdf(makePdfFile())).resolves.toEqual({
      contractSignedDate: "2026-10-14",
      policyStartDate: "2026-11-01",
    });
  });

  it.each([
    { lines: ["Datum vzniku návrhu pojistné smlouvy: 13. 10. 2026"] },
    { lines: ["Datum vzniku návrhu", "pojistné smlouvy", "13. 10. 2026"] },
  ])("reads the proposal date from inline or split text: $lines", async ({ lines }) => {
    pdfState.pages = [lines.map((str, index) => ({ str, x: 33, y: 800 - index * 12 }))];
    await expect(parseKoopOdzamPdf(makePdfFile())).resolves.toEqual({
      contractSignedDate: "2026-10-13",
    });
  });

  it("does not use the acceptance deadline when the proposal date is missing", async () => {
    pdfState.pages = [proposalDateRow().filter((item) => item.str !== "13. 10. 2026")];
    expect((await parseKoopOdzamPdf(makePdfFile())).contractSignedDate).toBeUndefined();
  });

  it.each(["31. 2. 2026", "29. 2. 2026", "0. 10. 2026", "13. 13. 2026"])(
    "rejects an invalid proposal date without substituting the deadline: %s",
    async (date) => {
      pdfState.pages = [proposalDateRow(date)];
      expect((await parseKoopOdzamPdf(makePdfFile())).contractSignedDate).toBeUndefined();
    },
  );

  it("accepts a valid leap day", async () => {
    pdfState.pages = [proposalDateRow("29. 2. 2028")];
    expect((await parseKoopOdzamPdf(makePdfFile())).contractSignedDate).toBe("2028-02-29");
  });
});
