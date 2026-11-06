import { describe, expect, it } from "vitest";
import { parseDomexNeuronProperty, type DomexPropertyLayoutLine } from "./parseDomexNeuronProperty";

const page = (...lines: string[]): DomexPropertyLayoutLine[] => lines.map((text, index) => ({
  text, items: [{ str: text, x: 30, y: 820 - index * 12, width: text.length * 4 }],
}));
const building = () => [
  "POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Rodinný dům", "Místo pojištění: Testovací 12, 110 00 Praha",
  "Varianta pojištění: MAXI", "Pojistná částka/Limit pojistného plnění", "Požár; Výbuch; přímý úder blesku",
  "Pád letadla a jeho částí", "Pojistná částka 4 700 000 Kč", "Povodeň a záplava", "Limit pojistného plnění 350 000 Kč",
  "Spoluúčast: 1 000 Kč",
];
const household = () => [
  "POJIŠTĚNÍ DOMÁCNOSTI", "DOMÁCNOST – Rekreační", "Místo pojištění: Ukázková 34, 602 00 Brno",
  "Varianta pojištění: MINI", "Pojistná částka/Limit pojistného plnění", "Požár; Výbuch",
  "Pojistná částka 650 000 Kč", "Krádež", "Limit pojistného plnění 90 000 Kč", "Spoluúčast: 500 Kč",
];
const liability = () => [
  "POJIŠTĚNÍ ODPOVĚDNOSTI", "Sublimit pojistného plnění pro škodu na movité věci 100 000 Kč",
  "Limit pojistného plnění: 25 000 000 Kč", "Sublimit pojistného plnění pro finanční škodu 50 000 Kč", "Spoluúčast: 0 Kč",
];

describe("DOMEX Neuron property sections", () => {
  it("keeps building, household, liability and assistance facts in their own sections across pages", () => {
    const result = parseDomexNeuronProperty([
      page(...building().slice(0, 3)),
      page(...building().slice(3), ...household().slice(0, 3)),
      page(...household().slice(3), ...liability(), "ASISTENČNÍ SLUŽBY", "Předmět pojištění Místo pojištění Sjednaný rozsah asistenčních služeb",
        "HLAVNÍ STAVBA Testovací 12, 110 00 Praha Domácí asistence plus", "DOMÁCNOST Ukázková 34, 602 00 Brno Domácí asistence", "SPOLEČNÁ USTANOVENÍ"),
    ]);
    expect(result).toMatchObject({
      domexPropertyType: "dum", domexPropertyAddress: "Testovací 12, 110 00 Praha", domexPropertyCoverage: "maxi",
      domexPropertySumInsured: 4_700_000, domexPropertyDeductible: 1000, domexPropertyAssistance: "plus",
      domexHouseholdType: "rekreacni", domexHouseholdAddress: "Ukázková 34, 602 00 Brno", domexHouseholdCoverage: "mini",
      domexHouseholdSumInsured: 650_000, domexHouseholdDeductible: 500, domexHouseholdAssistance: "basic",
      domexLiabilitySumInsured: 25_000_000, domexLiabilityDeductible: 0,
    });
  });

  it("supports apartment/trvalá types and a multiline hazard label and value", () => {
    expect(parseDomexNeuronProperty([page(
      "POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Bytová jednotka", "Varianta pojištění:", "OPTI", "Požár", "Výbuch", "Pojistná částka", "2 400 000 Kč",
      "POJIŠTĚNÍ DOMÁCNOSTI", "DOMÁCNOST – Trvalá", "Varianta pojištění: NOP", "Požár; Výbuch", "Pojistná částka", "320 000 CZK",
    )])).toMatchObject({ domexPropertyType: "byt", domexPropertyCoverage: "opti", domexPropertySumInsured: 2_400_000,
      domexHouseholdType: "trvale", domexHouseholdCoverage: "nop", domexHouseholdSumInsured: 320_000 });
  });

  it.each(["building", "household", "liability"])("does not invent an absent insured part for an only-%s policy", (part) => {
    const lines = part === "building" ? building() : part === "household" ? household() : liability();
    const result = parseDomexNeuronProperty([page(...lines, "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA Domácí asistence plus",
      "DOMÁCNOST Domácí asistence", "SPOLEČNÁ USTANOVENÍ", "Frekvence placení: Roční")]);
    if (part !== "building") expect(result).toMatchObject({ domexPropertyType: null, domexPropertyAddress: null,
      domexPropertySumInsured: null, domexPropertyCoverage: null, domexPropertyAssistance: null });
    if (part !== "household") expect(result).toMatchObject({ domexHouseholdType: null, domexHouseholdAddress: null,
      domexHouseholdSumInsured: null, domexHouseholdCoverage: null, domexHouseholdAssistance: null });
    if (part !== "liability") expect(result?.domexLiabilitySumInsured).toBeNull();
  });

  it("keeps missing building labels unknown instead of copying the household's labels", () => {
    const result = parseDomexNeuronProperty([page("POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Rodinný dům", "Místo pojištění:",
      ...household(), ...liability())]);
    expect(result).toMatchObject({ domexPropertyAddress: null, domexPropertyCoverage: null, domexPropertySumInsured: null,
      domexHouseholdCoverage: "mini", domexHouseholdSumInsured: 650_000 });
  });

  it("does not substitute another risk limit, sublimit or deductible for the fire sum insured", () => {
    const result = parseDomexNeuronProperty([page("POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Rodinný dům", "Varianta pojištění: MAXI",
      "Požár; Výbuch", "Limit pojistného plnění 70 000 Kč", "Jiné nebezpečí", "Pojistná částka 800 000 Kč", "Spoluúčast: 1 000 Kč",
      "POJIŠTĚNÍ ODPOVĚDNOSTI", "Sublimit pojistného plnění 40 000 Kč", "Spoluúčast: 500 Kč")]);
    expect(result).toMatchObject({ domexPropertySumInsured: null, domexPropertyDeductible: 1000, domexLiabilitySumInsured: null });
  });

  it("does not take a sum insured from an unrelated table when the main fire hazard is missing", () => {
    expect(parseDomexNeuronProperty([page("HLAVNÍ STAVBA – Bytová jednotka", "Varianta pojištění: OPTI",
      "Povodeň a záplava", "Pojistná částka 350 000 Kč")])?.domexPropertySumInsured).toBeNull();
  });

  it("extracts the entire centered address while excluding neighboring labels and the right sidebar", () => {
    const lines = page("POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Rodinný dům");
    lines.push(
      { text: "Testovací 12, 110 00 Praha", items: [{ str: "Testovací 12, 110 00", x: 160, y: 710, width: 130 },
        { str: "Praha", x: 420, y: 710, width: 24 }] },
      { text: "Místo pojištění: Riziková zóna 9", items: [
        { str: "Místo pojištění:", x: 30, y: 704, width: 65 }, { str: "Riziková zóna 9", x: 450, y: 704, width: 100 },
      ] },
      { text: "část obce", items: [{ str: "část obce", x: 160, y: 699, width: 30 }] },
      { text: "Konstrukce stavby: syntetická Domácí asistence plus", items: [
        { str: "Konstrukce stavby:", x: 30, y: 680, width: 80 }, { str: "syntetická", x: 160, y: 680, width: 50 },
        { str: "Domácí asistence plus", x: 450, y: 680, width: 100 },
      ] },
    );
    expect(parseDomexNeuronProperty([lines])?.domexPropertyAddress).toBe("Testovací 12, 110 00 Praha část obce");
  });

  it("resolves multiline assistance per insured part even if the table repeats full part headings", () => {
    expect(parseDomexNeuronProperty([page(...building(), ...household(), "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA – Rodinný dům",
      "Místo pojištění: Testovací 12, 110 00 Praha", "Domácí asistence", "plus", "DOMÁCNOST – Rekreační",
      "Místo pojištění: Ukázková 34, 602 00 Brno", "Domácí asistence")])).toMatchObject({
      domexPropertyAssistance: "plus", domexHouseholdAssistance: "basic",
    });
  });

  it.each(["Nesjednáno", "Domácí asistence neznámá", "Domácí asistence plus extra"])("keeps an unknown assistance choice unknown: %s", (choice) => {
    expect(parseDomexNeuronProperty([page(...building(), "ASISTENČNÍ SLUŽBY", `HLAVNÍ STAVBA ${choice}`)])?.domexPropertyAssistance).toBeNull();
  });

  it("does not infer assistance from a heading or copy a policy's general plus mention to both parts", () => {
    expect(parseDomexNeuronProperty([page(...building(), ...household(), "Domácí asistence plus", "ASISTENČNÍ SLUŽBY")])).toMatchObject({
      domexPropertyAssistance: null, domexHouseholdAssistance: null, domexAssistancePlus: null,
    });
  });

  it("does not let the later basic-versus-plus explanation override an already assigned household choice", () => {
    expect(parseDomexNeuronProperty([
      page(...building(), ...household(), "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA Testovací 12, 110 00 Praha Domácí asistence plus", "DOMÁCNOST Ukázková 34, 602 00 Brno Domácí asistence"),
      page("Rozsah asistenčních služeb Domácí asistence Domácí asistence plus", "Další informace o variantách"),
    ])).toMatchObject({ domexPropertyAssistance: "plus", domexHouseholdAssistance: "basic" });
  });

  it("does not fill a missing assistance answer from a later explanatory table or another page", () => {
    expect(parseDomexNeuronProperty([
      page(...building(), ...household(), "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA", "DOMÁCNOST"),
      page("Domácí asistence plus"),
    ])).toMatchObject({ domexPropertyAssistance: null, domexHouseholdAssistance: null });
    expect(parseDomexNeuronProperty([page(...building(), "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA", "Údaj není vyplněný",
      "Vysvětlení", "Vysvětlení", "Domácí asistence plus")])?.domexPropertyAssistance).toBeNull();
  });

  it("leaves legacy DOMEX layouts to the existing parser", () => {
    expect(parseDomexNeuronProperty([page("POJIŠTĚNÍ STAVEB", "Předmět pojištění Rodinný dům", "Rozsah pojištění MAXI",
      "POJIŠTĚNÍ DOMÁCNOSTI", "Předmět pojištění Trvale obydlená domácnost", "POJIŠTĚNÍ ODPOVĚDNOSTI", "Limit pojistného plnění 20 000 000 Kč")])).toBeNull();
  });
});
