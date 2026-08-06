import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  birthDateFromCzechBirthNumber,
  parseKooperativaAutoPdf,
} from "./parseKooperativaAutoPdf";

type PdfTextItemFixture =
  | string
  | {
      str: string;
      transform: number[];
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
          items: (pdfState.pages[pageNumber - 1] ?? []).map((item) =>
            typeof item === "string" ? { str: item } : item
          ),
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
        { str: "IČO", transform: [1, 0, 0, 1, 33, 589] },
        { str: "DIČ", transform: [1, 0, 0, 1, 49, 589] },
        { str: "28024371", transform: [1, 0, 0, 1, 165, 589] },
      ],
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6468525432",
      clientName: "MM Spedition s.r.o.",
      companyId: "28024371",
      policyholderType: "legal_entity",
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
        "Rodné číslo",
        "950714/1234",
      ],
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6468692249",
      clientName: "Petr Lexa",
      birthNumber: "9507141234",
      policyholderType: "natural_person",
    });
  });

  it("uses a direct birth date for a foreign policyholder", async () => {
    pdfState.pages = [
      [
        "Číslo pojistné smlouvy",
        "6484962448",
        "Pojistník",
        "Jméno a příjmení",
        "Maria Nováková",
        "Typ osoby",
        "fyzická osoba, cizinec",
        { str: "Datum narození", transform: [1, 0, 0, 1, 33, 589] },
        { str: "7. 11. 1990", transform: [1, 0, 0, 1, 165, 589] },
      ],
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6484962448",
      policyholderType: "natural_person",
      policyholderBirthDate: "1990-11-07",
    });
  });

  it("converts Czech birth numbers to a birth date", () => {
    expect(birthDateFromCzechBirthNumber("950714/1234")).toBe("14.07.1995");
    expect(birthDateFromCzechBirthNumber("045714/1234")).toBe("14.07.2004");
    expect(birthDateFromCzechBirthNumber("991332/1234")).toBeNull();
  });
});
