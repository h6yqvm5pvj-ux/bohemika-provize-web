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
} as const satisfies Record<string, AdminRole>;

export const ADMIN_PANEL_EMAILS = Object.keys(FALLBACK_ADMIN_ROLES);

export const ADMIN_PANEL_EMAILS_LABEL = ADMIN_PANEL_EMAILS.join(", ");

const ADMIN_ROLE_DENYLIST = new Set(["vojtech.mahr@bohemika.eu"]);

export type AccountManagementRole = "accountCreator";

export const ACCOUNT_CREATOR_EMAILS = [
  "vojtech.mahr@bohemika.eu",
  "petra.lukesova@bohemika.eu",
] as const;

export const ACCOUNT_CREATOR_EMAILS_LABEL = ACCOUNT_CREATOR_EMAILS.join(", ");

export const normalizeAdminRole = (value: unknown): AdminRole | null => {
  if (value === "owner" || value === "admin" || value === "support") return value;
  return null;
};

export const getFallbackAdminRole = (
  value: string | null | undefined
): AdminRole | null => {
  const email = normalizeEmail(value);
  if (ADMIN_ROLE_DENYLIST.has(email)) return null;
  return FALLBACK_ADMIN_ROLES[email as keyof typeof FALLBACK_ADMIN_ROLES] ?? null;
};

export const isAccountCreatorEmail = (value: string | null | undefined): boolean =>
  ACCOUNT_CREATOR_EMAILS.includes(
    normalizeEmail(value) as (typeof ACCOUNT_CREATOR_EMAILS)[number]
  );

export const normalizeAccountManagementRole = (
  value: unknown
): AccountManagementRole | null =>
  value === "accountCreator" ? value : null;

export const resolveAdminRoleFromClaims = (
  email: string | null | undefined,
  claims: Record<string, unknown> | null | undefined
): AdminRole | null => {
  const normalizedEmail = normalizeEmail(email);
  if (ADMIN_ROLE_DENYLIST.has(normalizedEmail)) return null;
  if (claims?.admin === true) {
    // Missing roles are legacy admin claims. An explicit unknown role must not
    // silently gain full administrator access; Firestore enforces the same rule.
    return Object.prototype.hasOwnProperty.call(claims, "adminRole")
      ? normalizeAdminRole(claims.adminRole)
      : "admin";
  }
  return getFallbackAdminRole(normalizedEmail);
};

export const canCreateUserAccounts = (
  email: string | null | undefined,
  claims: Record<string, unknown> | null | undefined
): boolean =>
  isAccountCreatorEmail(email) ||
  claims?.canCreateUsers === true ||
  claims?.accountCreator === true ||
  normalizeAccountManagementRole(claims?.accountManagementRole) === "accountCreator" ||
  adminRoleAtLeast(resolveAdminRoleFromClaims(email, claims), "admin");

export const adminRoleAtLeast = (
  role: AdminRole | null | undefined,
  minimumRole: AdminRole
): boolean =>
  Boolean(role && ADMIN_ROLE_ORDER[role] >= ADMIN_ROLE_ORDER[minimumRole]);

export const isAdminPanelEmail = (value: string | null | undefined): boolean =>
  getFallbackAdminRole(value) != null;
