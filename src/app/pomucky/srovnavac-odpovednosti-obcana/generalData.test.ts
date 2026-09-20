import { describe, expect, it } from "vitest";
import { criterionHasDifferences, hasGeneralComparison } from "./generalData";

const cpp = "cpp:domex-plus-2023-10-01";
const csob = "csob:nase-odpovednost-2025-06-16";

describe("filtr rozdílů v obecných podmínkách", () => {
  it("zachová stejné maximální limity, pokud se liší nižší varianty v podrobnostech", () => {
    expect(criterionHasDifferences("maximum-limit", [cpp, csob])).toBe(true);
  });

  it("zachová stejné označení Evropa, pokud se liší územní podrobnosti", () => {
    expect(criterionHasDifferences("territory", ["allianz:mujdomov-2026-06-25", csob])).toBe(true);
  });

  it("skryje shodné hodnocení nedbalosti i shodná podkritéria", () => {
    for (const criterion of ["negligence", "negligence-definition", "negligence-position", "negligence-refusal"] as const) {
      expect(criterionHasDifferences(criterion, [cpp, csob])).toBe(false);
    }
  });

  it("nepovažuje prázdný výběr ani jediný produkt za rozdíl", () => {
    expect(criterionHasDifferences("maximum-limit", [])).toBe(false);
    expect(criterionHasDifferences("maximum-limit", [cpp])).toBe(false);
  });

  it("nepřenáší údaje automaticky na jinou verzi produktu ani jinou pojišťovnu", () => {
    expect(hasGeneralComparison(cpp)).toBe(true);
    expect(hasGeneralComparison("cpp:domex-plus-2027-10-01")).toBe(false);
    expect(hasGeneralComparison("pillow:zakladni-2030-09-10")).toBe(false);
  });
});
