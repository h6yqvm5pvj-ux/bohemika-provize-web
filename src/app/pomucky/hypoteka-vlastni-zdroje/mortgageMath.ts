export type TaxMode = "securities" | "withholding";
export type SecuritiesTaxReason = "timeTest" | "lowProceeds" | "taxed" | "none";
export type LiquidationValue = { grossValue: number; netValue: number; tax: number; taxableGain: number; reason: SecuritiesTaxReason };
export type TaxOptions = { otherSaleProceeds?: number; taxRate?: number; entryFeePct?: number };
const WITHHOLDING_TAX_RATE = .15;
const SECURITIES_LOW_PROCEEDS_LIMIT = 100_000;

export function monthlyRate(annualRatePct: number): number {
  return Math.pow(1 + Math.max(annualRatePct, -99) / 100, 1 / 12) - 1;
}

export function monthlyRateAfterTax(annualRatePct: number, taxMode: TaxMode): number {
  const grossMonthlyRate = taxMode === "withholding" ? annualRatePct / 1200 : monthlyRate(annualRatePct);
  return taxMode === "withholding" && grossMonthlyRate > 0 ? grossMonthlyRate * (1 - WITHHOLDING_TAX_RATE) : grossMonthlyRate;
}

export function effectiveAnnualReturnPct(annualRatePct: number, taxMode: TaxMode): number {
  return (Math.pow(1 + monthlyRateAfterTax(annualRatePct, taxMode), 12) - 1) * 100;
}

export function getSecuritiesLiquidationValue(grossValue: number, taxableGain: number, options: TaxOptions = {}): LiquidationValue {
  if (grossValue + (options.otherSaleProceeds ?? 0) <= SECURITIES_LOW_PROCEEDS_LIMIT) return { grossValue, netValue: grossValue, tax: 0, taxableGain: 0, reason: "lowProceeds" };
  const gain = Math.max(0, taxableGain);
  const tax = gain * (options.taxRate ?? .15);
  return { grossValue, netValue: grossValue - tax, tax, taxableGain: gain, reason: tax > 0 ? "taxed" : "none" };
}

export function getLiquidationValue(
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode,
  options: TaxOptions = {}
): LiquidationValue {
  const grossValue = futureValue(currentSavings, monthlyContribution, annualRatePct, months, taxMode, options);

  if (taxMode === "securities") {
    // Initial cash is invested now; monthly purchases occur at each month end.
    const factor = 1 + monthlyRate(annualRatePct);
    const investedFraction = 1 - (options.entryFeePct ?? 0) / 100;
    let taxableGain = months <= 36 ? currentSavings * investedFraction * Math.pow(factor, months) - currentSavings : 0;
    for (let age = 0; age < Math.min(months, 37); age++) {
      taxableGain += monthlyContribution * investedFraction * Math.pow(factor, age) - monthlyContribution;
    }
    const value = getSecuritiesLiquidationValue(grossValue, taxableGain, options);
    if (months > 36 && monthlyContribution === 0 && value.reason !== "lowProceeds") value.reason = "timeTest";
    return value;
  }

  return {
    grossValue,
    netValue: grossValue,
    tax: 0,
    taxableGain: 0,
    reason: "none",
  };
}

export function futureValue(
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode,
  options: TaxOptions = {}
): number {
  const rate = monthlyRateAfterTax(annualRatePct, taxMode);
  const fraction = taxMode === "securities" ? 1 - (options.entryFeePct ?? 0) / 100 : 1;
  currentSavings *= fraction;
  monthlyContribution *= fraction;
  if (months <= 0) return currentSavings;
  if (Math.abs(rate) < 0.0000001) return currentSavings + monthlyContribution * months;

  const factor = Math.pow(1 + rate, months);
  return currentSavings * factor + monthlyContribution * ((factor - 1) / rate);
}

export function monthsToTarget(
  target: number,
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  taxMode: TaxMode,
  options: TaxOptions = {}
): number | null {
  if (currentSavings >= target) return 0;
  if (monthlyContribution <= 0 && (currentSavings <= 0 || annualRatePct <= 0)) return null;

  for (let months = 1; months <= 600; months += 1) {
    if (
      getLiquidationValue(
        currentSavings,
        monthlyContribution,
        annualRatePct,
        months,
        taxMode,
        options
      ).netValue >= target
    ) {
      return months;
    }
  }

  return null;
}

export function monthsToGrossTarget(
  target: number,
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  taxMode: TaxMode,
  options: TaxOptions = {}
): number | null {
  if (currentSavings >= target) return 0;
  if (monthlyContribution <= 0 && (currentSavings <= 0 || annualRatePct <= 0)) return null;

  for (let months = 1; months <= 600; months += 1) {
    if (futureValue(currentSavings, monthlyContribution, annualRatePct, months, taxMode, options) >= target) {
      return months;
    }
  }

  return null;
}

export function requiredMonthlyContribution(
  target: number,
  currentSavings: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode,
  options: TaxOptions = {}
): number | null {
  if (getLiquidationValue(currentSavings, 0, annualRatePct, months, taxMode, options).netValue >= target) return 0;
  if (months <= 0) return null;

  // Below the exemption threshold a lower, tax-exempt solution can exist
  // even if larger contributions cross the threshold and temporarily reduce net value.
  if (taxMode === "securities" && target + (options.otherSaleProceeds ?? 0) <= SECURITIES_LOW_PROCEEDS_LIMIT) {
    const base = futureValue(currentSavings, 0, annualRatePct, months, taxMode, options);
    const unit = futureValue(0, 1, annualRatePct, months, taxMode, options);
    const contribution = Math.max(0, (target - base) / unit);
    const rounded = Math.ceil(contribution);
    if (getLiquidationValue(currentSavings, rounded, annualRatePct, months, taxMode, options).netValue >= target) return rounded;
  }

  let low = 0;
  let high = Math.max(1_000, target / months);

  for (let guard = 0; guard < 30; guard += 1) {
    if (getLiquidationValue(currentSavings, high, annualRatePct, months, taxMode, options).netValue >= target) {
      break;
    }
    high *= 2;
  }

  if (getLiquidationValue(currentSavings, high, annualRatePct, months, taxMode, options).netValue < target) return null;

  for (let i = 0; i < 48; i += 1) {
    const mid = (low + high) / 2;
    const netValue = getLiquidationValue(currentSavings, mid, annualRatePct, months, taxMode, options).netValue;
    if (netValue >= target) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return Math.max(0, Math.ceil(high - 1e-8));
}


export function calculateMortgageTarget(price: number, appraisal: number, ageAtPurchase: number, investment: boolean, reserve: number) {
  const ltv = investment ? .7 : ageAtPurchase < 36 ? .9 : .8;
  const mortgage = Math.min(price, appraisal * ltv);
  return { ltv, mortgage, target: price - mortgage + reserve };
}
