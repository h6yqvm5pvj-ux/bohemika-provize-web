import { describe, expect, it } from "vitest";
import { createEmptyClientCard, MAX_CLIENT_IDENTITY_DOCUMENTS, parseClientCardDraft } from "./clientCardData";

const card = createEmptyClientCard("Testovací klient");
const document = { id: "doc-1", type: "identity-card", validFrom: "2024-02-29", validTo: "2034-02-28", number: "TEST-123", issuedBy: "Test" };

describe("client card input validation", () => {
  it("reads older cards without an IČO and keeps leading zeros in a new IČO", () => {
    const legacy = { ...card } as Record<string, unknown>;
    delete legacy.companyId;
    expect(parseClientCardDraft(legacy)).toEqual(card);
    expect(parseClientCardDraft({ ...card, companyId: "00123456" })?.companyId).toBe("00123456");
  });
  it.each(["123", "123456789", "abcdefgh", 12345678, null])("rejects an invalid IČO: %s", companyId => {
    expect(parseClientCardDraft({ ...card, companyId })).toBeNull();
  });
  it("accepts complete data, trims text and preserves intentionally blank fields", () => {
    expect(parseClientCardDraft({ ...card, clientName: "  Testovací klient  ", identityDocuments: [document] }))
      .toEqual({ ...card, identityDocuments: [document] });
  });

  it.each([
    { birthDate: "2025-02-29" },
    { birthDate: "01.01.2000" },
    { clientName: " " },
    { email: "invalid" },
    { clientName: "x".repeat(201) },
    { phone: 123 },
    { phone: "test\u0000" },
    { ownerUid: "other-account" },
    { identityDocuments: [{ ...document, ownerUid: "other-account" }] },
    { identityDocuments: [{ ...document, constructor: "unexpected" }] },
    { identityDocuments: [{ ...document, validTo: "2030-13-01" }] },
    { identityDocuments: [{ ...document, type: "unknown" }] },
    { identityDocuments: [document, document] },
  ])("rejects invalid or unauthorized fields: %j", (fields) => {
    expect(parseClientCardDraft({ ...card, ...fields })).toBeNull();
  });

  it("enforces the maximum number of documents", () => {
    const documents = Array.from({ length: MAX_CLIENT_IDENTITY_DOCUMENTS }, (_, index) => ({ ...document, id: `doc-${index}` }));
    expect(parseClientCardDraft({ ...card, identityDocuments: documents })).not.toBeNull();
    expect(parseClientCardDraft({ ...card, identityDocuments: [...documents, { ...document, id: "extra" }] })).toBeNull();
  });
});
