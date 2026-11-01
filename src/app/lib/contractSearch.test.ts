import { describe, expect, it } from "vitest";
import { matchesContractClientName, matchesContractSearch, normalizeContractSearchText, prepareContractSearch } from "./contractSearch";

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
  it.each(["Woody Parkett s.r.o.", "parkett woody sro", "Woody s r o Parkett", "Woody Parkett s.r.", "Woody Parkett"])("finds company spelling and word-order variant %s", query => {
    expect(matchesContractSearch({ clientName: "Parkett s.r Woody" }, prepareContractSearch(query))).toBe(true);
  });
  it.each(["Woody Parkett a.s.", "Woody Woody s.r.o.", "s.r.o.", "sro", "Woody Other s.r.o."])("rejects company mismatch %s", query => {
    expect(matchesContractSearch({ clientName: "Parkett Woody s.r.o.", contractNumber: "12345" }, prepareContractSearch(query))).toBe(false);
  });
  it("accepts a.s. spacing variants but keeps people and legal forms distinct", () => {
    expect(matchesContractSearch({ clientName: "ČSOB Servis a.s." }, prepareContractSearch("Servis CSOB a s"))).toBe(true);
    expect(matchesContractSearch({ clientName: "ČSOB Servis s.r.o." }, prepareContractSearch("Servis CSOB a s"))).toBe(false);
    expect(matchesContractSearch({ clientName: "Jan Novák" }, prepareContractSearch("Jan Novák sro"))).toBe(false);
  });
  it("matches the normalized aliases used by the contracts page with the same company rules", () => {
    const query = prepareContractSearch("Woody Parkett sro");
    expect(matchesContractClientName(normalizeContractSearchText("Parkett s.r Woody"), query)).toBe(true);
    expect(matchesContractClientName(normalizeContractSearchText("Parkett Woody a.s."), query)).toBe(false);
  });
  it("keeps ordinary municipality and foundation words searchable", () => {
    expect(matchesContractSearch({ clientName: "Obec Malá Lhota" }, prepareContractSearch("obec"))).toBe(true);
    expect(matchesContractSearch({ clientName: "Nadace Pomoc" }, prepareContractSearch("nadace"))).toBe(true);
  });
});
