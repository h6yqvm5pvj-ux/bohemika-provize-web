const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export type AdminRole = "owner" | "admin" | "support";

export const ADMIN_ROLE_ORDER: Record<AdminRole, number> = {
  support: 1,
  admin: 2,
  owner: 3,
};

export const FALLBACK_ADMIN_ROLES = {
  "jakub.rauscher@bohemika.eu": "owner",
  "vojtech.mahr@bohemika.eu": "admin",
} as const satisfies Record<string, AdminRole>;

export const ADMIN_PANEL_EMAILS = Object.keys(FALLBACK_ADMIN_ROLES);

export const ADMIN_PANEL_EMAILS_LABEL = ADMIN_PANEL_EMAILS.join(", ");

export const normalizeAdminRole = (value: unknown): AdminRole | null => {
  if (value === "owner" || value === "admin" || value === "support") return value;
  return null;
};

export const getFallbackAdminRole = (
  value: string | null | undefined
): AdminRole | null => {
  const email = normalizeEmail(value);
  return FALLBACK_ADMIN_ROLES[email as keyof typeof FALLBACK_ADMIN_ROLES] ?? null;
};

export const resolveAdminRoleFromClaims = (
  email: string | null | undefined,
  claims: Record<string, unknown> | null | undefined
): AdminRole | null => {
  if (claims?.admin === true) {
    return normalizeAdminRole(claims.adminRole) ?? "admin";
  }
  return getFallbackAdminRole(email);
};

export const adminRoleAtLeast = (
  role: AdminRole | null | undefined,
  minimumRole: AdminRole
): boolean =>
  Boolean(role && ADMIN_ROLE_ORDER[role] >= ADMIN_ROLE_ORDER[minimumRole]);

export const isAdminPanelEmail = (value: string | null | undefined): boolean =>
  getFallbackAdminRole(value) != null;
