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

  it.each(["100 000 Kč", "100.000 Kč", "100\u00a0000 Kč", "100000 Kč", "100 000,00 Kč"])(
    "reads the animal damage annual limit (%s) separately from the glass event limit", async limit => {
      pdfState.pages = [["Pojištění skel", "Limit pojistného plnění na pojistnou událost", "15 000 Kč", "Spoluúčast", "1 000 Kč",
        "Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění", limit, "Spoluúčast", "0 Kč"]];
      expect(await parseKooperativaAutoPdf(makePdfFile())).toMatchObject({
        carAddonAnimalDamage: true, carAddonAnimalDamageLimit: 100000, carAddonGlassLimit: 15000,
      });
    },
  );

  it("reads inline and positioned animal damage limits with separately emitted values", async () => {
    pdfState.pages = [["Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění: 100.000 Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonAnimalDamageLimit).toBe(100000);
    pdfState.pages = [["Pojištění poškození vozidla zvířetem",
      { str: "100 000 Kč", transform: [1, 0, 0, 1, 519, 382] },
      { str: "Roční limit pojistného plnění", transform: [1, 0, 0, 1, 33, 382] },
      { str: "Spoluúčast", transform: [1, 0, 0, 1, 33, 369] },
      { str: "1 000 Kč", transform: [1, 0, 0, 1, 524, 369] }]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonAnimalDamageLimit).toBe(100000);
  });

  it.each([
    ["Pojištění poškození vozidla zvířetem", "Spoluúčast", "1 000 Kč"],
    ["Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění", "Spoluúčast", "1 000 Kč"],
    ["Pojištění poškození vozidla zvířetem", "Limit pojistného plnění na pojistnou událost", "15 000 Kč"],
    ["Pojištění poškození vozidla zvířetem", "Pojištění zavazadel", "Roční limit pojistného plnění", "30 000 Kč"],
    ["Pojištění zavazadel", "Roční limit pojistného plnění", "30 000 Kč"],
  ])("does not borrow an animal damage annual limit from another label or coverage (%j)", async (...lines) => {
    pdfState.pages = [lines];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonAnimalDamageLimit).toBeUndefined();
  });

  it.each(["-100 000 Kč", "100.00.0 Kč", "neurčeno", "1 000 000 001 Kč", "100 000 Kč nebo 200 000 Kč"])(
    "leaves malformed animal damage limits (%s) unknown", async limit => {
      pdfState.pages = [["Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění", limit]];
      expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonAnimalDamageLimit).toBeUndefined();
    },
  );

  it("does not choose between conflicting animal damage annual limits", async () => {
    pdfState.pages = [["Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění", "100 000 Kč"],
      ["Pojištění poškození vozidla zvířetem", "Roční limit pojistného plnění", "200 000 Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonAnimalDamageLimit).toBeUndefined();
  });

  it.each(["15 000 Kč", "15.000 Kč", "15\u00a0000 Kč", "15000 Kč", "15 000,00 Kč"])(
    "reads the glass event limit (%s), independently of premiums and deductibles", async limit => {
      pdfState.pages = [["Pojištění skel", "Roční pojistné", "850 Kč",
        "Limit pojistného plnění na pojistnou událost", limit, "Spoluúčast", "1 000 Kč",
        "Pojištění poškození vozidla zvířetem", "Limit pojistného plnění na pojistnou událost", "1 500 Kč"]];
      expect(await parseKooperativaAutoPdf(makePdfFile())).toMatchObject({ carAddonGlass: true, carAddonGlassLimit: 15000 });
    },
  );

  it("reads an inline glass limit and a separately printed currency", async () => {
    pdfState.pages = [["Pojištění skel", "Limit pojistného plnění na pojistnou událost: 15.000 Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBe(15000);
    pdfState.pages = [["Pojištění skel", "Limit pojistného plnění na pojistnou událost", "15 000", "Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBe(15000);
  });

  it("reads the labelled visual row when the text items are emitted in a different order", async () => {
    pdfState.pages = [["Pojištění skel",
      { str: "15 000 Kč", transform: [1, 0, 0, 1, 519, 382] },
      { str: "Limit pojistného plnění na pojistnou událost", transform: [1, 0, 0, 1, 33, 382] },
      { str: "Spoluúčast", transform: [1, 0, 0, 1, 33, 369] },
      { str: "1 000 Kč", transform: [1, 0, 0, 1, 524, 369] }]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBe(15000);
  });

  it("keeps the glass limit separate from the following insured item in the same section", async () => {
    pdfState.pages = [["Pojištění skel", "Co pojišťujeme", "Skla vozidla",
      "Limit pojistného plnění na pojistnou událost", "15 000 Kč", "Spoluúčast", "1 000 Kč",
      "Co pojišťujeme", "Související vybavení", "Limit pojistného plnění na pojistnou událost", "1 500 Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBe(15000);
  });

  it.each([
    ["Pojištění skel", "Spoluúčast", "1 000 Kč"],
    ["Pojištění skel", "Limit pojistného plnění na pojistnou událost", "Spoluúčast", "1 000 Kč"],
    ["Pojištění skel", "Pojištění poškození vozidla zvířetem", "Limit pojistného plnění na pojistnou událost", "1 500 Kč"],
    ["Pojištění poškození vozidla zvířetem", "Limit pojistného plnění na pojistnou událost", "1 500 Kč"],
  ])("does not borrow a glass limit from a deductible or another coverage (%j)", async (...lines) => {
    pdfState.pages = [lines];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBeUndefined();
  });

  it.each(["-15 000 Kč", "15.00.0 Kč", "neurčeno", "1 000 000 001 Kč", "15 000 Kč nebo 30 000 Kč"])(
    "leaves a malformed or ambiguous glass limit (%s) unknown", async limit => {
      pdfState.pages = [["Pojištění skel", "Limit pojistného plnění na pojistnou událost", limit]];
      expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBeUndefined();
    },
  );

  it("does not choose between conflicting limits in repeated glass sections", async () => {
    pdfState.pages = [["Pojištění skel", "Limit pojistného plnění na pojistnou událost", "15 000 Kč"],
      ["Pojištění skel", "Limit pojistného plnění na pojistnou událost", "30 000 Kč"]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).carAddonGlassLimit).toBeUndefined();
  });

  const replacementClause = (number: string) => [
    "Náhrada pojistné smlouvy",
    "Dnem počátku této pojistné smlouvy se v plném rozsahu ruší",
    `pojistná smlouva č. ${number}`,
    ".",
  ];

  it("detects a replacement on a later page and keeps the new and original numbers separate", async () => {
    pdfState.pages = [
      ["Číslo pojistné smlouvy", "6490000088"],
      ["Pojištění náhradního vozidla"],
      replacementClause("6480000077"),
    ];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "6490000088",
      isRefresh: true,
      refreshOriginalContractNumber: "6480000077",
    });
  });

  it("handles accents, whitespace and a contract number in a separate PDF text item", async () => {
    pdfState.pages = [[
      "Číslo pojistné smlouvy: 6490000088",
      "NAHRADA\u00a0POJISTNE SMLOUVY:",
      "Dnem pocatku teto", "pojistne smlouvy se v plnem rozsahu rusi pojistna smlouva c.",
      "0060000077.",
    ]];

    await expect(parseKooperativaAutoPdf(makePdfFile())).resolves.toMatchObject({
      isRefresh: true,
      refreshOriginalContractNumber: "0060000077",
    });
  });

  it("accepts the same original number repeated in the PDF", async () => {
    pdfState.pages = [["Číslo pojistné smlouvy", "6490000088",
      ...replacementClause("6480000077"), ...replacementClause("6480000077")]];
    expect((await parseKooperativaAutoPdf(makePdfFile())).refreshOriginalContractNumber).toBe("6480000077");
  });

  it.each(["", "12345", "123456789012345", "6480000077ABC", "6480000077/1", "6490000088"])(
    "leaves a missing, malformed or self-referencing original number (%s) for manual correction", async number => {
      pdfState.pages = [["Číslo pojistné smlouvy", "6490000088", ...replacementClause(number),
        "Způsob vypořádání vzniklého přeplatku pojistného", "1234567890"]];
      const parsed = await parseKooperativaAutoPdf(makePdfFile());
      expect(parsed.isRefresh).toBe(true);
      expect(parsed.refreshOriginalContractNumber).toBeUndefined();
    }
  );

  it("does not choose between conflicting original numbers", async () => {
    pdfState.pages = [["Číslo pojistné smlouvy", "6490000088",
      ...replacementClause("6480000077"), ...replacementClause("6480000066")]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed.isRefresh).toBe(true);
    expect(parsed.refreshOriginalContractNumber).toBeUndefined();
  });

  it.each([
    ["Pojištění náhradního vozidla", "6480000077"],
    ["Náhrada pojistné smlouvy", "Způsob vypořádání vzniklého přeplatku pojistného", "6480000077"],
    ["Dnem počátku této pojistné smlouvy se v plném rozsahu ruší pojistná smlouva č. 6480000077"],
  ])("does not infer a replacement from unrelated or incomplete text (%j)", async (...lines) => {
    pdfState.pages = [["Číslo pojistné smlouvy", "6490000088", ...lines]];
    const parsed = await parseKooperativaAutoPdf(makePdfFile());
    expect(parsed.isRefresh).toBeUndefined();
    expect(parsed.refreshOriginalContractNumber).toBeUndefined();
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
