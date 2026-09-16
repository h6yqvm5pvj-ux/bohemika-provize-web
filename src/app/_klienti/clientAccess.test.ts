import { describe, expect, it } from "vitest";
import { clientCardHrefForName, contractReturnHrefFromClientCard } from "./clientAccess";

describe("contract to client card navigation", () => {
  it("keeps ordinary client links free of contract context", () => {
    expect(clientCardHrefForName("Jaroslav Lubina")).toBe("/klienti/c-6a61726f736c6176206c7562696e61");
    expect(clientCardHrefForName(null)).toBeNull();
    expect(contractReturnHrefFromClientCard(new URLSearchParams("scope=team"))).toBeNull();
  });

  it.each([false, true])("returns to the exact contract, preserving list context: %s", (fromList) => {
    const ownerEmail = "adviser+team@example.test";
    const entryId = "contract-2026 č. 1";
    const href = clientCardHrefForName("Jaroslav Lubina", { ownerEmail, entryId, fromList })!;
    const query = new URL(href, "https://example.test").searchParams;
    const expected = `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}${fromList ? "?from=list" : ""}`;
    expect(contractReturnHrefFromClientCard(query)).toBe(expected);
    expect(href).not.toContain("embedded");
    expect(contractReturnHrefFromClientCard(query)).not.toContain("embedded");
  });

  it("uses the originating contract when a client has several contracts", () => {
    const origin = { ownerEmail: "owner@example.test", entryId: "second-contract" };
    const href = clientCardHrefForName("Jaroslav Lubina", origin)!;
    expect(contractReturnHrefFromClientCard(new URL(href, "https://example.test").searchParams))
      .toBe("/smlouvy/owner%40example.test___second-contract");
  });

  it("does not generate a return link without a complete contract identifier", () => {
    expect(clientCardHrefForName("Jaroslav Lubina", { ownerEmail: null, entryId: "contract" }))
      .toBe("/klienti/c-6a61726f736c6176206c7562696e61");
  });

  it.each(["", "not-a-contract", "owner___", "___contract", "owner___contract___extra", "https://example.test/owner___contract", "//example.test/owner___contract", "owner___../contract", "owner___\\contract", "owner___contract\n"])("ignores malformed return context: %j", (fromContract) => {
    expect(contractReturnHrefFromClientCard(new URLSearchParams({ fromContract }))).toBeNull();
  });
});
