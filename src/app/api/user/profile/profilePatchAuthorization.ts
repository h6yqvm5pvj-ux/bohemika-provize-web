type ProfilePatchScopeInput = {
  isImpersonating: boolean;
  effectiveEmail: string;
  declaredTargetEmail: string;
  patchKeys: string[];
  hasPositionTimeline: boolean;
};

const IMPERSONATED_PROFILE_PATCH_KEYS = new Set([
  "fullName",
  "commissionMode",
  "agencyNumber",
  "ico",
  "phoneNumber",
  "monthlyGoal",
  "notifyMinutes",
  "backgroundColor",
  "fontTheme",
  "reduceMotion",
  "tipsterCollaborationMode",
  "tipsterCommissionPercent",
  "notificationSettings",
  "positionTimeline",
  "homeLayout",
  "homeWidgets",
  "homePerformanceMode",
  "homeQuickActions",
  "tvorbaFooterProfile",
  "onlineCard",
]);

export const profilePatchScopeError = (
  input: ProfilePatchScopeInput
): string | null => {
  const { isImpersonating, effectiveEmail, declaredTargetEmail } = input;
  if (
    (isImpersonating && declaredTargetEmail !== effectiveEmail) ||
    (!isImpersonating && Boolean(declaredTargetEmail))
  ) {
    return "Cílový uživatel se neshoduje s ověřenou impersonací.";
  }

  if (
    isImpersonating &&
    input.patchKeys.some((key) => !IMPERSONATED_PROFILE_PATCH_KEYS.has(key))
  ) {
    return "Toto nastavení účtu nelze měnit v administrátorském zastoupení.";
  }

  return null;
};
