import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseKooperativaCestovkoPdf } from "./parseKooperativaCestovkoPdf";

type PdfTextItemFixture = {
  str: string;
  x?: number;
  y?: number;
  width?: number;
};

const pdfState = vi.hoisted(() => ({
  pages: [] as PdfTextItemFixture[][],
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
            transform: [1, 0, 0, 1, item.x ?? 0, item.y ?? 0],
            width: item.width ?? 0,
          })),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "kooperativa-kolumbus.pdf", {
    type: "application/pdf",
  });

describe("parseKooperativaCestovkoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("extracts the policyholder, discounted premium and all contract dates", async () => {
    pdfState.pages = [
      [
        { str: "Číslo návrhu", x: 174, y: 807, width: 35 },
        { str: "5052830694", x: 174, y: 789 },
        { str: "Pojistník", x: 50, y: 637, width: 49 },
        { str: "Titul, jméno, příjmení", x: 33, y: 613, width: 84 },
        { str: "Ing. Adam Vodrážka", x: 165, y: 613 },
        { str: "Pojištěné osoby", x: 50, y: 540 },
      ],
      [
        { str: "Doba trvání pojištění, pojistné období", x: 50, y: 727 },
        { str: "Počátek pojištění", x: 33, y: 703, width: 68 },
        { str: "18. 9. 2026", x: 165, y: 703 },
        { str: "Konec pojištění", x: 341, y: 703, width: 60 },
        { str: "29. 9. 2026", x: 429, y: 703 },
        { str: "Údaje o pojistném", x: 50, y: 678 },
        { str: "Celkové jednorázové pojistné", x: 33, y: 654, width: 112 },
        { str: "1 680 Kč", x: 165, y: 654 },
        { str: "Celkové jednorázové pojistné", x: 33, y: 642, width: 112 },
        { str: "po slevě", x: 33, y: 631 },
        { str: "1 344 Kč", x: 165, y: 642 },
        { str: "Částka k úhradě", x: 33, y: 587, width: 61 },
        { str: "1 344 Kč", x: 165, y: 587 },
        { str: "Čekací doba", x: 50, y: 463 },
      ],
      [
        { str: "Uzavření pojistné smlouvy", x: 50, y: 685 },
        {
          str: "Termín pro přijetí návrhu pojistné smlouvy pojistníkem",
          x: 33,
          y: 639,
          width: 214,
        },
        { str: "31. 8. 2026", x: 341, y: 639 },
      ],
    ];

    await expect(parseKooperativaCestovkoPdf(makePdfFile())).resolves.toEqual({
      contractNumber: "5052830694",
      clientName: "Ing. Adam Vodrážka",
      policyStartDate: "2026-09-18",
      policyEndDate: "2026-09-29",
      contractSignedDate: "2026-08-31",
      amount: 1344,
      frequency: "annual",
    });
  });

  it("supports the alternate proposal heading and payment amount fallback", async () => {
    pdfState.pages = [
      [
        { str: "Návrh pojistné smlouvy č." },
        { str: "5052830694" },
        { str: "Údaje o pojistném" },
        { str: "Částka k úhradě" },
        { str: "1 344 Kč" },
      ],
    ];

    await expect(parseKooperativaCestovkoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "5052830694",
      amount: 1344,
      frequency: "annual",
    });
  });
});
