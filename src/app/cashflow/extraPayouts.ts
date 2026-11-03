/** Owner-private, administrator-recorded receipts; never client-editable forecasts. */
export type CashflowExtraPayout = {
  id: string;
  title: string;
  amountCzk: number;
  payoutMonthKey: string;
  status: "paid";
};

export const CASHFLOW_EXTRA_PAYOUTS_MAX = 100;
const MAX_AMOUNT_CZK = 100_000_000;

/** Strip audit/internal fields before a receipt enters the shared calculation. */
export function normalizeCashflowExtraPayouts(value: unknown): CashflowExtraPayout[] {
  if (!Array.isArray(value) || value.length > CASHFLOW_EXTRA_PAYOUTS_MAX) return [];
  const seen = new Set<string>();
  const result: CashflowExtraPayout[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const raw = row as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const month = typeof raw.payoutMonthKey === "string" ? raw.payoutMonthKey : "";
    const amount = raw.amountCzk;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) || seen.has(id) ||
      !title || title.length > 160 || /[\u0000-\u001f\u007f]/.test(title) ||
      !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month) ||
      raw.status !== "paid" || typeof amount !== "number" || !Number.isFinite(amount) ||
      amount <= 0 || amount > MAX_AMOUNT_CZK ||
      Math.abs(Math.round(amount * 100) / 100 - amount) > 1e-7) continue;
    seen.add(id);
    result.push({ id, title, amountCzk: Math.round(amount * 100) / 100, payoutMonthKey: month, status: "paid" });
  }
  return result;
}
