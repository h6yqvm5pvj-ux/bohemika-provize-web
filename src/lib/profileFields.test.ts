import { describe, expect, it } from "vitest";

import {
  formatProfilePhoneInput,
  isValidProfileIco,
  isValidProfilePhone,
} from "@/lib/profileFields";

describe("profile field helpers", () => {
  it("formats Czech phone numbers into readable groups", () => {
    expect(formatProfilePhoneInput("602127638")).toBe("602 127 638");
    expect(formatProfilePhoneInput("+420602127638")).toBe("+420 602 127 638");
  });

  it("keeps phone validation optional but rejects incomplete values", () => {
    expect(isValidProfilePhone("")).toBe(true);
    expect(isValidProfilePhone("602 127 638")).toBe(true);
    expect(isValidProfilePhone("12345")).toBe(false);
  });

  it("accepts only an empty or eight-digit IČO", () => {
    expect(isValidProfileIco("")).toBe(true);
    expect(isValidProfileIco("19238134")).toBe(true);
    expect(isValidProfileIco("1234")).toBe(false);
  });
});
