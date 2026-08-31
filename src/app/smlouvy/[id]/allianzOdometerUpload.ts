import { birthDateFromCzechBirthNumber } from "@/app/lib/parseKooperativaAutoPdf";

export type AllianzOdometerIdentity = {
  kind: "birthDate" | "companyId";
  label: "Datum narození" | "IČO";
  value: string;
};

export function resolveAllianzOdometerIdentity(
  personalId: string | null | undefined,
): AllianzOdometerIdentity | null {
  const normalized = String(personalId ?? "").replace(/\s+/g, "").trim();
  if (!normalized) return null;

  if (/^\d{8}$/.test(normalized)) {
    return {
      kind: "companyId",
      label: "IČO",
      value: normalized,
    };
  }

  const birthDate = birthDateFromCzechBirthNumber(normalized);
  if (!birthDate) return null;

  return {
    kind: "birthDate",
    label: "Datum narození",
    value: birthDate,
  };
}
