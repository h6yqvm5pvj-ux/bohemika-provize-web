import { describe, expect, it } from "vitest";
import { canAccessPreparationSection } from "./preparationSections";

describe("section availability", () => {
  it.each(["advisor@example.com", " OTHER@EXAMPLE.TEST ", "jindra.hajek@bohemika.eu"])(
    "opens clients for any signed-in account: %s", (email) => {
      expect(canAccessPreparationSection(email, "clients")).toBe(true);
    }
  );

  it.each(["", "   ", null, undefined])("requires an account to open clients: %s", (email) => {
    expect(canAccessPreparationSection(email, "clients")).toBe(false);
  });

  it("allows the selected Hajek account to open statements", () => {
    expect(canAccessPreparationSection("jindra.hajek@bohemika.eu", "statements")).toBe(true);
    expect(canAccessPreparationSection(" JINDRA.HAJEK@BOHEMIKA.EU ", "statements")).toBe(true);
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
