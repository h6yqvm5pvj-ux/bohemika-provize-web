export type ExplanationRow = {
  key?: string;
  curve: { percent: number; payoutPercent: number }[];
  payouts: number[];
};
export type ClientExplanation = {
  progression: string;
  doubleBenefit: string | null;
  example: string | null;
};
const percent = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %`;
const money = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
const tolerance = 0.000001;
// These existing NEON calculators multiply the full assessed percentage.
// Other products are described as percentage tables, without inferring that
// their rules between sampled points are whole-base multiplier bands.
const wholeBaseCurves = new Set(["cpp-10x", "cpp-5x", "cpp-neon-top-2022-06"]);

export type ClientScenarioExample = {
  assessment: number;
  payout: number;
  payoutPercent: number;
  effectiveMultiplier: number;
  wholeBaseMultiplier: number | null;
};

export function getClientScenarioExample(
  row: ExplanationRow,
  scenarios: { percent: number }[],
  sumInsured: number,
): ClientScenarioExample | null {
  if (!Number.isFinite(sumInsured) || sumInsured <= 0) return null;
  const index = scenarios.findIndex((scenario, index) => scenario.percent > 0 && scenario.percent <= 100 &&
    Number.isFinite(row.payouts[index]) && row.payouts[index] >= 0);
  if (index < 0) return null;
  const assessment = scenarios[index].percent;
  const payout = row.payouts[index];
  const payoutPercent = payout / sumInsured * 100;
  const effectiveMultiplier = payoutPercent / assessment;
  const roundedMultiplier = Math.round(effectiveMultiplier);
  return {
    assessment, payout, payoutPercent, effectiveMultiplier,
    wholeBaseMultiplier: wholeBaseCurves.has(row.key ?? "") && roundedMultiplier > 1 &&
      Math.abs(effectiveMultiplier - roundedMultiplier) < tolerance ? roundedMultiplier : null,
  };
}

/** Describe the same curve and scenario amounts used by the comparison itself. */
export function explainClientVariant(
  row: ExplanationRow,
  scenarios: { percent: number }[],
  sumInsured: number,
): ClientExplanation {
  const points = row.curve.filter(point => Number.isFinite(point.percent) && Number.isFinite(point.payoutPercent) &&
    point.percent > 0 && point.percent <= 100 && point.payoutPercent >= 0).sort((a, b) => a.percent - b.percent);
  const wholePoints = points.filter(point => Number.isInteger(point.percent));
  const complete = wholePoints.length === 100 && wholePoints.every((point, index) => point.percent === index + 1);
  const firstIncrease = complete ? wholePoints.find(point => point.payoutPercent > point.percent + tolerance) : undefined;
  const firstDouble = complete ? wholePoints.find(point => point.payoutPercent + tolerance >= point.percent * 2) : undefined;
  // Only describe a whole-base multiplier band when the selected curve really
  // applies that multiplier throughout the band. Other tables use total payout
  // percentages, which must not be presented as the same calculation method.
  const firstMultiplier = firstIncrease ? firstIncrease.payoutPercent / firstIncrease.percent : 0;
  const firstIndex = firstIncrease ? points.indexOf(firstIncrease) : -1;
  const previous = points[firstIndex - 1];
  const band = wholeBaseCurves.has(row.key ?? "") && firstIncrease && Number.isInteger(firstMultiplier) && firstMultiplier > 1 && previous &&
    Math.abs(previous.payoutPercent - previous.percent) < tolerance &&
    firstIncrease.percent - previous.percent === 1
    ? points.slice(firstIndex).findIndex(point => Math.abs(point.payoutPercent - point.percent * firstMultiplier) > tolerance)
    : -1;
  const bandEnd = band > 0 ? points[firstIndex + band - 1] : null;
  const progression = bandEnd && previous
    ? `Při rozsahu nad ${percent(previous.percent)} do ${percent(bandEnd.percent)} včetně se plnění počítá z ${firstMultiplier === 2 ? "dvojnásobku" : `${firstMultiplier}násobku`} pojistné částky. Násobek se vztahuje na celý posouzený rozsah následků.`
    : firstIncrease
      ? `První navýšení oproti plnění bez progrese je v tabulce při ${percent(firstIncrease.percent)} trvalých následků. Tomuto hodnocení odpovídá plnění ${percent(firstIncrease.payoutPercent)} pojistné částky.`
      : "Výše plnění se řídí tabulkou této varianty. Samotné označení maximální progrese nepopisuje plnění při menším rozsahu následků.";
  const doubleBenefit = firstDouble && (!bandEnd || firstDouble.percent !== firstIncrease?.percent)
    ? `Alespoň dvojnásobku plnění bez progrese dosahuje tabulka poprvé při ${percent(firstDouble.percent)} hodnocení. Uvedené hranice porovnáváme po celých procentech.`
    : null;
  const selectedExample = getClientScenarioExample(row, scenarios, sumInsured);
  let example: string | null = null;
  if (selectedExample) {
    const { assessment, payout, payoutPercent, effectiveMultiplier } = selectedExample;
    example = `Při hodnocení ${percent(assessment)} a pojistné částce ${money(sumInsured)} vychází plnění na ${money(payout)}, tedy ${percent(payoutPercent)} pojistné částky.`;
    if (Math.abs(effectiveMultiplier - 2) < tolerance) example += " To je dvojnásobek plnění bez progrese.";
    else if (Math.abs(effectiveMultiplier - 1) < tolerance) example += " V tomto scénáři se plnění progresí ještě nezvyšuje.";
  }
  return { progression, doubleBenefit, example };
}

export function clientComparisonHeading(rows: ExplanationRow[]): string {
  const firstPayouts = rows[0]?.payouts;
  if (rows.length > 1 && firstPayouts?.length && rows.every(row => row.payouts.length === firstPayouts.length &&
    row.payouts.every((value, index) => Number.isFinite(value) && Math.abs(value - firstPayouts[index]) < tolerance))) {
    return "Stejná pojistná částka. Ve zvolených scénářích je plnění stejné.";
  }
  const maxima = rows.map(row => row.curve.find(point => point.percent === 100)?.payoutPercent);
  const commonMaximum = maxima[0];
  if (rows.length === 1) return "Stejná pojistná částka. Rozhoduje průběh progrese.";
  return rows.length > 1 && commonMaximum != null && Number.isFinite(commonMaximum) && commonMaximum > 100 &&
    maxima.every(value => value != null && Math.abs(value - commonMaximum) < tolerance)
    ? `Stejná pojistná částka. Stejné maximum ${Number((commonMaximum / 100).toFixed(2)).toLocaleString("cs-CZ")}×. Přesto jiné plnění.`
    : "Stejná pojistná částka. Přesto jiné plnění.";
}
