import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomexDetailPanel, type DomexFields } from "./DomexDetailPanel";

const fields: DomexFields = {
  address: "", propertyAddress: "", householdAddress: "", propertyAssistance: "", householdAssistance: "",
  propertyType: "", propertyCoverage: "", sumInsured: "", deductible: "",
  householdType: "", householdCoverage: "", householdSumInsured: "", householdDeductible: "",
  outbuildingSumInsured: "", liabilitySumInsured: "", liabilityDeductible: "",
  liabilityMobile: false, liabilityTenant: false, liabilityLandlord: false, assistancePlus: false, note: "",
};
const render = (props: Partial<ComponentProps<typeof DomexDetailPanel>> = {}) => renderToStaticMarkup(
  <DomexDetailPanel prod="domexneuron" editMode={false} fields={fields} domexDetail={null} onChange={() => {}} {...props} />,
);

describe("DOMEX Neuron property details", () => {
  it("shows each insured object's address, variant, amount and assistance separately", () => {
    const html = render({ domexDetail: {
      propertyAddress: "Testovací 10, Město A", propertyType: "dum", propertyCoverage: "opti", sumInsured: 5_200_000,
      householdAddress: "Ukázková 20, Město B", householdType: "trvale", householdCoverage: "maxi", householdSumInsured: 850_000,
      liabilitySumInsured: 25_000_000, propertyAssistance: "basic", householdAssistance: "plus",
    } });
    expect(html).toContain("Rodinný dům");
    expect(html).toContain("Testovací 10, Město A");
    expect(html).toContain("Ukázková 20, Město B");
    expect(html).toContain("OPTI");
    expect(html).toContain("MAXI");
    expect(html).toMatch(/5[.\s]?200[.\s]?000/);
    expect(html).toMatch(/850[.\s]?000/);
    expect(html).toContain("Limit pojistného plnění");
    expect(html).toMatch(/25[.\s]?000[.\s]?000/);
    expect(html).toContain("Asistenční služby");
    expect(html).toMatch(/<dt[^>]*>Stavba<\/dt><dd[^>]*>Domácí asistence<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>Domácnost<\/dt><dd[^>]*>Asistence PLUS<\/dd>/);
    expect(html).not.toContain("/cuzk?address=");
  });

  it("does not create a building section from a household's legacy address", () => {
    const html = render({ domexDetail: {
      address: "Ukázková 20, Město B", householdAddress: "Ukázková 20, Město B",
      householdType: "rekreacni", householdSumInsured: 850_000, householdAssistance: "basic",
    } });
    expect(html).toContain("Pojištění domácnosti");
    expect(html).toContain("Rekreační");
    expect(html).not.toContain("Pojištění stavby");
    expect(html).not.toMatch(/<dt[^>]*>Stavba<\/dt>/);
  });

  it("does not substitute the household address after the building address was explicitly cleared", () => {
    const html = render({ domexDetail: {
      address: "Domácnost B", propertyAddress: null, propertyType: "dum",
      householdAddress: "Domácnost B", householdType: "trvale",
    } });
    const building = html.slice(html.indexOf("Pojištění stavby"), html.indexOf("Pojištění domácnosti"));
    expect(building).not.toContain("Domácnost B");
    expect(html).toContain("Domácnost B");
  });

  it("keeps a liability-only policy free of invented property or assistance sections", () => {
    const html = render({ domexDetail: { liabilitySumInsured: 25_000_000 }, premiumIndexationEnabled: true });
    expect(html).toContain("Pojištění odpovědnosti");
    expect(html).not.toContain("Pojištění stavby");
    expect(html).not.toContain("Pojištění domácnosti");
    expect(html).not.toContain("Asistenční služby");
    expect(html).not.toContain("schválené valorizace");
  });

  it.each([true, false, null])("warns about indexed insured sums only with confirmed indexation: %s", enabled => {
    const html = render({ premiumIndexationEnabled: enabled, domexDetail: { propertyType: "byt", sumInsured: 4_200_000 } });
    expect(html).toContain("Bytová jednotka");
    expect(html.includes("schválené valorizace")).toBe(enabled === true);
  });

  it("offers independent assistance and address fields when editing", () => {
    const html = render({ editMode: true, fields: { ...fields, propertyAssistance: "basic", householdAssistance: "plus" } });
    expect(html).toContain('aria-label="Adresa pojištěné nemovitosti"');
    expect(html).toContain('aria-label="Adresa pojištěné domácnosti"');
    expect(html).toContain('aria-label="Asistence stavba"');
    expect(html).toContain('aria-label="Asistence domácnost"');
  });

  it("renders an imported address as text", () => {
    const html = render({ domexDetail: { propertyAddress: '<script>alert("synthetic")</script>', propertyType: "dum" } });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it.each(["domex", "maxdomov"] as const)("preserves the existing shared-address and assistance display for %s", prod => {
    const html = render({ prod, domexDetail: { address: "Testovací 10", propertyType: "dum", assistancePlus: true }, fields: { ...fields, assistancePlus: true } });
    expect(html).toContain("Testovací 10");
    expect(html).toContain("Asistence PLUS");
    expect(html).not.toContain("Asistenční služby");
  });
});
