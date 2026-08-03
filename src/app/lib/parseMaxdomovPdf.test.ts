import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMaxdomovPdf } from "./parseMaxdomovPdf";

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
  new File(["pdf fixture"], "maxdomov.pdf", { type: "application/pdf" });

describe("parseMaxdomovPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("extracts the current MAXDOMOV layout without using the old-layout fallback", async () => {
    pdfState.pages = [
      [
        { str: "Příjmení, jméno, titul", x: 60, y: 700, width: 130 },
        { str: "Pavelka František", x: 60, y: 680, width: 110 },
        { str: "Číslo nabídky", x: 60, y: 650, width: 100 },
        { str: "1001111111", x: 180, y: 650, width: 70 },
        { str: "Počátek", x: 60, y: 620, width: 50 },
        { str: "pojištění", x: 115, y: 620, width: 60 },
        { str: "16.10.2025", x: 60, y: 600, width: 70 },
        { str: "Frekvence placení", x: 60, y: 570, width: 120 },
        { str: "Pololetně", x: 60, y: 550, width: 70 },
        { str: "Splátka pojistného", x: 60, y: 520, width: 120 },
        { str: "3 100 Kč", x: 60, y: 500, width: 70 },
      ],
      [],
      [],
      [
        { str: "15.10.2025", x: 92, y: 198, width: 50 },
        { str: "X", x: 135, y: 125, width: 8 },
        { str: "2 302", x: 541, y: 25, width: 25 },
      ],
      [
        { str: "Podpisy smluvních stran", x: 60, y: 700, width: 140 },
        { str: "dne", x: 60, y: 650, width: 20 },
        { str: "15.10.2025", x: 60, y: 630, width: 70 },
        { str: "14.10.2025", x: 408, y: 118, width: 50 },
      ],
    ];

    await expect(parseMaxdomovPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "1001111111",
      clientName: "František Pavelka",
      policyStartDate: "2025-10-16",
      contractSignedDate: "2025-10-15",
      frequency: "semiannual",
      amount: 3100,
    });
  });

  it("extracts core fields from the older MAXDOMOV 3 filled-form layout", async () => {
    pdfState.pages = [
      [
        { str: "1009822272", x: 110.5, y: 755, width: 61.1 },
        { str: "František Pavelka", x: 28.3, y: 655.3, width: 79.4 },
        { str: "411230/431", x: 470.3, y: 655.3, width: 52.8 },
      ],
      [],
      [],
      [
        { str: "15.10.2025", x: 92.1, y: 198, width: 50 },
        { str: "X", x: 135.4, y: 125.2, width: 6.7 },
        { str: "2 302", x: 541.4, y: 25.1, width: 25 },
      ],
      [{ str: "14.10.2025", x: 408, y: 117.8, width: 50 }],
    ];

    await expect(parseMaxdomovPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "1009822272",
      clientName: "František Pavelka",
      policyStartDate: "2025-10-15",
      contractSignedDate: "2025-10-14",
      frequency: "annual",
      amount: 2302,
    });
  });
});
