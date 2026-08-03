import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseCppAutoPdf } from "./parseCppAutoPdf";

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
      ],
    ];

    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3271000001",
      clientName: "Martin Tamáš",
    });
  });
});
