import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseCsobAutoPdf } from "./parseCsobAutoPdf";

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
      cleanup: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
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
  new File(["pdf fixture"], "csob-auto.pdf", { type: "application/pdf" });

describe("parseCsobAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("uses legal entity name for CSOB Auto policyholders", async () => {
    pdfState.pages = [
      [
        { str: "Pojistník", x: 42.5, y: 661.4, width: 49.5 },
        { str: "IČO", x: 42.5, y: 646.4, width: 13.9 },
        {
          str: "Název právnické osoby, obchodní firma právnické osoby nebo označení fyzické osoby podnikatele",
          x: 119, y: 646.4, width: 351.8,
        },
        { str: "40788571", x: 42.5, y: 634.7, width: 44.5 },
        { str: "Tomáš Krejča", x: 119, y: 634.7, width: 66.2 },
        { str: "Pojistný zájem", x: 42.5, y: 367.4, width: 83.2 },
      ],
    ];

    await expect(parseCsobAutoPdf(makePdfFile())).resolves.toMatchObject({
      clientName: "Tomáš Krejča",
    });
  });

  it("keeps parsing personal CSOB Auto policyholder names", async () => {
    pdfState.pages = [
      [
        { str: "Pojistník", x: 42.5, y: 661.4, width: 49.5 },
        { str: "Rodné číslo", x: 42.5, y: 646.4, width: 70 },
        { str: "Titul", x: 119, y: 646.4, width: 35 },
        { str: "Jméno", x: 170, y: 646.4, width: 40 },
        { str: "Příjmení", x: 240, y: 646.4, width: 60 },
        { str: "800101/1234", x: 42.5, y: 634.7, width: 70 },
        { str: "Mgr.", x: 119, y: 634.7, width: 25 },
        { str: "Martin", x: 170, y: 634.7, width: 40 },
        { str: "Tamáš", x: 240, y: 634.7, width: 40 },
        { str: "Pojistný zájem", x: 42.5, y: 367.4, width: 83.2 },
      ],
    ];

    await expect(parseCsobAutoPdf(makePdfFile())).resolves.toMatchObject({
      clientName: "Mgr. Martin Tamáš",
    });
  });
});
