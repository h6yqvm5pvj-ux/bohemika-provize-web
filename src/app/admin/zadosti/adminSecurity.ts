import {
  formatAccountTypeLabel,
  formatPositionLabel,
  nameFromEmail,
} from "./adminFormatters";

export type AdminSecurityFactorRow = {
  uid: string;
  factorId: string;
  displayName: string | null;
  enrollmentTime: string | null;
  phoneNumber: string | null;
};

export type AdminSecurityUserRow = {
  uid: string;
  email: string;
  fullName: string | null;
  position: string | null;
  accountType: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastRefreshAt: string | null;
  mfa: {
    enabled: boolean;
    factorCount: number;
    hasTotp: boolean;
    hasPhone: boolean;
    factors: AdminSecurityFactorRow[];
  };
};

export type AdminSecurityResponse = {
  ok?: boolean;
  users?: AdminSecurityUserRow[];
  summary?: {
    total?: number;
    enabled?: number;
    disabled?: number;
    emailVerified?: number;
  };
};

export type AdminSecurityFilter = "all" | "enabled" | "disabled";

export const ADMIN_SECURITY_FILTERS: Array<{
  id: AdminSecurityFilter;
  label: string;
}> = [
  { id: "all", label: "Všichni" },
  { id: "enabled", label: "2FA aktivní" },
  { id: "disabled", label: "Bez 2FA" },
];

export const getMfaFactorLabel = (factor: AdminSecurityFactorRow): string => {
  if (factor.factorId === "totp") return "TOTP";
  if (factor.factorId === "phone") return "SMS";
  return factor.displayName || factor.factorId.toUpperCase();
};

export const filterAdminSecurityRows = (
  rows: AdminSecurityUserRow[],
  filter: AdminSecurityFilter,
  search: string
): AdminSecurityUserRow[] => {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (filter === "enabled" && !row.mfa.enabled) return false;
    if (filter === "disabled" && row.mfa.enabled) return false;
    if (!query) return true;

    const name = (row.fullName || nameFromEmail(row.email)).toLowerCase();
    const email = row.email.toLowerCase();
    const position = (row.position || "").toLowerCase();
    const positionLabel = formatPositionLabel(row.position).toLowerCase();
    const accountTypeLabel = formatAccountTypeLabel(row.accountType).toLowerCase();

    return (
      name.includes(query) ||
      email.includes(query) ||
      position.includes(query) ||
      positionLabel.includes(query) ||
      accountTypeLabel.includes(query)
    );
  });
};

export const summarizeAdminSecurityRows = (rows: AdminSecurityUserRow[]) => {
  const total = rows.length;
  const mfaEnabled = rows.filter((row) => row.mfa.enabled).length;
  const mfaMissing = total - mfaEnabled;
  const emailVerified = rows.filter((row) => row.emailVerified).length;

  return { total, mfaEnabled, mfaMissing, emailVerified };
};
