import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getVisibleCriteria, hasSectionComparison } from "./comparisonData";
import { HISTORICAL_LIABILITY_PRODUCTS } from "./historicalProducts";
import { LIABILITY_PRODUCTS } from "./products";
import { LIABILITY_SECTIONS } from "./sections";
import { GENERAL_SECTION } from "./generalData";
import { LIFE_SPORT_SECTION } from "./lifeSportData";
import { BREEDER_SECTION } from "./breederData";
import { PROPERTY_SECTION } from "./propertyData";
import { TENANCY_SECTION } from "./tenancyData";
import { COINSURED_SECTION } from "./coinsuredData";
import { buildLiabilityReport, initialExportSettings } from "./exportData";

const withSuppliedData = new Set([
  "cpp:domex-plus-2019-01-01", "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01", "kooperativa:pojisteni-odpovednosti-2021-05-01",
]);

const csobMaximaIds = new Set([
  "csob:nase-odpovednost-2018-04-01", "csob:nase-odpovednost-2020-03-01", "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18", "maxima:maxdomov-3-1-2023-01-16",
]);

describe("historické verze produktů", () => {
  it("mají vlastní identifikátory a nepřebírají krytí ani limity aktuálních verzí", () => {
    const ids = [...LIABILITY_PRODUCTS, ...HISTORICAL_LIABILITY_PRODUCTS].map(product => product.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of HISTORICAL_LIABILITY_PRODUCTS) {
      for (const section of LIABILITY_SECTIONS) {
        const hasSuppliedData = withSuppliedData.has(product.id) || csobMaximaIds.has(product.id);
        expect(hasSectionComparison(section, product.id), `${product.id} / ${section.id}`)
          .toBe(hasSuppliedData);
        if (hasSuppliedData) {
          expect(Object.keys(section.answers[product.id]!).sort()).toEqual(section.criteria.map(row => row.id).sort());
        }
      }
    }
  });

  it("má dostupná loga také pro pojišťovny bez aktuálních produktů", () => {
    for (const logo of new Set(HISTORICAL_LIABILITY_PRODUCTS.map(product => product.logoPath))) {
      expect(existsSync(resolve(process.cwd(), `public${logo}`)), logo).toBe(true);
    }
  });

  it("při filtrování rozliší i nižší varianty limitů ČPP a shodnou nedbalost skryje", () => {
    const cpp = ["cpp:domex-plus-2019-01-01", "cpp:domex-plus-2022-08-01"];
    expect(getVisibleCriteria(GENERAL_SECTION, cpp, true, []).map(row => row.id)).toEqual(["maximum-limit"]);
    expect(getVisibleCriteria(GENERAL_SECTION, [...withSuppliedData], true, []).map(row => row.id))
      .toEqual(["maximum-limit", "territory"]);
  });

  it("předá do exportu šest kritérií se správnými limity a hodnocením jednotlivých verzí", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([GENERAL_SECTION], products, {
      ...initialExportSettings([GENERAL_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(6);
    const limit = rows.find(row => row.id === "maximum-limit")!;
    expect(limit.cells.map(cell => cell.summary)).toEqual([
      "Max. 20 000 000 Kč", "Max. 20 000 000 Kč", "Max. 20 000 000 Kč", "Max. 30 000 000 Kč",
    ]);
    ["2, 4, 6, 8, 10, 12 nebo 15", "2, 3, 4, 5, 6, 7, 8, 9, 10 a 15", "1, 2, 5, 10 nebo 15", "1, 2, 5, 10, 15 nebo 20"]
      .forEach((variants, index) => {
        expect(limit.cells[index].detail).toContain(`${variants} mil. Kč`);
        expect(limit.cells[index].detail).toContain("ve výši sjednaného limitu");
      });
    const territory = rows.find(row => row.id === "territory")!.cells;
    expect(territory.map(cell => cell.summary)).toEqual([
      "ČR, Evropa (geograficky) jen při přechodném pobytu", "ČR, Evropa (geograficky) jen při přechodném pobytu",
      "Evropa (vyjma Turecka a zemí SSSR, pokud nejsou členy EU)", "Evropa (vyjma Turecka a zemí SSSR, pokud nejsou členy EU)",
    ]);
    for (const row of rows) {
      expect(row.cells.every(cell => cell.tone === (row.id === "territory" ? "warning" : "positive"))).toBe(true);
    }
    expect(rows.find(row => row.id === "negligence-refusal")!.cells.every(cell => cell.summary === "Pouze snížit pojistné plnění")).toBe(true);
  });

  it("u historického sportu zachová rozdíly definice, připojištění elektroniky a finanční škody i při exportu", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([LIFE_SPORT_SECTION], products, {
      ...initialExportSettings([LIFE_SPORT_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(12);
    expect(rows.find(row => row.id === "electric-vehicles")!.cells.every(cell => cell.summary === "Ano, vztahuje" && cell.tone === "positive")).toBe(true);
    expect(rows.find(row => row.id === "electric-vehicles-sidewalk")!.cells.every(cell => cell.summary === "Ano, ale pojistné plnění může být kráceno" && cell.tone === "positive")).toBe(true);
    expect(rows.find(row => row.id === "electric-vehicles-definition")!.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "Není stanoveno", tone: "positive" }, { summary: "Není stanoveno", tone: "positive" },
      { summary: "Není stanoveno", tone: "positive" }, { summary: "Není součástí", tone: "negative" },
    ]);
    expect(rows.find(row => row.id === "electronics")!.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "Možno připojistit", tone: "warning" },
      { summary: "Možno připojistit (škody na kuchyňských spotřebičích jsou obsaženy v základním pojištění)", tone: "warning" },
      { summary: "Ano, vztahuje", tone: "positive" }, { summary: "Ano, vztahuje", tone: "positive" },
    ]);
    expect(rows.find(row => row.id === "pure-financial-loss")!.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "Ano, limit 10 % z limitu pojištění", tone: "positive" }, { summary: "Ano, limit 10 % z limitu pojištění", tone: "positive" },
      { summary: "Není součástí", tone: "negative" }, { summary: "Není součástí", tone: "negative" },
    ]);
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, [...withSuppliedData], true, []).map(row => row.id))
      .toEqual(["electric-vehicles", "electric-vehicles-definition", "electronics", "pure-financial-loss"]);
  });

  it("rozliší výluky nebezpečných, výdělečných a exotických zvířat a exportuje i společné krytí", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([BREEDER_SECTION], products, {
      ...initialExportSettings([BREEDER_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      const expected = row.id === "dangerous-animals" ? [true, true, false, false]
        : row.id === "commercial-animals" ? [false, false, false, false]
        : row.id === "exotic-animals" ? [true, true, false, true] : [true, true, true, true];
      expect(row.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual(expected.map(included => ({
        summary: included ? "Ano, vztahuje" : "Není součástí", tone: included ? "positive" : "negative",
      })));
    }
    expect(getVisibleCriteria(BREEDER_SECTION, [...withSuppliedData], true, []).map(row => row.id))
      .toEqual(["other-pets", "dangerous-animals", "exotic-animals"]);
    expect(getVisibleCriteria(BREEDER_SECTION, [...withSuppliedData].slice(2), true, []).map(row => row.id))
      .toEqual(["other-pets", "exotic-animals"]);
  });

  it("zachová rozdíly nemovitostí a pozemků mezi historickými verzemi", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([PROPERTY_SECTION], products, {
      ...initialExportSettings([PROPERTY_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(14);
    const expected: Record<string, string[]> = {
      "property-owner": ["Ano, vztahuje", "Ano, vztahuje", "Možno připojistit", "Možno připojistit"],
      "other-properties": ["Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Ano, vztahuje"],
      "other-home": ["Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Ano, vztahuje"],
      "other-holiday-home": ["Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Ano, vztahuje"],
      "other-farm-building": ["Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Není součástí"],
      "other-business-property": Array(4).fill("Není součástí"),
      "other-apartment-building": ["Ano, vztahuje", "Není součástí", "Není součástí", "Není součástí"],
      "other-property-land": ["Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Ano, vztahuje"],
      "other-separate-land": ["Ano, vztahuje", "Není součástí", "Není součástí", "Není součástí"],
      "other-property-territory": ["ČR", "ČR", "Není součástí", "ČR"],
      "minor-building-work": ["Ano, vztahuje", "Ano, vztahuje", "Možno připojistit", "Možno připojistit"],
      "self-build": ["Ano, vztahuje", "Ano, vztahuje", "Možno připojistit", "Možno připojistit"],
    };
    for (const row of rows) {
      expect(row.cells.map(({ summary, tone }) => ({ summary, tone })), row.id)
        .toEqual((expected[row.id] ?? Array(4).fill("Ano, vztahuje")).map(summary => ({
          summary, tone: summary === "Není součástí" ? "negative" : summary === "Možno připojistit" ? "warning" : "positive",
        })));
    }
    expect(getVisibleCriteria(PROPERTY_SECTION, [...withSuppliedData].slice(0, 2), true, []).map(row => row.id))
      .toEqual(["property-owner", "other-properties", "other-apartment-building", "other-separate-land"]);
  });

  it("nevynechá podmínku připojištění Kooperativy ani při samostatném exportu podkritéria bez detailů", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([PROPERTY_SECTION], products, {
      ...initialExportSettings([PROPERTY_SECTION]), includeSubcriteria: true, includeDetails: false,
      selectedCriteria: { property: ["listed-property-land", "other-home"] },
    });
    const [listedLand, otherHome] = report.sections[0].rows;
    for (const row of [listedLand, otherHome]) {
      expect(row.cells[0].context).toBeUndefined();
      expect(row.cells[1].context).toBeUndefined();
    }
    expect(listedLand.cells[2].context).toContain("Možno připojistit");
    expect(listedLand.cells[3].context).toContain("Možno připojistit");
    expect(otherHome.cells[2]).toMatchObject({ summary: "Není součástí", tone: "negative", context: undefined });
    expect(otherHome.cells[3]).toMatchObject({ summary: "Ano, vztahuje", context: "Podmínky hlavního krytí: Možno připojistit" });
  });

  it("při exportu nájmu zachová základ procentních limitů, sdílený limit a výluku nadřazeného krytí", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([TENANCY_SECTION], products, {
      ...initialExportSettings([TENANCY_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(21);
    expect(rows.every(row => row.cells.every(cell => cell.summary !== "Údaj zatím není doplněn"))).toBe(true);
    const property = rows.find(row => row.id === "rented-property")!.cells;
    expect(property.map(cell => cell.summary)).toEqual([
      "Ano, limit 15 % z PČ nemovitost", "Ano, limit 15 % ze sjednaného limitu", "Ano, vztahuje", "Ano, vztahuje",
    ]);
    for (const cell of property.slice(0, 2)) {
      expect(cell.detail).toBe("Tento limit je společný také pro škody na pronajatém vybavení v rámci pronajaté nemovitosti.");
    }
    const risks = rows.find(row => row.id === "rented-equipment-risks")!.cells;
    expect(risks[2]).toMatchObject({ summary: "Nebezpečí nejsou specifikována", context: "Podmínky hlavního krytí: Ano, limit 10 000 Kč" });
    expect(risks[3]).toMatchObject({ summary: "Nebezpečí nejsou specifikována", context: "Podmínky hlavního krytí: Není součástí" });
    const tools = buildLiabilityReport([TENANCY_SECTION], products, {
      ...initialExportSettings([TENANCY_SECTION]), includeSubcriteria: true, includeDetails: false, onlyDifferences: true,
      selectedCriteria: { tenancy: ["borrowed-tools"] },
    }).sections[0].rows[0];
    expect(tools.cells.every(cell => cell.summary === "Ano, vztahuje")).toBe(true);
    expect(tools.cells.map(cell => cell.context)).toEqual([
      "Podmínky hlavního krytí: Ano, limit 10 % z PČ domácnost",
      "Podmínky hlavního krytí: Ano, limit 10 % ze sjednaného limitu",
      "Podmínky hlavního krytí: Ano, limit 10 000 Kč",
      "Podmínky hlavního krytí: Ano, limit 20 000 Kč",
    ]);
  });

  it("nepřenese současné limity dronů do historie a rozliší výluky i připojištění pronajímatele", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([TENANCY_SECTION], products, {
      ...initialExportSettings([TENANCY_SECTION]), includeSubcriteria: true,
    });
    const cells = (id: string) => report.sections[0].rows.find(row => row.id === id)!.cells;
    expect(cells("borrowed-drone")[1].summary).toBe("Ano (vztahuje se na drony do 25 kg)");
    expect(TENANCY_SECTION.answers["cpp:domex-plus-2023-10-01"]?.["borrowed-drone"].summary).toContain("20 kg");
    expect(cells("borrowed-electronics").slice(0, 2).every(cell => cell.tone === "warning" && cell.summary === "Lze připojistit, limit 10 % z PČ domácnost")).toBe(true);
    expect(cells("rental-vehicle-deductible").map(cell => cell.summary)).toEqual([
      "Ano, vztahuje", "Ano, vztahuje", "Nevztahuje", "Ano, limit 20 000 Kč",
    ]);
    expect(cells("borrowed-motorboat").map(cell => cell.tone)).toEqual(["negative", "positive", "negative", "negative"]);
    expect(cells("borrowed-motorboat")[1].summary).toContain("20 m a max. pro 12 osob nebo vodní skútr do délky 4 m");
    expect(cells("landlord-tenant-belongings")[3]).toMatchObject({
      summary: "Lze připojistit jako pojištění odpovědnosti z vlastnictví nemovitosti, limit 30 000 000 Kč", tone: "warning",
    });
    expect(cells("tenant-damage-to-landlord").map(cell => cell.tone)).toEqual(["negative", "negative", "positive", "positive"]);
    for (const id of ["maximum-rental-income", "rental-without-address", "landlord-territory"]) {
      expect(cells(id).every(cell => cell.summary === "Není součástí" && cell.tone === "negative")).toBe(true);
    }
  });

  it("zachová neutrální N / A a věkové omezení dětí a rozliší spolupojištěné osoby podle ročníku", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => withSuppliedData.has(product.id));
    const report = buildLiabilityReport([COINSURED_SECTION], products, {
      ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(21);
    expect(rows.find(row => row.id === "non-paying-friends")!.cells.every(cell => cell.summary === "N / A" && cell.tone === "neutral")).toBe(true);
    expect(rows.find(row => row.id === "children")!.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "Ano, do 26 let věku dítěte", tone: "neutral" },
      { summary: "Ano, do 26 let věku dítěte", tone: "neutral" },
      { summary: "Ano (jakéhokoliv věku a stavu)", tone: "positive" },
      { summary: "Ano (jakéhokoliv věku a stavu)", tone: "positive" },
    ]);
    const cppIds = [...withSuppliedData].slice(0, 2);
    expect(getVisibleCriteria(COINSURED_SECTION, cppIds, true, []).map(row => row.id))
      .toEqual(["household-members", "other-paying-members"]);
    const differences = buildLiabilityReport([COINSURED_SECTION], products.slice(0, 2), {
      ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true, onlyDifferences: true,
    }).sections[0].rows;
    expect(differences.map(row => row.id)).toEqual(["other-paying-members"]);
    expect(differences[0].cells.map(cell => cell.summary)).toEqual(["Ano", "Není součástí"]);
    for (const prefix of ["helper-", "contracted-helper-"]) {
      const helpers = rows.filter(row => row.id.startsWith(prefix));
      expect(helpers).toHaveLength(6);
      for (const row of helpers) {
        expect(row.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
          { summary: "Ano", tone: "positive" }, { summary: "Ano", tone: "positive" },
          { summary: "Není součástí", tone: "negative" }, { summary: "Není součástí", tone: "negative" },
        ]);
      }
    }
  });

  it("exportuje historické ČSOB a Maximu s vlastními variantami limitů a nedoplňuje skryté detaily", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    expect(products).toHaveLength(5);
    const report = buildLiabilityReport([GENERAL_SECTION], products, {
      ...initialExportSettings([GENERAL_SECTION]), includeSubcriteria: true,
    });
    const rows = report.sections[0].rows;
    expect(rows).toHaveLength(6);
    const limits = rows.find(row => row.id === "maximum-limit")!.cells;
    expect(limits.every(cell => cell.summary === "Max. 50 000 000 Kč" && cell.tone === "positive")).toBe(true);
    expect(limits.slice(0, 3).every(cell => cell.detail?.includes("2, 4, 6, 8, 10, 15 nebo 25 mil. Kč"))).toBe(true);
    expect(limits[3].detail).toBe("Další varianty: 1; 2,5; 5; 10; 20 mil. Kč.");
    expect(limits[4].detail).toBe("Další varianty: 1; 2,5; 5; 10; 20; 50 mil. Kč.");
    for (const cell of rows.find(row => row.id === "territory")!.cells) {
      expect(cell).toMatchObject({ summary: "Evropa", tone: "positive", detail: undefined });
    }
    const definitions = rows.find(row => row.id === "negligence-definition")!.cells;
    expect(definitions[3]).toMatchObject({ summary: "Více informací", tone: "positive", detail: undefined });
    expect(definitions[4].detail).toContain("a) Jednání nebo opomenutí");
    expect(definitions[4].detail).toContain("b) Lhostejnost k výsledku jednání nebo k výsledku činnosti");
    expect(definitions[4].detail).toContain("c) Vědomé porušení právní povinnosti");
    expect(rows.find(row => row.id === "negligence-position")!.cells.map(cell => cell.tone))
      .toEqual(["positive", "positive", "neutral", "positive", "positive"]);
  });

  it("odhalí změnu hodnocení ČSOB 2022 i rozdíl variant limitů Maximy se shodným maximem", () => {
    const [csob2018, csob2020, csob2022, maxima2021, maxima2023] = [...csobMaximaIds];
    expect(getVisibleCriteria(GENERAL_SECTION, [csob2018, csob2020], true, [])).toEqual([]);
    expect(getVisibleCriteria(GENERAL_SECTION, [csob2020, csob2022], true, []).map(row => row.id))
      .toEqual(["negligence", "negligence-position"]);
    expect(getVisibleCriteria(GENERAL_SECTION, [maxima2021, maxima2023], true, []).map(row => row.id))
      .toEqual(["maximum-limit", "negligence", "negligence-definition"]);
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => [maxima2021, maxima2023].includes(product.id));
    const report = buildLiabilityReport([GENERAL_SECTION], products, {
      ...initialExportSettings([GENERAL_SECTION]), includeSubcriteria: true, onlyDifferences: true,
    });
    expect(report.sections[0].rows.map(row => row.id)).toEqual(["maximum-limit", "negligence-definition"]);
  });

  it("rozliší historické podmínky elektroniky ČSOB i při shodném základním limitu a nepřebírá novější podmínky", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const report = buildLiabilityReport([LIFE_SPORT_SECTION], products, {
      ...initialExportSettings([LIFE_SPORT_SECTION]), includeSubcriteria: true,
    });
    expect(report.sections[0].rows).toHaveLength(12);
    const electronics = report.sections[0].rows.find(row => row.id === "electronics")!.cells;
    expect(electronics.slice(0, 3).every(cell => cell.summary === "Ano, limit 3 000 Kč" && cell.tone === "neutral")).toBe(true);
    expect(electronics[0].detail).toBe("Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč.");
    expect(electronics[1].detail).toBe(electronics[0].detail);
    expect(electronics[2].detail).toBe("Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč. Při poškození požárem, výbuchem, vodovodní škodou, pojištěným v obchodech a žákem nebo studentem ve škole nebo na praxi.");
    expect(electronics[2].detail).not.toContain("je limitem sjednaný limit");
    expect(electronics.slice(3).every(cell => cell.summary === "Ano, vztahuje" && cell.tone === "positive")).toBe(true);
    const [csob2018, csob2020, csob2022, maxima2021, maxima2023] = [...csobMaximaIds];
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, [csob2018, csob2020], true, [])).toEqual([]);
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, [csob2020, csob2022], true, []).map(row => row.id)).toEqual(["electronics"]);
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, [maxima2021, maxima2023], true, [])).toEqual([]);
    const differences = buildLiabilityReport([LIFE_SPORT_SECTION], products.slice(1, 3), {
      ...initialExportSettings([LIFE_SPORT_SECTION]), includeSubcriteria: true, onlyDifferences: true,
    });
    expect(differences.sections[0].rows.map(row => row.id)).toEqual(["electronics"]);
  });

  it("zachová výluky historické Maximy u elektrovozítek a čisté finanční škody také v exportu podkritérií", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const report = buildLiabilityReport([LIFE_SPORT_SECTION], products, {
      ...initialExportSettings([LIFE_SPORT_SECTION]), includeSubcriteria: true, onlyDifferences: true,
    });
    const rows = report.sections[0].rows;
    expect(rows.map(row => row.id)).toEqual([
      "electric-vehicles", "electric-vehicles-sidewalk", "electric-vehicles-definition", "electronics", "pure-financial-loss",
    ]);
    for (const row of rows.filter(row => row.id !== "electronics")) {
      expect(row.cells.slice(3).every(cell => cell.summary === "Není součástí" && cell.tone === "negative")).toBe(true);
      expect(row.cells.slice(0, 3).every(cell => cell.tone === "positive")).toBe(true);
    }
    expect(rows.find(row => row.id === "electric-vehicles-sidewalk")!.cells[0].summary)
      .toBe("Ano, ale pojistné plnění může být kráceno");
    expect(rows.find(row => row.id === "electric-vehicles-definition")!.cells[0].summary).toBe("Není stanoveno");
    expect(rows.find(row => row.id === "pure-financial-loss")!.cells[0].summary).toBe("Ano, vztahuje");
  });

  it("u historického chovatele ČSOB a Maximy exportuje společnou výluku výdělečného chovu a odliší pouze škody na rostlinách", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const settings = { ...initialExportSettings([BREEDER_SECTION]), includeSubcriteria: true };
    const rows = buildLiabilityReport([BREEDER_SECTION], products, settings).sections[0].rows;
    expect(rows).toHaveLength(9);
    expect(rows.find(row => row.id === "commercial-animals")!.cells.every(cell => cell.summary === "Není součástí" && cell.tone === "negative")).toBe(true);
    for (const id of ["dangerous-animals", "exotic-animals", "livestock"]) {
      expect(rows.find(row => row.id === id)!.cells.every(cell => cell.summary === "Ano, vztahuje" && cell.tone === "positive")).toBe(true);
    }
    const differences = buildLiabilityReport([BREEDER_SECTION], products, { ...settings, onlyDifferences: true }).sections[0].rows;
    expect(differences.map(row => row.id)).toEqual(["animal-plant-damage"]);
    expect(differences[0].cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "Ano, vztahuje", tone: "positive" }, { summary: "Ano, vztahuje", tone: "positive" },
      { summary: "Ano, vztahuje", tone: "positive" }, { summary: "Není součástí", tone: "negative" },
      { summary: "Není součástí", tone: "negative" },
    ]);
    expect(getVisibleCriteria(BREEDER_SECTION, [...csobMaximaIds], true, []).map(row => row.id)).toEqual(["animal-plant-damage"]);
    expect(getVisibleCriteria(BREEDER_SECTION, [...csobMaximaIds].slice(0, 3), true, [])).toEqual([]);
    expect(getVisibleCriteria(BREEDER_SECTION, [...csobMaximaIds].slice(3), true, [])).toEqual([]);
  });

  it("rozliší změnu krytí pozemku a svépomoci mezi historickými verzemi Maximy", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const settings = { ...initialExportSettings([PROPERTY_SECTION]), includeSubcriteria: true };
    const rows = buildLiabilityReport([PROPERTY_SECTION], products, settings).sections[0].rows;
    expect(rows).toHaveLength(14);
    expect(rows.find(row => row.id === "listed-property-land")!.cells.map(cell => cell.summary))
      .toEqual(["Ano, vztahuje", "Ano, vztahuje", "Ano, vztahuje", "Není součástí", "Ano, vztahuje"]);
    for (const id of ["other-farm-building", "other-business-property", "other-apartment-building", "other-property-land", "other-separate-land"]) {
      expect(rows.find(row => row.id === id)!.cells.map(cell => cell.tone)).toEqual(["positive", "positive", "positive", "negative", "negative"]);
    }
    const maxima = products.slice(3);
    const differences = buildLiabilityReport([PROPERTY_SECTION], maxima, { ...settings, onlyDifferences: true }).sections[0].rows;
    expect(differences.map(row => row.id)).toEqual(["listed-property-land", "self-build"]);
    expect(differences[1].cells.map(cell => cell.summary))
      .toEqual(["Není součástí", "Ano, vztahuje (ale jen na smlouvou pojištěné nemovitosti)"]);
    expect(getVisibleCriteria(PROPERTY_SECTION, maxima.map(product => product.id), true, []).map(row => row.id))
      .toEqual(["property-owner", "listed-property", "listed-property-land", "self-build"]);
    expect(getVisibleCriteria(PROPERTY_SECTION, [...csobMaximaIds].slice(0, 3), true, [])).toEqual([]);
  });

  it("u historické Maximy exportuje podmínku připojištění i u samostatných podkritérií a neduplikuje ji", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const rows = buildLiabilityReport([PROPERTY_SECTION], products, {
      ...initialExportSettings([PROPERTY_SECTION]), includeSubcriteria: true, includeDetails: false,
      selectedCriteria: { property: ["listed-property-land", "other-home", "other-property-land", "other-property-territory"] },
    }).sections[0].rows;
    for (const row of rows) {
      expect(row.cells.slice(0, 3).every(cell => cell.context === undefined)).toBe(true);
    }
    const [listedLand, otherHome, otherLand, territory] = rows;
    expect(listedLand.cells[3]).toMatchObject({ summary: "Není součástí", tone: "negative", context: undefined });
    expect(listedLand.cells[4]).toMatchObject({ summary: "Ano, vztahuje", context: "Podmínky hlavního krytí: Možno připojistit" });
    for (const row of [otherHome, territory]) {
      expect(row.cells.slice(3).map(cell => cell.context)).toEqual(Array(2).fill("Podmínky hlavního krytí: Možno připojistit"));
    }
    expect(territory.cells.every(cell => cell.summary === "ČR" && cell.tone === "positive")).toBe(true);
    expect(otherLand.cells.slice(3).every(cell => cell.summary === "Není součástí" && cell.context === undefined)).toBe(true);
  });

  it("u historického nájmu rozliší změnu připojištění Maximy a zachová limity i hodnocení půjčené elektroniky ČSOB", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const settings = { ...initialExportSettings([TENANCY_SECTION]), includeSubcriteria: true };
    const rows = buildLiabilityReport([TENANCY_SECTION], products, settings).sections[0].rows;
    expect(rows).toHaveLength(21);
    const electronics = rows.find(row => row.id === "borrowed-electronics")!.cells;
    for (const cell of electronics.slice(0, 3)) {
      expect(cell).toMatchObject({ summary: "Ano, limit 3 000 Kč", tone: "positive", detail: "Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč." });
    }
    expect(electronics.slice(3).every(cell => cell.summary === "Nevztahuje" && cell.tone === "negative")).toBe(true);
    for (const id of ["borrowed-vehicle", "rental-vehicle-deductible", "borrowed-motorboat", "borrowed-drone", "borrowed-aircraft"]) {
      expect(rows.find(row => row.id === id)!.cells.every(cell => cell.summary === "Nevztahuje" && cell.tone === "negative")).toBe(true);
    }
    const maxima = products.slice(3);
    const differences = buildLiabilityReport([TENANCY_SECTION], maxima, { ...settings, onlyDifferences: true }).sections[0].rows;
    expect(differences.map(row => row.id)).toEqual(["rented-property", "rented-property-risks", "landlord-tenant-belongings"]);
    expect(differences[0].cells.map(cell => cell.tone)).toEqual(["warning", "positive"]);
    expect(differences[2].cells.map(cell => cell.tone)).toEqual(["positive", "warning"]);
    expect(differences[1].cells[0]).toMatchObject({ summary: "Požár, výbuch, vodovodní škoda", tone: "neutral", context: "Podmínky hlavního krytí: Možno připojistit" });
    expect(differences[1].cells[1].context).toBeUndefined();
    expect(getVisibleCriteria(TENANCY_SECTION, products.slice(0, 3).map(product => product.id), true, [])).toEqual([]);
  });

  it("u historického pronajímatele exportuje i podmínku nadřazeného krytí a nevymýšlí zavřené detaily Maximy", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const rows = buildLiabilityReport([TENANCY_SECTION], products, {
      ...initialExportSettings([TENANCY_SECTION]), includeSubcriteria: true, includeDetails: false,
      selectedCriteria: { tenancy: ["maximum-rental-income", "rental-without-address", "landlord-territory"] },
    }).sections[0].rows;
    const [income, address, territory] = rows;
    for (const cell of income.cells.slice(0, 3)) {
      expect(cell).toMatchObject({ summary: "Není uvedeno", tone: "positive", context: "Podmínky hlavního krytí: Možno připojistit" });
    }
    expect(income.cells.slice(3).every(cell => cell.summary === "Není součástí" && cell.context === undefined)).toBe(true);
    expect(address.cells.slice(0, 3).every(cell => cell.summary === "Ne, max. 3 místa pojištění" && cell.tone === "negative")).toBe(true);
    for (const cell of address.cells.slice(3)) {
      expect(cell).toMatchObject({ summary: "Možno připojistit", tone: "warning", detail: undefined, context: "Podmínky hlavního krytí: Není součástí" });
    }
    expect(territory.cells.every(cell => cell.summary === "ČR" && cell.tone === "positive")).toBe(true);
    expect(territory.cells.map(cell => cell.context)).toEqual([
      ...Array(3).fill("Podmínky hlavního krytí: Možno připojistit"), ...Array(2).fill("Podmínky hlavního krytí: Není součástí"),
    ]);
    for (const id of [...csobMaximaIds].slice(3)) {
      expect(TENANCY_SECTION.answers[id]?.["rental-without-address"].detail).toBeUndefined();
    }
  });

  it("u historických spolupojištěných osob odliší N / A od výluky a zachová změnu ČSOB v roce 2022", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const settings = { ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true };
    const rows = buildLiabilityReport([COINSURED_SECTION], products, settings).sections[0].rows;
    expect(rows).toHaveLength(21);
    expect(rows.find(row => row.id === "non-paying-friends")!.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
      { summary: "N / A", tone: "neutral" }, { summary: "N / A", tone: "neutral" },
      { summary: "Ano", tone: "positive" }, { summary: "Není součástí", tone: "negative" },
      { summary: "Není součástí", tone: "negative" },
    ]);
    expect(rows.find(row => row.id === "children")!.cells.every(cell => cell.summary === "Ano (jakéhokoliv věku a stavu)" && cell.tone === "positive")).toBe(true);
    expect(rows.find(row => row.id === "limited-capacity-relative")!.cells.every(cell => cell.summary === "Ano" && cell.tone === "positive")).toBe(true);
    const csobIds = products.slice(0, 3).map(product => product.id);
    expect(getVisibleCriteria(COINSURED_SECTION, csobIds.slice(0, 2), true, [])).toEqual([]);
    expect(getVisibleCriteria(COINSURED_SECTION, csobIds.slice(1), true, []).map(row => row.id))
      .toEqual(["household-members", "non-paying-friends"]);
    const differences = buildLiabilityReport([COINSURED_SECTION], products.slice(1, 3), { ...settings, onlyDifferences: true }).sections[0].rows;
    expect(differences.map(row => row.id)).toEqual(["non-paying-friends"]);
    expect(differences[0].cells.map(cell => cell.summary)).toEqual(["N / A", "Ano"]);
    expect(getVisibleCriteria(COINSURED_SECTION, products.slice(3).map(product => product.id), true, [])).toEqual([]);
  });

  it("u historické výpomoci ČSOB zachová stejné výluky bez smlouvy i se smlouvou a exportuje samostatná podkritéria", () => {
    const products = HISTORICAL_LIABILITY_PRODUCTS.filter(product => csobMaximaIds.has(product.id));
    const differences = buildLiabilityReport([COINSURED_SECTION], products, {
      ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true, onlyDifferences: true,
    }).sections[0].rows;
    const helperRows = ["helper-property-care", "helper-path-maintenance", "helper-construction",
      "contracted-helper-property-care", "contracted-helper-path-maintenance", "contracted-helper-construction"];
    expect(differences.map(row => row.id)).toEqual(["non-paying-friends", ...helperRows]);
    const standalone = buildLiabilityReport([COINSURED_SECTION], products, {
      ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true,
      selectedCriteria: { coinsured: helperRows },
    }).sections[0].rows;
    expect(standalone.map(row => row.id)).toEqual(helperRows);
    for (const row of standalone) {
      expect(row.cells.map(({ summary, tone }) => ({ summary, tone }))).toEqual([
        ...Array(3).fill({ summary: "Není součástí", tone: "negative" }),
        ...Array(2).fill({ summary: "Ano", tone: "positive" }),
      ]);
    }
  });
});
