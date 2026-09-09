import { describe, expect, it } from "vitest";
import { createClientNameIndex, matchClientName } from "./clientNameMatching";

const match = (query: string, names: string[]) => matchClientName(query, createClientNameIndex(names));

describe("calculator client name matching", () => {
  it("returns only the exact name from the screenshot when similar clients also exist", () => {
    expect(match("Jan Buček", ["Jana Bučková", "Jan Bůček", "Jan Buček", "Jan Bucek", "Jan Buček s.r.o."]))
      .toEqual([{ name: "Jan Buček", kind: "exact" }]);
  });

  it("accepts whitespace, case and Unicode composition differences as exact", () => {
    expect(match("  JAN   BUC\u030cEK  ", ["Jan Buček", "JAN BUČEK"]))
      .toEqual([{ name: "Jan Buček", kind: "exact" }]);
  });

  it("keeps accent variants separate and requires a choice without an exact spelling", () => {
    const result = match("Jan Bucek", ["Jan Buček", "Jan Bůček", "Jan Buček"]);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.kind)).toEqual(["normalized", "normalized"]);
    expect(new Set(result.map((item) => item.name))).toEqual(new Set(["Jan Buček", "Jan Bůček"]));
  });

  it.each([
    ["Buček Jan", "Jan Buček", "reordered"],
    ["Nováková Svobodová Anna", "Anna Nováková Svobodová", "reordered"],
    ["Ing. Jan Buček, Ph.D.", "Jan Buček", "normalized"],
    ["Jan Bucekk", "Jan Buček", "similar"],
    ["Jan Buečk", "Jan Buček", "similar"],
    ["Buč Jan", "Jan Buček", "prefix"],
    ["Buč", "Jan Buček", "prefix"],
  ])("classifies %s against %s as %s", (query, name, kind) => {
    expect(match(query, [name])).toEqual([{ name, kind }]);
  });

  it.each([
    ["Jan Jan", "Jan Novák"],
    ["Jan Buček", "Ivan Buček"],
    ["Jan Buček", "Jan Dušan Bučkovský"],
    ["Jan Buček", "Jan Buček s.r.o."],
    ["Jan Buček", "Jana Bůčková"],
    ["an Buček", "Jan Buček"],
    ["Praha Servis s.r.o.", "Servis Praha s.r.o."],
    ["a", "Jan Buček"],
    ["Ing.", "Jan Buček"],
  ])("does not suggest %s as %s", (query, name) => {
    expect(match(query, [name])).toEqual([]);
  });

  it("prioritizes full normalized/reordered names over partial names and typos", () => {
    expect(match("Bucek Jan", ["Jan Buček", "Jan Bucek s.r.o.", "Jan Bučka", "Jan Buček Petr"]))
      .toEqual([{ name: "Jan Buček", kind: "reordered" }]);
  });

  it("finds companies and non-Latin names without turning them into person-name matches", () => {
    expect(match("ABC SERVIS s.r.o.", ["ABC Servis s.r.o."])[0].kind).toBe("exact");
    expect(match("ABC", ["ABC Servis s.r.o."])[0].kind).toBe("prefix");
    expect(match("李 明", ["李 明"])[0].kind).toBe("exact");
  });
});
