import { createHash } from "node:crypto";

import { toDate } from "@/app/lib/formatters";

const CREATE_REPLAY_IGNORED_FIELDS = new Set<string>([
  "allowedEmails",
  "createdAt",
  "duplicateLookupKey",
  "items",
  "managerChain",
  "managerEmailSnapshot",
  "managerModeSnapshot",
  "managerOverrides",
  "managerPositionSnapshot",
  "paid",
  "position",
  "result",
  "total",
  "commissionMode",
  "refreshCommissionBase",
  "clientSearchKeys",
  "contractNumberSearchKeys",
  "tipContractTipsterName",
  "tipContractImmediateFirstYearGross",
  "tipContractImmediateFirstYearNet",
  "tipContractTipsterAmountFirstYear",
]);

const normalizeEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const toLocalIsoDay = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isTimestampLike = (value: unknown): boolean =>
  Boolean(
    value &&
      typeof value === "object" &&
      (("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") ||
        ("seconds" in value && typeof (value as { seconds?: unknown }).seconds === "number"))
  );

export const buildIdempotentEntryId = (
  ownerEmail: string,
  idempotencyKey: string
): string => {
  const hash = createHash("sha256")
    .update(`${normalizeEmail(ownerEmail)}::${idempotencyKey}`)
    .digest("hex")
    .slice(0, 40);
  return `idem_${hash}`;
};

export const normalizeCreateReplayValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date || isTimestampLike(value)) {
    const date = toDate(value);
    return date ? toLocalIsoDay(date) : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCreateReplayValue(item));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        out[key] = normalizeCreateReplayValue(value[key]);
      });
    return out;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null;
  }
  return value;
};

export const createReplayComparableJson = (
  source: Record<string, unknown>,
  expected: Record<string, unknown>
): string => {
  const out: Record<string, unknown> = {};
  Object.keys(expected)
    .filter((key) => !CREATE_REPLAY_IGNORED_FIELDS.has(key))
    .sort()
    .forEach((key) => {
      out[key] = normalizeCreateReplayValue(source[key]);
    });
  return JSON.stringify(out);
};

export const idempotentReplayMatchesPayload = (
  existing: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean =>
  createReplayComparableJson(existing, expected) ===
  createReplayComparableJson(expected, expected);

export const normalizeContractNumber = (
  value: string | null | undefined
): string => (value ?? "").replace(/\s+/g, "").trim();

export const normalizeContractNumberLoose = (
  value: string | null | undefined
): string => normalizeContractNumber(value).replace(/^0+/, "");

export const contractNumberClaimDocId = (
  value: string | null | undefined
): string => encodeURIComponent(normalizeContractNumber(value).toLowerCase());

export const normalizeContractEntryType = (
  value: unknown
): "contract" | "endorsement" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "contract" || normalized === "endorsement") {
    return normalized;
  }
  return null;
};

export const normalizeClientNameForDuplicate = (
  value: string | null | undefined
): string => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const isoDayFromUnknown = (value: unknown): string | null => {
  const date = toDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
};

export const buildDuplicateLookupKey = ({
  entryType,
  productKey,
  clientName,
  contractSignedDate,
}: {
  entryType: unknown;
  productKey: unknown;
  clientName: unknown;
  contractSignedDate: unknown;
}): string | null => {
  if (normalizeContractEntryType(entryType) !== "contract") return null;
  if (typeof productKey !== "string" || !productKey.trim()) return null;
  const client = normalizeClientNameForDuplicate(
    typeof clientName === "string" ? clientName : null
  );
  if (!client) return null;
  const signedDay = isoDayFromUnknown(contractSignedDate);
  if (!signedDay) return null;
  return `${productKey.trim()}___${client}___${signedDay}`;
};

export type DuplicateContractError = Error & {
  statusCode?: number;
  duplicatePath?: string;
};

export const createDuplicateContractError = (
  entryPath: string | null | undefined
): DuplicateContractError => {
  const duplicateErr = new Error(
    "Smlouva s tímto číslem už v systému existuje."
  ) as DuplicateContractError;
  duplicateErr.statusCode = 409;
  if (entryPath) duplicateErr.duplicatePath = entryPath;
  return duplicateErr;
};
