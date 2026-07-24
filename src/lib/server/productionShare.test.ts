import { describe, expect, it } from "vitest";

import {
  clampText,
  isPlainObject,
  isValidEmail,
  nameFromEmail,
  normalizeEmail,
  parseNonNegativeInt,
  parseNonNegativeNumber,
  pickDisplayName,
} from "./productionShare";

describe("production share helpers", () => {
  it("normalizes and validates recipient emails", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("derives display names from profile fields or email local parts", () => {
    expect(pickDisplayName({ fullName: "  Jana Novakova " }, "jana@example.com")).toBe(
      "Jana Novakova"
    );
    expect(pickDisplayName({ name: "Petr" }, "petr@example.com")).toBe("Petr");
    expect(nameFromEmail("jan.novak@example.com")).toBe("Jan Novak");
  });

  it("clamps text and parses non-negative numbers consistently", () => {
    expect(clampText("  abcdef ", 3)).toBe("abc");
    expect(parseNonNegativeInt("12,9")).toBe(12);
    expect(parseNonNegativeInt(-2)).toBe(0);
    expect(parseNonNegativeNumber("42,5")).toBe(42.5);
    expect(parseNonNegativeNumber(Number.NaN)).toBe(0);
  });

  it("accepts only plain objects for snapshot parsing inputs", () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
  });
});
