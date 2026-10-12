import { describe, expect, it } from "vitest";
import { BENCHMARKS, COUNTERWEIGHTS, TOPICS, evidenceHref, progression, topicMatches } from "./comparisonData";
import { buildComparisonReport } from "./comparisonPdf";

describe("NEON 2026 vs. Bel Mondo 20", () => {
  it("počítá plnění podle ověřených tabulek včetně skoků ČPP na hranicích pásem", () => {
    const expected = [[10,10,10],[20,40,25],[30,90,50],[50,250,145],[70,490,360],[90,810,695],[100,1000,1000]];
    expect(BENCHMARKS).toEqual(expected.map(([percent]) => percent));
    for (const [percent, cppPercent, generaliPercent] of expected) {
      expect(progression(percent, 1_000_000)).toMatchObject({ cppPercent, generaliPercent, cpp: cppPercent * 10_000, generali: generaliPercent * 10_000 });
    }
    expect(progression(50, 1_000_000).difference).toBe(1_050_000);
    expect(progression(10, 1_000_000).cppPercent).toBe(10);
    expect(progression(11, 1_000_000).cppPercent).toBe(22);
    expect(progression(50, 1_000_000).cppPercent).toBe(250);
    expect(progression(51, 1_000_000).cppPercent).toBe(306);
    for (let percent = 1; percent <= 100; percent++) {
      const result = progression(percent, 1_000_000);
      expect(Number.isFinite(result.generali)).toBe(true);
      expect(result.cppPercent).toBeGreaterThanOrEqual(result.generaliPercent);
    }
  });
  it("odmítne neplatné hodnoty modelu", () => {
    for (const percent of [0,101,1.5,NaN,Infinity]) expect(() => progression(percent, 1_000_000)).toThrow();
    for (const sum of [0,-1,10_000_001,100.5,NaN,Infinity]) expect(() => progression(50, sum)).toThrow();
  });
  it("hledá bez diakritiky a zachovává opravované a nepotvrzené závěry", () => {
    expect(TOPICS).toHaveLength(49);
    expect(new Set(TOPICS.map((row) => row.id)).size).toBe(49);
    expect(TOPICS.filter((row) => topicMatches(row, "roztrousena"))).not.toHaveLength(0);
    expect(TOPICS.filter((row) => topicMatches(row, "P02"))).toHaveLength(1);
    expect(TOPICS.find((row) => row.id === "P02")!.status).toBe("převzato_neověřeno");
    expect(TOPICS.find((row) => row.id === "D02")!.generali).toContain("nové smlouvy");
    for (const topic of TOPICS) {
      expect(topic.conditions.length).toBeGreaterThan(30);
      expect(topic.evidence.some((ref) => ref.insurer === "cpp")).toBe(true);
      expect(topic.evidence.some((ref) => ref.insurer === "generali")).toBe(true);
      for (const source of topic.evidence) {
        const url = new URL(evidenceHref(source));
        expect(url.protocol).toBe("https:");
        expect(source.printedPage).toBe(source.pdfPage);
        expect(source.pdfPage).toBeGreaterThan(0);
        expect(source.pdfPage).toBeLessThanOrEqual(source.insurer === "cpp" ? 100 : 55);
      }
    }
  });
  it("exportuje jen vybraná témata, vždy se všemi protivahami a omezeními", () => {
    const report = buildComparisonReport({ selectedIds: ["R07", "unknown"], percent: 50, insuredSum: 1_000_000 });
    const rows = report.sections.flatMap((section) => section.rows);
    expect(rows.map((row) => row.id)).toEqual(["scope", "R07", ...COUNTERWEIGHTS.map((row) => row.id)]);
    expect(rows.find((row) => row.id === "R07")!.cells.every((cell) => cell.detail?.includes("12 měsících"))).toBe(true);
    expect(report.sections.some((section) => section.id === "progression")).toBe(false);
    expect(() => buildComparisonReport({ selectedIds: ["unknown"], percent: 50, insuredSum: 1_000_000 })).toThrow("Vyber alespoň jedno téma");
  });
});
