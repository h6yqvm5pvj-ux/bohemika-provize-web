/** New Czech disability pension awards in 2026; not valorisation of existing pensions.
 * Sources checked 2026-09-17; see methodology.md next to this file.
 * All rates use integer fractions so ceiling never adds a spurious crown.
 */
export const PENSION_2026 = {
  year: 2026,
  basicAmount: 4_900,
  firstThreshold: 21_546,
  secondThreshold: 195_868,
  averageWage: 48_967,
  annualRateNumerator: 1_495,
  annualRateDenominator: 100_000,
} as const;

export type MinimumMode = "ordinary" | "insured15" | "under28";
export type IncomeMode = "gross" | "assessment";
export type PensionInput = {
  monthlyIncome: number;
  creditedYears: number;
  minimumMode: MinimumMode;
};

export const DISABILITY_DEGREES = [
  { degree: 1, roman: "I.", decline: "35–49 %", divisor: 3, ordinaryMinimum: 1_634 },
  { degree: 2, roman: "II.", decline: "50–69 %", divisor: 2, ordinaryMinimum: 2_450 },
  { degree: 3, roman: "III.", decline: "70 % a více", divisor: 1, ordinaryMinimum: 4_900 },
] as const;

export const MINIMUM_LABELS: Record<MinimumMode, string> = {
  ordinary: "Běžné zákonné minimum",
  insured15: "Alespoň 15 let pojištění bez náhradních dob",
  under28: "Mladší 28 let se splněnými podmínkami",
};

/** Accept Czech decimal separators and pasted grouped amounts, never scientific notation. */
export function parsePensionNumber(value: string): number | null {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

export function reduceAssessmentBase(monthlyIncome: number) {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0 || monthlyIncome > 10_000_000) {
    throw new RangeError("Příjem musí být mezi 0 a 10 000 000 Kč.");
  }
  const assessmentBase = Math.ceil(monthlyIncome);
  const firstBand = Math.min(assessmentBase, PENSION_2026.firstThreshold);
  const secondBand = Math.max(0, Math.min(assessmentBase, PENSION_2026.secondThreshold) - PENSION_2026.firstThreshold);
  return {
    assessmentBase,
    firstBand,
    secondBand,
    excluded: Math.max(0, assessmentBase - PENSION_2026.secondThreshold),
    reducedBase: Math.ceil((firstBand * 99 + secondBand * 26) / 100),
  };
}

export function calculateDisabilityPension(input: PensionInput) {
  if (!Number.isInteger(input.creditedYears) || input.creditedYears < 0 || input.creditedYears > 60) {
    throw new RangeError("Zadej počet celých započtených let od 0 do 60.");
  }
  if (!["ordinary", "insured15", "under28"].includes(input.minimumMode)) throw new RangeError("Neplatný režim minima.");
  if (input.minimumMode === "insured15" && input.creditedYears < 15) {
    throw new RangeError("Při alespoň 15 letech pojištění nemůže být celková započtená doba kratší než 15 let.");
  }
  const reduction = reduceAssessmentBase(input.monthlyIncome);
  const protectedBase = reduceAssessmentBase(PENSION_2026.averageWage).reducedBase;
  const pensions = DISABILITY_DEGREES.map((item) => {
    const earnedPercentage = Math.ceil(
      (reduction.reducedBase * input.creditedYears * PENSION_2026.annualRateNumerator) /
      (PENSION_2026.annualRateDenominator * item.divisor),
    );
    const minimumPercentage = input.minimumMode === "ordinary"
      ? item.ordinaryMinimum
      : Math.max(item.ordinaryMinimum, Math.ceil((protectedBase * 45) / (100 * item.divisor)));
    const percentageAmount = Math.max(earnedPercentage, minimumPercentage);
    return {
      ...item,
      basicAmount: PENSION_2026.basicAmount,
      earnedPercentage,
      minimumPercentage,
      minimumApplied: earnedPercentage < minimumPercentage,
      percentageAmount,
      total: PENSION_2026.basicAmount + percentageAmount,
    };
  });
  return { ...reduction, creditedYears: input.creditedYears, minimumMode: input.minimumMode, pensions };
}

export type PensionResult = ReturnType<typeof calculateDisabilityPension>;
export const formatPensionMoney = (value: number) => new Intl.NumberFormat("cs-CZ", {
  style: "currency", currency: "CZK", maximumFractionDigits: 0,
}).format(value);

export function buildPensionSummary(result: PensionResult, incomeMode: IncomeMode): string {
  return [
    "Orientační výpočet invalidního důchodu – nové přiznání v roce 2026",
    `${incomeMode === "gross" ? "Hrubý měsíční příjem použitý jako odhad OVZ" : "Osobní vyměřovací základ"}: ${formatPensionMoney(result.assessmentBase)}`,
    `Započtená doba včetně dopočtené doby: ${result.creditedYears} celých let.`,
    `Režim minima: ${MINIMUM_LABELS[result.minimumMode]}.`,
    `Redukovaný výpočtový základ: ${formatPensionMoney(result.reducedBase)}.`,
    ...result.pensions.map((pension) => `${pension.roman} stupeň: ${formatPensionMoney(pension.total)} měsíčně (základní výměra ${formatPensionMoney(pension.basicAmount)} + procentní výměra ${formatPensionMoney(pension.percentageAmount)}${pension.minimumApplied ? "; dorovnáno na zvolené minimum" : ""}).`),
    incomeMode === "gross" ? "Aktuální mzda je pouze odhad celoživotních přepočtených příjmů. Skutečný důchod se může lišit." : "Výsledek závisí na správnosti zadaného OVZ a započtené doby.",
    "Částky předpokládají vznik nároku. Nárok ani stupeň invalidity tato kalkulačka neposuzuje; rozhoduje ČSSZ.",
    "Nezohledněno: zahraniční doby a dílčí důchody, souběhy důchodů, účast ve II. pilíři, invalidita z mládí ani změny již přiznaných důchodů.",
    "Zdroj: https://www.cssz.gov.cz/invalidni-duchody-podrobne",
  ].join("\n");
}
