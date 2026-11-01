import { birthDateFromCzechBirthNumber } from "./czechBirthNumber";
import type { KooperativaAutoPdfResult } from "./parseKooperativaAutoPdf";

export const KOOPERATIVA_CONTRACT_STATUS_URL =
  "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";

export type KooperativaStatusIdentity = {
  kind: "birthDate" | "companyId";
  label: "Datum narození" | "IČO";
  value: string;
};

function validBirthDate(value: string | null | undefined): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const today = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  if (Number(year) < 1800 || `${year}-${month}-${day}` > today || date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${day}.${month}.${year}`;
}

/** Return only the identity needed by the portal; never expose the raw RČ. */
export function resolveKooperativaStatusIdentity(
  parsed: Pick<KooperativaAutoPdfResult, "birthNumber" | "policyholderBirthDate" | "companyId" | "policyholderType">
): KooperativaStatusIdentity | null {
  const rawCompanyId = parsed.companyId?.trim() ?? "";
  const companyId = /^[\d\s]+$/.test(rawCompanyId) ? rawCompanyId.replace(/\s+/g, "") : "";
  if (parsed.birthNumber && !/^\d{6}\/?\d{3,4}$/.test(parsed.birthNumber.replace(/\s+/g, ""))) return null;
  const birthFromNumber = birthDateFromCzechBirthNumber(parsed.birthNumber);
  const birthDateIso = birthFromNumber ? birthFromNumber.split(".").reverse().join("-") : null;
  const birthDate = validBirthDate(birthDateIso);
  const directBirthDate = validBirthDate(parsed.policyholderBirthDate);
  // A conflicting date or an invalid supplied value must not silently choose
  // another field; the user can obtain the required identity from the PDF.
  if ((parsed.birthNumber && !birthDate) || (parsed.policyholderBirthDate && !directBirthDate) ||
    (birthDate && directBirthDate && birthDate !== directBirthDate)) return null;
  if (parsed.policyholderType === "legal_entity") {
    return /^\d{8}$/.test(companyId) ? { kind: "companyId", label: "IČO", value: companyId } : null;
  }
  const date = birthDate ?? directBirthDate;
  if (date) return { kind: "birthDate", label: "Datum narození", value: date };
  if (parsed.policyholderType === "natural_person") return null;
  return /^\d{8}$/.test(companyId) ? { kind: "companyId", label: "IČO", value: companyId } : null;
}
