import type { Position } from "@/app/types/domain";

import type { ContractDoc } from "./contractsApi.types";

export type ContractTransferReason = "manual" | "career_end";

export type ContractOwnershipTransferRecord = {
  type: ContractTransferReason;
  fromEmail: string;
  toEmail: string;
  transferredAt: Date;
  effectiveDate: string | null;
  transferredByEmail: string;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 200) : null;
};

const normalizePosition = (value: unknown): Position | null =>
  typeof value === "string" && value.trim() ? (value.trim() as Position) : null;

export const normalizeTransferEffectiveDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return normalized;
};

export const pragueIsoDay = (value: Date): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
};

export const originalAdviserEmailForContract = (
  contract: Pick<ContractDoc, "originalAdviserEmail" | "userEmail">,
  fallbackOwnerEmail?: string | null
): string =>
  normalizeEmail(contract.originalAdviserEmail) ||
  normalizeEmail(contract.userEmail) ||
  normalizeEmail(fallbackOwnerEmail);

export const servicingOwnerEmailForContract = (
  contract: Pick<
    ContractDoc,
    "servicingOwnerEmail" | "commissionOwnerEmail" | "userEmail"
  >,
  fallbackOwnerEmail?: string | null
): string =>
  normalizeEmail(contract.servicingOwnerEmail) ||
  normalizeEmail(contract.commissionOwnerEmail) ||
  normalizeEmail(contract.userEmail) ||
  normalizeEmail(fallbackOwnerEmail);

export const contractWasTransferred = (
  contract: Pick<
    ContractDoc,
    | "originalAdviserEmail"
    | "servicingOwnerEmail"
    | "commissionOwnerEmail"
    | "userEmail"
  >,
  fallbackOwnerEmail?: string | null
): boolean => {
  const originalEmail = originalAdviserEmailForContract(contract, fallbackOwnerEmail);
  const servicingEmail = servicingOwnerEmailForContract(contract, fallbackOwnerEmail);
  return Boolean(originalEmail && servicingEmail && originalEmail !== servicingEmail);
};

export const buildTransferredContractData = ({
  contract,
  fromOwnerEmail,
  toOwnerEmail,
  toOwnerUserId,
  actorEmail,
  transferredAt,
  fromOwnerName,
  toOwnerName,
  effectiveDate = null,
  reason = "manual",
}: {
  contract: ContractDoc;
  fromOwnerEmail: string;
  toOwnerEmail: string;
  toOwnerUserId: string | null;
  actorEmail: string;
  transferredAt: Date;
  fromOwnerName?: string | null;
  toOwnerName?: string | null;
  effectiveDate?: string | null;
  reason?: ContractTransferReason;
}): Record<string, unknown> => {
  const normalizedFrom = normalizeEmail(fromOwnerEmail);
  const normalizedTo = normalizeEmail(toOwnerEmail);
  const normalizedActor = normalizeEmail(actorEmail);
  const originalAdviserEmail = originalAdviserEmailForContract(
    contract,
    normalizedFrom
  );
  const existingOriginalName = normalizeName(contract.originalAdviserName);
  const originalAdviserName =
    existingOriginalName ||
    (originalAdviserEmail === normalizedFrom ? normalizeName(fromOwnerName) : null);
  const originalPosition =
    normalizePosition(contract.originalPosition) ??
    normalizePosition(contract.position);
  const previousHistory = Array.isArray(contract.ownershipTransferHistory)
    ? contract.ownershipTransferHistory
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item))
        )
        .slice(-49)
    : [];
  const transfer: ContractOwnershipTransferRecord = {
    type: reason,
    fromEmail: normalizedFrom,
    toEmail: normalizedTo,
    transferredAt,
    effectiveDate,
    transferredByEmail: normalizedActor,
  };

  const nextData: Record<string, unknown> = {
    ...contract,
    userEmail: normalizedTo,
    originalAdviserEmail,
    originalAdviserName,
    originalPosition,
    servicingOwnerEmail: normalizedTo,
    servicingOwnerName: normalizeName(toOwnerName),
    commissionOwnerEmail: normalizedTo,
    transferReason: reason,
    transferFromEmail: normalizedFrom,
    transferToEmail: normalizedTo,
    transferAt: transferredAt,
    transferEffectiveDate: effectiveDate,
    transferredByEmail: normalizedActor,
    ownershipTransfer: transfer,
    ownershipTransferHistory: [...previousHistory, transfer],
  };

  const oldPrefix = `users/${normalizedFrom}/entries/`;
  const newPrefix = `users/${normalizedTo}/entries/`;
  const parentPath =
    typeof contract.parentContractEntryPath === "string"
      ? contract.parentContractEntryPath
      : "";
  if (parentPath.startsWith(oldPrefix)) {
    nextData.parentContractEntryPath = `${newPrefix}${parentPath.slice(oldPrefix.length)}`;
  }

  if (normalizeEmail(contract.refreshReplacedByOwnerEmail) === normalizedFrom) {
    nextData.refreshReplacedByOwnerEmail = normalizedTo;
  }

  const replacementOwnerEmail = normalizeEmail(
    (contract as Record<string, unknown>).replacementReplacedByOwnerEmail
  );
  if (replacementOwnerEmail === normalizedFrom) {
    nextData.replacementReplacedByOwnerEmail = normalizedTo;
  }

  if (toOwnerUserId) {
    nextData.userId = toOwnerUserId;
  } else {
    delete nextData.userId;
  }

  return nextData;
};
