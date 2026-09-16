import { describe, expect, it } from "vitest";
import { matchesContractSearch, normalizeContractSearchText, prepareContractSearch } from "./contractSearch";

const contract = { clientName: "Ing. Žaneta Nováková", contractNumber: "AB 12/34-56" };

describe("contract search", () => {
  it.each(["zaneta", "NOVÁKOVÁ", "Nováková Žaneta", "novak zan", "  žaneta\t\u00a0 novakova  ", "Ing. Nováková", "ab123456", "12 / 34 - 56", "34-56"])("finds %s", query => {
    expect(matchesContractSearch(contract, prepareContractSearch(query))).toBe(true);
  });
  it.each(["novak jana", "novakova absent", "999999", "Černá", "novak 999"])("rejects %s", query => {
    expect(matchesContractSearch(contract, prepareContractSearch(query))).toBe(false);
  });
  it("treats whitespace as an empty search and tolerates missing fields", () => {
    expect(matchesContractSearch({}, prepareContractSearch(" \n\t "))).toBe(true);
    expect(matchesContractSearch({}, prepareContractSearch("novak"))).toBe(false);
    expect(normalizeContractSearchText("  NOVÁK\u00a0  Jan  ")).toBe("novak jan");
  });
});
