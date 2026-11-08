import { isRetiredProduct } from "@/app/lib/retiredProducts";
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
  "policyTermEndDate",
  "automaticRenewal",
  "premiumIndexationEnabled",
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

export const parsePolicyTermEndDate = (value: unknown):
  { ok: true; value: Date | null } | { ok: false; error: string } => {
  if (value == null || value === "") return { ok: true, value: null };
  const isoDate = typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(value) ? value : null;
  const date = value instanceof Date ? value : isoDate ? new Date(isoDate.length === 10 ? `${isoDate}T00:00:00.000Z` : isoDate) : null;
  if (!date || !isReasonableContractDate(date) ||
    (isoDate != null && (isoDate.length === 10 ? date.toISOString().slice(0, 10) : date.toISOString()) !== isoDate)) {
    return { ok: false, error: "Pole policyTermEndDate má neplatné datum." };
  }
  return { ok: true, value: date };
};

export const validateContractRenewal = ({ productKey, automaticRenewal, policyTermEndDate, policyStartDate, policyEndDate }: {
  productKey: unknown;
  automaticRenewal: unknown;
  policyTermEndDate: unknown;
  policyStartDate: Date | null;
  policyEndDate: Date | null;
}): ValidationResult => {
  if (automaticRenewal != null && typeof automaticRenewal !== "boolean") {
    return { ok: false, error: "Pole automaticRenewal musí být boolean nebo null." };
  }
  if (productKey !== "domexneuron" && (automaticRenewal != null || policyTermEndDate != null)) {
    return { ok: false, error: "Prolongaci lze uložit pouze k produktu DOMEX Neuron." };
  }
  const termEnd = toDate(policyTermEndDate);
  if (policyTermEndDate != null && (!termEnd || !isReasonableContractDate(termEnd) || !policyStartDate || termEnd < policyStartDate)) {
    return { ok: false, error: "Pole policyTermEndDate má neplatnou hodnotu." };
  }
  if (automaticRenewal === true && policyEndDate != null) {
    return { ok: false, error: "Smlouva s prolongací nesmí mít vyplněný konec smlouvy." };
  }
  if (automaticRenewal === false && (!policyEndDate || (termEnd && utcDayIndex(termEnd) !== utcDayIndex(policyEndDate)))) {
    return { ok: false, error: "Smlouva bez prolongace musí mít konec smlouvy shodný s koncem pojistného období." };
  }
  return { ok: true };
};

export const validateContractPremiumIndexation = ({ productKey, premiumIndexationEnabled }: {
  productKey: unknown;
  premiumIndexationEnabled: unknown;
}): ValidationResult => {
  if (premiumIndexationEnabled != null && typeof premiumIndexationEnabled !== "boolean") {
    return { ok: false, error: "Pole premiumIndexationEnabled musí být boolean nebo null." };
  }
  if (productKey !== "domexneuron" && premiumIndexationEnabled != null) {
    return { ok: false, error: "Valorizaci lze uložit pouze k produktu DOMEX Neuron." };
  }
  return { ok: true };
};

export const validateDomexNeuronDetailProduct = (productKey: unknown, detail: unknown): ValidationResult => {
  if (detail && typeof detail === "object" && Object.hasOwn(detail, "neuron") && productKey !== "domexneuron") {
    return { ok: false, error: "Model objektů domexDetail.neuron lze uložit pouze k produktu DOMEX Neuron." };
  }
  return { ok: true };
};

export const validateContractCoreInvariants = (
  existing: ContractDoc,
  patch: Record<string, unknown>
): ValidationResult => {
  if (isRetiredProduct(existing.productKey)) {
    return { ok: false, error: "Produkt již není podporován." };
  }
  if (hasOwn(patch, "domexDetail")) {
    const neuronDetailValidation = validateDomexNeuronDetailProduct(existing.productKey, patch.domexDetail);
    if (!neuronDetailValidation.ok) return neuronDetailValidation;
  }
  if (hasOwn(patch, "koopMajetekDetail") && patch.koopMajetekDetail != null && existing.productKey !== "koopmajetekobcan") {
    return { ok: false, error: "Údaje koopMajetekDetail lze uložit pouze k produktu Kooperativa majetek a odpovědnost občanů." };
  }
  if (hasOwn(patch, "koopOdzamDetail") && patch.koopOdzamDetail != null && existing.productKey !== "koopodzam") {
    return { ok: false, error: "Údaje koopOdzamDetail lze uložit pouze k produktu Kooperativa odpovědnost zaměstnance." };
  }
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
    const indexationValidation = validateContractPremiumIndexation({
      productKey: existing.productKey,
      premiumIndexationEnabled: hasOwn(patch, "premiumIndexationEnabled")
        ? patch.premiumIndexationEnabled : existing.premiumIndexationEnabled,
    });
    if (!indexationValidation.ok) return indexationValidation;
    const renewalValidation = validateContractRenewal({
      productKey: existing.productKey,
      automaticRenewal: hasOwn(patch, "automaticRenewal") ? patch.automaticRenewal : existing.automaticRenewal,
      policyTermEndDate: hasOwn(patch, "policyTermEndDate") ? patch.policyTermEndDate : existing.policyTermEndDate,
      policyStartDate: finalPolicyStartDate,
      policyEndDate: finalPolicyEndDate,
    });
    if (!renewalValidation.ok) return renewalValidation;
  }

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
      toIsoDay(finalSignedDate),
      existing.acquisitionType
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
