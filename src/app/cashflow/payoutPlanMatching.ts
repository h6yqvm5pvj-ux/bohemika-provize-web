import type { EntryDoc } from "./types";

/** Legacy persisted metadata, retained for reading older contracts only.
 * C payouts now settle their corresponding B installment automatically.
 * Saved manual associations have no effect on cashflow calculations.
 */
export type CashflowPayoutMatch = {
  payoutKey: string;
  payoutSignature: string;
  plannedCode: string;
  plannedMonthKey: string;
  plannedPeriodStart: string;
  plannedFrequency: EntryDoc["frequencyRaw"];
  writtenBy: string;
  writtenAtMs: number;
  actorEmail: string;
};

export const normalizedPayoutEmail = (value: string | null | undefined) =>
  String(value ?? "").trim().toLowerCase();
