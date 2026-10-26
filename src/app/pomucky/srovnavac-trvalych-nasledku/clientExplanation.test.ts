import { describe, expect, it } from "vitest";
import { clientComparisonHeading, explainClientVariant, getClientScenarioExample } from "./clientExplanation";
import { buildClientReport } from "./clientReport";

const curve = (calculate: (percent: number) => number) => Array.from({ length: 101 }, (_, percent) => ({ percent, payoutPercent: calculate(percent) }));
const cpp = { key: "cpp-10x", curve: curve(percent => percent * Math.ceil(percent / 10)), payouts: [220000, 2500000, 6000000] };
// Representative ranges from the existing Bel Mondo 2023–2024 table. Its
// progression adds percentage points; it does not multiply whole bands by 2.
const generali = { key: "generali-bel-mondo-20-2023-2024", curve: curve(percent => {
  if (percent <= 15) return percent;
  if (percent <= 25) return 15 + (percent - 15) * 2;
  if (percent <= 35) return 35 + (percent - 25) * 3;
  if (percent <= 45) return 65 + (percent - 35) * 4;
  if (percent === 50) return 145;
  if (percent === 75) return 425;
  if (percent === 100) return 1000;
  return percent * 3;
}), payouts: [110000, 1450000, 4250000] };
const scenarios = [11, 50, 75].map(percent => ({ percent, label: String(percent) }));
const insured = 1000000;

describe("client explanation from selected progression tables", () => {
  it("describes NEON's exact open 10%, closed 20% multiplier band and the 11% example", () => {
    const explanation = explainClientVariant(cpp, scenarios, insured);
    expect(explanation.progression).toContain("nad 10 % do 20 % včetně");
    expect(explanation.progression).toContain("z dvojnásobku pojistné částky");
    expect(explanation.example).toContain("220 000 Kč");
    expect(explanation.example).toContain("22 % pojistné částky");
    expect(explanation.doubleBenefit).toBeNull();
  });

  it("separates Bel Mondo's first progression at 16% from doubling the basic benefit at 38%", () => {
    const explanation = explainClientVariant(generali, scenarios, insured);
    expect(explanation.progression).toContain("při 16 %");
    expect(explanation.progression).toContain("plnění 17 %");
    expect(explanation.doubleBenefit).toContain("při 38 % hodnocení");
    expect(explanation.example).toContain("110 000 Kč");
    expect(explanation.example).toContain("ještě nezvyšuje");
    expect(explanation.progression).not.toContain("z dvojnásobku");
  });

  it("uses another selected table's thresholds rather than reusing the newer Bel Mondo text", () => {
    const older = { curve: curve(percent => percent <= 25 ? percent : percent <= 80 ? 25 + (percent - 25) * 5 : 300 + (percent - 80) * 25), payouts: [110000] };
    const explanation = explainClientVariant(older, scenarios.slice(0, 1), insured);
    expect(explanation.progression).toContain("při 26 %");
    expect(explanation.doubleBenefit).toContain("při 34 %");
    expect(explanation.progression).not.toContain("16 %");
  });

  it("keeps the same first band for a different selected NEON progression", () => {
    const fivefold = { key: "cpp-5x", curve: curve(percent => percent * Math.ceil(percent / 20)), payouts: [110000] };
    expect(explainClientVariant(fivefold, scenarios.slice(0, 1), insured).progression).toContain("nad 20 % do 40 % včetně");
  });

  it.each([10, 20, 20.1, 50])("takes the example amount from the actual selected scenario (%s%%), including decimals", percent => {
    const payout = insured * percent * Math.ceil(percent / 10) / 100;
    const explanation = explainClientVariant({ ...cpp, payouts: [payout] }, [{ percent }], insured);
    expect(explanation.example).toContain(`${payout.toLocaleString("cs-CZ")} Kč`);
  });

  it("does not infer exact multiplier bands for a rounded percentage-table calculator", () => {
    expect(explainClientVariant({ ...cpp, key: "other-table" }, scenarios, insured).progression).not.toContain("nad 10 % do 20 %");
  });

  it("does not invent thresholds for incomplete or invalid curve data", () => {
    const explanation = explainClientVariant({ curve: [{ percent: 11, payoutPercent: 22 }, { percent: NaN, payoutPercent: Infinity }], payouts: [0] }, [{ percent: 0 }], 0);
    expect(explanation.progression).not.toContain("poprvé");
    expect(explanation.doubleBenefit).toBeNull();
    expect(explanation.example).toBeNull();
    expect(JSON.stringify(explanation)).not.toContain("NaN");
  });

  it("skips a zero scenario and uses the next selected scenario", () => {
    expect(explainClientVariant({ ...cpp, payouts: [0, 220000] }, [{ percent: 0 }, { percent: 11 }], insured).example).toContain("hodnocení 11 %");
  });

  it("only claims a common maximum when all selected variants have it", () => {
    expect(clientComparisonHeading([cpp, generali])).toContain("Stejné maximum 10×");
    expect(clientComparisonHeading([cpp, { curve: curve(percent => percent * 5), payouts: [] }])).not.toContain("Stejné maximum");
    expect(clientComparisonHeading([cpp])).toContain("Rozhoduje průběh progrese");
  });

  it("describes equal selected payouts without claiming a difference", () => {
    expect(clientComparisonHeading([cpp, { ...generali, payouts: cpp.payouts }])).toBe("Stejná pojistná částka. Ve zvolených scénářích je plnění stejné.");
  });

  it("uses the full-base NEON multiplier in the illustrated calculation", () => {
    expect(getClientScenarioExample(cpp, scenarios, insured)).toEqual({
      assessment: 11, payout: 220000, payoutPercent: 22, effectiveMultiplier: 2, wholeBaseMultiplier: 2,
    });
  });

  it("keeps percentage-table payouts separate from a whole-base multiplier", () => {
    const example = getClientScenarioExample({ ...generali, payouts: [760000] }, [{ percent: 38 }], insured);
    expect(example?.payoutPercent).toBe(76);
    expect(example?.effectiveMultiplier).toBe(2);
    expect(example?.wholeBaseMultiplier).toBeNull();
  });

  it("omits invalid scenarios and missing amounts from illustrated calculations", () => {
    expect(getClientScenarioExample({ ...cpp, payouts: [NaN, 0, 220000] }, [{ percent: 11 }, { percent: 0 }, { percent: 11 }], insured)?.payout).toBe(220000);
    expect(getClientScenarioExample(cpp, scenarios, 0)).toBeNull();
    expect(getClientScenarioExample(cpp, scenarios, Infinity)).toBeNull();
    expect(getClientScenarioExample({ ...cpp, payouts: [] }, scenarios, insured)).toBeNull();
  });
});

describe("explanations in the PDF report", () => {
  const row = (source: typeof cpp) => ({ ...source, insurerName: "ČPP", productName: "NEON 2023–2026", badges: ["10× progrese"], logo: null });
  const options = { generatedAt: "26. 10. 2026", sumInsured: insured, scenarios, rows: [row(cpp)], appendix: "none" as const };

  it("includes the client explanation even when optional appendices are disabled", () => {
    const html = buildClientReport(options);
    expect(html).toContain("Proč se vyplacené částky liší");
    expect(html).toContain("nad 10 % do 20 % včetně");
    expect(html).toContain("22 % pojistné částky");
    expect(html).toContain("konkrétní úraz mohou různé pojišťovny ohodnotit odlišně");
    expect(html).not.toContain("pdf-chart\"><svg");
  });

  it("shows exactly the selected variants and safely escapes names and badges", () => {
    const html = buildClientReport({ ...options, rows: [{ ...row(cpp), productName: '<img src=x onerror="alert(1)">', badges: ["<script>bad()</script>"] }] });
    expect(html).toContain("&lt;img");
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain("<script>bad()");
    expect(html).not.toContain("Bel Mondo");
  });

  it("preserves decimal scenario precision in the illustrated formula", () => {
    const html = buildClientReport({ ...options, scenarios: [{ percent: 11.111, label: "Scénář 1" }], rows: [{ ...row(cpp), payouts: [222220] }] });
    expect(html).toContain("1 000 000 Kč × 11,111 % × 2");
    expect(html).toContain("222 220 Kč");
  });

  it("labels formulas that need rounding instead of implying an exact calculation", () => {
    const html = buildClientReport({ ...options, scenarios: [{ percent: 11.11111111, label: "Scénář 1" }], rows: [{ ...row(cpp), payouts: [222222.2222] }] });
    expect(html).toContain("Přibližně: 1 000 000 Kč × 11,111111 % × 2");
  });

  it("focuses the cover and graphic on the first selected scenario with different payouts", () => {
    const html = buildClientReport({ ...options,
      scenarios: [1, 50, 75].map(percent => ({ label: String(percent), percent })),
      rows: [{ ...row(cpp), payouts: [10000, 2500000, 6000000] },
        { ...row(generali), insurerName: "Generali", productName: "Bel Mondo", payouts: [10000, 1450000, 4250000] }],
    });
    const focus = html.match(/<aside class="pdf-focus">([\s\S]*?)<\/aside>/)?.[1];
    expect(focus).toContain("SCÉNÁŘ 2");
    expect(focus).toContain("50<span>%</span>");
    expect(html).toContain("ROZDÍL PŘI 50 % NÁSLEDKŮ");
    expect(html).toContain("Porovnání pojistného plnění ve scénáři 2");
  });

  it("paginates explanations into separate sheets without losing products", () => {
    const html = buildClientReport({ ...options, rows: Array.from({ length: 8 }, (_, index) => ({ ...row(cpp), productName: `Varianta ${index}` })) });
    expect(html.match(/class="pdf-explanation-card"/g)).toHaveLength(8);
    expect(html.match(/class="pdf-explanation-title"/g)).toHaveLength(3);
    expect(html.match(/class="pdf-summary/g)).toHaveLength(4); // table and key on each of two overview pages
  });
});
