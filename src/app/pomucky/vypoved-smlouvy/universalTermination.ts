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

export function formatLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function getUniversalTerminationReasons(
  insuranceType: InsuranceType | null
): readonly TerminationReasonOption[] {
  if (insuranceType === "life") return UNIVERSAL_LIFE_TERMINATION_REASONS;
  if (insuranceType === "nonLife") {
    return UNIVERSAL_NON_LIFE_TERMINATION_REASONS;
  }
  return [];
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
  if (!normalizedInsurer || normalizedInsurer === "čpp" || normalizedInsurer === "cpp") {
    return null;
  }

  const reasonIsAvailable = getUniversalTerminationReasons(insuranceType).some(
    (item) => item.id === reason
  );
  if (!reasonIsAvailable) return null;

  return getUniversalLetterDefinition(reason);
}
