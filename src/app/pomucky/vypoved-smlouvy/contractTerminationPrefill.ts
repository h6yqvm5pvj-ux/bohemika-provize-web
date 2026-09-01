import {
  isLifeProduct,
  PRODUCT_ORDER,
  productInstitutionLabel,
} from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import type {
  InsuranceType,
  TerminationReason,
} from "./universalTermination";

export type TerminationPrefillInsurer =
  | "ČPP"
  | "Kooperativa"
  | "Allianz"
  | "UNIQA"
  | "ČSOB"
  | "Direct"
  | "Pillow"
  | "Slavia"
  | "AXA"
  | "Generali"
  | "MetLife"
  | "NN"
  | "Maxima"
  | "Simplea";

export type ContractTerminationPrefill = {
  sourcePath: string;
  sourceProduct?: Product | null;
  contractNumber: string;
  policyholderName: string;
  personalId: string;
  address: string;
  phone: string;
  email: string;
  policyStartDate: string;
  contractSignedDate: string;
  insurer: TerminationPrefillInsurer | null;
  insuranceType: InsuranceType | null;
  reason: TerminationReason | null;
};

const STORAGE_PREFIX = "bohemika:contract-termination-prefill:";
const MAX_PREFILL_AGE_MS = 30 * 60 * 1000;
const PREFILL_KEY_RE = /^[a-zA-Z0-9-]{8,80}$/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TERMINATION_REASONS = new Set<TerminationReason>([
  "anniversary",
  "twoMonths",
  "agreement",
  "periodEnd",
  "postClaim",
  "otherReason",
]);

const SUPPORTED_INSURERS = new Set<TerminationPrefillInsurer>([
  "ČPP",
  "Kooperativa",
  "Allianz",
  "UNIQA",
  "ČSOB",
  "Direct",
  "Pillow",
  "Slavia",
  "AXA",
  "Generali",
  "MetLife",
  "NN",
  "Maxima",
  "Simplea",
]);
const SUPPORTED_PRODUCTS = new Set<Product>(PRODUCT_ORDER);
const CPP_SUS_UPLOAD_NOTICE_PRODUCTS = new Set<Product>([
  "domex",
  "cpphafan",
  "zamex",
  "cppsimplex",
]);

const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanPersonalId = (value: unknown): string => {
  const normalized = cleanText(value, 30);
  const compact = normalized.replace(/\s+/g, "");
  return /^\d{8}$/.test(compact) ? compact : normalized;
};

const cleanIsoDay = (value: unknown): string => {
  const normalized = cleanText(value, 10);
  return ISO_DAY_RE.test(normalized) ? normalized : "";
};

export function normalizeTerminationPrefillInsurer(
  value: unknown,
): TerminationPrefillInsurer | null {
  const normalized = cleanText(value, 40).toLocaleLowerCase("cs-CZ");
  const aliases: Record<string, TerminationPrefillInsurer> = {
    cpp: "ČPP",
    "čpp": "ČPP",
    kooperativa: "Kooperativa",
    allianz: "Allianz",
    uniqa: "UNIQA",
    csob: "ČSOB",
    "čsob": "ČSOB",
    direct: "Direct",
    pillow: "Pillow",
    slavia: "Slavia",
    axa: "AXA",
    generali: "Generali",
    metlife: "MetLife",
    nn: "NN",
    maxima: "Maxima",
    simplea: "Simplea",
  };
  return aliases[normalized] ?? null;
}

export function resolveContractTerminationProductDefaults(
  product: Product | null | undefined,
): {
  insurer: TerminationPrefillInsurer | null;
  insuranceType: InsuranceType | null;
} {
  if (!product) return { insurer: null, insuranceType: null };
  return {
    insurer: normalizeTerminationPrefillInsurer(productInstitutionLabel(product)),
    insuranceType: isLifeProduct(product) ? "life" : "nonLife",
  };
}

export function isCppSusUploadNoticeProduct(
  product: Product | null | undefined,
): boolean {
  return product ? CPP_SUS_UPLOAD_NOTICE_PRODUCTS.has(product) : false;
}

export function normalizeContractTerminationPrefill(
  value: unknown,
): ContractTerminationPrefill | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const insurer = normalizeTerminationPrefillInsurer(raw.insurer);
  const insuranceType =
    raw.insuranceType === "life" || raw.insuranceType === "nonLife"
      ? raw.insuranceType
      : null;
  const supportedInsuranceType =
    insurer === "Direct" && insuranceType === "life" ? null : insuranceType;
  const reason = TERMINATION_REASONS.has(raw.reason as TerminationReason)
    ? (raw.reason as TerminationReason)
    : null;
  const sourcePath = cleanText(raw.sourcePath, 220);
  const sourceProductRaw = cleanText(raw.sourceProduct, 60) as Product;
  const sourceProduct = SUPPORTED_PRODUCTS.has(sourceProductRaw)
    ? sourceProductRaw
    : null;

  return {
    sourcePath: sourcePath.startsWith("/smlouvy/") ? sourcePath : "",
    ...(sourceProduct ? { sourceProduct } : {}),
    contractNumber: cleanText(raw.contractNumber, 90),
    policyholderName: cleanText(raw.policyholderName, 120),
    personalId: cleanPersonalId(raw.personalId),
    address: cleanText(raw.address, 220),
    phone: cleanText(raw.phone, 50),
    email: cleanText(raw.email, 160),
    policyStartDate: cleanIsoDay(raw.policyStartDate),
    contractSignedDate: cleanIsoDay(raw.contractSignedDate),
    insurer: insurer && SUPPORTED_INSURERS.has(insurer) ? insurer : null,
    insuranceType: supportedInsuranceType,
    reason,
  };
}

export function getContractTerminationPdfFieldDefaults(
  prefill: ContractTerminationPrefill,
): Record<string, string> {
  return {
    contractNumber: prefill.contractNumber,
    policyholderName: prefill.policyholderName,
    personalId: prefill.personalId,
    policyholderBirthNumber: prefill.personalId,
    identifiedName: prefill.policyholderName,
    identifiedBirthNumber: prefill.personalId,
    address: prefill.address,
    policyholderResidence: prefill.address,
    identifiedResidence: prefill.address,
  };
}

export function storeContractTerminationPrefill(
  value: ContractTerminationPrefill,
): string | null {
  if (typeof window === "undefined") return null;
  const payload = normalizeContractTerminationPrefill(value);
  if (!payload) return null;

  const key =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ version: 1, createdAtMs: Date.now(), payload }),
    );
    return key;
  } catch {
    return null;
  }
}

export function consumeContractTerminationPrefill(
  key: string | null,
): ContractTerminationPrefill | null {
  if (typeof window === "undefined" || !key || !PREFILL_KEY_RE.test(key)) {
    return null;
  }

  try {
    const storageKey = `${STORAGE_PREFIX}${key}`;
    const serialized = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    if (!serialized) return null;

    const stored = JSON.parse(serialized) as Record<string, unknown>;
    const createdAtMs =
      typeof stored.createdAtMs === "number" ? stored.createdAtMs : 0;
    if (
      stored.version !== 1 ||
      !Number.isFinite(createdAtMs) ||
      Date.now() - createdAtMs > MAX_PREFILL_AGE_MS
    ) {
      return null;
    }
    return normalizeContractTerminationPrefill(stored.payload);
  } catch {
    return null;
  }
}
