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

  it("reads bank transfer amount, account, variable symbol, and annual frequency", async () => {
    pdfState.pages = [[
      { str: "Číslo návrhu PS: 6207127218", x: 40, y: 800 },
      { str: "Placení pojistného", x: 40, y: 785 },
      { str: "Forma placení", x: 40, y: 770 },
      { str: "Z účtu", x: 40, y: 755 },
      { str: "Četnost placení", x: 40, y: 740 },
      { str: "Roční", x: 40, y: 725 },
      { str: "Pojistné", x: 40, y: 710 },
      { str: "25 886 Kč", x: 40, y: 695 },
      { str: "Číslo účtu příjemce", x: 40, y: 680 },
      { str: "187078376/0300", x: 40, y: 665 },
      { str: "Variabilní symbol", x: 40, y: 650 },
      { str: "6207127218", x: 40, y: 635 },
      { str: "Lhůta k přijetí", x: 40, y: 620 },
    ]];

    await expect(parseCsobAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6207127218",
      amount: 25886,
      frequency: "annual",
      paymentDetails: {
        amount: 25886,
        accountNumber: "187078376/0300",
        variableSymbol: "6207127218",
        dueDate: null,
      },
    });
  });
});
