import type { AdminUsersRow, AdminUserSummary } from "./adminUsers";
export type AdminUsersMissingItem = { key: string; label: string };
const normalizeEmail = (value: string | null) => (value ?? "").trim().toLowerCase();
const hasUsableIco = (value: string | null) => (value ?? "").replace(/\D+/g, "").length === 8;
const hasUsablePhoneNumber = (value: string | null) => (value ?? "").replace(/\D+/g, "").length >= 6;
const hasUsablePositionTimeline = (value: AdminUsersRow["positionTimeline"]) => Array.isArray(value) && value.length > 0;

export const buildAdminUserMissingItems = (row: AdminUsersRow | AdminUserSummary): AdminUsersMissingItem[] => {
  if ("missingItems" in row) return row.missingItems;
  const accountType = (row.accountType ?? "").trim().toLowerCase();
  const missing: AdminUsersMissingItem[] = [];

  if (!row.profileExists) missing.push({ key: "profile", label: "Profil" });
  if (!(row.fullName ?? "").trim()) missing.push({ key: "fullName", label: "Jméno" });
  if (!accountType) missing.push({ key: "accountType", label: "Typ účtu" });

  if (accountType === "tipster") {
    if (!normalizeEmail(row.tipRecipientEmail)) {
      missing.push({ key: "tipRecipientEmail", label: "Příjemce tipů" });
    }
    return missing;
  }

  if (!normalizeEmail(row.managerEmail)) {
    missing.push({ key: "managerEmail", label: "Nadřízený" });
  }
  if (!(row.agencyNumber ?? "").trim()) {
    missing.push({ key: "agencyNumber", label: "Agenturní číslo" });
  }
  if (!hasUsableIco(row.ico)) missing.push({ key: "ico", label: "IČO" });
  if (!hasUsablePhoneNumber(row.phoneNumber)) {
    missing.push({ key: "phoneNumber", label: "Telefon" });
  }
  if (!hasUsablePositionTimeline(row.positionTimeline) && !(row.position ?? "").trim()) {
    missing.push({ key: "position", label: "Kariéra" });
  }
  if (!(row.commissionMode ?? "").trim()) {
    missing.push({ key: "commissionMode", label: "Provizní režim" });
  }

  return missing;
};
