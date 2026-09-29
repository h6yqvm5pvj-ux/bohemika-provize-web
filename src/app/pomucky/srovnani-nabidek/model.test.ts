import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INSURERS } from "./insurers";
import { addOffer, appendTemplate, createDocument, createRow, moveItem, offerGroups, parseDocument, recommendOffer, removeOffer } from "./model";

describe("free comparison documents", () => {
  it("retains one chosen recommendation across saving and reordering and clears it on removal", () => {
    let doc = addOffer(createDocument());
    expect(doc.recommendedOfferId).toBeUndefined();
    const first = doc.offers[1].id, second = doc.offers[2].id;
    doc = recommendOffer(doc, first);
    doc = recommendOffer(doc, second);
    expect(doc.recommendedOfferId).toBe(second);
    doc.offers = moveItem(doc.offers, 2, -1);
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
    expect(doc.offers[1].id).toBe(doc.recommendedOfferId);
    expect(recommendOffer(doc, "missing")).toBe(doc);
    expect(recommendOffer(doc, doc.offers[0].id)).toBe(doc);
    expect(removeOffer(doc, second).recommendedOfferId).toBeUndefined();
    expect(recommendOffer(doc).recommendedOfferId).toBeUndefined();
  });

  it("rejects recommendations that do not reference a proposal", () => {
    const doc = createDocument();
    for (const recommendedOfferId of ["missing", doc.offers[0].id, 123, null]) {
      expect(() => parseDocument(JSON.stringify({ ...doc, recommendedOfferId }))).toThrow("platné srovnání");
    }
  });

  it("preserves values and highlights when columns move, and removes only deleted offer cells", () => {
    let doc = createDocument();
    const original = doc.offers[0].id, proposal = doc.offers[1].id;
    doc.rows[0].cells[proposal] = { text: "2 000 000 Kč", tone: "positive" };
    doc = addOffer(doc);
    const added = doc.offers[2].id;
    doc.offers = moveItem(doc.offers, 2, -1);
    expect(doc.rows[0].cells[proposal]).toEqual({ text: "2 000 000 Kč", tone: "positive" });
    expect(doc.rows[0].cells[added]).toEqual({ text: "", tone: "neutral" });
    expect(removeOffer(doc, original)).toBe(doc);
    doc = removeOffer(doc, added);
    expect(doc.rows[0].cells).not.toHaveProperty(added);
    expect(doc.rows[0].cells[proposal].text).toBe("2 000 000 Kč");
    expect(removeOffer(doc, proposal)).toBe(doc);
  });

  it("round-trips arbitrary rows, sections, multiple offers, icons, line breaks and notes", () => {
    let doc = appendTemplate(addOffer(createDocument()), "property");
    doc.firstName = "Žaneta"; doc.lastName = "Dvořáková"; doc.notes = "Poznámka\nDruhý odstavec";
    doc.offers[0].insurerId = "custom"; doc.offers[0].customInsurer = "Historická pojišťovna";
    doc.rows.push(createRow(doc.offers, "Vlastní položka", "star"));
    doc.rows.at(-1)!.cells[doc.offers[1].id] = { text: "Individuální limit\nPodmínka: dohoda", tone: "warning" };
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
    const before = doc.rows.length;
    doc = appendTemplate(doc, "auto");
    expect(doc.rows.length).toBeGreaterThan(before);
    expect(doc.rows[before - 1].label).toBe("Vlastní položka");
  });

  it("repeats the original contract alongside every group of proposals", () => {
    let doc = createDocument();
    for (let index = 0; index < 7; index++) doc = addOffer(doc);
    const groups = offerGroups(doc.offers);
    expect(groups.map(group => group.length)).toEqual([4, 4, 3]);
    expect(groups.every(group => group[0].id === doc.offers[0].id)).toBe(true);
    expect(groups.flatMap(group => group.slice(1))).toEqual(doc.offers.slice(1));
  });

  it.each([
    (doc: ReturnType<typeof createDocument>) => { doc.offers[1].id = doc.offers[0].id; },
    (doc: ReturnType<typeof createDocument>) => { doc.offers[0].id = "__proto__"; },
    (doc: ReturnType<typeof createDocument>) => { doc.offers[0].insurerId = "https://unknown.test/logo.png"; },
    (doc: ReturnType<typeof createDocument>) => { delete doc.rows[0].cells[doc.offers[0].id]; },
    (doc: ReturnType<typeof createDocument>) => { doc.date = "2026-02-31"; },
    (doc: ReturnType<typeof createDocument>) => { doc.rows[0].icon = "<script>"; },
  ])("rejects malformed or unsafe project structures", mutate => {
    const doc = createDocument(); mutate(doc);
    expect(() => parseDocument(JSON.stringify(doc))).toThrow("platné srovnání");
  });

  it("uses existing local logos for every listed insurer", () => {
    for (const insurer of INSURERS) expect(existsSync(resolve(process.cwd(), `public${insurer.logo}`)), insurer.name).toBe(true);
  });
});
