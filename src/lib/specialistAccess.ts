const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const isSpecialistProfile = (
  profile: Record<string, unknown> | null | undefined
): boolean => {
  if (!profile) return false;
  if (profile.specialist === true || profile.documentsSpecialist === true) return true;

  const role = normalizeText(profile.role || profile.appRole || profile.userRole).toLowerCase();
  if (role === "specialist" || role === "specialista") return true;

  const roles = profile.roles;
  if (Array.isArray(roles)) {
    return roles.some((item) => {
      const normalized = normalizeText(item).toLowerCase();
      return normalized === "specialist" || normalized === "specialista";
    });
  }

  if (roles && typeof roles === "object") {
    const row = roles as Record<string, unknown>;
    return row.specialist === true || row.documentsSpecialist === true;
  }

  return false;
};
