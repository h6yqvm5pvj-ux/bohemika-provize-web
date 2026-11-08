import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalculatorKoopOdzamPdfDetailSummary } from "./CalculatorKoopOdzamPdfDetailSummary";

describe("CalculatorKoopOdzamPdfDetailSummary", () => {
  it("shows the extracted employee coverage preview below the calculator form", () => {
    const html = renderToStaticMarkup(<CalculatorKoopOdzamPdfDetailSummary detail={{
      occupation: "Uklízečka",
      vehicleRelatedDamage: false,
      annualLimit: 150_000,
      territorialScope: "Česká republika",
      deductible: "10 % min. 1 000 Kč",
    }} />);
    expect(html).toContain("PDF → detail smlouvy");
    expect(html).toContain("5 polí");
    expect(html).toContain("Odpovědnost zaměstnance");
    expect(html).toContain("lucide-car-front");
    expect(html).toContain("lucide-map-pin");
    expect(html).toContain("Uklízečka");
    expect(html).toContain(">Ne<");
    expect(html).toContain("150.000 Kč");
    expect(html).toContain("Česká republika");
    expect(html).toContain("10 % min. 1 000 Kč");
  });

  it("hides the preview when PDF detail is missing", () => {
    expect(CalculatorKoopOdzamPdfDetailSummary({ detail: null })).toBeNull();
  });
});
