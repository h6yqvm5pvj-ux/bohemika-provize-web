import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { normalizeContractNumber } from "@/app/api/contracts/_lib/contractsApi.identity";
import { DOMEX_DETAIL_ALLOWED_KEYS, sanitizeDetailObject } from "@/app/api/contracts/_lib/contractsApi.createPayload";
import { isValidContractNumber, parsePolicyTermEndDate, validateContractCoreInvariants } from "@/app/api/contracts/_lib/contractsApi.validation";
import { clientIdentityKey } from "@/app/_klienti/clientIdentity";
import { toDate } from "@/app/lib/formatters";
import type { DomexPdfResult } from "@/app/lib/parseDomexPdf";
import { mergeEmptyContractFields, mergeEmptyPropertyDetailFields, PROPERTY_PDF_DETAIL_FIELD_MAP } from "@/app/smlouvy/[id]/contractDetailPdfReimport";
import type { ContractDoc as DetailContract } from "@/app/smlouvy/[id]/contractDetailTypes";

export type DomexNeuronPdfBackfillPlan = {
  status: "ready" | "unchanged";
  patch: Record<string, unknown>;
  changedKeys: string[];
  conflictKeys: string[];
} | {
  status: "rejected";
  reason: "unsupported-contract" | "identity-mismatch" | "invalid-pdf-data" | "invalid-current-data" | "invalid-merged-contract";
  conflictKeys: string[];
};

const CORE_FIELDS = ["contractSignedDate", "policyStartDate", "policyEndDate", "policyTermEndDate", "automaticRenewal", "premiumIndexationEnabled"] as const;
const DATE_FIELDS = new Set<string>(["contractSignedDate", "policyStartDate", "policyEndDate", "policyTermEndDate"]);
const DETAIL_ENUMS: Record<string, readonly string[]> = {
  propertyType: ["dum", "byt"], householdType: ["trvale", "rekreacni"],
  propertyCoverage: ["mini", "opti", "maxi", "nop"], householdCoverage: ["mini", "opti", "maxi", "nop"],
  propertyAssistance: ["basic", "plus"], householdAssistance: ["basic", "plus"],
};
const empty = (value: unknown) => value == null || (typeof value === "string" && !value.trim());
const canonical = (value: unknown): unknown => typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : value;
const isoDay = (value: unknown) => {
  const date = toDate(value);
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
};
const sameCore = (field: string, left: unknown, right: unknown) => DATE_FIELDS.has(field)
  ? isoDay(left) === isoDay(right)
  : left === right;

/** Pure plan only. The writer must independently authorize ownership, verify
 * PDF identity/hash and re-read the same contract version in its transaction.
 * Diagnostics intentionally contain field keys, never extracted values. */
export function planDomexNeuronPdfBackfill(current: ContractDoc, parsed: DomexPdfResult): DomexNeuronPdfBackfillPlan {
  const conflicts = new Set<string>();
  const reject = (reason: Extract<DomexNeuronPdfBackfillPlan, { status: "rejected" }>["reason"]): DomexNeuronPdfBackfillPlan =>
    ({ status: "rejected", reason, conflictKeys: [...conflicts].sort() });
  if (current.productKey !== "domexneuron" || (current.entryType != null && current.entryType !== "contract")) return reject("unsupported-contract");
  if (typeof current.contractNumber !== "string" || typeof parsed.contractNumber !== "string" ||
    typeof current.clientName !== "string" || typeof parsed.clientName !== "string" ||
    [current.contractNumber, parsed.contractNumber, current.clientName, parsed.clientName].some(value => /[\u0000-\u001f\u007f]/.test(value)) ||
    !isValidContractNumber(normalizeContractNumber(current.contractNumber)) ||
    !isValidContractNumber(normalizeContractNumber(parsed.contractNumber)) ||
    normalizeContractNumber(current.contractNumber) !== normalizeContractNumber(parsed.contractNumber) ||
    !clientIdentityKey(current.clientName) || clientIdentityKey(current.clientName) !== clientIdentityKey(parsed.clientName)) return reject("identity-mismatch");

  const coreInput: Record<string, unknown> = {};
  for (const field of CORE_FIELDS) {
    const raw = parsed[field];
    if (raw == null || raw === "") continue;
    if (DATE_FIELDS.has(field)) {
      const date = parsePolicyTermEndDate(raw);
      if (!date.ok || !date.value) return reject("invalid-pdf-data");
      coreInput[field] = date.value.toISOString().slice(0, 10);
    } else {
      if (typeof raw !== "boolean") return reject("invalid-pdf-data");
      coreInput[field] = raw;
    }
    if (!empty(current[field]) && !sameCore(field, current[field], coreInput[field])) conflicts.add(field);
  }

  const rawDetail: Record<string, unknown> = {};
  for (const [parsedKey, field] of PROPERTY_PDF_DETAIL_FIELD_MAP) {
    const raw = parsed[parsedKey as keyof DomexPdfResult];
    if (raw == null) continue;
    if (DETAIL_ENUMS[field]) {
      if (typeof raw !== "string" || !DETAIL_ENUMS[field].includes(raw)) return reject("invalid-pdf-data");
    } else if (/SumInsured$|Deductible$/.test(parsedKey)) {
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return reject("invalid-pdf-data");
    } else if (["liabilityMobile", "liabilityTenant", "liabilityLandlord", "assistancePlus"].includes(field)) {
      if (typeof raw !== "boolean") return reject("invalid-pdf-data");
    } else if (typeof raw !== "string" || /[\u0000-\u001f\u007f]/.test(raw)) return reject("invalid-pdf-data");
    rawDetail[field] = raw;
  }
  if (parsed.domexNeuron != null) rawDetail.neuron = parsed.domexNeuron;
  const incomingDetail = sanitizeDetailObject(rawDetail, "domexDetail", DOMEX_DETAIL_ALLOWED_KEYS);
  if (!incomingDetail.ok) return reject("invalid-pdf-data");
  const currentDetail = current.domexDetail ?? {};
  if (!sanitizeDetailObject(currentDetail, "domexDetail", DOMEX_DETAIL_ALLOWED_KEYS).ok) return reject("invalid-current-data");
  for (const [field, value] of Object.entries(incomingDetail.value ?? {})) {
    if (field === "neuron") continue;
    const previous = currentDetail[field as keyof typeof currentDetail];
    if (!empty(previous) && !empty(value) && canonical(previous) !== canonical(value)) conflicts.add(`domexDetail.${field}`);
  }

  const coreMerge = mergeEmptyContractFields(current as unknown as DetailContract, coreInput);
  const patch: Record<string, unknown> = {};
  const changedKeys: string[] = [];
  for (const field of CORE_FIELDS) {
    if (!(field in coreMerge.updates)) continue;
    if (field === "policyEndDate" && (current.automaticRenewal ?? coreMerge.updates.automaticRenewal) !== false) {
      conflicts.add(field);
      continue;
    }
    const raw = coreMerge.updates[field];
    if (DATE_FIELDS.has(field)) {
      const date = parsePolicyTermEndDate(raw);
      if (!date.ok || !date.value) return reject("invalid-pdf-data");
      patch[field] = date.value;
    } else patch[field] = raw;
    changedKeys.push(field);
  }
  // A printed term cannot silently clear a saved maturity or enable renewal
  // while that populated end date is retained by the additive-only policy.
  for (const field of CORE_FIELDS) {
    if (coreInput[field] !== undefined && empty(current[field]) && !(field in patch)) conflicts.add(field);
  }
  const propertyMerge = mergeEmptyPropertyDetailFields(currentDetail, parsed as Record<string, unknown>);
  for (const key of propertyMerge.conflictKeys ?? []) conflicts.add(`domexDetail.neuron.${key}`);
  const validatedMerged = sanitizeDetailObject(propertyMerge.detail, "domexDetail", DOMEX_DETAIL_ALLOWED_KEYS);
  if (!validatedMerged.ok) return reject("invalid-merged-contract");
  const detail = { ...currentDetail };
  for (const [field, value] of Object.entries(validatedMerged.value ?? {})) {
    const previous = currentDetail[field as keyof typeof currentDetail];
    if ((field === "neuron" ? JSON.stringify(previous) !== JSON.stringify(value) : empty(previous)) && !empty(value)) {
      (detail as Record<string, unknown>)[field] = value;
      changedKeys.push(`domexDetail.${field}`);
    }
  }
  if (changedKeys.some(field => field.startsWith("domexDetail."))) patch.domexDetail = detail;
  // Run full API core invariants even for a detail-only patch.
  if (!validateContractCoreInvariants(current, { ...patch,
    contractSignedDate: patch.contractSignedDate ?? current.contractSignedDate,
  }).ok) return reject("invalid-merged-contract");
  return { status: changedKeys.length ? "ready" : "unchanged", patch,
    changedKeys: changedKeys.sort(), conflictKeys: [...conflicts].sort() };
}
