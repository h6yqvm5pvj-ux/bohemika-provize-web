import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseCppBytexPdf } from "./parseCppBytexPdf";

const pdfState = vi.hoisted(() => ({
  items: [] as Array<{ str: string; x: number; y: number; width?: number }>,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => ({
          items: pdfState.items.map((item) => ({
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
  new File(["pdf fixture"], "bytex.pdf", { type: "application/pdf" });

describe("parseCppBytexPdf", () => {
  beforeEach(() => {
    pdfState.items = [];
  });

  it("extracts core contract fields from the Bytex layout", async () => {
    pdfState.items = [
      { str: "POJISTNÍK", x: 40, y: 720 },
      { str: "Jméno a příjmení", x: 60, y: 700, width: 90 },
      { str: "Jiří Sobotka", x: 190, y: 700 },
      { str: "Číslo nabídky pojistné smlouvy", x: 60, y: 660, width: 160 },
      { str: "0034698485", x: 90, y: 630 },
      { str: "Počátek pojištění", x: 60, y: 590, width: 110 },
      { str: "21.03.2026", x: 210, y: 590 },
      { str: "Nabídka vytvořena dne: 20.03.2026", x: 60, y: 560 },
      { str: "Frekvence splátek pojistného", x: 60, y: 520, width: 160 },
      { str: "Roční", x: 240, y: 520 },
      { str: "Výše platby", x: 60, y: 490, width: 90 },
      { str: "6 885 Kč", x: 200, y: 490 },
    ];

    await expect(parseCppBytexPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "0034698485",
      clientName: "Jiří Sobotka",
      policyStartDate: "2026-03-21",
      contractSignedDate: "2026-03-20",
      frequency: "annual",
      amount: 6885,
    });
  });

  it("maps quarterly and semiannual payment frequencies", async () => {
    pdfState.items = [
      { str: "Frekvence splátek pojistného", x: 60, y: 520, width: 160 },
      { str: "Čtvrtletní", x: 240, y: 520 },
    ];
    await expect(parseCppBytexPdf(makePdfFile())).resolves.toMatchObject({
      frequency: "quarterly",
    });

    pdfState.items = [
      { str: "Frekvence splátek pojistného", x: 60, y: 520, width: 160 },
      { str: "Pololetní", x: 240, y: 520 },
    ];
    await expect(parseCppBytexPdf(makePdfFile())).resolves.toMatchObject({
      frequency: "semiannual",
    });
  });
});
