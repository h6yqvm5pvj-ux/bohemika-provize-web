import { describe, expect, it } from "vitest";
import { canAccessPreparationSection } from "./preparationSections";

describe("pilot section availability", () => {
  it("allows the selected Hajek account to open statements only", () => {
    expect(canAccessPreparationSection("jindra.hajek@bohemika.eu", "statements")).toBe(true);
    expect(canAccessPreparationSection(" JINDRA.HAJEK@BOHEMIKA.EU ", "statements")).toBe(true);
    expect(canAccessPreparationSection("jindra.hajek@bohemika.eu", "clients")).toBe(false);
  });

  it.each(["jindrich.hajek@bohemika.eu", "jindra.hajek@example.com", "jindra.hajek", "advisor@example.com", "", null, undefined])(
    "does not grant statements to another account: %s", (email) => {
      expect(canAccessPreparationSection(email, "statements")).toBe(false);
    }
  );

  it.each(["jakub.rauscher@bohemika.eu", "jakub.rauscher"])("preserves existing owner access: %s", (email) => {
    expect(canAccessPreparationSection(email, "clients")).toBe(true);
    expect(canAccessPreparationSection(email, "statements")).toBe(true);
  });
});
