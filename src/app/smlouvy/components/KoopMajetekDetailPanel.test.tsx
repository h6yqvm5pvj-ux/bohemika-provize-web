import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KoopMajetekDetailPanel } from "./KoopMajetekDetailPanel";

describe("KoopMajetekDetailPanel", () => {
  it("renders each parsed coverage as a detail card with its variant and amounts", () => {
    const html = renderToStaticMarkup(<KoopMajetekDetailPanel coverages={[
      { name: "Domácnost", variant: "KOMFORT", deductible: 1_000, sumInsured: 500_000 },
      { name: "Odpovědnost", variant: null, deductible: 0, sumInsured: 20_000_000 },
    ]} />);
    expect(html).toContain("Domácnost");
    expect(html).toContain("Varianta pojištění");
    expect(html).toContain("Pojistná částka / limit plnění");
    expect(html).toContain("Spoluúčast");
    expect(html).toContain("Odpovědnost");
  });
});
