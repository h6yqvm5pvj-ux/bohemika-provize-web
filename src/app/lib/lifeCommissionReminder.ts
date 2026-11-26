export const LIFE_COMMISSION_REMINDER_TYPE = "life_commission_reminder";
const MESSAGE_ID_RE = /^life-commission-reminder-(\d{4}-(?:0[1-9]|1[0-2]))-[a-f0-9]{24}$/;

export type LifeCommissionReminderContract = {
  entryId: string;
  contractNumber: string;
  productLabel: string;
  code: "B036" | "B048";
  payoutDay: string;
};

export type LifeCommissionReminder = {
  id: string;
  title: string;
  body: string;
  contracts: LifeCommissionReminderContract[];
};

export function isLifeCommissionReminderMessageId(value: unknown): value is string {
  return typeof value === "string" && MESSAGE_ID_RE.test(value);
}

export function lifeCommissionReminderMessageMonth(id: string): string | null {
  return MESSAGE_ID_RE.exec(id)?.[1] ?? null;
}

export function isLifeCommissionReminderEntryId(value: unknown): value is string {
  return typeof value === "string" && /^[^/\\%\u0000-\u001f\u007f]{1,160}$/.test(value) &&
    !value.includes("..") && !value.includes("___") && value !== ".";
}

export function parseLifeCommissionReminderContracts(value: unknown): LifeCommissionReminderContract[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const { entryId, contractNumber, productLabel, code, payoutDay } = item as Record<string, unknown>;
    if (!isLifeCommissionReminderEntryId(entryId) || typeof contractNumber !== "string" ||
      typeof productLabel !== "string" || (code !== "B036" && code !== "B048") ||
      typeof payoutDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payoutDay)) return [];
    const date = new Date(`${payoutDay}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== payoutDay) return [];
    return [{ entryId, contractNumber: contractNumber.slice(0, 160), productLabel: productLabel.slice(0, 100), code, payoutDay }];
  });
}
