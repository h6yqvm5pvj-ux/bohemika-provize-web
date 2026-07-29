import { describe, expect, it, vi } from "vitest";

import {
  CONTRACT_NUMBER_CLAIMS_COLLECTION,
  CONTRACT_REFS_COLLECTION,
  collectOwnerEntryRefsByContractNumber,
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

  it("falls back to owner collection scan when contractNumber index is not ready", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const whereGet = vi.fn().mockRejectedValue({ code: 9 });
    const matchingRef = { path: "users/advisor@example.com/entries/match" };
    const excludedRef = { path: "users/advisor@example.com/entries/excluded" };
    const otherRef = { path: "users/advisor@example.com/entries/other" };
    const ownerEntriesRef = {
      where: vi.fn(() => ({ get: whereGet })),
      get: vi.fn().mockResolvedValue({
        docs: [
          {
            ref: matchingRef,
            data: () => ({ contractNumber: "00123" }),
          },
          {
            ref: excludedRef,
            data: () => ({ contractNumber: "00123" }),
          },
          {
            ref: otherRef,
            data: () => ({ contractNumber: "999" }),
          },
        ],
      }),
    } as unknown as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;

    try {
      const refs = await collectOwnerEntryRefsByContractNumber({
        ownerEntriesRef,
        contractNumber: "001 23",
        excludeEntryPath: excludedRef.path,
      });

      expect(refs.map((ref) => ref.path)).toEqual([matchingRef.path]);
      expect(ownerEntriesRef.where).toHaveBeenCalled();
      expect(ownerEntriesRef.get).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
