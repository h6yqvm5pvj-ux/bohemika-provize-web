import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseDomexNeuronPdf, parseDomexPdf } from "./parseDomexPdf";

const pdfState = vi.hoisted(() => ({
  lines: [] as string[],
  paymentItems: [] as Array<{ str: string; transform: number[]; width: number }>,
  needsOcr: false,
  extraPages: [] as Array<{ items: Array<{ str: string; transform: number[]; width: number }>; needsOcr: boolean }>,
}));

vi.mock("./pdfDocumentText", () => ({
  readPdfText: vi.fn(async () => ({
    pages: [{
      needsOcr: pdfState.needsOcr,
      items: [...pdfState.lines.map((str, index) => ({
        str,
        transform: [1, 0, 0, 1, 30, 820 - index * 12],
        width: 300,
      })), ...pdfState.paymentItems],
    }, ...pdfState.extraPages],
    warnings: [],
    ocrTextUsed: false,
  })),
}));

const makePdfFile = () => new File(["synthetic fixture"], "domex.pdf", { type: "application/pdf" });

const neuronLines = () => [
  "Číslo pojistné smlouvy",
  "0090000017",
  "PRO POJIŠTĚNÍ MAJETKU A ODPOVĚDNOSTI OBČANŮ DOMEX+",
  "ZPROSTŘEDKOVATEL",
  "Jméno a příjmení: Jiří Poradce",
  "POJISTNÍK",
  "Jméno a příjmení: Mgr. Tereza Novotná Rodné číslo: 000000/0000",
  "POJIŠTĚNÝ",
  "Jméno a příjmení: Petr Pojištěný",
  "Počátek pojištění: 1. 1. 2020",
  "SPOLEČNÁ USTANOVENÍ",
  "Pojistná doba: Na dobu určitou Počátek pojištění: 12. 10. 2026 Konec pojištění: 11. 10. 2027",
  "Pojistné období: Roční Automatická obnova ke konci pojistného období: ANO",
  "Frekvence placení: Pololetní",
  "Roční pojistné po slevách a přirážkách: 4 800 Kč Výše pravidelné platby: 2 400 Kč",
  "Nabídka vytvořena dne: 8. 10. 2026",
  "Tisk SUS Plus 9. 10. 2026",
  "Pojistná smlouva uzavřena dne: 10. 10. 2026 9:49",
];

const paymentLines = () => [
  "ČÁSTKA K ÚHRADĚ 1 234,50 Kč",
  "ČÍSLO ÚČTU 19-2000145399/0800",
  "VARIABILNÍ SYMBOL 0090000017",
  "DATUM SPLATNOSTI 12. 10. 2026",
];

describe("parseDomexPdf", () => {
  beforeEach(() => { pdfState.lines = neuronLines(); pdfState.paymentItems = []; pdfState.needsOcr = false; pdfState.extraPages = []; });

  it("records unreadable Neuron sections for a scan without claiming that they are absent or uncontracted", async () => {
    pdfState.lines = [];
    pdfState.needsOcr = true;
    const result = await parseDomexNeuronPdf(makePdfFile());
    expect(result.domexNeuron).toEqual({ parserVersion: 2, objects: [], sections: {
      property: "unreadable", household: "unreadable", liability: "unreadable", assistance: "unreadable",
    }, liabilityFields: { sumInsured: "unreadable", deductible: "unreadable" } });
    expect((await parseDomexPdf(makePdfFile())).domexNeuron).toBeUndefined();
  });

  it("distinguishes readable missing sections in explicit Neuron mode from an unreadable document", async () => {
    pdfState.lines = ["Toto je čitelný syntetický dokument bez údajů o majetku a bez jednotlivých pojištěných částí. ".repeat(3)];
    const result = await parseDomexNeuronPdf(makePdfFile());
    expect(result.domexNeuron.sections).toEqual({ property: "not_found", household: "not_found", liability: "not_found", assistance: "not_found" });
    expect((await parseDomexPdf(makePdfFile())).domexNeuron).toBeUndefined();
    pdfState.lines.push("POJIŠTĚNÍ DOMÁCNOSTI: Nesjednáno");
    expect((await parseDomexNeuronPdf(makePdfFile())).domexNeuron.sections.household).toBe("not_insured");
  });

  it("preserves proved facts in mixed native/scanned PDFs while marking missing extraction as unreadable", async () => {
    pdfState.lines.push("HLAVNÍ STAVBA – Rodinný dům", "Místo pojištění: Testovací 12, Praha", "Varianta pojištění: MAXI",
      "Požár; Výbuch", "Pojistná částka 4 700 000 Kč");
    pdfState.extraPages = [{ items: [], needsOcr: true }];
    const result = await parseDomexNeuronPdf(makePdfFile());
    expect(result.domexNeuron.sections).toMatchObject({ property: "found", household: "unreadable", liability: "unreadable" });
    expect(result.domexNeuron.objects[0]).toMatchObject({ address: "Testovací 12, Praha", sumInsured: 4_700_000,
      fields: { address: "found", sumInsured: "found", assistance: "unreadable" } });
    expect(result.pdfImportWarnings).toContain("DOMEX Neuron: část PDF je nečitelná; seznam objektů a načtené údaje mohou být neúplné.");
    pdfState.lines.push("POJIŠTĚNÍ DOMÁCNOSTI: Nesjednáno");
    expect((await parseDomexNeuronPdf(makePdfFile())).domexNeuron.sections.household).toBe("not_insured");
  });

  it("does not call a short readable page corrupted without scan provenance", async () => {
    pdfState.lines = ["Krátký čitelný dokument."];
    expect((await parseDomexNeuronPdf(makePdfFile())).domexNeuron.sections.household).toBe("not_found");
  });

  it("preserves preexisting import warnings when the Neuron object limit is exceeded", async () => {
    pdfState.lines = neuronLines().map(line => line.replace("2 400 Kč", "2 700 Kč"));
    pdfState.lines.push(...Array.from({ length: 51 }, (_, index) => ["HLAVNÍ STAVBA – Rodinný dům", `Místo pojištění: Testovací ${index + 1}, Praha`,
      "Varianta pojištění: MAXI", "Požár; Výbuch", "Pojistná částka 4 000 000 Kč"]).flat());
    const result = await parseDomexNeuronPdf(makePdfFile());
    expect(result.domexNeuron.objects).toHaveLength(50);
    expect(result.pdfImportWarnings).toEqual(expect.arrayContaining([
      "Pojistné: součet pravidelných plateb podle frekvence se liší od ročního pojistného po slevách a přirážkách.",
      "DOMEX Neuron: PDF obsahuje více než 50 objektů; načtené údaje vyžadují ruční kontrolu.",
    ]));
  });

  it("extracts only the labelled payment block from positioned columns, preserving variable-symbol zeroes", async () => {
    pdfState.lines.push("Číslo účtu pojistníka: 178124-4159/0710");
    const pairs = [
      ["ČÁSTKA K ÚHRADĚ", "1 234,50 Kč"],
      ["ČÍSLO ÚČTU", "19-2000145399/0800"],
      ["VARIABILNÍ SYMBOL", "0090000017"],
      ["DATUM SPLATNOSTI", "12. 10. 2026"],
    ];
    pdfState.paymentItems = pairs.flatMap(([label, value], index) => [
      { str: label, transform: [1, 0, 0, 1, 36, 500 - index * 17], width: 100 },
      { str: value, transform: [1, 0, 0, 1, 180, 500 - index * 17], width: 100 },
    ]);
    expect((await parseDomexPdf(makePdfFile())).paymentDetails).toEqual({
      amount: 1234.5, accountNumber: "19-2000145399/0800", variableSymbol: "0090000017", dueDate: "2026-10-12",
    });
  });

  it("supports payment values on following lines and a missing variable symbol using the policy header", async () => {
    pdfState.lines.push(...paymentLines().filter(line => !line.startsWith("VARIABILNÍ SYMBOL")).flatMap(line => {
      const match = line.match(/^(ČÁSTKA K ÚHRADĚ|ČÍSLO ÚČTU|DATUM SPLATNOSTI) (.+)$/)!;
      return [match[1], match[2]];
    }));
    expect((await parseDomexPdf(makePdfFile())).paymentDetails).toMatchObject({
      amount: 1234.5, variableSymbol: "0090000017", dueDate: "2026-10-12",
    });
  });

  it.each([
    ["VARIABILNÍ SYMBOL 0090000017", "VARIABILNÍ SYMBOL 0090000018"],
    ["VARIABILNÍ SYMBOL 0090000017", "VARIABILNÍ SYMBOL"],
    ["ČÁSTKA K ÚHRADĚ 1 234,50 Kč", "ČÁSTKA K ÚHRADĚ -1 234,50 Kč"],
    ["ČÁSTKA K ÚHRADĚ 1 234,50 Kč", "ČÁSTKA K ÚHRADĚ 0 Kč"],
    ["ČÁSTKA K ÚHRADĚ 1 234,50 Kč", "ČÁSTKA K ÚHRADĚ 1 234,501 Kč"],
    ["ČÁSTKA K ÚHRADĚ 1 234,50 Kč", "ČÁSTKA K ÚHRADĚ 12 34,50 Kč"],
    ["ČÁSTKA K ÚHRADĚ 1 234,50 Kč", "ČÁSTKA K ÚHRADĚ 1 234,50 EUR"],
    ["ČÍSLO ÚČTU 19-2000145399/0800", "ČÍSLO ÚČTU 1234567890/0800"],
    ["DATUM SPLATNOSTI 12. 10. 2026", "DATUM SPLATNOSTI 31. 2. 2026"],
  ])("does not offer payment details with a malformed or mismatched field: %s", async (from, to) => {
    pdfState.lines.push(...paymentLines().map(line => line.replace(from, to)));
    expect((await parseDomexPdf(makePdfFile())).paymentDetails).toBeUndefined();
  });

  it("does not combine a missing payment account with a policyholder account elsewhere", async () => {
    pdfState.lines.push("ČÍSLO ÚČTU 178124-4159/0710", ...paymentLines().filter(line => !line.startsWith("ČÍSLO ÚČTU")));
    expect((await parseDomexPdf(makePdfFile())).paymentDetails).toBeUndefined();
  });

  it("rejects conflicting payment blocks instead of choosing an arbitrary recipient", async () => {
    pdfState.lines.push(...paymentLines(), ...paymentLines().map(line => line.replace("19-2000145399/0800", "178124-4159/0710")));
    expect((await parseDomexPdf(makePdfFile())).paymentDetails).toBeUndefined();
  });

  it("extracts Neuron fields from the policyholder and shared provisions sections", async () => {
    const result = await parseDomexPdf(makePdfFile());
    expect(result).toMatchObject({
      contractNumber: "0090000017",
      clientName: "Mgr. Tereza Novotná",
      policyStartDate: "2026-10-12",
      policyTermEndDate: "2027-10-11",
      policyEndDate: null,
      automaticRenewal: true,
      contractSignedDate: "2026-10-10",
      frequency: "semiannual",
      amount: 2400,
      annualPremium: 4800,
    });
    expect(result.pdfImportWarnings).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("000000/0000");
    expect(JSON.stringify(result)).not.toContain("Jiří Poradce");
    expect(JSON.stringify(result)).not.toContain("Petr Pojištěný");
  });

  it("uses the printed end date when automatic renewal is explicitly disabled", async () => {
    pdfState.lines = neuronLines().map(line => line.replace("období: ANO", "období: NE"));
    await expect(parseDomexPdf(makePdfFile())).resolves.toMatchObject({
      automaticRenewal: false,
      policyEndDate: "2027-10-11",
      policyTermEndDate: "2027-10-11",
    });
  });

  it.each([
    ["Valorizace: ANO", true],
    ["Valorizace NE", false],
    ["VALORIZACE:\u00a0ano", true],
    ["Valorizace:\nNE", false],
    ["Pojistné období: Roční Valorizace: ANO Frekvence placení: Pololetní", true],
  ] as const)("reads explicit indexation fields: %s", async (label, expected) => {
    pdfState.lines.splice(12, 0, ...label.split("\n"));
    expect((await parseDomexPdf(makePdfFile())).premiumIndexationEnabled).toBe(expected);
  });

  it.each(["Valorizace:", "Valorizace: možná", "Valorizace: 1", "Valorizace: ANO / NE", "Valorizace: ANO NE", "Valorizace: ano-ne"])(
    "keeps indexation unknown for incomplete, invalid or ambiguous answers: %s", async (label) => {
      pdfState.lines.splice(12, 0, ...label.split("\n"));
      expect((await parseDomexPdf(makePdfFile())).premiumIndexationEnabled).toBeNull();
    },
  );

  it("does not infer indexation from automatic renewal or explanatory prose", async () => {
    pdfState.lines.unshift("Při valorizaci se pojistné může změnit.");
    const result = await parseDomexPdf(makePdfFile());
    expect(result.automaticRenewal).toBe(true);
    expect(result.premiumIndexationEnabled).toBeNull();
  });

  it.each([
    [["Valorizace: NE", "Valorizace: NE"], false],
    [["Valorizace: ANO", "Valorizace: ANO"], true],
    [["Valorizace: ANO", "Valorizace: NE"], true],
    [["Valorizace: NE", "Valorizace: ANO"], true],
  ] as const)("reads separate building and household indexation fields before shared provisions: %s", async (fields, expected) => {
    pdfState.lines.splice(10, 0, "POJIŠTĚNÍ STAVEB", fields[0], "POJIŠTĚNÍ DOMÁCNOSTI", fields[1]);
    expect((await parseDomexPdf(makePdfFile())).premiumIndexationEnabled).toBe(expected);
  });

  it.each([
    ["Čtvrtletní", "quarterly", "1 200"],
    ["Roční", "annual", "4 800"],
  ])("maps %s payments independently of the annual term", async (label, frequency, amount) => {
    pdfState.lines = neuronLines().map(line => line.replace("Pololetní", label).replace("2 400 Kč", `${amount} Kč`));
    const result = await parseDomexPdf(makePdfFile());
    expect(result).toMatchObject({ frequency, amount: Number(amount.replace(/\s/g, "")) });
    expect(result.pdfImportWarnings).toBeUndefined();
  });

  it("warns when payments do not agree with the annual premium without changing the payment", async () => {
    pdfState.lines = neuronLines().map(line => line.replace("2 400 Kč", "2 700 Kč"));
    const result = await parseDomexPdf(makePdfFile());
    expect(result.amount).toBe(2700);
    expect(result.pdfImportWarnings).toEqual([
      "Pojistné: součet pravidelných plateb podle frekvence se liší od ročního pojistného po slevách a přirážkách.",
    ]);
  });

  it("keeps renewal unknown when the answer is missing instead of ending the contract", async () => {
    pdfState.lines = neuronLines().map(line => line.replace("období: ANO", "období:"));
    const result = await parseDomexPdf(makePdfFile());
    expect(result.policyTermEndDate).toBe("2027-10-11");
    expect(result.automaticRenewal).toBeUndefined();
    expect(result.policyEndDate).toBeUndefined();
    expect(result.pdfImportWarnings).toContain("Prolongace: ověř ANO / NE a datum konce pojištění podle PDF.");
  });

  it("rejects impossible policy dates and warns if a nonrenewing contract has no valid end", async () => {
    pdfState.lines = neuronLines().map(line => line
      .replace("12. 10. 2026", "31. 2. 2026")
      .replace("11. 10. 2027", "32. 10. 2027")
      .replace("období: ANO", "období: NE"));
    const result = await parseDomexPdf(makePdfFile());
    expect(result.policyStartDate).toBeUndefined();
    expect(result.policyTermEndDate).toBeUndefined();
    expect(result.policyEndDate).toBeNull();
    expect(result.pdfImportWarnings).toContain("Prolongace: smlouva se automaticky neobnovuje, ale datum konce pojištění chybí nebo je neplatné.");
  });

  it("does not substitute the annual term for an unrecognized Neuron payment frequency", async () => {
    pdfState.lines = neuronLines().map(line => line.replace("Pololetní", "Neznámá"));
    expect((await parseDomexPdf(makePdfFile())).frequency).toBeUndefined();
  });

  it("keeps legacy DOMEX replacement numbers, payment labels and creation date", async () => {
    pdfState.lines = [
      "Náhrada smlouvy Číslo pojistné smlouvy",
      "0030000012 0030000013",
      "POJISTNÍK",
      "Jméno a příjmení",
      "Ing. Pavel Nový",
      "Rodné číslo: 000000/0000",
      "Počátek pojištění 1. 6. 2025",
      "Frekvence splátek pojistného Čtvrtletní",
      "Výše platby 1 250 Kč",
      "Nabídka vytvořena dne: 30. 5. 2025",
    ];
    const result = await parseDomexPdf(makePdfFile());
    expect(result).toMatchObject({
      isRefresh: true,
      refreshOriginalContractNumber: "0030000012",
      contractNumber: "0030000013",
      clientName: "Ing. Pavel Nový",
      policyStartDate: "2025-06-01",
      frequency: "quarterly",
      amount: 1250,
      contractSignedDate: "2025-05-30",
    });
    expect(result.pdfImportWarnings).toBeUndefined();
    expect(result.automaticRenewal).toBeUndefined();
  });

  it("keeps legacy property parsing when a generic liability heading is present", async () => {
    pdfState.lines = ["POJIŠTĚNÍ STAVEB", "Předmět pojištění Rodinný dům", "Rozsah pojištění MAXI",
      "Pojistné částky, pojistné a spoluúčast", "Hlavní stavba", "Pojistná částka 4 000 000 Kč", "Spoluúčast 1 000 Kč",
      "POJIŠTĚNÍ DOMÁCNOSTI", "Předmět pojištění Trvale obydlená domácnost", "Rozsah pojištění MINI",
      "Pojistné částky, pojistné a spoluúčast", "Trvale obydlená domácnost", "Pojistná částka 400 000 Kč", "Spoluúčast 500 Kč",
      "POJIŠTĚNÍ ODPOVĚDNOSTI", "Limit pojistného plnění 20 000 000 Kč"];
    expect(await parseDomexPdf(makePdfFile())).toMatchObject({ domexPropertyType: "dum", domexPropertyCoverage: "maxi",
      domexPropertySumInsured: 4_000_000, domexHouseholdType: "trvale", domexHouseholdCoverage: "mini", domexHouseholdSumInsured: 400_000 });
  });

  it("uses the scoped Neuron fields and does not infer legacy addons from risk names", async () => {
    pdfState.lines.push("POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Rodinný dům", "Místo pojištění: Testovací 12, Praha",
      "Varianta pojištění: MAXI", "Požár; Výbuch", "Pojistná částka 4 700 000 Kč",
      "Náhrada újmy na mobilním telefonu, tabletu a notebooku DPPBOZ", "Odpovědnost nájemce na věci nemovité DPPBOZ");
    expect(await parseDomexPdf(makePdfFile())).toMatchObject({ domexPropertyType: "dum", domexPropertyAddress: "Testovací 12, Praha",
      domexPropertyCoverage: "maxi", domexPropertySumInsured: 4_700_000, domexHouseholdType: null, domexHouseholdSumInsured: null,
      domexOutbuildingSumInsured: null, domexLiabilityMobile: null, domexLiabilityTenant: null, domexLiabilityLandlord: null });
  });

  it("keeps the offer number separate from the original policy in stacked Neuron boxes", async () => {
    pdfState.lines = [
      "Číslo nabídky pojistné smlouvy",
      "0090000018",
      "Náhrada smlouvy",
      "0030000012",
      ...neuronLines().slice(2).filter(line => !line.startsWith("Pojistná smlouva uzavřena")),
      "Nabídka pojistné smlouvy předložena: 11. 10. 2026 9:40",
    ];
    expect(await parseDomexPdf(makePdfFile())).toMatchObject({
      contractNumber: "0090000018",
      isRefresh: true,
      refreshOriginalContractNumber: "0030000012",
      contractSignedDate: "2026-10-11",
    });
  });

  it("supports offer headers next to the replacement header in the legacy column layout", async () => {
    pdfState.lines = [
      "Náhrada smlouvy Číslo nabídky pojistné smlouvy",
      "0030000012 0090000018",
    ];
    expect(await parseDomexPdf(makePdfFile())).toMatchObject({
      isRefresh: true,
      refreshOriginalContractNumber: "0030000012",
      contractNumber: "0090000018",
    });
  });

  it("does not mark an ordinary offer as a replacement", async () => {
    pdfState.lines = ["Číslo nabídky pojistné smlouvy: 0090000018"];
    const result = await parseDomexPdf(makePdfFile());
    expect(result.contractNumber).toBe("0090000018");
    expect(result.isRefresh).toBeUndefined();
    expect(result.refreshOriginalContractNumber).toBeUndefined();
  });

  it("does not take the new policy number from the next labelled box as a missing original", async () => {
    pdfState.lines = ["Náhrada smlouvy", "Číslo nabídky pojistné smlouvy", "0090000018"];
    const result = await parseDomexPdf(makePdfFile());
    expect(result.contractNumber).toBe("0090000018");
    expect(result.isRefresh).toBeUndefined();
    expect(result.refreshOriginalContractNumber).toBeUndefined();
  });

  it("does not take the original policy number from the next labelled box as a missing offer number", async () => {
    pdfState.lines = ["Číslo nabídky pojistné smlouvy", "Náhrada smlouvy", "0030000012"];
    const result = await parseDomexPdf(makePdfFile());
    expect(result.contractNumber).toBeUndefined();
    expect(result.refreshOriginalContractNumber).toBe("0030000012");
  });

  it.each([
    ["Nabídka pojistné smlouvy předložena: 11. 10. 2026 9:40"],
    ["NABIDKA POJISTNE SMLOUVY PREDLOZENA:\n11. 10. 2026"],
    ["Nabídka\u00a0pojistné smlouvy předložena: 11.\u00a010.\u00a02026"],
  ])("prefers the offer presentation date over creation and printing dates: %s", async (line) => {
    pdfState.lines = neuronLines().filter(value => !value.startsWith("Pojistná smlouva uzavřena"));
    pdfState.lines.push(line);
    expect((await parseDomexPdf(makePdfFile())).contractSignedDate).toBe("2026-10-11");
  });

  it("keeps the signing date ahead of the offer presentation date", async () => {
    pdfState.lines.push("Nabídka pojistné smlouvy předložena: 9. 10. 2026 9:40");
    expect((await parseDomexPdf(makePdfFile())).contractSignedDate).toBe("2026-10-10");
  });

  it("rejects an impossible offer presentation date", async () => {
    pdfState.lines = ["Nabídka pojistné smlouvy předložena: 31. 2. 2026 9:40"];
    expect((await parseDomexPdf(makePdfFile())).contractSignedDate).toBeUndefined();
  });

  it("does not take the insured person's name when the policyholder's name is missing", async () => {
    pdfState.lines = neuronLines().filter(line => !line.includes("Mgr. Tereza"));
    expect((await parseDomexPdf(makePdfFile())).clientName).toBeUndefined();
  });
});
