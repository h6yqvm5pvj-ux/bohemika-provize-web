import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KoopOdzamDetailPanel } from "./KoopOdzamDetailPanel";

describe("KoopOdzamDetailPanel", () => {
  it("renders each extracted coverage field in the contract detail", () => {
    const html = renderToStaticMarkup(<KoopOdzamDetailPanel detail={{
      occupation: "Uklízečka",
      vehicleRelatedDamage: false,
      annualLimit: 150_000,
      territorialScope: "Česká republika",
      deductible: "10 % min. 1 000 Kč",
    }} />);
    expect(html).toContain("Odpovědnost zaměstnance");
    expect(html).toContain("lucide-car-front");
    expect(html).toContain("lucide-map-pin");
    expect(html).toContain("Povolání");
    expect(html).toContain("Uklízečka");
    expect(html).toContain("Škoda související s řízením a provozem dopravního prostředku");
    expect(html).toContain(">Ne<");
    expect(html).toContain("Roční limit plnění");
    expect(html).toContain("150.000 Kč");
    expect(html).toContain("Územní rozsah");
    expect(html).toContain("Česká republika");
    expect(html).toContain("10 % min. 1 000 Kč");
  });

  it("renders the explicit yes value and hides an empty section", () => {
    const html = renderToStaticMarkup(<KoopOdzamDetailPanel detail={{
      occupation: null,
      vehicleRelatedDamage: true,
      annualLimit: null,
      territorialScope: null,
      deductible: null,
    }} />);
    expect(html).toContain(">Ano<");
    expect(KoopOdzamDetailPanel({ detail: null })).toBeNull();
  });
});
