import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalculatorAutoPdfDetailSummary } from "./CalculatorAutoPdfDetailSummary";

describe("CalculatorAutoPdfDetailSummary", () => {
  it("shows ČPP Extra Benefit PROFI in its own percent section", () => {
    const html = renderToStaticMarkup(<CalculatorAutoPdfDetailSummary items={[
      { section: "extraBenefit", label: "Extra Benefit PROFI", value: "Ne" },
      { section: "addons", label: "Pojištění KLIKA", value: "Ano" },
    ]} />);

    expect(html).toContain("EXTRA BENEFIT PROFI");
    expect(html).toContain("lucide-percent");
    expect(html).toContain("Připojištění");
    expect(html).not.toMatch(/EXTRA BENEFIT PROFI<\/span>[\s\S]*?<dt[^>]*>Extra Benefit PROFI<\/dt>/);
  });
});
