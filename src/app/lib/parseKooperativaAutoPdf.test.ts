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

  it("reads the birth number from B Pojistník, excluding the insurer and vehicle owner", async () => {
    pdfState.pages = [["A Pojistitel", "IČO: 87654321", "B Pojistník", "Typ osoby: občan",
      "Rodné číslo: 950714/1234", "C Vlastník vozidla", "Rodné číslo: 900101/4321", "IČO: 12345678"]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed).toMatchObject({ birthNumber: "9507141234", policyholderType: "natural_person" });
    expect(parsed.companyId).toBeUndefined();
  });

  it.each(["IČ", "IČO", "I Č O"])("reads a company's %s from the B section without losing leading zeros", async label => {
    pdfState.pages = [["A Pojistitel", "IČO: 87654321", "B. Pojistník", "Typ osoby", "právnická osoba",
      `${label}: 0012 3456`, "C. Provozovatel vozidla", "IČO: 12345678"]];
    expect(await parseKooperativaAutoPdf(makePdfFile())).toMatchObject({ companyId: "00123456", policyholderType: "legal_entity" });
  });

  it("accepts a section letter separated from the Pojistník heading", async () => {
    pdfState.pages = [["B", "Pojistník", "Rodné číslo", "950714/1234", "C", "Pojištěný", "Rodné číslo", "900101/4321"]];
    expect(await parseKooperativaAutoPdf(makePdfFile())).toMatchObject({ birthNumber: "9507141234" });
  });

  it("never infers policyholder identifiers when the policyholder section is missing", async () => {
    pdfState.pages = [["A Pojistitel", "IČO: 87654321", "C Pojištěný", "Rodné číslo: 950714/1234", "Datum narození: 14.07.1995"]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed.birthNumber).toBeUndefined();
    expect(parsed.companyId).toBeUndefined();
    expect(parsed.policyholderBirthDate).toBeUndefined();
  });

  it("does not fill a missing policyholder RČ from the next person's section", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: občan", "Rodné číslo", "C Vlastník vozidla", "Rodné číslo: 950714/1234"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).birthNumber).toBeUndefined();
  });

  it("does not fill a company's missing IČO using DIČ or an insurer footer", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: právnická osoba", "IČO", "DIČ", "CZ00123456",
      "Kooperativa pojišťovna, a.s.", "IČO: 87654321"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).companyId).toBeUndefined();
  });

  it("keeps a representative's personal identifier out of the company policyholder", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: právnická osoba", "IČO: 00123456",
      "Osoba oprávněná jednat za pojistníka", "Rodné číslo: 950714/1234", "Datum narození: 14.07.1995"]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed).toMatchObject({ companyId: "00123456", policyholderType: "legal_entity" });
    expect(parsed.birthNumber).toBeUndefined();
    expect(parsed.policyholderBirthDate).toBeUndefined();
  });

  it("does not borrow a representative's IČO when the company's field is missing", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: právnická osoba", "IČO", "Zástupce pojistníka", "IČO: 00123456"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).companyId).toBeUndefined();
  });

  it("rejects conflicting identifiers across repeated policyholder sections", async () => {
    pdfState.pages = [["B Pojistník", "Rodné číslo: 950714/1234", "C Provozovatel vozidla"],
      ["B Pojistník", "Rodné číslo: 900101/4321", "C Provozovatel vozidla"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).birthNumber).toBeUndefined();
  });

  it("accepts a repeated policyholder section when the identifier stays the same", async () => {
    pdfState.pages = [["B Pojistník", "Rodné číslo: 950714/1234", "C Provozovatel vozidla"],
      ["B Pojistník", "Rodné číslo: 950714/1234", "C Provozovatel vozidla"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).birthNumber).toBe("9507141234");
  });

  it("does not combine a person and a company from separate B sections", async () => {
    pdfState.pages = [["B Pojistník", "Rodné číslo: 950714/1234", "C Provozovatel vozidla"],
      ["B Pojistník", "IČO: 00123456", "C Provozovatel vozidla"]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed.birthNumber).toBeUndefined();
    expect(parsed.companyId).toBeUndefined();
  });

  it("rejects two different IČOs in the same policyholder section", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: právnická osoba", "IČO: 00123456", "IČ: 12345678"]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed.companyId).toBeUndefined();
    expect(parsed.policyholderType).toBeUndefined();
  });

  it("reads an RČ from the labelled visual row inside the policyholder block", async () => {
    pdfState.pages = [["B Pojistník",
      { str: "Rodné číslo", transform: [1, 0, 0, 1, 33, 589] }, "Jiné pole",
      { str: "950714/1234", transform: [1, 0, 0, 1, 165, 589] }, "C Provozovatel vozidla"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).birthNumber).toBe("9507141234");
  });

  it("does not use a direct birth date from the insured's section", async () => {
    pdfState.pages = [["B Pojistník", "Typ osoby: občan", "Datum narození", "C Pojištěný", "Datum narození: 14.07.1995"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).policyholderBirthDate).toBeUndefined();
  });
});
