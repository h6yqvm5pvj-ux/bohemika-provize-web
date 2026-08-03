import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseKooperativaAutoPdf } from "./parseKooperativaAutoPdf";

const pdfState = vi.hoisted(() => ({
  pages: [] as string[][],
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
          items: (pdfState.pages[pageNumber - 1] ?? []).map((str) => ({ str })),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "kooperativa-auto.pdf", { type: "application/pdf" });

describe("parseKooperativaAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("uses company name when the Kooperativa policyholder is a legal entity", async () => {
    pdfState.pages = [
      [
        "Číslo pojistné smlouvy",
        "6468525432",
        "Pojistník",
        "Název",
        "MM Spedition s.r.o.",
        "Typ osoby",
        "podnikatel, právnická osoba",
        "IČO",
        "28024371",
      ],
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6468525432",
      clientName: "MM Spedition s.r.o.",
    });
  });

  it("keeps parsing personal policyholder names", async () => {
    pdfState.pages = [
      [
        "Číslo pojistné smlouvy",
        "6468692249",
        "Pojistník",
        "Jméno a příjmení",
        "Petr Lexa",
        "Typ osoby",
        "občan",
      ],
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6468692249",
      clientName: "Petr Lexa",
    });
  });
});
