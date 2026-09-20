import { describe, expect, it } from "vitest";
import { comparisonAnswersDiffer, getVisibleCriteria, hasSectionComparison, type ComparisonSectionData } from "./comparisonData";
import { LIABILITY_SECTIONS } from "./sections";
import { PROPERTY_SECTION } from "./propertyData";
import { LIFE_SPORT_SECTION } from "./lifeSportData";
import { SCREENSHOT_PRODUCT_IDS } from "./screenshotData";

const cpp = SCREENSHOT_PRODUCT_IDS[1];
const csob = SCREENSHOT_PRODUCT_IDS[2];
const direct = SCREENSHOT_PRODUCT_IDS[3];

describe("společné filtrování srovnání", () => {
  it("porovnává také rozbalitelné podrobnosti a hodnocení", () => {
    const answer = { summary: "Ano", detail: "Limit 3 000 Kč", tone: "positive" as const };
    expect(comparisonAnswersDiffer([answer, { ...answer, detail: "Limit 10 000 Kč" }])).toBe(true);
    expect(comparisonAnswersDiffer([answer, { ...answer, tone: "warning" }])).toBe(true);
    expect(comparisonAnswersDiffer([answer, { ...answer, summary: " Ano ", detail: "Limit 3\n000 Kč" }])).toBe(false);
  });

  it("odlišuje chybějící údaj od výluky", () => {
    expect(comparisonAnswersDiffer([undefined, { summary: "Není součástí", tone: "negative" }])).toBe(true);
    expect(comparisonAnswersDiffer([undefined, undefined])).toBe(false);
  });

  it("sbalí všechny úrovně potomků, ale zachová stav nezávislých větví", () => {
    const section: ComparisonSectionData = {
      id: "test", title: "Test", number: "01", answers: {},
      criteria: [
        { id: "owner", title: "Vlastník" },
        { id: "other", title: "Další nemovitosti", parentId: "owner" },
        { id: "home", title: "Bydlení", parentId: "other" },
        { id: "land", title: "Pozemek", parentId: "other" },
        { id: "tenant", title: "Nájemce" },
        { id: "equipment", title: "Vybavení", parentId: "tenant" },
      ],
    };
    expect(getVisibleCriteria(section, [], false, ["owner"]).map((row) => row.id)).toEqual(["owner", "tenant", "equipment"]);
    expect(getVisibleCriteria(section, [], false, ["other"]).map((row) => row.id)).toEqual(["owner", "other", "tenant", "equipment"]);
    expect(getVisibleCriteria(section, [], false, ["owner", "tenant"]).map((row) => row.id)).toEqual(["owner", "tenant"]);
  });

  it("ve filtru ponechá sbaleného rodiče se skrytými rozdíly a rozbalí je až na požádání", () => {
    const ids = getVisibleCriteria(LIFE_SPORT_SECTION, [...SCREENSHOT_PRODUCT_IDS], true, ["electric-vehicles"]).map((row) => row.id);
    expect(ids).toContain("electric-vehicles");
    expect(ids).not.toContain("electric-vehicles-definition");
    const expanded = getVisibleCriteria(LIFE_SPORT_SECTION, [...SCREENSHOT_PRODUCT_IDS], true, []).map((row) => row.id);
    expect(expanded).toContain("electric-vehicles");
    expect(expanded).toContain("electric-vehicles-definition");
    expect(expanded).not.toContain("electric-vehicles-sidewalk");
    expect(ids).not.toContain("electric-vehicles-sidewalk");
  });

  it("odliší stejné dílčí krytí, pokud u jednoho produktu vyžaduje připojištění", () => {
    const visible = getVisibleCriteria(PROPERTY_SECTION, [cpp, direct], true, []);
    expect(visible.map((row) => row.id)).toContain("other-home");
    expect(visible.map((row) => row.id)).toContain("listed-property-land");
  });

  it("skryje skutečně shodné sportovní podmínky ČPP a ČSOB", () => {
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, [cpp, csob], true, []).map((row) => row.id))
      .toEqual(["electronics", "pure-financial-loss"]);
  });

  it("pro jediný produkt nevytváří rozdíly", () => {
    for (const section of LIABILITY_SECTIONS) {
      expect(getVisibleCriteria(section, [cpp], true, [])).toEqual([]);
    }
  });
});

describe("vazby a verze podkladů", () => {
  it("nepřenáší údaje z dodaných verzí na jiné produkty ani budoucí verze", () => {
    for (const section of LIABILITY_SECTIONS) {
      expect(hasSectionComparison(section, cpp)).toBe(true);
      expect(hasSectionComparison(section, "cpp:domex-plus-2027-10-01")).toBe(false);
      expect(hasSectionComparison(section, "pillow:zakladni-2030-09-10")).toBe(false);
    }
  });

  it("podkritéria a podmínky odkazují na existující řádky bez cyklů", () => {
    expect(new Set(LIABILITY_SECTIONS.map((section) => section.id)).size).toBe(LIABILITY_SECTIONS.length);
    for (const section of LIABILITY_SECTIONS) {
      const ids = section.criteria.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const row of section.criteria) {
        if (row.coverageParentId) expect(ids).toContain(row.coverageParentId);
        const visited = new Set([row.id]);
        let parentId = row.parentId;
        while (parentId) {
          expect(ids).toContain(parentId);
          expect(visited.has(parentId)).toBe(false);
          visited.add(parentId);
          parentId = section.criteria.find((criterion) => criterion.id === parentId)?.parentId;
        }
      }
    }
  });
});
