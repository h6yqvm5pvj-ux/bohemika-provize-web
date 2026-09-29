import type { INSURERS } from "./insurers";
import type { InsuranceType } from "./lifeCoverage";

// User-supplied product names, including historical versions for existing contracts.
export const LIFE_PRODUCTS: Partial<Record<typeof INSURERS[number]["id"], readonly string[]>> = {
  allianz: ["Život", "Partners Život"],
  generali: ["Allegro 20", "Bel Mondo 20", "Můj Život 2", "BeneFit Extra", "Swing", "Bella Vita"],
  metlife: [
    "Garde 2.0", "Garde 3.0", "Garde 3.1", "Garde 3.2", "Garde 4.0", "Garde 4.1", "Garde 4.2", "Garde 5.0", "Garde Risk 1.0", "Garde 6.0",
    "Vision 4.0", "Vision 5.0", "Vision 5.1", "Vision 6.0", "Vision 6.1", "Vision 6.2", "Vision 7.0", "Vision 8.0", "OneGuard",
  ],
  kooperativa: ["Flexi", "Na Přání", "Perspektiva"],
  csob: ["Náš Život", "Forte"],
  cpp: ["Neon Life", "Neon Risk", "Evoluce", "Evoluce Plus", "Maximum"],
  kb: ["Elán", "Mutumutu"],
  nn: ["Orange", "Smart", "Život", "Blue"],
  pillow: ["Pojištění úrazu a nemoci"],
  simplea: ["Simplea"],
  uniqa: ["Život a radost", "Active Life", "Symfonie", "Domino", "Logika"],
  youplus: ["4U"],
  slavia: ["PRO zdraví"],
};

export function productsForInsurer(insurerId: string, insuranceType: InsuranceType): readonly string[] {
  if (insuranceType !== "" && insuranceType !== "life") return [];
  return Object.hasOwn(LIFE_PRODUCTS, insurerId) ? LIFE_PRODUCTS[insurerId as keyof typeof LIFE_PRODUCTS] || [] : [];
}
