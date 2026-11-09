export type ContractPaymentDetails = {
  amount: number;
  accountNumber: string;
  variableSymbol: string;
  dueDate?: string | null;
  frequency?: "monthly" | "quarterly" | "semiannual" | "annual";
};

const MAX_PAYMENT_AMOUNT = 9_999_999.99;
const ACCOUNT_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

const passesAccountChecksum = (digits: string): boolean => {
  const padded = digits.padStart(10, "0");
  return [...padded].reduce((sum, digit, index) => sum + Number(digit) * ACCOUNT_WEIGHTS[index], 0) % 11 === 0;
};

const parseAccount = (value: unknown): { accountNumber: string; bban: string } | null => {
  if (typeof value !== "string" || value.length > 64) return null;
  const accountNumber = value.replace(/\s+/g, "");
  const match = accountNumber.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!match) return null;
  const [, prefix = "", basic, bank] = match;
  if (bank === "0000" || basic.replace(/0/g, "").length < 2 ||
    !passesAccountChecksum(prefix) || !passesAccountChecksum(basic)) return null;
  return { accountNumber, bban: `${bank}${prefix.padStart(6, "0")}${basic.padStart(10, "0")}` };
};

const validDueDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const date = new Date(`${value}T00:00:00.000Z`);
  return year >= 2000 && year <= 2100 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Only the validated payment fields are retained from the untrusted PDF text. */
export function normalizeContractPaymentDetails(value: unknown): ContractPaymentDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const { amount } = candidate;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT_AMOUNT ||
    Number(amount.toFixed(2)) !== amount) return null;
  if (candidate.currency != null && candidate.currency !== "CZK") return null;
  const account = parseAccount(candidate.accountNumber);
  if (!account || typeof candidate.variableSymbol !== "string" || candidate.variableSymbol.length > 32) return null;
  const variableSymbol = candidate.variableSymbol.trim();
  if (!/^\d{1,10}$/.test(variableSymbol)) return null;
  const dueDate = candidate.dueDate == null || candidate.dueDate === "" ? null : candidate.dueDate;
  if (dueDate != null && (typeof dueDate !== "string" || !validDueDate(dueDate))) return null;
  return { amount, accountNumber: account.accountNumber, variableSymbol, dueDate };
}

const modulo97 = (digits: string): number => {
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
};

/**
 * Czech IBAN: bank (4), prefix (6), basic account (10), then CZ as 12/35 and 00.
 * Reference: https://www.cnb.cz/cs/platebni-styk/iban/iban-mezinarodni-format-cisla-uctu/
 * SPD fields: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */
export function buildContractPaymentQrPayload(value: unknown): string | null {
  const payment = normalizeContractPaymentDetails(value);
  if (!payment) return null;
  const account = parseAccount(payment.accountNumber);
  if (!account) return null;
  const checkDigits = String(98 - modulo97(`${account.bban}123500`)).padStart(2, "0");
  const iban = `CZ${checkDigits}${account.bban}`;
  const fields = ["SPD", "1.0", `ACC:${iban}`, `AM:${payment.amount.toFixed(2)}`, "CC:CZK", `X-VS:${payment.variableSymbol}`];
  if (payment.dueDate) fields.push(`DT:${payment.dueDate.replace(/-/g, "")}`);
  return fields.join("*");
}
