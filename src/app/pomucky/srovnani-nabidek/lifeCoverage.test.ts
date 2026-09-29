import { describe, expect, it } from "vitest";
import { addOffer, appendLifeCoverage, changeRowCoverage, comparisonCellText, createDocument, parseDocument } from "./model";
import { createLifeDetails, lifeDetailsText, type LifeDetails } from "./lifeCoverage";

describe("structured life comparison", () => {
  it("does not assume a sum insured, amount type, disability degree or progression", () => {
    for (const kind of ["investment", "death", "terminal", "disability", "injury"] as const) expect(lifeDetailsText(createLifeDetails(kind))).toBe("");
  });

  it("formats separate disability amounts and exports only the selected degrees", () => {
    const details: LifeDetails = { kind: "disability", status: "included", amountType: "loan", interestRate: "4,5", degrees: "23", amounts: { "1": "900 000", "2": "1 500 000", "3": "2 000 000" } };
    const text = lifeDetailsText(details);
    expect(text).toContain("Klesající dle úroku z úvěru"); expect(text).toContain("4,5 %");
    expect(text).toContain("II. stupeň: 1 500 000 Kč"); expect(text).toContain("III. stupeň: 2 000 000 Kč");
    expect(text).not.toContain("900 000");
    expect(lifeDetailsText({ ...details, status: "excluded" })).toBe("Nesjednáno");
    expect(lifeDetailsText({ ...details, amountType: "constant" })).not.toContain("4,5");
  });

  it("keeps the exact injury threshold and progression including custom options", () => {
    const details: LifeDetails = { kind: "injury", status: "included", amount: "500 000", progression: "8.5x", customProgression: "Nepoužít", threshold: "0.001", customThreshold: "Nepoužít" };
    expect(lifeDetailsText(details)).toContain("8,5× progrese");
    expect(lifeDetailsText(details)).toContain("Plnění od 0,001 %");
    expect(lifeDetailsText(details)).not.toContain("Nepoužít");
    expect(lifeDetailsText({ ...details, progression: "custom", customProgression: "Speciální varianta", threshold: "custom", customThreshold: "1" })).toContain("Plnění od: 1 %");
    expect(lifeDetailsText({ ...details, progression: "none", threshold: "0" })).toContain("Bez progrese\nPlnění od 0 %");
  });

  it("adds an empty independent set of parameters to new offers and retains text when changing row type", () => {
    let doc = appendLifeCoverage(createDocument(), "death");
    const original = doc.offers[0].id;
    doc.rows[0].cells[original] = { text: "Doplňující podmínka", tone: "warning", details: { kind: "death", status: "included", amount: "2 000 000", amountType: "linear", interestRate: "" } };
    doc = addOffer(doc);
    expect(doc.rows[0].cells[doc.offers[2].id].details).toEqual(createLifeDetails("death"));
    const changed = changeRowCoverage(doc.rows[0], "injury");
    expect(changed.coverage).toBe("injury"); expect(changed.label).toBe("Trvalé následky úrazu");
    expect(changed.cells[original].text).toContain("Pojistná částka: 2 000 000 Kč");
    expect(changed.cells[original].text).toContain("Doplňující podmínka");
    const custom = changeRowCoverage(doc.rows[0]);
    expect(custom.coverage).toBeUndefined(); expect(custom.cells[original].details).toBeUndefined();
    expect(comparisonCellText(custom.cells[original])).toContain("Lineárně klesající");
    expect(doc.rows[0].cells[original].details?.kind).toBe("death");
  });

  it("round-trips all structured values and migrates original version-1 concepts", () => {
    let doc = createDocument();
    for (const kind of ["investment", "death", "terminal", "disability", "injury"] as const) doc = appendLifeCoverage(doc, kind);
    const id = doc.offers[1].id;
    doc.rows[3].cells[id].details = { kind: "disability", status: "included", degrees: "3", amountType: "constant", interestRate: "5", amounts: { "1": "100", "2": "200", "3": "300" } };
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
    const legacy = { ...createDocument(), version: 1, insuranceType: undefined };
    legacy.rows[0].cells[legacy.offers[0].id].text = "Původní volná poznámka";
    const migrated = parseDocument(JSON.stringify(legacy));
    expect(migrated.version).toBe(2); expect(migrated.insuranceType).toBe("");
    expect(migrated.rows[0].cells[legacy.offers[0].id].text).toBe("Původní volná poznámka");
    expect(migrated.rows[0].coverage).toBeUndefined();
  });

  it.each([
    { kind: "death", status: "included", amount: "1", amountType: "unknown", interestRate: "" },
    { kind: "death", status: "invalid", amount: "1", amountType: "constant", interestRate: "" },
    { kind: "death", status: "included", amount: { script: "x" }, amountType: "constant", interestRate: "" },
    { kind: "disability", status: "included", amountType: "constant", interestRate: "", degrees: "123", amounts: { "1": "1", "2": "2", "3": "3" } },
  ])("rejects malformed or mismatched imported parameters", details => {
    const doc = appendLifeCoverage(createDocument(), "death");
    const raw = JSON.parse(JSON.stringify(doc));
    raw.rows[0].cells[doc.offers[0].id].details = details;
    expect(() => parseDocument(JSON.stringify(raw))).toThrow("neplatné údaje životního pojištění");
  });
});
