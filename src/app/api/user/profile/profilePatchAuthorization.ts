type ProfilePatchScopeInput = {
  isImpersonating: boolean;
  effectiveEmail: string;
  declaredTargetEmail: string;
  patchKeys: string[];
  hasPositionTimeline: boolean;
};

export const profilePatchScopeError = ({
  isImpersonating,
  effectiveEmail,
  declaredTargetEmail,
  patchKeys,
  hasPositionTimeline,
}: ProfilePatchScopeInput): string | null => {
  if (
    (isImpersonating && declaredTargetEmail !== effectiveEmail) ||
    (!isImpersonating && Boolean(declaredTargetEmail))
  ) {
    return "Cílový uživatel se neshoduje s ověřenou impersonací.";
  }

  if (
    isImpersonating &&
    (patchKeys.length !== 1 ||
      patchKeys[0] !== "positionTimeline" ||
      !hasPositionTimeline)
  ) {
    return "Při přepnutí za uživatele lze měnit pouze Historii kariéry.";
  }

  return null;
};
