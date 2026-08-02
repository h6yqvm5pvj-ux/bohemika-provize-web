import { toDate } from "@/app/lib/formatters";
import { productCoefficientValidityError } from "@/app/lib/productFormulas/coefficientSets";

import type { ContractDoc } from "./contractsApi.types";

const CONTRACT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$/;
const MIN_REASONABLE_CONTRACT_DATE = new Date("2000-01-01T00:00:00.000Z");
const MAX_REASONABLE_CONTRACT_DATE = new Date("2101-01-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const UPDATE_FIELDS_CONTRACT_CORE_KEYS = new Set<string>([
  "clientName",
  "contractNumber",
  "contractSignedDate",
  "policyStartDate",
  "policyEndDate",
]);

const UPDATE_FIELDS_LIFECYCLE_KEYS = new Set<string>([
  "status",
  "stornoDate",
]);

type ValidationResult = { ok: true } | { ok: false; error: string };

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const isReasonableContractDate = (value: Date): boolean =>
  value >= MIN_REASONABLE_CONTRACT_DATE && value < MAX_REASONABLE_CONTRACT_DATE;

const utcDayIndex = (value: Date): number =>
  Math.floor(value.getTime() / DAY_MS);

const toIsoDay = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isValidContractNumber = (value: string): boolean =>
  CONTRACT_NUMBER_RE.test(value);

export const validateContractCoreInvariants = (
  existing: ContractDoc,
  patch: Record<string, unknown>
): ValidationResult => {
  const shouldValidateCore = [...UPDATE_FIELDS_CONTRACT_CORE_KEYS].some((key) =>
    hasOwn(patch, key)
  );
  const shouldValidateLifecycle =
    [...UPDATE_FIELDS_LIFECYCLE_KEYS].some((key) => hasOwn(patch, key)) ||
    hasOwn(patch, "policyStartDate") ||
    hasOwn(patch, "contractSignedDate");
  if (!shouldValidateCore && !shouldValidateLifecycle) return { ok: true };

  const finalClientName = hasOwn(patch, "clientName")
    ? patch.clientName
    : existing.clientName;
  if (shouldValidateCore) {
    if (typeof finalClientName !== "string" || !finalClientName.trim()) {
      return { ok: false, error: "Pole clientName nesmí být prázdné." };
    }

    const finalContractNumber = hasOwn(patch, "contractNumber")
      ? patch.contractNumber
      : existing.contractNumber;
    if (
      typeof finalContractNumber !== "string" ||
      !isValidContractNumber(finalContractNumber.trim())
    ) {
      return { ok: false, error: "Pole contractNumber má neplatný formát." };
    }
  }

  const finalSignedDate = toDate(
    hasOwn(patch, "contractSignedDate")
      ? patch.contractSignedDate
      : existing.contractSignedDate
  );
  const finalPolicyStartDate = toDate(
    hasOwn(patch, "policyStartDate")
      ? patch.policyStartDate
      : existing.policyStartDate
  );
  const finalPolicyEndDate = toDate(
    hasOwn(patch, "policyEndDate")
      ? patch.policyEndDate
      : existing.policyEndDate
  );
  const finalStatus = hasOwn(patch, "status") ? patch.status : existing.status;
  const finalStornoDate = toDate(
    hasOwn(patch, "stornoDate") ? patch.stornoDate : existing.stornoDate
  );

  if (shouldValidateCore) {
    if (!finalSignedDate || !isReasonableContractDate(finalSignedDate)) {
      return { ok: false, error: "Pole contractSignedDate má neplatnou hodnotu." };
    }
    if (!finalPolicyStartDate || !isReasonableContractDate(finalPolicyStartDate)) {
      return { ok: false, error: "Pole policyStartDate má neplatnou hodnotu." };
    }
    if (finalPolicyStartDate.getTime() < finalSignedDate.getTime()) {
      return {
        ok: false,
        error: "Pole policyStartDate nemůže být dřív než contractSignedDate.",
      };
    }
    if (
      finalPolicyEndDate &&
      (!isReasonableContractDate(finalPolicyEndDate) ||
        finalPolicyEndDate.getTime() < finalPolicyStartDate.getTime())
    ) {
      return {
        ok: false,
        error: "Pole policyEndDate má neplatnou hodnotu.",
      };
    }
    const coefficientValidityError = productCoefficientValidityError(
      existing.productKey,
      toIsoDay(finalSignedDate)
    );
    if (coefficientValidityError) {
      return { ok: false, error: coefficientValidityError };
    }
  }
  if (!shouldValidateLifecycle) return { ok: true };

  if (finalStatus === "storno" && !finalStornoDate) {
    return { ok: false, error: "Storno musí mít vyplněné datum storna." };
  }
  if (finalStatus !== "storno" && finalStornoDate) {
    return {
      ok: false,
      error: "Datum storna lze uložit jen ke smlouvě se stavem storno.",
    };
  }
  const stornoBoundaryDate = finalPolicyStartDate ?? finalSignedDate;
  if (finalStatus === "storno" && finalStornoDate && !stornoBoundaryDate) {
    return {
      ok: false,
      error: "Datum storna nelze ověřit bez data počátku nebo podpisu smlouvy.",
    };
  }
  if (
    finalStatus === "storno" &&
    finalStornoDate &&
    stornoBoundaryDate &&
    utcDayIndex(finalStornoDate) < utcDayIndex(stornoBoundaryDate)
  ) {
    return {
      ok: false,
      error:
        finalPolicyStartDate != null
          ? "Datum storna nesmí být před datem počátku smlouvy."
          : "Datum storna nesmí být před datem podpisu smlouvy.",
    };
  }

  return { ok: true };
};
