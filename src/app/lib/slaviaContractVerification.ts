export type SlaviaPolicyholderIdentity = {
  personalId: string;
  personalIdType: "birthNumber" | "companyId";
};

/** Format a Slavia policyholder ID for its contract verification portal. */
export function formatSlaviaVerificationIdentity(
  identity: SlaviaPolicyholderIdentity | null | undefined,
): { label: "Datum narození" | "IČO"; value: string } | null {
  if (!identity || typeof identity.personalId !== "string") return null;
  if (identity.personalIdType === "companyId") {
    const companyId = identity.personalId.replace(/\s+/g, "");
    return /^\d{8}$/.test(companyId) ? { label: "IČO", value: companyId } : null;
  }
  if (identity.personalIdType !== "birthNumber") return null;
  const match = identity.personalId.replace(/\s+/g, "").match(/^(\d{2})(\d{2})(\d{2})\/?\d{3,4}$/);
  if (!match) return null;
  const [, yearPart, encodedMonth, dayPart] = match;
  const encoded = Number(encodedMonth);
  const month = encoded > 70 ? encoded - 70 : encoded > 50 ? encoded - 50 : encoded > 20 ? encoded - 20 : encoded;
  const year = Number(yearPart) > 53 ? 1900 + Number(yearPart) : 2000 + Number(yearPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    label: "Datum narození",
    value: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`,
  };
}
