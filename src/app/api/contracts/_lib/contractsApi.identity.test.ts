import { describe, expect, it } from "vitest";

import {
  buildDuplicateLookupKey,
  buildIdempotentEntryId,
  contractNumberClaimDocId,
  createDuplicateContractError,
  createReplayComparableJson,
  idempotentReplayMatchesPayload,
  isoDayFromUnknown,
  normalizeClientNameForDuplicate,
  normalizeContractEntryType,
  normalizeContractNumber,
  normalizeContractNumberLoose,
  normalizeCreateReplayValue,
} from "./contractsApi.identity";

describe("contracts create identity helpers", () => {
  it("builds stable idempotent entry IDs from normalized owner email", () => {
    expect(buildIdempotentEntryId(" Advisor@Example.COM ", "key-1")).toBe(
      buildIdempotentEntryId("advisor@example.com", "key-1")
    );
    expect(buildIdempotentEntryId("advisor@example.com", "key-1")).toMatch(
      /^idem_[a-f0-9]{40}$/
    );
    expect(buildIdempotentEntryId("advisor@example.com", "key-1")).not.toBe(
      buildIdempotentEntryId("advisor@example.com", "key-2")
    );
  });

  it("normalizes replay values recursively", () => {
    const timestampLike = {
      toDate: () => new Date("2026-02-01T11:20:30.000Z"),
    };

    expect(
      normalizeCreateReplayValue({
        b: 1.123456789,
        a: undefined,
        nested: [timestampLike, Number.POSITIVE_INFINITY],
      })
    ).toEqual({
      a: null,
      b: 1.123457,
      nested: ["2026-02-01", null],
    });
  });

  it("compares idempotent replay payloads while ignoring server-computed fields", () => {
    const expected = {
      productKey: "neon",
      clientName: "Jan Novak",
      contractNumber: "ABC123",
      contractSignedDate: new Date("2026-01-10T00:00:00.000Z"),
      total: 12345,
      items: [{ title: "server item" }],
      allowedEmails: ["manager@example.com"],
    };
    const existing = {
      productKey: "neon",
      clientName: "Jan Novak",
      contractNumber: "ABC123",
      contractSignedDate: {
        toDate: () => new Date("2026-01-10T12:00:00.000Z"),
      },
      total: 999,
      items: [],
      allowedEmails: [],
    };

    expect(idempotentReplayMatchesPayload(existing, expected)).toBe(true);
    expect(createReplayComparableJson(existing, expected)).toBe(
      createReplayComparableJson(expected, expected)
    );
    expect(
      idempotentReplayMatchesPayload(
        { ...existing, contractNumber: "XYZ999" },
        expected
      )
    ).toBe(false);
  });

  it("normalizes contract numbers and claim document IDs", () => {
    expect(normalizeContractNumber(" 001 23 / ab ")).toBe("00123/ab");
    expect(normalizeContractNumberLoose(" 001 23 / ab ")).toBe("123/ab");
    expect(contractNumberClaimDocId(" CPP 12/34 ")).toBe("cpp12%2F34");
  });

  it("normalizes duplicate lookup inputs", () => {
    expect(normalizeContractEntryType(" Contract ")).toBe("contract");
    expect(normalizeContractEntryType("endorsement")).toBe("endorsement");
    expect(normalizeContractEntryType("other")).toBeNull();
    expect(normalizeClientNameForDuplicate(" Jan   Novak ")).toBe("jan novak");
    expect(isoDayFromUnknown(new Date("2026-01-10T23:00:00.000Z"))).toBe(
      "2026-01-10"
    );
  });

  it("builds duplicate lookup keys only for complete contracts", () => {
    expect(
      buildDuplicateLookupKey({
        entryType: "contract",
        productKey: "neon",
        clientName: " Jan   Novak ",
        contractSignedDate: "2026-01-10",
      })
    ).toBe("neon___jan novak___2026-01-10");

    expect(
      buildDuplicateLookupKey({
        entryType: "endorsement",
        productKey: "neon",
        clientName: "Jan Novak",
        contractSignedDate: "2026-01-10",
      })
    ).toBeNull();
    expect(
      buildDuplicateLookupKey({
        entryType: "contract",
        productKey: "neon",
        clientName: "",
        contractSignedDate: "2026-01-10",
      })
    ).toBeNull();
  });

  it("creates duplicate contract errors with status and optional path", () => {
    const err = createDuplicateContractError("users/a/entries/1");

    expect(err.message).toBe("Smlouva s tímto číslem už v systému existuje.");
    expect(err.statusCode).toBe(409);
    expect(err.duplicatePath).toBe("users/a/entries/1");

    expect(createDuplicateContractError(null).duplicatePath).toBeUndefined();
  });
});
