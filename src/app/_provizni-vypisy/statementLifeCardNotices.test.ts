import { describe, expect, it } from "vitest";

import { lifePremiumBaseNoticeKind } from "./statementLifeCardNotices";

describe("lifePremiumBaseNoticeKind", () => {
  it("does not show a premium-base notice without a mismatch", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: false,
        isRefreshMissingOriginal: true,
        hasPremiumIncrease: false,
        hasEndorsement: true,
      })
    ).toBeNull();
  });

  it("shows the REFRESH explanation for a missing original contract", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: true,
        hasPremiumIncrease: false,
        hasEndorsement: false,
      })
    ).toBe("refresh-missing-original");
  });

  it("shows a regular mismatch when there is no special explanation", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: false,
        hasEndorsement: false,
      })
    ).toBe("mismatch");
  });

  it("prefers the endorsement explanation even for a premium increase", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: true,
        hasEndorsement: true,
      })
    ).toBe("endorsement");
  });

  it("does not duplicate a premium-increase explanation without an endorsement", () => {
    expect(
      lifePremiumBaseNoticeKind({
        hasPremiumMismatch: true,
        isRefreshMissingOriginal: false,
        hasPremiumIncrease: true,
        hasEndorsement: false,
      })
    ).toBeNull();
  });
});
