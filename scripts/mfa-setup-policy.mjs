// Pure migration eligibility: explicit admin blocks are never setup candidates.
export function mfaSetupMigrationAction(user, block, enrollment) {
  if (block?.reason !== "missing-totp") return "skip";
  if (Object.keys(block.revocation?.pendingOperations ?? {}).length) return "pending";
  const factors = user.multiFactor?.enrolledFactors ?? [];
  if (!factors.length) {
    return !user.disabled && block.setupPolicyVersion === 2 && !block.mfaRecoveryApproval ? "skip" : "setup";
  }
  const hasTotp = factors.some(factor => factor.factorId === "totp");
  const confirmed = block.mfaEmailConfirmationRequired !== true ||
    (enrollment?.approvalMethod === "email" && enrollment?.state === "used" &&
      factors.some(factor => factor.factorId === "totp" && factor.uid === block.mfaEmailConfirmedFactorUid && factor.uid === enrollment.factorUid));
  return user.emailVerified && hasTotp && confirmed ? "complete" : "requires-reset";
}
