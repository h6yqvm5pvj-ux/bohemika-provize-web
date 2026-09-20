import { describe, expect, it } from "vitest";
import { CLIENT_NEEDS, detectClientNeeds, parseAiClientNeeds, personalizeSections } from "./clientNeeds";
import { getCoverageConditions, getVisibleCriteria } from "./comparisonData";
import { LIABILITY_SECTIONS } from "./sections";

const ids = (query: string) => detectClientNeeds(query).matches.map(match => match.id);

describe("profil klienta z vlastních slov", () => {
  it("rozpozná nájem, děti a elektrokolo hned bez volání AI", () => {
    expect(ids("Klient bydlí v nájmu, má dvě děti a jezdí na elektrokole.")).toEqual(["tenant", "children", "electric"]);
    expect(ids("BYDLI V NAJMU, MA 2 DETI A ELEKTROKOLO")).toEqual(["tenant", "children", "electric"]);
  });

  it.each([
    ["Nemá psa ani kočku, má dvě děti a jezdí na kole.", ["children", "cycling"]],
    ["Má děti a psa nemá.", ["children"]],
    ["Děti nemá, chová psa.", ["dog"]],
    ["Nejezdí na elektrokole, ale jezdí na kole.", ["cycling"]],
    ["Je bez dětí a bez zvířat.", []],
    ["Nemá psa. Jeho manželka má psa.", ["dog"]],
    ["Pronajímá si byt.", ["tenant"]],
    ["Pronajímá byt jiným.", ["landlord"]],
    ["Nepronajímá si byt, bydlí ve vlastním domě.", ["owner"]],
    ["Chová hospodářská zvířata a má dva psy.", ["dog", "livestock"]],
    ["Potřebuje pojištění pro podnikání.", []],
  ])("respektuje konkrétní výrok: %s", (query, expected) => { expect(ids(query)).toEqual(expected); });

  it("AI přijme jen známé potřeby s doloženou citací a respektuje negace", () => {
    const query = "Žije v pronajatém bytě. Psa nemá.";
    expect(parseAiClientNeeds('```json\n{"needs":[{"id":"tenant","evidence":"v pronajatém bytě"}]}\n```', query)).toEqual([{ id: "tenant", evidence: "v pronajatém bytě" }]);
    expect(parseAiClientNeeds({ needs: [{ id: "dog", evidence: "Psa" }, { id: "children", evidence: "má dvě děti" }] }, query)).toEqual([]);
    expect(parseAiClientNeeds({ needs: [{ id: "allianz-is-best", evidence: "bytě" }] }, query)).toBeNull();
    expect(parseAiClientNeeds("Allianz klienta pojistí za 200 Kč", query)).toBeNull();
    expect(parseAiClientNeeds({ needs: "tenant" }, query)).toBeNull();
  });
});

describe("dohledatelné porovnání podle profilu", () => {
  it("všechny mapované potřeby odkazují na existující kritéria", () => {
    for (const need of CLIENT_NEEDS) for (const [sectionId, criteria] of Object.entries(need.criteria)) {
      const section = LIABILITY_SECTIONS.find(item => item.id === sectionId)!;
      expect(section, need.id).toBeDefined();
      for (const id of criteria) expect(section.criteria.some(row => row.id === id), `${need.id}/${id}`).toBe(true);
    }
  });

  it("ponechá obecné podmínky, související podkritéria i jejich rodiče, odpovědi nemění", () => {
    const sections = personalizeSections(LIABILITY_SECTIONS, ["tenant", "children", "electric"]);
    expect(sections.map(section => section.id)).toEqual(["general", "life-sport", "tenancy", "coinsured"]);
    expect(sections[0].criteria).toHaveLength(6);
    expect(sections.find(section => section.id === "coinsured")!.criteria.map(row => row.id)).toEqual(["household-members", "children"]);
    expect(sections.find(section => section.id === "life-sport")!.criteria.map(row => row.id)).toContain("recreational-cycling");
    for (const section of sections) {
      const original = LIABILITY_SECTIONS.find(item => item.id === section.id)!;
      expect(section.answers).toBe(original.answers);
      const collapsed = section.criteria.flatMap(row => row.parentId ? [row.parentId] : []);
      expect(getVisibleCriteria(section, [], false, collapsed).every(row => !row.parentId)).toBe(true);
      for (const row of section.criteria) expect(row.relevance?.length).toBeGreaterThan(0);
    }
  });

  it("neztratí podmínky hlavního krytí u žádného personalizovaného podkritéria", () => {
    for (const need of CLIENT_NEEDS) for (const section of personalizeSections(LIABILITY_SECTIONS, [need.id])) {
      const original = LIABILITY_SECTIONS.find(item => item.id === section.id)!;
      for (const row of section.criteria) for (const productId of Object.keys(section.answers)) {
        expect(getCoverageConditions(section, row, productId), `${need.id}/${row.id}/${productId}`).toEqual(getCoverageConditions(original, row, productId));
      }
    }
  });

  it("bez profilu ponechá kompletní srovnání", () => {
    expect(personalizeSections(LIABILITY_SECTIONS, [])).toEqual(LIABILITY_SECTIONS);
  });
});
