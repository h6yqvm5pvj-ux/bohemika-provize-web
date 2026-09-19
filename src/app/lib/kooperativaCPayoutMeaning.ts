import { toDate } from "./formatters";

type PayoutSource = {
  code?: string | null;
  amount?: number | null;
  status?: string | null;
  statementPeriod?: string | null;
  payoutMonthKey?: string | null;
  writtenBy?: string | null;
};

export const isKooperativaCPayout = (product: unknown, code: unknown): boolean =>
  product === "kooperativaAuto" && /^C1\d{2,}$/.test(String(code ?? "").trim().toUpperCase());

function statementStart(payout: PayoutSource): Date | null {
  const period = payout.statementPeriod?.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (period) {
    const date = new Date(Number(period[3]), Number(period[2]) - 1, Number(period[1]));
    return date.getFullYear() === Number(period[3]) && date.getMonth() === Number(period[2]) - 1 && date.getDate() === Number(period[1]) ? date : null;
  }
  const month = payout.payoutMonthKey?.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  return month ? new Date(Number(month[1]), Number(month[2]) - 1, 1) : null;
}

/** Presentation evidence only. Never use this hint to change a coefficient,
 * premium, payment frequency or to infer a C→B installment number. */
export function describeKooperativaCPayout({ product, policyStartDate, payout, payouts = [] }: {
  product: unknown;
  policyStartDate: unknown;
  payout: PayoutSource;
  payouts?: readonly PayoutSource[];
}): { kind: "subsequentCandidate" | "correction" | "unknown"; label: string; explanation: string } | null {
  if (!isKooperativaCPayout(product, payout.code)) return null;
  if (payout.status === "storno" || Number(payout.amount) < 0) return {
    kind: "correction", label: "Storno / srážka C provize",
    explanation: "Samostatná oprava z výpisu. Původní kód a částka zůstávají zachované.",
  };
  const normalize = (value: string | null | undefined) => String(value ?? "").trim().toUpperCase();
  const relatedCorrection = payouts.some(other => normalize(other.code) === normalize(payout.code) &&
    normalize(other.writtenBy) === normalize(payout.writtenBy) && (other.status === "storno" || Number(other.amount) < 0));
  if (relatedCorrection) return {
    kind: "correction", label: "C provize s opravou",
    explanation: "Ke stejnému kódu a příjemci patří i záporná položka. Výplatu a její opravu je potřeba posuzovat společně.",
  };
  const start = toDate(policyStartDate);
  const observed = statementStart(payout);
  if (start && Number.isFinite(start.getTime()) && observed && Number.isFinite(payout.amount) && Number(payout.amount) > 0 && ["paid", "difference"].includes(payout.status ?? "")) {
    const anniversary = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    if (observed >= anniversary) return {
      kind: "subsequentCandidate", label: "Pravděpodobná následná provize",
      explanation: "Kladná C výplata je ve výpisu po prvním výročí smlouvy. To odpovídá následné provizi, ale samo neurčuje, kterou splátku plánu nahrazuje.",
    };
  }
  return {
    kind: "unknown", label: "C provize z výpisu",
    explanation: "C kód může označovat následnou provizi i jiný doplatek. Její význam a období nelze určit jen podle čísla kódu.",
  };
}
