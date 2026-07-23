import { describe, expect, it } from "vitest";

import {
  CONTRACT_NUMBER_CLAIMS_COLLECTION,
  CONTRACT_REFS_COLLECTION,
  contractRefDocId,
  contractRefFromData,
  entryRefPath,
  isFirestoreFailedPrecondition,
} from "./contractsApi.duplicates";

describe("contracts duplicate Firestore helpers", () => {
  it("keeps collection names stable", () => {
    expect(CONTRACT_REFS_COLLECTION).toBe("contractRefs");
    expect(CONTRACT_NUMBER_CLAIMS_COLLECTION).toBe("contractNumberClaims");
  });

  it("builds stable contract ref document IDs and entry paths", () => {
    expect(contractRefDocId(" Advisor@Example.COM ", " entry-1 ")).toBe(
      "advisor@example.com___entry-1"
    );
    expect(entryRefPath(" Advisor@Example.COM ", " entry-1 ")).toBe(
      "users/advisor@example.com/entries/entry-1"
    );
  });

  it("normalizes contract ref payloads", () => {
    const payload = contractRefFromData({
      ownerEmail: " Advisor@Example.COM ",
      entryId: " entry-1 ",
      contractNumber: " 001 23 / AB ",
      productKey: "neon",
    });

    expect(payload).toMatchObject({
      ownerEmail: "advisor@example.com",
      entryId: "entry-1",
      entryPath: "users/advisor@example.com/entries/entry-1",
      contractNumberRaw: "001 23 / AB",
      contractNumberNormalized: "00123/AB",
      contractNumberLoose: "123/AB",
      productKey: "neon",
    });
    expect(payload?.updatedAt).toBeInstanceOf(Date);
  });

  it("skips incomplete contract ref payloads", () => {
    expect(
      contractRefFromData({
        ownerEmail: "",
        entryId: "entry-1",
        contractNumber: "123",
        productKey: "neon",
      })
    ).toBeNull();
    expect(
      contractRefFromData({
        ownerEmail: "advisor@example.com",
        entryId: "",
        contractNumber: "123",
        productKey: "neon",
      })
    ).toBeNull();
    expect(
      contractRefFromData({
        ownerEmail: "advisor@example.com",
        entryId: "entry-1",
        contractNumber: "",
        productKey: "neon",
      })
    ).toBeNull();
  });

  it("recognizes Firestore missing-index precondition errors", () => {
    expect(isFirestoreFailedPrecondition({ code: 9 })).toBe(true);
    expect(
      isFirestoreFailedPrecondition({
        message: "FAILED_PRECONDITION: missing index",
      })
    ).toBe(true);
    expect(isFirestoreFailedPrecondition({ code: 6 })).toBe(false);
    expect(isFirestoreFailedPrecondition(new Error("already exists"))).toBe(false);
  });
});
