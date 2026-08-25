import { describe, expect, it } from "vitest";

import { profilePatchScopeError } from "./profilePatchAuthorization";

describe("profilePatchScopeError", () => {
  it("allows an impersonated career patch only for the verified target", () => {
    expect(
      profilePatchScopeError({
        isImpersonating: true,
        effectiveEmail: "petra.janackova@bohemika.eu",
        declaredTargetEmail: "petra.janackova@bohemika.eu",
        patchKeys: ["positionTimeline"],
        hasPositionTimeline: true,
      })
    ).toBeNull();
  });

  it("rejects a missing or different target during impersonation", () => {
    for (const declaredTargetEmail of ["", "jakub.rauscher@bohemika.eu"]) {
      expect(
        profilePatchScopeError({
          isImpersonating: true,
          effectiveEmail: "petra.janackova@bohemika.eu",
          declaredTargetEmail,
          patchKeys: ["positionTimeline"],
          hasPositionTimeline: true,
        })
      ).toBe("Cílový uživatel se neshoduje s ověřenou impersonací.");
    }
  });

  it("rejects a declared target without a verified impersonation", () => {
    expect(
      profilePatchScopeError({
        isImpersonating: false,
        effectiveEmail: "jakub.rauscher@bohemika.eu",
        declaredTargetEmail: "petra.janackova@bohemika.eu",
        patchKeys: ["positionTimeline"],
        hasPositionTimeline: true,
      })
    ).toBe("Cílový uživatel se neshoduje s ověřenou impersonací.");
  });

  it("allows ordinary profile settings for the verified target", () => {
    expect(
      profilePatchScopeError({
        isImpersonating: true,
        effectiveEmail: "petra.janackova@bohemika.eu",
        declaredTargetEmail: "petra.janackova@bohemika.eu",
        patchKeys: ["positionTimeline", "commissionMode"],
        hasPositionTimeline: true,
      })
    ).toBeNull();
  });

  it("keeps security and account lifecycle fields on the real account", () => {
    for (const key of ["mfaLastVerifiedPing", "lastActivePing", "accountSetupCompletedAt"]) {
      expect(
        profilePatchScopeError({
          isImpersonating: true,
          effectiveEmail: "petra.janackova@bohemika.eu",
          declaredTargetEmail: "petra.janackova@bohemika.eu",
          patchKeys: [key],
          hasPositionTimeline: false,
        })
      ).toBe("Toto nastavení účtu nelze měnit v administrátorském zastoupení.");
    }
  });
});
