import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";

type PayoutSource = {
  code?: string | null;
  amount?: number | null;
  status?: string | null;
  statementPeriod?: string | null;
  payoutMonthKey?: string | null;
  writtenBy?: string | null;
};

export const isKooperativaCPayout = (product: unknown, code: unknown): boolean =>
  product === "kooperativaAuto" && /^C1\d{2,}$/.test(String(code ?? "").trim().toUpperCase().replace(/\s+/g, ""));

/** C1xx is the statement code of the corresponding B1xx subsequent commission.
 * Statement dates and amounts remain untouched, including separate corrections. */
export function describeKooperativaCPayout({ product, payout, payouts = [] }: {
  product: unknown;
  policyStartDate: unknown;
  payout: PayoutSource;
  payouts?: readonly PayoutSource[];
  calendar?: Date;
}): { kind: "subsequent" | "correction" | "unknown"; label: string; explanation: string } | null {
  if (!isKooperativaCPayout(product, payout.code)) return null;
  if (payout.status === "storno" || Number(payout.amount) < 0) return {
    kind: "correction", label: "Storno / srážka C provize",
    explanation: "Samostatná oprava z výpisu. Původní kód a částka zůstávají zachované.",
  };
  const normalize = (value: string | null | undefined) => String(value ?? "").trim().toUpperCase();
  const relatedCorrection = payouts.some(other => normalize(other.code) === normalize(payout.code) &&
    normalize(other.writtenBy) === normalize(payout.writtenBy) && (other.status === "storno" || Number(other.amount) < 0));
  if (Number.isFinite(payout.amount) && Number(payout.amount) > 0) {
    const plannedCode = baseCommissionCodeForPayoutComparison(payout.code, "kooperativaAuto");
    return {
      kind: "subsequent", label: "Následná provize",
      explanation: `Automaticky odpovídá následné provizi ${plannedCode} v plánu.${relatedCorrection ? " Ke stejnému kódu a příjemci je evidována také samostatná oprava." : ""}`,
    };
  }
  return {
    kind: "unknown", label: "C provize z výpisu",
    explanation: "Kód odpovídá následné provizi, ale položka nemá platnou kladnou částku výplaty.",
  };
}
