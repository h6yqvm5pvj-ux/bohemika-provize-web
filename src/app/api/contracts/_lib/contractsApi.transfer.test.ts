import { describe, expect, it } from "vitest";

import {
  buildTransferredContractData,
  contractWasTransferred,
  normalizeTransferEffectiveDate,
  originalAdviserEmailForContract,
  pragueIsoDay,
  servicingOwnerEmailForContract,
} from "./contractsApi.transfer";

describe("contract ownership transfer", () => {
  it("keeps the original adviser and signing position across repeated transfers", () => {
    const firstTransferAt = new Date("2026-08-28T10:00:00.000Z");
    const first = buildTransferredContractData({
      contract: {
        userEmail: "puvodni@example.cz",
        position: "poradce4",
        commissionPayouts: [
          {
            key: "historical-a101",
            code: "A101",
            amount: 12_500,
            status: "paid",
            writtenBy: "puvodni@example.cz",
          },
        ],
        parentContractEntryPath:
          "users/puvodni@example.cz/entries/root-contract",
        refreshReplacedByOwnerEmail: "puvodni@example.cz",
      },
      fromOwnerEmail: "puvodni@example.cz",
      toOwnerEmail: "spravce@example.cz",
      toOwnerUserId: "new-user-id",
      actorEmail: "admin@example.cz",
      transferredAt: firstTransferAt,
      effectiveDate: "2026-09-01",
      fromOwnerName: "Původní Poradce",
      toOwnerName: "Nový Správce",
    });

    expect(first).toMatchObject({
      userEmail: "spravce@example.cz",
      originalAdviserEmail: "puvodni@example.cz",
      originalAdviserName: "Původní Poradce",
      originalPosition: "poradce4",
      position: "poradce4",
      servicingOwnerEmail: "spravce@example.cz",
      commissionOwnerEmail: "spravce@example.cz",
      userId: "new-user-id",
      parentContractEntryPath:
        "users/spravce@example.cz/entries/root-contract",
      refreshReplacedByOwnerEmail: "spravce@example.cz",
      transferEffectiveDate: "2026-09-01",
      commissionPayouts: [
        {
          key: "historical-a101",
          code: "A101",
          amount: 12_500,
          status: "paid",
          writtenBy: "puvodni@example.cz",
        },
      ],
    });

    const second = buildTransferredContractData({
      contract: first,
      fromOwnerEmail: "spravce@example.cz",
      toOwnerEmail: "dalsi@example.cz",
      toOwnerUserId: null,
      actorEmail: "admin@example.cz",
      transferredAt: new Date("2026-08-29T10:00:00.000Z"),
      effectiveDate: "2026-10-01",
      fromOwnerName: "Nový Správce",
      toOwnerName: "Další Správce",
    });

    expect(second.originalAdviserEmail).toBe("puvodni@example.cz");
    expect(second.originalAdviserName).toBe("Původní Poradce");
    expect(second.originalPosition).toBe("poradce4");
    expect(second.position).toBe("poradce4");
    expect(second).not.toHaveProperty("userId");
    expect(second.ownershipTransferHistory).toHaveLength(2);
    expect(second.ownershipTransferHistory).toMatchObject([
      { effectiveDate: "2026-09-01" },
      { effectiveDate: "2026-10-01" },
    ]);
  });

  it("resolves original and servicing adviser for old and transferred records", () => {
    expect(
      originalAdviserEmailForContract(
        { userEmail: "OWNER@EXAMPLE.CZ" },
        "fallback@example.cz"
      )
    ).toBe("owner@example.cz");
    expect(
      servicingOwnerEmailForContract(
        {
          userEmail: "old@example.cz",
          commissionOwnerEmail: "current@example.cz",
        },
        null
      )
    ).toBe("current@example.cz");
    expect(
      contractWasTransferred({
        originalAdviserEmail: "old@example.cz",
        servicingOwnerEmail: "current@example.cz",
        userEmail: "current@example.cz",
      })
    ).toBe(true);
  });

  it("validates the requested effective day and evaluates it in Prague time", () => {
    expect(normalizeTransferEffectiveDate("2028-02-29")).toBe("2028-02-29");
    expect(normalizeTransferEffectiveDate("2027-02-29")).toBeNull();
    expect(normalizeTransferEffectiveDate("29. 2. 2028")).toBeNull();
    expect(pragueIsoDay(new Date("2026-08-27T22:30:00.000Z"))).toBe(
      "2026-08-28"
    );
  });
});
