import type { Product } from "@/app/types/domain";

export type InsuranceType = "life" | "nonLife";

export type TerminationReason =
  | "anniversary"
  | "twoMonths"
  | "agreement"
  | "periodEnd"
  | "postClaim"
  | "otherReason";

export type TerminationReasonOption = {
  id: TerminationReason;
  label: string;
};

export type UniversalLetterCalculator =
  | "annualAnniversary"
  | "monthlyAnniversary"
  | "twoMonths"
  | "postClaim";

export type UniversalLetterDefinition = {
  idSuffix: string;
  terminationSentence: string;
  refundAccountSentence?: string;
  requiresOtherReason?: boolean;
  calculator?: UniversalLetterCalculator;
};

export type UniversalTerminationLetterFieldKey =
  | "contractNumber"
  | "policyholderName"
  | "personalId"
  | "email"
  | "place"
  | "signedDate"
  | "refundAccount"
  | "otherReason";

export type MissingUniversalTerminationField = {
  key: UniversalTerminationLetterFieldKey;
  label: string;
};

const REQUIRED_UNIVERSAL_TERMINATION_FIELDS: readonly MissingUniversalTerminationField[] = [
  { key: "contractNumber", label: "číslo smlouvy" },
  { key: "policyholderName", label: "jméno pojistníka" },
  { key: "personalId", label: "RČ / IČ" },
  { key: "email", label: "e-mail" },
  { key: "place", label: "místo podpisu" },
  { key: "signedDate", label: "datum podpisu" },
];

export function getMissingUniversalTerminationFields(
  fields: Partial<Record<UniversalTerminationLetterFieldKey, string>>,
  requiresOtherReason = false,
): MissingUniversalTerminationField[] {
  const requiredFields = requiresOtherReason
    ? [
        ...REQUIRED_UNIVERSAL_TERMINATION_FIELDS,
        { key: "otherReason" as const, label: "jiný důvod výpovědi" },
      ]
    : REQUIRED_UNIVERSAL_TERMINATION_FIELDS;

  return requiredFields.filter(({ key }) => !fields[key]?.trim());
}

const terminationFilenameToken = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

export function buildUniversalTerminationPdfFilename(
  product: string,
  policyholderName: string,
): string {
  const productToken = terminationFilenameToken(product) || "produkt";
  const nameToken = terminationFilenameToken(policyholderName) || "klient";
  return `vypoved_${productToken}_${nameToken}.pdf`;
}

export function formatLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateForTerminationLetter(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} . ${month} . ${year}`;
}

export const UNIVERSAL_LIFE_TERMINATION_REASONS: readonly TerminationReasonOption[] = [
  {
    id: "anniversary",
    label: "K výročnímu dni s 6 týdenní výpovědní lhůtou",
  },
  {
    id: "twoMonths",
    label: "Do 2 měsíců od uzavření s 8 denní výpovědní lhůtou",
  },
];

export const UNIVERSAL_NON_LIFE_TERMINATION_REASONS: readonly TerminationReasonOption[] = [
  {
    id: "periodEnd",
    label: "Ke konci pojistného období",
  },
  {
    id: "twoMonths",
    label: "Do 2 měsíců od uzavření smlouvy",
  },
  {
    id: "postClaim",
    label: "Po pojistné události",
  },
  {
    id: "otherReason",
    label: "Vypovědět smlouvu z jiného důvodu",
  },
];

export const TRAVEL_TERMINATION_REASONS: readonly TerminationReasonOption[] = [
  {
    id: "twoMonths",
    label: "Do 2 měsíců od uzavření s 8 denní výpovědní lhůtou",
  },
];

const TERMINABLE_TRAVEL_PRODUCTS = new Set<Product>([
  "cppcestovko",
  "koopcestovko",
  "axacestovko",
]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTravelTerminationProduct(
  product: Product | null | undefined,
): boolean {
  return product ? TERMINABLE_TRAVEL_PRODUCTS.has(product) : false;
}

export function shouldShowContractTerminationAction({
  product,
  policyStartDay,
  today,
}: {
  product: Product | null | undefined;
  policyStartDay: string;
  today: string;
}): boolean {
  if (!isTravelTerminationProduct(product)) return true;
  if (!ISO_DAY_RE.test(policyStartDay) || !ISO_DAY_RE.test(today)) return false;
  return today < policyStartDay;
}

export const CPP_LIFE_TERMINATION_REASONS: readonly TerminationReasonOption[] = [
  ...UNIVERSAL_LIFE_TERMINATION_REASONS,
  {
    id: "agreement",
    label: "Dohodou (pouze ČPP)",
  },
];

export function getUniversalTerminationReasons(
  insuranceType: InsuranceType | null
): readonly TerminationReasonOption[] {
  if (insuranceType === "life") return UNIVERSAL_LIFE_TERMINATION_REASONS;
  if (insuranceType === "nonLife") {
    return UNIVERSAL_NON_LIFE_TERMINATION_REASONS;
  }
  return [];
}

export function getTerminationReasonsForSelection(
  insuranceType: InsuranceType | null,
  insurer: string | null,
  product?: Product | null,
): readonly TerminationReasonOption[] {
  if (!insuranceType || !insurer) return [];
  if (isTravelTerminationProduct(product)) {
    return insuranceType === "nonLife" ? TRAVEL_TERMINATION_REASONS : [];
  }
  const normalizedInsurer = insurer.trim().toLocaleLowerCase("cs-CZ");
  if (
    insuranceType === "life" &&
    (normalizedInsurer === "čpp" || normalizedInsurer === "cpp")
  ) {
    return CPP_LIFE_TERMINATION_REASONS;
  }
  return getUniversalTerminationReasons(insuranceType);
}

export function getUniversalLetterDefinition(
  reason: TerminationReason | null
): UniversalLetterDefinition | null {
  switch (reason) {
    case "anniversary":
      return {
        idSuffix: "anniversary",
        terminationSentence:
          "K nejbližšímu měsíčnímu výročí s 6 týdenní výpovědní lhůtou.",
        calculator: "monthlyAnniversary",
      };
    case "periodEnd":
      return {
        idSuffix: "period-end",
        terminationSentence:
          "Ke konci pojistného období s 6 týdenní výpovědní lhůtou.",
        calculator: "annualAnniversary",
      };
    case "twoMonths":
      return {
        idSuffix: "two-months",
        terminationSentence:
          "Do 2 měsíců od uzavření smlouvy s 8 denní výpovědní lhůtou.",
        refundAccountSentence:
          "Případný přeplatek na pojistném prosím zaslat na účet:",
        calculator: "twoMonths",
      };
    case "postClaim":
      return {
        idSuffix: "post-claim",
        terminationSentence:
          "Po pojistné události s 1 měsíční výpovědní lhůtou.",
        calculator: "postClaim",
      };
    case "otherReason":
      return {
        idSuffix: "other-reason",
        terminationSentence: "Z jiného důvodu:",
        requiresOtherReason: true,
      };
    default:
      return null;
  }
}

export function getUniversalLetterForSelection({
  insurer,
  insuranceType,
  reason,
}: {
  insurer: string | null;
  insuranceType: InsuranceType | null;
  reason: TerminationReason | null;
}): UniversalLetterDefinition | null {
  const normalizedInsurer = (insurer ?? "").trim().toLocaleLowerCase("cs");
  const isCpp = normalizedInsurer === "čpp" || normalizedInsurer === "cpp";
  if (!normalizedInsurer || (isCpp && insuranceType === "life")) {
    return null;
  }

  const reasonIsAvailable = getUniversalTerminationReasons(insuranceType).some(
    (item) => item.id === reason
  );
  if (!reasonIsAvailable) return null;

  return getUniversalLetterDefinition(reason);
}
