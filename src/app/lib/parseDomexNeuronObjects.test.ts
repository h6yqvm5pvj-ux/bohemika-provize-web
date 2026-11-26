import { describe, expect, it } from "vitest";
import { parseDomexNeuronProperty, type DomexPropertyLayoutLine } from "./parseDomexNeuronProperty";
import { DOMEX_NEURON_MAX_OBJECTS, DOMEX_NEURON_PARSER_VERSION } from "./domexNeuronSchema";
import { normalizeDomexNeuronData } from "./domexNeuronValidation";

const page = (...lines: string[]): DomexPropertyLayoutLine[] => lines.map((text, index) => ({ text,
  items: [{ str: text, x: 30, y: 820 - index * 12, width: text.length * 4 }],
}));
const building = (address = "Testovací 12, 110 00 Praha", type = "Rodinný dům", coverage = "MAXI", amount = "4 700 000") => [
  "POJIŠTĚNÍ STAVEB", `HLAVNÍ STAVBA – ${type}`, `Místo pojištění: ${address}`,
  `Varianta pojištění: ${coverage}`, "Požár; Výbuch", `Pojistná částka ${amount} Kč`, "Spoluúčast: 1 000 Kč",
];
const household = (address = "Ukázková 34, 602 00 Brno", type = "Rekreační", coverage = "MINI", amount = "650 000") => [
  "POJIŠTĚNÍ DOMÁCNOSTI", `DOMÁCNOST – ${type}`, `Místo pojištění: ${address}`,
  `Varianta pojištění: ${coverage}`, "Požár; Výbuch", `Pojistná částka ${amount} Kč`, "Spoluúčast: 500 Kč",
];

const assistanceTable = (rows: { kind: "property" | "household"; address: string[]; choice: string[] }[]): DomexPropertyLayoutLine[] => {
  const items = [
    { str: "Předmět pojištění", x: 65, y: 760, width: 80 },
    { str: "Místo pojištění", x: 230, y: 760, width: 65 },
    { str: "Sjednaný rozsah asistenčních služeb", x: 370, y: 760, width: 165 },
    ...rows.flatMap((row, index) => {
      const y = 710 - index * 60;
      return [
        { str: row.kind === "property" ? "HLAVNÍ STAVBA" : "DOMÁCNOST", x: 75, y, width: 70 },
        ...row.address.map((str, line) => ({ str, x: 190, y: y + 11 - line * 11, width: 140 })),
        ...row.choice.map((str, line) => ({ str, x: 410, y: y + 11 - line * 11, width: 100 })),
      ];
    }),
  ];
  return [...new Set(items.map(item => item.y))].sort((a, b) => b - a).map(y => {
    const row = items.filter(item => item.y === y).sort((a, b) => a.x - b.x);
    return { text: row.map(item => item.str).join(" "), items: row };
  });
};

describe("DOMEX Neuron versioned objects and extraction states", () => {
  it("reads every assistance table column, including wrapped addresses and choices in a different object order", () => {
    const result = parseDomexNeuronProperty([
      page(...building(), ...building("Další 56, 301 00 Plzeň"), ...household(), ...household("Jiná 78, 779 00 Olomouc")),
      [...page("ASISTENČNÍ SLUŽBY"), ...assistanceTable([
        { kind: "household", address: ["Jiná 78,", "779 00", "Olomouc"], choice: ["Domácí", "asistence", "plus"] },
        { kind: "property", address: ["Další 56,", "301 00", "Plzeň"], choice: ["Domácí", "asistence"] },
        { kind: "household", address: ["Ukázková 34,", "602 00", "Brno"], choice: ["Domácí asistence"] },
        { kind: "property", address: ["Testovací 12,", "110 00", "Praha"], choice: ["Domácí asistence", "plus"] },
      ])],
    ])!;
    expect(result.domexNeuron.objects.map(object => [object.kind, object.assistance, object.fields.assistance])).toEqual([
      ["property", "plus", "found"], ["property", "basic", "found"],
      ["household", "basic", "found"], ["household", "plus", "found"],
    ]);
    expect(normalizeDomexNeuronData(result.domexNeuron)).toEqual(result.domexNeuron);
  });

  it.each([true, false])("reads all assistance rows across pages with a repeated header: %s", repeatHeader => {
    const first = assistanceTable([{ kind: "household", address: ["Jiná 78,", "779 00", "Olomouc"], choice: ["Domácí asistence", "plus"] }]);
    const second = assistanceTable([{ kind: "household", address: ["Ukázková 34,", "602 00", "Brno"], choice: ["Domácí asistence"] }]);
    const result = parseDomexNeuronProperty([
      page(...household(), ...household("Jiná 78, 779 00 Olomouc")),
      [...page("ASISTENČNÍ SLUŽBY"), ...first], repeatHeader ? second : second.slice(1),
    ])!;
    expect(result.domexNeuron.objects.map(object => object.assistance)).toEqual(["basic", "plus"]);
  });

  it("does not use a comparison of both plans as a missing selected range", () => {
    const comparison = { text: "Rozsah poskytování asistenčních služeb Domácí asistence Domácí asistence plus", items: [
      { str: "Rozsah poskytování asistenčních služeb", x: 30, y: 690, width: 180 },
      { str: "Domácí asistence", x: 350, y: 690, width: 80 },
      { str: "Domácí asistence plus", x: 460, y: 690, width: 100 },
    ] };
    const result = parseDomexNeuronProperty([page(...household()), [...page("ASISTENČNÍ SLUŽBY"),
      ...assistanceTable([{ kind: "household", address: ["Ukázková 34,", "602 00", "Brno"], choice: [] }]), comparison]])!;
    expect(result.domexNeuron.objects[0]).toMatchObject({ assistance: null, fields: { assistance: "not_found" } });
  });

  it.each(["missing", "duplicate", "different"])("does not guess a positioned table row with a %s address", address => {
    const place = address === "missing" ? [] : address === "different" ? ["Cizí 99,", "110 00", "Praha"] : ["Testovací 12,", "110 00", "Praha"];
    const result = parseDomexNeuronProperty([
      page(...building(), ...(address === "duplicate" ? building() : [])),
      [...page("ASISTENČNÍ SLUŽBY"), ...assistanceTable([{ kind: "property", address: place, choice: ["Domácí asistence", "plus"] }])],
    ])!;
    expect(result.domexNeuron.objects.every(object => object.assistance === null && object.fields.assistance === "unreadable")).toBe(true);
  });

  it("keeps an unknown selected range unreadable instead of accepting a partial plan name", () => {
    const result = parseDomexNeuronProperty([page(...building()), [...page("ASISTENČNÍ SLUŽBY"),
      ...assistanceTable([{ kind: "property", address: ["Testovací 12,", "110 00", "Praha"], choice: ["Domácí asistence", "neznámá"] }])]])!;
    expect(result.domexNeuron.objects[0]).toMatchObject({ assistance: null, fields: { assistance: "unreadable" } });
  });

  it("keeps multiple insured objects and matches assistance by address rather than row order", () => {
    const parsed = parseDomexNeuronProperty([page(...building(), ...building("Další 56, 301 00 Plzeň", "Bytová jednotka", "OPTI", "3 100 000"),
      ...household(), ...household("Jiná 78, 779 00 Olomouc", "Trvalá", "NOP", "420 000"), "ASISTENČNÍ SLUŽBY",
      "HLAVNÍ STAVBA Další 56, 301 00 Plzeň Domácí asistence", "DOMÁCNOST Jiná 78, 779 00 Olomouc Domácí asistence plus",
      "HLAVNÍ STAVBA Testovací 12, 110 00 Praha Domácí asistence plus", "DOMÁCNOST Ukázková 34, 602 00 Brno Domácí asistence")])!;
    const data = parsed.domexNeuron;
    expect(data.parserVersion).toBe(DOMEX_NEURON_PARSER_VERSION);
    expect(data.objects.map(object => [object.id, object.kind, object.type, object.coverage, object.sumInsured, object.assistance])).toEqual([
      ["property-1", "property", "dum", "maxi", 4_700_000, "plus"], ["property-2", "property", "byt", "opti", 3_100_000, "basic"],
      ["household-1", "household", "rekreacni", "mini", 650_000, "basic"], ["household-2", "household", "trvale", "nop", 420_000, "plus"],
    ]);
    expect(parsed).toMatchObject({ domexPropertyAddress: data.objects[0].address, domexPropertyCoverage: "maxi",
      domexHouseholdAddress: data.objects[2].address, domexHouseholdCoverage: "mini" });
    expect(data.objects.every(object => Object.values(object.fields).every(status => status === "found"))).toBe(true);
    expect(normalizeDomexNeuronData(data)).toEqual(data);
  });

  it("splits repeated address blocks without copying a previous object's type", () => {
    const result = parseDomexNeuronProperty([page(...building(), "Místo pojištění: Další 56, 301 00 Plzeň", "Varianta pojištění: OPTI",
      "Požár; Výbuch", "Pojistná částka 3 100 000 Kč")])!;
    expect(result.domexNeuron.objects).toHaveLength(2);
    expect(result.domexNeuron.objects[1]).toMatchObject({ id: "property-2", address: "Další 56, 301 00 Plzeň", type: null,
      coverage: "opti", sumInsured: 3_100_000, fields: { type: "not_found", address: "found" } });
  });

  it("handles numbered subject headings while still requiring the correct address for assistance", () => {
    const first = building().map(text => text.replace("HLAVNÍ STAVBA –", "HLAVNÍ STAVBA 1 –"));
    const second = building("Další 56, 301 00 Plzeň").map(text => text.replace("HLAVNÍ STAVBA –", "HLAVNÍ STAVBA č. 2 –"));
    const home = household().map(text => text.replace("DOMÁCNOST –", "DOMÁCNOST 2 –"));
    const result = parseDomexNeuronProperty([page(...first, ...second, ...home, "ASISTENČNÍ SLUŽBY",
      "HLAVNÍ STAVBA č. 2 Další 56, 301 00 Plzeň Domácí asistence",
      "HLAVNÍ STAVBA 1 Testovací 12, 110 00 Praha Domácí asistence plus",
      "DOMÁCNOST 2 Ukázková 34, 602 00 Brno Domácí asistence")])!;
    expect(result.domexNeuron.objects.map(object => [object.kind, object.assistance])).toEqual([
      ["property", "plus"], ["property", "basic"], ["household", "basic"],
    ]);
  });

  it("keeps a page continuation and repeated continuation heading in the same object", () => {
    const result = parseDomexNeuronProperty([page(...building().slice(0, 3)), page("HLAVNÍ STAVBA – Rodinný dům", ...building().slice(3))])!;
    expect(result.domexNeuron.objects).toHaveLength(1);
    expect(result.domexNeuron.objects[0]).toMatchObject({ address: "Testovací 12, 110 00 Praha", sumInsured: 4_700_000,
      fields: { sumInsured: "found", assistance: "not_found" } });
  });

  it("keeps a repeated object heading with a new table separate even across pages", () => {
    const result = parseDomexNeuronProperty([page(...building()), page("HLAVNÍ STAVBA – Rodinný dům", "Varianta pojištění: OPTI",
      "Požár; Výbuch", "Pojistná částka", "2 500 000", "Kč")])!;
    expect(result.domexNeuron.objects).toHaveLength(2);
    expect(result.domexNeuron.objects[1]).toMatchObject({ address: null, coverage: "opti", sumInsured: 2_500_000,
      fields: { address: "not_found", sumInsured: "found" } });
  });

  it("distinguishes explicitly uncontracted sections from sections that were not found", () => {
    const result = parseDomexNeuronProperty([page("DOMEX NEURON", "POJIŠTĚNÍ STAVEB: Nesjednáno", "POJIŠTĚNÍ DOMÁCNOSTI", "Nepojištěno",
      "POJIŠTĚNÍ ODPOVĚDNOSTI – Nesjednáno")])!;
    expect(result.domexNeuron).toMatchObject({ objects: [], sections: {
      property: "not_insured", household: "not_insured", liability: "not_insured", assistance: "not_found",
    }, liabilityFields: { sumInsured: "not_insured", deductible: "not_insured" } });
    expect(parseDomexNeuronProperty([page(...building())])?.domexNeuron.sections.household).toBe("not_found");
    expect(parseDomexNeuronProperty([page("DOMEX NEURON", "POJIŠTĚNÍ STAVEB", "HLAVNÍ STAVBA – Nesjednáno")])?.domexNeuron)
      .toMatchObject({ objects: [], sections: { property: "not_insured" } });
  });

  it("distinguishes present malformed values, explicit uncontracted fields and absent labels", () => {
    const result = parseDomexNeuronProperty([page("HLAVNÍ STAVBA – ???", "Místo pojištění: ???", "Varianta pojištění: ????",
      "Požár; Výbuch", "Pojistná částka: -1 000 Kč", "Spoluúčast: Nesjednáno", "POJIŠTĚNÍ ODPOVĚDNOSTI", "Limit pojistného plnění: ???")])!;
    expect(result.domexNeuron.objects[0]).toMatchObject({ type: null, address: null, coverage: null, sumInsured: null, deductible: null, assistance: null,
      fields: { type: "unreadable", address: "unreadable", coverage: "unreadable", sumInsured: "unreadable", deductible: "not_insured", assistance: "not_found" } });
    expect(result.domexNeuron.liabilityFields).toEqual({ sumInsured: "unreadable", deductible: "not_found" });
  });

  it("does not treat a whole section as uncontracted because one fire hazard was not insured", () => {
    const result = parseDomexNeuronProperty([page(...building().map(text => text.replace("Pojistná částka 4 700 000 Kč", "Pojistná částka: Nesjednáno")))])!;
    expect(result.domexNeuron.sections).toMatchObject({ property: "found", household: "not_found" });
    expect(result.domexNeuron.objects[0].fields).toMatchObject({ type: "found", sumInsured: "not_insured", assistance: "not_found" });
  });

  it.each(["same-address", "missing-address"])("does not guess assistance for %s objects", situation => {
    const second = building(situation === "same-address" ? "Testovací 12, 110 00 Praha" : "Další 56, 301 00 Plzeň");
    const subject = situation === "same-address" ? "HLAVNÍ STAVBA Testovací 12, 110 00 Praha Domácí asistence plus" : "HLAVNÍ STAVBA Domácí asistence plus";
    const result = parseDomexNeuronProperty([page(...building(), ...second, "ASISTENČNÍ SLUŽBY", subject)])!;
    expect(result.domexNeuron.objects).toHaveLength(2);
    expect(result.domexNeuron.objects.every(object => object.assistance === null && object.fields.assistance === "unreadable")).toBe(true);
  });

  it("keeps a singleton's missing assistance address unreadable instead of assigning by kind", () => {
    expect(parseDomexNeuronProperty([page(...building(), "ASISTENČNÍ SLUŽBY", "HLAVNÍ STAVBA Domácí asistence plus")])?.domexNeuron.objects[0])
      .toMatchObject({ assistance: null, fields: { assistance: "unreadable" } });
  });

  it("records explicit uncontracted assistance separately from an omitted summary value", () => {
    const result = parseDomexNeuronProperty([page(...building(), ...household(), "ASISTENČNÍ SLUŽBY",
      "HLAVNÍ STAVBA Testovací 12, 110 00 Praha Nesjednáno", "DOMÁCNOST Ukázková 34, 602 00 Brno")])!;
    expect(result.domexNeuron.objects[0].fields.assistance).toBe("not_insured");
    expect(result.domexNeuron.objects[1].fields.assistance).toBe("not_found");
  });

  it("bounds output to 50 objects and reports an incomplete section", () => {
    const lines = Array.from({ length: DOMEX_NEURON_MAX_OBJECTS + 1 }, (_, index) => building(`Testovací ${index + 1}, 110 00 Praha`)).flat();
    const result = parseDomexNeuronProperty([page(...lines)])!;
    expect(result.domexNeuron.objects).toHaveLength(DOMEX_NEURON_MAX_OBJECTS);
    expect(result.domexNeuron.sections.property).toBe("unreadable");
    expect(result.pdfImportWarnings?.[0]).toContain("více než 50 objektů");
    expect(normalizeDomexNeuronData(result.domexNeuron)).toEqual(result.domexNeuron);
  });
});
