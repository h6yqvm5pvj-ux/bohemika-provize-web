import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractCppAutoPolicyholderPersonalId,
  parseCppAutoPdf,
} from "./parseCppAutoPdf";

const pdfState = vi.hoisted(() => ({
  pages: [] as Array<Array<{ str: string; x: number; y: number; width?: number }>>,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() {
        return pdfState.pages.length;
      },
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: (pdfState.pages[pageNumber - 1] ?? []).map((item) => ({
            str: item.str,
            transform: [1, 0, 0, 1, item.x, item.y],
            width: item.width ?? 80,
          })),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "cpp-auto.pdf", { type: "application/pdf" });

describe("parseCppAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("uses company name when the CPP Auto policyholder has a Název field", async () => {
    pdfState.pages = [
      [
        { str: "Číslo návrhu pojistné smlouvy", x: 240, y: 750, width: 116 },
        { str: "3271032734", x: 276, y: 737, width: 45 },
        { str: "POJISTNÍK", x: 45, y: 586, width: 42 },
        { str: "Název:", x: 45, y: 571, width: 25 },
        { str: "Green Bridge Recycling s.r.o.", x: 84, y: 571, width: 95 },
        { str: "IČ:", x: 300, y: 571, width: 15 },
        { str: "12 34 56 78", x: 320, y: 571, width: 45 },
        { str: "Plátce DPH:", x: 435, y: 571, width: 44 },
        { str: "ANO", x: 481, y: 571, width: 16 },
        { str: "Titul před:", x: 45, y: 539, width: 35 },
        { str: "Jméno:", x: 147, y: 539, width: 26 },
        { str: "Andreas", x: 175, y: 539, width: 28 },
        { str: "Příjmení:", x: 274, y: 539, width: 32 },
        { str: "Hellinger", x: 308, y: 539, width: 30 },
      ],
    ];

    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3271032734",
      clientName: "Green Bridge Recycling s.r.o.",
      personalId: "12345678",
    });
  });

  it("keeps parsing personal CPP Auto policyholder names", async () => {
    pdfState.pages = [
      [
        { str: "Číslo návrhu pojistné smlouvy", x: 240, y: 750, width: 116 },
        { str: "3271000001", x: 276, y: 737, width: 45 },
        { str: "POJISTNÍK", x: 45, y: 586, width: 42 },
        { str: "Titul před:", x: 45, y: 571, width: 35 },
        { str: "Jméno:", x: 147, y: 571, width: 26 },
        { str: "Martin", x: 175, y: 571, width: 28 },
        { str: "Příjmení:", x: 274, y: 571, width: 32 },
        { str: "Tamáš", x: 308, y: 571, width: 30 },
        { str: "Rodné číslo:", x: 45, y: 555, width: 45 },
        { str: "900101/1234", x: 95, y: 555, width: 48 },
      ],
    ];

    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3271000001",
      clientName: "Martin Tamáš",
      personalId: "900101/1234",
    });
  });

  it("reads the identifier only from the policyholder section", () => {
    expect(
      extractCppAutoPolicyholderPersonalId([
        "POJISTNÍK",
        "Název: Testovací firma",
        "IČ: 87 65 43 21",
        "PROVOZOVATEL",
        "IČ: 12 34 56 78",
      ]),
    ).toBe("87654321");
  });

  it("returns the email from the CPP policyholder E-mail field, excluding the adviser and vehicle operator", async () => {
    pdfState.pages = [[
      { str: "ZPROSTŘEDKOVATEL", x: 45, y: 640 },
      { str: "E-mail: poradce@example.test", x: 45, y: 625, width: 160 },
      { str: "POJISTNÍK", x: 45, y: 600 },
      { str: "Jméno:", x: 45, y: 585, width: 30 },
      { str: "Petr", x: 80, y: 585, width: 20 },
      { str: "Přijmení:", x: 120, y: 585, width: 40 },
      { str: "Novák", x: 165, y: 585, width: 30 },
      { str: "E-mail:", x: 45, y: 565, width: 30 },
      { str: "PETR@EXAMPLE.TEST", x: 80, y: 565, width: 100 },
      { str: "Telefon: 777123456", x: 260, y: 565, width: 100 },
      { str: "PROVOZOVATEL", x: 45, y: 540, width: 80 },
      { str: "E-mail: provozovatel@example.test", x: 45, y: 525, width: 180 },
    ]];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({ clientName: "Petr Novák", clientEmail: "petr@example.test" });
  });

  it("does not fill the email if it belongs only to the adviser", async () => {
    pdfState.pages = [[
      { str: "POJISTNÍK", x: 45, y: 600 },
      { str: "Jméno:", x: 45, y: 585, width: 30 },
      { str: "Petr", x: 80, y: 585, width: 20 },
      { str: "Příjmení:", x: 120, y: 585, width: 40 },
      { str: "Novák", x: 165, y: 585, width: 30 },
      { str: "ZPROSTŘEDKOVATEL", x: 45, y: 565 },
      { str: "E-mail: poradce@example.test", x: 45, y: 545, width: 150 },
    ]];
    expect((await parseCppAutoPdf(makePdfFile())).clientEmail).toBeUndefined();
  });
});
