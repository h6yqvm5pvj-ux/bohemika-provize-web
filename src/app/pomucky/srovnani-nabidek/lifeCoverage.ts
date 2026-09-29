import { PROGRESSION_LABELS } from "../srovnavac-trvalych-nasledku/progressionOptions";
import { formatMoneyValue } from "./money";

export const INSURANCE_TYPES = [
  { id: "auto", label: "Pojištění vozidel", icon: "car" },
  { id: "property", label: "Pojištění majetku a odpovědnosti", icon: "home" },
  { id: "life", label: "Životní pojištění", icon: "heart" },
  { id: "employee", label: "Pojištění odpovědnosti zaměstnance", icon: "briefcase" },
] as const;
export type InsuranceType = "" | typeof INSURANCE_TYPES[number]["id"];
export const LIFE_COVERAGES = [
  { id: "investment", label: "Investiční složka", icon: "wallet" },
  { id: "death", label: "Smrt", icon: "heart" },
  { id: "terminal", label: "Terminální stadium", icon: "heart" },
  { id: "disability", label: "Invalidita", icon: "shield" },
  { id: "injury", label: "Trvalé následky úrazu", icon: "activity" },
] as const;
export type LifeCoverageKind = typeof LIFE_COVERAGES[number]["id"];
export const AMOUNT_TYPES = [
  { id: "constant", label: "Konstantní" },
  { id: "linear", label: "Lineárně klesající" },
  { id: "loan", label: "Klesající dle úroku z úvěru" },
] as const;
export type AmountType = "" | typeof AMOUNT_TYPES[number]["id"];
export const COVERAGE_STATUSES = [
  { id: "", label: "Neuvedeno" }, { id: "included", label: "Sjednáno" }, { id: "excluded", label: "Nesjednáno" },
] as const;
export const DISABILITY_DEGREES = [
  { id: "123", label: "I., II. a III. stupeň", degrees: ["1", "2", "3"] },
  { id: "23", label: "II. a III. stupeň", degrees: ["2", "3"] },
  { id: "3", label: "Pouze III. stupeň", degrees: ["3"] },
] as const;
export type DisabilityDegree = "1" | "2" | "3";
export const DEGREE_LABELS = { "1": "I. stupeň", "2": "II. stupeň", "3": "III. stupeň" } as const;
export const INJURY_THRESHOLDS = [
  { id: "0", label: "Od 0 %" }, { id: "0.001", label: "Od 0,001 %" }, { id: "0.5", label: "Od 0,5 %" }, { id: "10", label: "Od 10 %" },
] as const;
export const PROGRESSIONS = [
  { id: "none", label: "Bez progrese" },
  ...Object.entries(PROGRESSION_LABELS).map(([id, label]) => ({ id: id as keyof typeof PROGRESSION_LABELS, label })),
] as const;
type Status = typeof COVERAGE_STATUSES[number]["id"];
type Base = { status: Status };
type DecreasingAmount = { amountType: AmountType; interestRate: string };
export type LifeDetails =
  | (Base & { kind: "investment"; monthlyAmount: string })
  | (Base & DecreasingAmount & { kind: "death"; amount: string })
  | (Base & { kind: "terminal"; amount: string })
  | (Base & DecreasingAmount & { kind: "disability"; degrees: "" | typeof DISABILITY_DEGREES[number]["id"]; amounts: Record<DisabilityDegree, string> })
  | (Base & { kind: "injury"; amount: string; progression: "" | "custom" | typeof PROGRESSIONS[number]["id"]; customProgression: string; threshold: "" | "custom" | typeof INJURY_THRESHOLDS[number]["id"]; customThreshold: string });

export function createLifeDetails(kind: LifeCoverageKind): LifeDetails {
  const base = { status: "" as const };
  switch (kind) {
    case "investment": return { ...base, kind, monthlyAmount: "" };
    case "death": return { ...base, kind, amount: "", amountType: "", interestRate: "" };
    case "terminal": return { ...base, kind, amount: "" };
    case "disability": return { ...base, kind, amountType: "", interestRate: "", degrees: "", amounts: { "1": "", "2": "", "3": "" } };
    case "injury": return { ...base, kind, amount: "", progression: "", customProgression: "", threshold: "", customThreshold: "" };
  }
}

const withUnit = (value: string, unit: string) => unit === "Kč" ? formatMoneyValue(value) : /^[\d\s.,]+$/.test(value.trim()) ? `${value.trim()} ${unit}` : value.trim();
/** Only active selections are exported; hidden values stay available when toggling back. */
export function lifeDetailsText(details: LifeDetails): string {
  if (details.status === "excluded") return "Nesjednáno";
  const lines: string[] = details.status === "included" ? ["Sjednáno"] : [];
  if (details.kind === "investment" && details.monthlyAmount.trim()) lines.push(`Měsíční investice: ${withUnit(details.monthlyAmount, "Kč")}`);
  if ("amount" in details && details.amount.trim()) lines.push(`Pojistná částka: ${withUnit(details.amount, "Kč")}`);
  if ("amountType" in details && details.amountType) {
    lines.push(`Průběh částky: ${AMOUNT_TYPES.find(type => type.id === details.amountType)!.label}`);
    if (details.amountType === "loan" && details.interestRate.trim()) lines.push(`Úrok z úvěru: ${withUnit(details.interestRate, "%")}`);
  }
  if (details.kind === "disability" && details.degrees) {
    const selected = DISABILITY_DEGREES.find(option => option.id === details.degrees)!;
    lines.push(`Stupně invalidity: ${selected.label}`);
    for (const degree of selected.degrees) {
      const amount = details.amounts[degree];
      lines.push(`${DEGREE_LABELS[degree]}: ${amount.trim() ? withUnit(amount, "Kč") : "částka neuvedena"}`);
    }
  }
  if (details.kind === "injury") {
    if (details.progression === "custom") { if (details.customProgression.trim()) lines.push(`Progrese: ${details.customProgression.trim()}`); }
    else if (details.progression) lines.push(PROGRESSIONS.find(option => option.id === details.progression)!.label);
    if (details.threshold === "custom") { if (details.customThreshold.trim()) lines.push(`Plnění od: ${withUnit(details.customThreshold, "%")}`); }
    else if (details.threshold) lines.push(`Plnění ${INJURY_THRESHOLDS.find(option => option.id === details.threshold)!.label.toLocaleLowerCase("cs-CZ")}`);
  }
  return lines.join("\n");
}

export function parseLifeDetails(value: unknown, expectedKind: LifeCoverageKind): LifeDetails {
  const fail = (): never => { throw new Error("Soubor obsahuje neplatné údaje životního pojištění."); };
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
  const text = (value: unknown): string => typeof value === "string" && value.length <= 160 ? value : fail();
  const selection = <T extends string>(value: unknown, options: readonly T[]): T => typeof value === "string" && options.includes(value as T) ? value as T : fail();
  const data = record(value);
  if (data.kind !== expectedKind) fail();
  const status = selection(data.status, COVERAGE_STATUSES.map(option => option.id));
  const decreasing = () => ({ amountType: selection(data.amountType, ["", ...AMOUNT_TYPES.map(option => option.id)]), interestRate: text(data.interestRate) });
  switch (expectedKind) {
    case "investment": return { kind: expectedKind, status, monthlyAmount: text(data.monthlyAmount) };
    case "death": return { kind: expectedKind, status, amount: text(data.amount), ...decreasing() };
    case "terminal": return { kind: expectedKind, status, amount: text(data.amount) };
    case "disability": {
      const amounts = record(data.amounts);
      return { kind: expectedKind, status, ...decreasing(), degrees: selection(data.degrees, ["", ...DISABILITY_DEGREES.map(option => option.id)]), amounts: { "1": text(amounts["1"]), "2": text(amounts["2"]), "3": text(amounts["3"]) } };
    }
    case "injury": return { kind: expectedKind, status, amount: text(data.amount), progression: selection(data.progression, ["", "custom", ...PROGRESSIONS.map(option => option.id)]), customProgression: text(data.customProgression), threshold: selection(data.threshold, ["", "custom", ...INJURY_THRESHOLDS.map(option => option.id)]), customThreshold: text(data.customThreshold) };
  }
}
