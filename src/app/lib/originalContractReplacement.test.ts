import { describe, expect, it } from "vitest";

import {
  canSaveUnlinkedOriginalReplacement,
  ORIGINAL_CONTRACT_REPLACEMENT_PRODUCTS,
  originalReplacementLabel,
  originalReplacementProductLabel,
  originalReplacementStornoDescription,
  supportsOriginalContractReplacement,
  usesPreviousDayReplacementStorno,
} from "./originalContractReplacement";

describe("original contract replacement capabilities", () => {
  it.each(ORIGINAL_CONTRACT_REPLACEMENT_PRODUCTS)(
    "povolí Refresh/Náhradu pro produkt %s",
    (product) => {
      expect(supportsOriginalContractReplacement(product)).toBe(true);
    },
  );

  it("nepovolí Náhradu pro nepodporovaný produkt", () => {
    expect(supportsOriginalContractReplacement("flexi")).toBe(false);
    expect(supportsOriginalContractReplacement(null)).toBe(false);
  });

  it.each(["domex", "cppAuto", "allianzAuto"] as const)(
    "umožní uložit produkt %s i bez nalezené původní smlouvy",
    (product) => {
      expect(canSaveUnlinkedOriginalReplacement(product)).toBe(true);
      expect(supportsOriginalContractReplacement(product)).toBe(true);
    },
  );

  it.each(["cppAuto", "allianzAuto"] as const)(
    "stornuje původní smlouvu produktu %s den před počátkem nové",
    (product) => {
      expect(usesPreviousDayReplacementStorno(product)).toBe(true);
      expect(canSaveUnlinkedOriginalReplacement(product)).toBe(true);
    },
  );

  it("rozlišuje název workflow", () => {
    expect(originalReplacementLabel("neon")).toBe("Refresh");
    expect(originalReplacementLabel("allianzAuto")).toBe("Náhrada");
  });

  it("vrací společné popisky produktu a termínu storna", () => {
    expect(originalReplacementProductLabel("domex")).toBe("DOMEX");
    expect(originalReplacementProductLabel("allianzAuto")).toBe("Allianz Auto");
    expect(originalReplacementStornoDescription("neon")).toBe(
      "ke dni počátku nové smlouvy",
    );
    expect(originalReplacementStornoDescription("cppAuto")).toBe(
      "jeden den před datem počátku nové smlouvy",
    );
  });
});
