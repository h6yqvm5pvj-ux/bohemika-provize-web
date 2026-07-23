import { describe, expect, it } from "vitest";

import {
  DOMEX_DETAIL_ALLOWED_KEYS,
  normalizeCreateEntryPayload,
  sanitizeDetailObject,
} from "./contractsApi.createPayload";

const ownerEmail = "advisor@example.com";
const ownerUid = "uid-123";

const baseEntry = (overrides: Record<string, unknown> = {}) => ({
  productKey: "neon",
  entryType: "contract",
  frequencyRaw: "monthly",
  clientName: " Jan Novak ",
  contractNumber: " ABC123 ",
  contractSignedDate: "2026-01-10",
  policyStartDate: "2026-02-01",
  inputAmount: 1_000,
  neonDetail: {
    deathType: " fixed ",
    deathAmount: 500_000,
  },
  ...overrides,
});

const normalizedPayload = (raw: unknown = baseEntry()) => {
  const result = normalizeCreateEntryPayload({
    raw,
    ownerEmail,
    ownerUid,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.payload;
};

describe("contracts create payload parsing", () => {
  it("normalizes a minimal contract create payload", () => {
    const payload = normalizedPayload();

    expect(payload).toMatchObject({
      productKey: "neon",
      entryType: "contract",
      position: "poradce1",
      commissionMode: null,
      inputAmount: 1_000,
      effectiveInputAmount: 1_000,
      frequencyRaw: "monthly",
      clientName: "Jan Novak",
      contractNumber: "ABC123",
      userEmail: ownerEmail,
      userId: ownerUid,
      paid: false,
      allowedEmails: [ownerEmail],
      neonDetail: {
        deathType: "fixed",
        deathAmount: 500_000,
      },
      domexDetail: null,
      maxdomovDetail: null,
    });
    expect(payload.contractSignedDate.toISOString().slice(0, 10)).toBe(
      "2026-01-10"
    );
    expect(payload.policyStartDate.toISOString().slice(0, 10)).toBe(
      "2026-02-01"
    );
    expect(payload.createdAt).toBeInstanceOf(Date);
  });

  it("rejects unknown fields and invalid core values", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({ unexpected: true }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Nepovolená pole v entry: unexpected.",
    });

    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({ contractNumber: "x" }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Pole contractNumber má neplatný formát.",
    });
  });

  it("rejects inconsistent contract dates", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          contractSignedDate: "2026-02-02",
          policyStartDate: "2026-02-01",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Pole policyStartDate nemůže být dřív než contractSignedDate.",
    });

    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          policyStartDate: "2026-02-01",
          policyEndDate: "2026-01-31",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Pole policyEndDate nemůže být dřív než policyStartDate.",
    });
  });

  it("normalizes TIP metadata and validates TIP percent rules", () => {
    const payload = normalizedPayload(
      baseEntry({
        tipContractTipsterEmail: " TIPSTER@EXAMPLE.COM ",
        tipContractTipsterPercent: 25,
        tipContractSourceTipId: " tip-123 ",
        tipContractSourceTipTitle: " Super tip ",
        tipContractSourceTipCreatedAtMs: 123.6,
      })
    );

    expect(payload).toMatchObject({
      tipContractTipsterEmail: "tipster@example.com",
      tipContractTipsterPercent: 25,
      tipContractSourceTipId: "tip-123",
      tipContractSourceTipTitle: "Super tip",
      tipContractSourceTipCreatedAtMs: 124,
    });

    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          tipContractTipsterEmail: "tipster@example.com",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error:
        "Pole tipContractTipsterPercent je povinné, pokud je vyplněné tipContractTipsterEmail.",
    });

    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          tipContractTipsterEmail: "tipster@example.com",
          tipContractTipsterPercent: 22,
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Pole tipContractTipsterPercent musí být násobek 5.",
    });
  });

  it("rejects TIP contracts where tipster is the same as owner", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          tipContractTipsterEmail: ownerEmail,
          tipContractTipsterPercent: 25,
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Tipař nemůže být stejný uživatel jako sjednatel.",
    });
  });

  it("validates refresh and replacement contracts", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          productKey: "flexi",
          isRefresh: true,
          refreshOriginalContractNumber: "OLD123",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error:
        "Refresh/Náhrada je podporovaná jen pro produkty ČPP ŽP NEON, DOMEX a ČPP Auto.",
    });

    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          isRefresh: true,
          refreshOriginalContractNumber: "ABC123",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Číslo původní smlouvy musí být jiné než číslo nové smlouvy.",
    });

    const missingOriginalPayload = normalizedPayload(
      baseEntry({
        isRefresh: true,
        refreshOriginalMissingInSystem: true,
      })
    );

    expect(missingOriginalPayload).toMatchObject({
      refreshOriginalContractNumber: null,
      refreshOriginalMissingInSystem: true,
      requiresStatementRefresh: true,
      commissionCalculationStatus: "provisional_refresh_missing_original",
      commissionBaseSource: "calculator_provisional",
    });
  });

  it("requires duration for MAXIMA Cizinci and defaults its variant", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({ productKey: "maxcizinkomplex" }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Pro produkt MAXIMA Cizinci je povinné pole durationMonths.",
    });

    const payload = normalizedPayload(
      baseEntry({
        productKey: "maxcizinkomplex",
        durationMonths: 12,
        maxCizinKomplexVariant: null,
      })
    );

    expect(payload.durationMonths).toBe(12);
    expect(payload.maxCizinKomplexVariant).toBe("exclusiveStandard");
  });

  it("normalizes endorsement payload fields", () => {
    expect(
      normalizeCreateEntryPayload({
        raw: baseEntry({
          entryType: "endorsement",
          rootContractEntryId: "root-1",
        }),
        ownerEmail,
        ownerUid,
      })
    ).toEqual({
      ok: false,
      error: "Dodatek musí obsahovat rootContractEntryId i parentContractEntryId.",
    });

    const payload = normalizedPayload(
      baseEntry({
        entryType: "endorsement",
        rootContractEntryId: " root-1 ",
        parentContractEntryId: " parent-1 ",
        parentContractEntryPath: " users/a/entries/parent-1 ",
        previousInputAmount: 1_000,
        newInputAmount: 1_200,
        premiumDelta: 200,
        premiumIncreaseAmount: 200,
        changeType: "increase",
      })
    );

    expect(payload).toMatchObject({
      entryType: "endorsement",
      rootContractEntryId: "root-1",
      parentContractEntryId: "parent-1",
      parentContractEntryPath: "users/a/entries/parent-1",
      previousInputAmount: 1_000,
      newInputAmount: 1_200,
      premiumDelta: 200,
      premiumIncreaseAmount: 200,
      premiumDecreaseAmount: null,
      changeType: "increase",
    });
  });

  it("sanitizes shared detail objects for create and update paths", () => {
    expect(
      sanitizeDetailObject(
        {
          address: "  Praha ",
          note: "",
          assistancePlus: true,
        },
        "domexDetail",
        DOMEX_DETAIL_ALLOWED_KEYS
      )
    ).toEqual({
      ok: true,
      value: {
        address: "Praha",
        note: null,
        assistancePlus: true,
      },
    });

    expect(
      sanitizeDetailObject({ unknown: "x" }, "domexDetail", DOMEX_DETAIL_ALLOWED_KEYS)
    ).toEqual({
      ok: false,
      error: "Pole domexDetail.unknown není povolené.",
    });
  });
});
