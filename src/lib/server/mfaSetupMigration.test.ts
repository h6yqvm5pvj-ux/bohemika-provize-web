import { describe, expect, it } from "vitest";
import { mfaSetupMigrationAction } from "../../../scripts/mfa-setup-policy.mjs";
const user = { disabled: true, emailVerified: true, multiFactor: { enrolledFactors: [] as { factorId: string; uid: string }[] } };
describe("migration from disabled accounts to mandatory setup", () => {
  it("enables historical missing-TOTP accounts for setup only", () => {
    expect(mfaSetupMigrationAction(user, { reason: "missing-totp" })).toBe("setup");
  });
  it.each([undefined, { reason: "admin-block" }, { reason: "admin-access-change" }, { revocation: {} }])("never changes an independent block: %j", block => {
    expect(mfaSetupMigrationAction(user, block)).toBe("skip");
  });
  it("preserves concurrent revocations and is idempotent", () => {
    expect(mfaSetupMigrationAction(user, { reason: "missing-totp", revocation: { pendingOperations: { operation: true } } })).toBe("pending");
    expect(mfaSetupMigrationAction({ ...user, disabled: false }, { reason: "missing-totp", setupPolicyVersion: 2 })).toBe("skip");
  });
  it("removes retired recovery approval even on a migrated account", () => {
    expect(mfaSetupMigrationAction({ ...user, disabled: false }, { reason: "missing-totp", setupPolicyVersion: 2, mfaRecoveryApproval: {} })).toBe("setup");
  });
  it("completes a pending enrolled account only with proof for the same factor", () => {
    const enrolled = { ...user, multiFactor: { enrolledFactors: [{ factorId: "totp", uid: "factor" }] } };
    const block = { reason: "missing-totp", mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: "factor" };
    expect(mfaSetupMigrationAction(enrolled, block)).toBe("requires-reset");
    expect(mfaSetupMigrationAction(enrolled, block, { approvalMethod: "administrator-recovery", state: "used", factorUid: "factor" })).toBe("requires-reset");
    expect(mfaSetupMigrationAction(enrolled, block, { approvalMethod: "email", state: "used", factorUid: "factor" })).toBe("complete");
    expect(mfaSetupMigrationAction(enrolled, block, { approvalMethod: "email", state: "used", factorUid: "other" })).toBe("requires-reset");
  });
});
