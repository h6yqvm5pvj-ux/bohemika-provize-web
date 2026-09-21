/** ČPP NEON RISK 01/2026, IX.4b, table 2 (tenfold progression).
 * https://www.cpp.cz/file/edee/dokumenty/zivotni-rizikove-a-urazove-pojisteni/brozury-pojistnych-podminek/pojisteni-neon/neon-risk/brozura-neon-risk_01_2026.pdf#page=52
 * Educational model for whole assessment percentages from 1 to 100.
 * The coefficient applies to the full assessed percentage, not marginal bands.
 */
export function calculatePermanentInjuryBenefit(insuredAmount: number, assessedPercent: number) {
  if (!Number.isSafeInteger(insuredAmount) || insuredAmount <= 0 || insuredAmount > 5_000_000
    || !Number.isInteger(assessedPercent) || assessedPercent < 1 || assessedPercent > 100) return null;

  const multiplier = Math.ceil(assessedPercent / 10);
  const baseBenefit = Math.round(insuredAmount * assessedPercent) / 100;
  return { multiplier, baseBenefit, progressiveBenefit: Math.round(insuredAmount * assessedPercent * multiplier) / 100 };
}
