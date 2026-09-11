import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfOcrPage } from "./pdfOcr";
import { conseqZenitMaturityDate, parseConseqZenitPages, parseConseqZenitPdf } from "./parseConseqZenitPdf";
import { detectProductFromPdf } from "./detectProductFromPdf";
import { parseContractPdfByProduct, buildPdfImportIssueMessage } from "../kalkulacka/calculatorPdfImport";

const state = vi.hoisted(() => ({ pages: [] as PdfOcrPage[], ocr: vi.fn() }));
vi.mock("./pdfOcr", () => ({ extractOcrLinesFromPdf: state.ocr }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({
    numPages: state.pages.length,
    getPage: async (number: number) => ({
      getViewport: () => ({ height: 900 }),
      getTextContent: async () => ({ items: state.pages[number - 1].words.map((word) => ({
        str: word.text, transform: [1, 0, 0, word.height, word.x, 900 - word.y - word.height],
        width: word.width, height: word.height,
      })) }),
    }),
    destroy: vi.fn(),
  }) }),
}));

const word = (text: string, x: number, y: number, width = 120) => ({ text, x, y, width, height: 8 });
const page = (words: PdfOcrPage["words"]): PdfOcrPage => ({ words, text: words.map((item) => item.text).join(" ") });
const fixture = (): PdfOcrPage[] => [
  page([
    word("Conseq Zenit", 30, 30),
    word("Jméno a příjmení: Jiný Podepisující", 30, 60),
    word("Záznam o elektronickém podpisu:", 30, 100, 180),
    word("Záznam o elektronickém podpisu:", 330, 100, 180),
    word("Jan Novák", 30, 115), word("03.11.2024 12:30:00", 330, 115),
    word("Bank iD CZ 04.11.2024 12:37:15", 30, 130, 200),
  ]),
  page([
    word("ČÍSLO SMLOUVY: 9512345678", 30, 30, 220),
    word("A | SMLUVNÍ STRANY", 30, 60),
    word("Jméno a příjmení, titul:", 90, 80, 145),
    word("Rodné číslo ČR:", 280, 80, 65), word("Datum narození:", 355, 80, 65),
    word("Místo narození:", 430, 80, 65),
    word("Jan Novák", 90, 93), word("7504121234", 280, 93, 65), word("12.04.1975", 355, 93, 60),
    word("Trvalý pobyt / bydliště", 30, 115),
    word("Zástupce účastníka", 30, 135), word("Jméno a příjmení, titul: Jiný Člověk", 90, 135, 200),
    word("B SPECIFIKACE DOPLŇKOVÉHO PENZIJNÍHO SPOŘENÍ (DPS) A SMLOUVY O POSKYTNUTÍ GARANCE", 30, 160, 540),
    word("Požadovaný vznik doplňkového penzijního spoření", 90, 180, 210),
    word("Předchozí smlouva:", 330, 180), word("01.01.2025", 90, 193), word("9999999999", 330, 193),
    word("Cílový věk strategie spoření", 90, 230, 120), word("Zvolená strategie spoření", 220, 230, 125),
    word("Měsíční poplatek za garanci (Kč)", 350, 230, 130), word("Měsíční příspěvek DPS (Kč)", 485, 230, 105),
    word("65 let", 90, 242, 60), word("980 Kč", 390, 242, 60), word("1 700 Kč", 500, 242, 80),
    word("Celkem (Kč)", 485, 270), word("2 680 Kč", 500, 282),
    word("C URČENÉ OSOBY", 30, 300), word("Datum narození: 02.02.1980", 90, 320, 180),
  ]),
];

describe("CONSEQ Zenit PDF parser", () => {
  beforeEach(() => { state.pages = fixture(); state.ocr.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the participant, own contribution, first-page signature and separate start date", async () => {
    const result = await parseContractPdfByProduct("conseqzenit", new File(["native"], "dps.pdf"));
    expect(result).toEqual({
      productDetected: true, contractNumber: "9512345678", clientName: "Jan Novák",
      amount: 1700, frequency: "monthly", contractSignedDate: "2024-11-04", policyStartDate: "2025-01-01",
      clientBirthDate: "1975-04-12", targetAge: 65, policyEndDate: "2040-04-12", ocrTextUsed: false,
    });
    expect(state.ocr).not.toHaveBeenCalled();
  });

  it.each([
    ["Jan Novák, Ing.", "Ing. Jan Novák"],
    ["Ing. Jan Novák", "Ing. Jan Novák"],
    ["Jan Novák, Mgr., Ph.D.", "Mgr. Ph.D. Jan Novák"],
  ])("moves titles to the beginning: %s", (name, expected) => {
    state.pages[1].words.find((item) => item.text === "Jan Novák")!.text = name;
    expect(parseConseqZenitPages(state.pages).clientName).toBe(expected);
  });

  it("does not substitute the guarantee fee or total for a missing DPS contribution", () => {
    state.pages[1].words = state.pages[1].words.filter((item) => item.text !== "1 700 Kč");
    expect(parseConseqZenitPages(state.pages).amount).toBeNull();
  });

  it("reads the age and contribution when browser OCR damages table captions", () => {
    const words = state.pages[1].words;
    words.find((item) => item.text === "Cílový věk strategie spoření")!.text = "Clloy věk strategie spoření";
    words.find((item) => item.text === "Měsíční příspěvek DPS (Kč)")!.text = "Měsíční příspěvek DPS (KE)";
    const result = parseConseqZenitPages(state.pages, true);
    expect(result).toMatchObject({ amount: 1700, targetAge: 65, policyEndDate: "2040-04-12" });
    expect(buildPdfImportIssueMessage({ product: "conseqzenit", parsed: result })).toBeNull();
  });

  it("does not borrow a representative's name, another person's birth date or a later-page signature", () => {
    state.pages[0].words = state.pages[0].words.filter((item) => !item.text.includes("Záznam o"));
    state.pages[1].words = state.pages[1].words.filter((item) => !["Jan Novák", "12.04.1975"].includes(item.text));
    state.pages.push(page([word("Záznam o elektronickém podpisu: 04.11.2024", 30, 30)]));
    const result = parseConseqZenitPages(state.pages);
    expect(result.clientName).toBeNull();
    expect(result.clientBirthDate).toBeNull();
    expect(result.contractSignedDate).toBeNull();
    expect(result.policyEndDate).toBeNull();
    expect(buildPdfImportIssueMessage({ product: "conseqzenit", parsed: result })).toContain("datum konce");
  });

  it("detects a scanned document via OCR and reuses that result for importing", async () => {
    const pages = fixture();
    state.pages = [page([]), page([])];
    state.ocr.mockResolvedValue({ pages, text: pages.map((item) => item.text).join("\n"), lines: [] });
    vi.stubGlobal("document", {});
    const onOcrStart = vi.fn();
    const file = new File(["scan"], "scan.pdf");
    await expect(detectProductFromPdf(file, { onOcrStart })).resolves.toMatchObject({ product: "conseqzenit" });
    await expect(parseConseqZenitPdf(file)).resolves.toMatchObject({ amount: 1700, policyEndDate: "2040-04-12", ocrTextUsed: true });
    expect(state.ocr).toHaveBeenCalledOnce();
    expect(onOcrStart).toHaveBeenCalledOnce();
  });

  it.each([
    ["1970-03-31", 65, "2035-03-31"],
    ["1980-02-29", 65, "2045-02-28"],
    ["1980-02-29", 64, "2044-02-29"],
    ["1970-02-31", 65, null], [null, 65, null], ["1970-03-31", null, null],
  ])("computes maturity from birth %s and age %s", (birth, age, expected) => {
    expect(conseqZenitMaturityDate(birth, age)).toBe(expected);
  });
});
