// src/app/api/contracts/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import { toDate } from "@/app/lib/formatters";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type ContractDoc = {
  id: string;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;
  note?: string | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: string | null;
  managerChain?: { email?: string | null; position?: Position | null; commissionMode?: string | null }[];
  managerOverrides?: { email?: string | null; position?: Position | null; commissionMode?: string | null; items?: any[]; total?: number | null }[];
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  parentContractEntryPath?: string | null;

  productKey?: Product;
  position?: Position | null;
  inputAmount?: number;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | number | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | number | null;
  policyStartDate?: FirestoreTimestamp | Date | string | number | null;
};

type ContractResponseItem = ContractDoc & { adviserEmail: string | null };

type ContractOwnerMeta = {
  position: Position | null;
  managerEmail: string | null;
  managerPosition: Position | null;
  currentChainEmails: string[];
};

type ContractDetailResponse = {
  ok: true;
  mode: "detail";
  position: Position | null;
  hasTeam: boolean;
  teamEmails: string[];
  contract: ContractResponseItem;
  timeline: ContractResponseItem[];
  ownerMeta: ContractOwnerMeta;
};

type ContractsResponse = {
  ok: true;
  scope: "my" | "team";
  position: Position | null;
  hasTeam: boolean;
  teamEmails: string[];
  contracts: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
  teamContracts?: ContractResponseItem[];
  teamHasMore?: boolean;
  teamNextCursor?: number | null;
  teamNextCursorToken?: string | null;
};

type ErrorResponse = { ok: false; error: string };
type UserNode = {
  email: string;
  managerEmail: string | null;
  position: Position | null;
};
type UserTreeResult = {
  users: UserNode[];
  childrenByManager: Map<string, UserNode[]>;
};

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 50;
const CONTRACTS_MUTATION_RATE_LIMIT = 60;
const CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;
const UPDATE_FIELDS_MAX_ENTRY_IDS = 50;
const USER_TREE_CACHE_TTL_MS = 30_000;
const CONTRACT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$/;
const REPLACEMENT_STORNO_PRODUCTS = new Set<Product>([
  "zamex",
  "domex",
  "koopmajetekobcan",
  "maxdomov",
  "cppsimplex",
  "cppPPRbez",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
]);
const CPP_STATUS_SYNC_PRODUCTS = new Set<Product>([
  "neon",
  "zamex",
  "domex",
  "cppsimplex",
  "cppAuto",
  "cppPPRs",
  "cppPPRbez",
  "cppcestovko",
]);
const LIFE_TIMELINE_PRODUCTS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
]);
const UPDATE_DATE_FIELDS = new Set<string>([
  "createdAt",
  "contractSignedDate",
  "policyStartDate",
  "stornoDate",
  "refreshReplacedBySignedDate",
  "replacementReplacedBySignedDate",
]);
const UPDATE_FIELDS_ALLOWED_DATE_FIELDS = new Set<string>([
  "contractSignedDate",
  "policyStartDate",
  "stornoDate",
]);
const UPDATE_FIELDS_ALLOWED_TOP_LEVEL_FIELDS = new Set<string>([
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientAddress",
  "contractNumber",
  "contractSignedDate",
  "policyStartDate",
  "carMake",
  "carPlate",
  "carVin",
  "carTp",
  "carLiabilityLimit",
  "carHullSumInsured",
  "carHullDeductible",
  "carAssistancePlan",
  "carAddonGlass",
  "carAddonAnimalCollision",
  "carAddonAnimalDamage",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonNatural",
  "carAddonOwnDamage",
  "carAddonGap",
  "carAddonSmartGap",
  "carAddonServisPro",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonPassengerInjury",
  "neonDetail",
  "flexiDetail",
  "domexDetail",
  "durationYears",
  "note",
  "status",
  "stornoDate",
]);
const UPDATE_FIELDS_REQUIRED_TEXT_FIELDS = new Set<string>([
  "clientName",
]);
const UPDATE_FIELDS_OPTIONAL_TEXT_FIELDS = new Set<string>([
  "clientEmail",
  "clientPhone",
  "clientAddress",
  "carMake",
  "carPlate",
  "carVin",
  "carTp",
  "carAssistancePlan",
  "note",
]);
const UPDATE_FIELDS_OPTIONAL_NUMBER_FIELDS = new Set<string>([
  "carLiabilityLimit",
  "carHullSumInsured",
  "carHullDeductible",
]);
const UPDATE_FIELDS_OPTIONAL_BOOLEAN_FIELDS = new Set<string>([
  "carAddonGlass",
  "carAddonAnimalCollision",
  "carAddonAnimalDamage",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonNatural",
  "carAddonOwnDamage",
  "carAddonGap",
  "carAddonSmartGap",
  "carAddonServisPro",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonPassengerInjury",
]);
const UPDATE_FIELDS_CONTRACT_CORE_KEYS = new Set<string>([
  "clientName",
  "contractNumber",
  "contractSignedDate",
  "policyStartDate",
]);
const NEON_DETAIL_ALLOWED_KEYS = new Set<string>([
  "version",
  "deathType",
  "deathAmount",
  "death2Type",
  "death2Amount",
  "deathTerminalAmount",
  "waiverInvalidity",
  "waiverUnemployment",
  "invalidityAType",
  "invalidityA1",
  "invalidityA2",
  "invalidityA3",
  "invalidityBType",
  "invalidityB1",
  "invalidityB2",
  "invalidityB3",
  "invalidityPension",
  "criticalIllnessType",
  "criticalIllnessAmount",
  "childSurgeryAmount",
  "vaccinationCompAmount",
  "accidentDailyBenefit",
  "diabetesAmount",
  "deathAccidentAmount",
  "injuryPermanentAmount",
  "hospitalizationAmount",
  "hospitalizationIllnessAmount",
  "hospitalizationInjuryAmount",
  "workIncapacityStart",
  "workIncapacityBackpay",
  "workIncapacityAmount",
  "workIncapacityInjury",
  "workIncapacityIllness",
  "careDependencyAmount",
  "specialAidAmount",
  "caregivingAmount",
  "reproductionCostAmount",
  "cppHelp",
  "liabilityCitizenLimit",
  "liabilityEmployeeLimit",
  "travelInsurance",
  "neonPdfRisks",
]);
const FLEXI_DETAIL_ALLOWED_KEYS = new Set<string>([
  "deathAmount",
  "deathTypedType",
  "deathTypedAmount",
  "deathAccidentAmount",
  "seriousIllnessType",
  "seriousIllnessAmount",
  "seriousIllnessForHim",
  "seriousIllnessForHer",
  "permanentIllnessAmount",
  "invalidityIllnessType",
  "invalidityIllness1",
  "invalidityIllness2",
  "invalidityIllness3",
  "hospitalGeneralAmount",
  "workIncapacityStart",
  "workIncapacityBackpay",
  "workIncapacityAmount",
  "caregivingAmount",
  "permanentAccidentAmount",
  "injuryDamageAmount",
  "accidentDailyBenefit",
  "hospitalAccidentAmount",
  "invalidityAccidentType",
  "invalidityAccident1",
  "invalidityAccident2",
  "invalidityAccident3",
  "trafficDeathAccidentAmount",
  "trafficPermanentAccidentAmount",
  "trafficInjuryDamageAmount",
  "trafficAccidentDailyBenefit",
  "trafficHospitalAccidentAmount",
  "trafficWorkIncapacityAmount",
  "trafficInvalidityAmount",
  "loanDeathAmount",
  "loanInvalidityType",
  "loanInvalidity1",
  "loanInvalidity2",
  "loanInvalidity3",
  "loanIllnessAmount",
  "loanWorkIncapacityAmount",
  "addonMajakBasic",
  "addonMajakPlus",
  "addonLiabilityCitizen",
  "addonTravel",
]);
const DOMEX_DETAIL_ALLOWED_KEYS = new Set<string>([
  "address",
  "propertyType",
  "propertyCoverage",
  "sumInsured",
  "deductible",
  "householdType",
  "householdCoverage",
  "householdSumInsured",
  "householdDeductible",
  "outbuildingSumInsured",
  "liabilitySumInsured",
  "liabilityDeductible",
  "liabilityMobile",
  "liabilityTenant",
  "liabilityLandlord",
  "assistancePlus",
  "note",
]);
const MIN_REASONABLE_CONTRACT_DATE = new Date("2000-01-01T00:00:00.000Z");
const MAX_REASONABLE_CONTRACT_DATE = new Date("2101-01-01T00:00:00.000Z");
const CPP_WSEXTRA_URL = "https://wsextra.cpp.cz/extranet/extranet.asmx";
const CPP_SOAP_ACTION_STAV_SMLOUVY_ZP = "https://extranet.cpp.cz/StavSmlouvyZP";

let cachedUserTree: { value: UserTreeResult; expiresAtMs: number } | null = null;
let cachedUserTreePromise: Promise<UserTreeResult> | null = null;

const isManagerPosition = (pos: Position | null | undefined): boolean =>
  Boolean(pos) && (pos as Position).startsWith("manazer");

const toMillis = (value: any): number | null => {
  const d = toDate(value);
  return d ? d.getTime() : null;
};

const contractSortDate = (data: ContractDoc): Date | null =>
  toDate(data.contractSignedDate) ?? toDate(data.createdAt);

const timelineSortDate = (data: ContractDoc): Date | null =>
  toDate(data.policyStartDate) ?? toDate(data.contractSignedDate) ?? toDate(data.createdAt);

type ParsedCursor = {
  date: Date;
  ts: number;
  key: string | null;
};

const encodeCursorToken = (ts: number, key: string) =>
  `${ts}::${encodeURIComponent(key)}`;

const contractCursorKey = (ownerEmail: string, docId: string) =>
  `${normalizeEmail(ownerEmail)}___${docId}`;

const responseCursorKey = (item: ContractResponseItem) =>
  contractCursorKey(
    normalizeEmail(item.adviserEmail ?? item.userEmail ?? ""),
    item.id
  );

const safeDecodeCursorKey = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const parseCursor = (search: URLSearchParams): ParsedCursor | null => {
  const raw = search.get("cursor");
  if (!raw) return null;
  const sep = raw.indexOf("::");
  if (sep > 0) {
    const ts = Number(raw.slice(0, sep));
    if (Number.isFinite(ts)) {
      const date = new Date(ts);
      if (!Number.isNaN(date.getTime())) {
        const keyPart = raw.slice(sep + 2);
        const key = keyPart ? safeDecodeCursorKey(keyPart) : null;
        if (keyPart && key == null) return null;
        return { date, ts, key };
      }
    }
  }
  const num = Number(raw);
  if (Number.isFinite(num)) {
    const d = new Date(num);
    if (!Number.isNaN(d.getTime())) {
      return { date: d, ts: d.getTime(), key: null };
    }
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, ts: d.getTime(), key: null };
};

const normalizeEmail = (email: string | null | undefined) =>
  (email ?? "").trim().toLowerCase();

const isValidContractNumber = (value: string) =>
  CONTRACT_NUMBER_RE.test(value);

const extractEmailFromUnknown = (value: unknown): string => {
  if (typeof value === "string") return normalizeEmail(value);
  if (value && typeof value === "object") {
    const nested = (value as { email?: string | null }).email;
    return normalizeEmail(nested);
  }
  return "";
};

const includesEmailInCollection = (value: unknown, targetEmail: string): boolean => {
  if (!Array.isArray(value) || !targetEmail) return false;
  return value.some((item) => extractEmailFromUnknown(item) === targetEmail);
};

const hasContractAccess = ({
  viewerEmail,
  teamEmails,
  ownerEmail,
  contract,
}: {
  viewerEmail: string;
  teamEmails: string[];
  ownerEmail: string;
  contract: ContractDoc;
}): boolean => {
  if (!viewerEmail || !ownerEmail) return false;
  if (viewerEmail === ownerEmail) return true;
  if (teamEmails.includes(ownerEmail)) return true;

  const contractOwnerEmail = normalizeEmail(contract.userEmail);
  if (contractOwnerEmail && contractOwnerEmail === viewerEmail) return true;

  const managerEmailSnapshot = normalizeEmail(contract.managerEmailSnapshot as string | null);
  if (managerEmailSnapshot && managerEmailSnapshot === viewerEmail) return true;

  if (includesEmailInCollection(contract.managerChain, viewerEmail)) return true;
  if (includesEmailInCollection(contract.managerOverrides, viewerEmail)) return true;

  return false;
};

const toContractResponseItem = (
  docId: string,
  ownerEmail: string,
  data: ContractDoc
): ContractResponseItem => {
  const normalizedOwner = normalizeEmail(ownerEmail);
  return {
    ...data,
    contractSignedDate: toMillis(data.contractSignedDate),
    createdAt: toMillis(data.createdAt),
    policyStartDate: toMillis((data as any).policyStartDate),
    stornoDate: toMillis((data as any).stornoDate),
    id: docId,
    adviserEmail: normalizedOwner,
    userEmail: normalizeEmail(data.userEmail) || normalizedOwner,
  };
};

const normalizeRootEntryId = (entry: ContractDoc): string => {
  const raw =
    entry.rootContractEntryId ??
    (entry.entryType === "endorsement" ? entry.parentContractEntryId : entry.id) ??
    entry.id;
  return typeof raw === "string" ? raw.trim() : "";
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const parseRequiredTrimmedText = (
  value: unknown,
  field: string,
  maxLen: number
): ParseResult<string> => {
  if (typeof value !== "string") {
    return { ok: false, error: `Pole ${field} musí být text.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `Pole ${field} nesmí být prázdné.` };
  }
  if (trimmed.length > maxLen) {
    return { ok: false, error: `Pole ${field} je příliš dlouhé.` };
  }
  return { ok: true, value: trimmed };
};

const parseOptionalTrimmedText = (
  value: unknown,
  field: string,
  maxLen: number
): ParseResult<string | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `Pole ${field} musí být text nebo null.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLen) {
    return { ok: false, error: `Pole ${field} je příliš dlouhé.` };
  }
  return { ok: true, value: trimmed };
};

const parseOptionalFiniteNumber = (
  value: unknown,
  field: string,
  {
    min = 0,
    max = 1_000_000_000,
  }: { min?: number; max?: number } = {}
): ParseResult<number | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `Pole ${field} musí být číslo nebo null.` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `Pole ${field} je mimo povolený rozsah.` };
  }
  return { ok: true, value };
};

const parseOptionalBoolean = (
  value: unknown,
  field: string
): ParseResult<boolean | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "boolean") {
    return { ok: false, error: `Pole ${field} musí být boolean nebo null.` };
  }
  return { ok: true, value };
};

const parseOptionalInteger = (
  value: unknown,
  field: string,
  { min, max }: { min: number; max: number }
): ParseResult<number | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: `Pole ${field} musí být celé číslo nebo null.` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `Pole ${field} je mimo povolený rozsah.` };
  }
  return { ok: true, value };
};

const parseContractStatus = (value: unknown): ParseResult<"active" | "storno"> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole status musí být text." };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized !== "active" && normalized !== "storno") {
    return { ok: false, error: "Pole status má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized as "active" | "storno" };
};

const sanitizeDetailObject = (
  value: unknown,
  field: "neonDetail" | "flexiDetail" | "domexDetail",
  allowedKeys: Set<string>
): ParseResult<Record<string, string | number | boolean | null> | null> => {
  if (value == null) return { ok: true, value: null };
  if (!isPlainObject(value)) {
    return { ok: false, error: `Pole ${field} musí být objekt nebo null.` };
  }

  const output: Record<string, string | number | boolean | null> = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        error: `Pole ${field}.${key} není povolené.`,
      };
    }
  }

  for (const key of keys) {
    const raw = value[key];
    if (raw == null) {
      output[key] = null;
      continue;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      const maxLen = key === "note" ? 2_000 : 200;
      if (trimmed.length > maxLen) {
        return {
          ok: false,
          error: `Pole ${field}.${key} je příliš dlouhé.`,
        };
      }
      output[key] = trimmed || null;
      continue;
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0 || raw > 1_000_000_000) {
        return {
          ok: false,
          error: `Pole ${field}.${key} má neplatnou číselnou hodnotu.`,
        };
      }
      output[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      output[key] = raw;
      continue;
    }
    return {
      ok: false,
      error: `Pole ${field}.${key} má nepodporovaný datový typ.`,
    };
  }

  return { ok: true, value: output };
};

const isReasonableContractDate = (value: Date): boolean =>
  value >= MIN_REASONABLE_CONTRACT_DATE && value < MAX_REASONABLE_CONTRACT_DATE;

const validateContractCoreInvariants = (
  existing: ContractDoc,
  patch: Record<string, unknown>
): { ok: true } | { ok: false; error: string } => {
  const shouldValidate = [...UPDATE_FIELDS_CONTRACT_CORE_KEYS].some((key) =>
    hasOwn(patch, key)
  );
  if (!shouldValidate) return { ok: true };

  const finalClientName = hasOwn(patch, "clientName")
    ? patch.clientName
    : existing.clientName;
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

  return { ok: true };
};

const toDateForUpdateField = (
  field: string,
  value: unknown
): { ok: true; value: Date | null } | { ok: false; error: string } => {
  if (!UPDATE_DATE_FIELDS.has(field)) {
    return { ok: true, value: null };
  }

  if (value == null || value === "") {
    return { ok: true, value: null };
  }

  const tryDate =
    value instanceof Date
      ? value
      : typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
      ? parseCzechDate(value) ?? new Date(value)
      : null;

  if (!tryDate || Number.isNaN(tryDate.getTime())) {
    return { ok: false, error: `Pole ${field} má neplatné datum.` };
  }

  return { ok: true, value: tryDate };
};

const normalizePatchUpdates = (
  updates: Record<string, unknown>
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } => {
  const unknownFields = Object.keys(updates).filter(
    (field) => !UPDATE_FIELDS_ALLOWED_TOP_LEVEL_FIELDS.has(field)
  );
  if (unknownFields.length > 0) {
    return {
      ok: false,
      error: `Nepovolená pole v updates: ${unknownFields.join(", ")}.`,
    };
  }

  const normalized: Record<string, unknown> = {};
  for (const [field, rawValue] of Object.entries(updates)) {
    if (UPDATE_FIELDS_ALLOWED_DATE_FIELDS.has(field)) {
      const parsedDate = toDateForUpdateField(field, rawValue);
      if (!parsedDate.ok) return parsedDate;
      normalized[field] = parsedDate.value;
      continue;
    }

    if (field === "contractNumber") {
      const parsed = parseRequiredTrimmedText(rawValue, field, 120);
      if (!parsed.ok) return parsed;
      if (!isValidContractNumber(parsed.value)) {
        return { ok: false, error: "Pole contractNumber má neplatný formát." };
      }
      normalized[field] = parsed.value;
      continue;
    }

    if (UPDATE_FIELDS_REQUIRED_TEXT_FIELDS.has(field)) {
      const parsed = parseRequiredTrimmedText(rawValue, field, 200);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (UPDATE_FIELDS_OPTIONAL_TEXT_FIELDS.has(field)) {
      const maxLen = field === "note" ? 2_000 : 200;
      const parsed = parseOptionalTrimmedText(rawValue, field, maxLen);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (UPDATE_FIELDS_OPTIONAL_NUMBER_FIELDS.has(field)) {
      const parsed = parseOptionalFiniteNumber(rawValue, field);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (UPDATE_FIELDS_OPTIONAL_BOOLEAN_FIELDS.has(field)) {
      const parsed = parseOptionalBoolean(rawValue, field);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "durationYears") {
      const parsed = parseOptionalInteger(rawValue, field, { min: 1, max: 120 });
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "status") {
      const parsed = parseContractStatus(rawValue);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "neonDetail") {
      const parsed = sanitizeDetailObject(rawValue, field, NEON_DETAIL_ALLOWED_KEYS);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "flexiDetail") {
      const parsed = sanitizeDetailObject(rawValue, field, FLEXI_DETAIL_ALLOWED_KEYS);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "domexDetail") {
      const parsed = sanitizeDetailObject(rawValue, field, DOMEX_DETAIL_ALLOWED_KEYS);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    return { ok: false, error: `Pole ${field} není podporované.` };
  }
  return { ok: true, payload: normalized };
};

type CppStavSmlouvyItem = {
  contractNumber: string;
  status: string;
  endDate: string | null;
};

const normalizeContractNumber = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, "").trim();

const normalizeContractNumberLoose = (value: string | null | undefined): string =>
  normalizeContractNumber(value).replace(/^0+/, "");

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const extractXmlBlocks = (xml: string, tag: string): string[] => {
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`,
    "gi"
  );
  const out: string[] = [];
  let match = pattern.exec(xml);
  while (match) {
    out.push(decodeXmlEntities((match[1] ?? "").trim()));
    match = pattern.exec(xml);
  }
  return out;
};

const extractXmlFirst = (xml: string, tag: string): string | null => {
  const values = extractXmlBlocks(xml, tag);
  return values.length > 0 ? values[0] : null;
};

const parseSoapBool = (value: string | null): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
};

const parseCzechDate = (value: string | null | undefined): Date | null => {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const m = raw.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4] ?? "0");
    const minute = Number(m[5] ?? "0");
    const second = Number(m[6] ?? "0");
    const parsed = new Date(year, month - 1, day, hour, minute, second);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
};

const normalizeCppContractState = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

async function fetchCppStavSmlouvyZp({
  idPartner,
  dateFrom,
}: {
  idPartner: string;
  dateFrom: string;
}): Promise<{ items: CppStavSmlouvyItem[]; errors: string[] }> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <StavSmlouvyZP xmlns="https://extranet.cpp.cz/">
      <IDpartner>${idPartner}</IDpartner>
      <DatumPodpisuOd>${dateFrom}</DatumPodpisuOd>
      <stavSmlouvy>VSE</stavSmlouvy>
      <list>true</list>
    </StavSmlouvyZP>
  </soap:Body>
</soap:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(CPP_WSEXTRA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${CPP_SOAP_ACTION_STAV_SMLOUVY_ZP}"`,
      },
      body: envelope,
      cache: "no-store",
      signal: controller.signal,
    });

    const xml = await response.text();
    if (!response.ok) {
      throw new Error(`ČPP WS HTTP ${response.status}.`);
    }

    const statusDetails = extractXmlBlocks(xml, "StatusDetail");
    const errors: string[] = [];
    for (const statusDetail of statusDetails) {
      const ok = parseSoapBool(extractXmlFirst(statusDetail, "PrubehOK"));
      if (ok !== false) continue;
      const popis = extractXmlFirst(statusDetail, "Popis");
      errors.push(popis || "ČPP WS vrátila chybu bez detailu.");
    }
    if (errors.length > 0) {
      return { items: [], errors };
    }

    const itemBlocks = extractXmlBlocks(xml, "StavSmlZPItem");
    const items = itemBlocks
      .map((block) => {
        const contractNumber = normalizeContractNumber(
          extractXmlFirst(block, "CISLO_SMLOUVY")
        );
        const status = (extractXmlFirst(block, "STAV_SMLOUVY") ?? "").trim();
        const endDate = extractXmlFirst(block, "DATUM_KONCE");
        return {
          contractNumber,
          status,
          endDate: endDate ? endDate.trim() : null,
        };
      })
      .filter((item) => item.contractNumber.length > 0);

    return { items, errors: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function findCppStatusItemByContractNumber(
  items: CppStavSmlouvyItem[],
  contractNumber: string
): CppStavSmlouvyItem | null {
  const exact = normalizeContractNumber(contractNumber);
  if (!exact) return null;

  const exactMatch = items.find((item) => normalizeContractNumber(item.contractNumber) === exact);
  if (exactMatch) return exactMatch;

  const loose = normalizeContractNumberLoose(contractNumber);
  if (!loose) return null;
  return (
    items.find(
      (item) => normalizeContractNumberLoose(item.contractNumber) === loose
    ) ?? null
  );
}

const buildUserTree = async (): Promise<UserTreeResult> => {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const snap = await adminDb.collection("users").get();
  const users: UserNode[] = [];

  snap.forEach((doc) => {
    const data = doc.data() as any;
    const email = normalizeEmail((data.email as string | undefined) ?? doc.id);
    if (!email) return;
    const managerEmail = normalizeEmail(data.managerEmail as string | undefined);
    const position = (data.position as Position | null | undefined) ?? null;
    users.push({ email, managerEmail: managerEmail || null, position });
  });

  const childrenByManager = buildChildrenByManager(users);
  return { users, childrenByManager };
};

const getCachedUserTree = async (): Promise<UserTreeResult> => {
  const now = Date.now();
  if (cachedUserTree && cachedUserTree.expiresAtMs > now) {
    return cachedUserTree.value;
  }

  if (cachedUserTreePromise) {
    return cachedUserTreePromise;
  }

  cachedUserTreePromise = buildUserTree()
    .then((value) => {
      cachedUserTree = {
        value,
        expiresAtMs: Date.now() + USER_TREE_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      cachedUserTreePromise = null;
    });

  return cachedUserTreePromise;
};

async function fetchContractsForOwners(
  owners: string[],
  cursor: ParsedCursor | null,
  pageSize: number
): Promise<{
  list: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
}> {
  // Fetch one extra record to detect if more pages exist (so the UI can show the load-more button)
  const pageLimit = pageSize + 1;
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const db = adminDb;
  const collected: ContractResponseItem[] = [];
  const seen = new Set<string>();
  let collectionGroupFailed = false;
  const shouldUseCollectionGroup = owners.length > 1;
  const cursorTs = cursor?.ts ?? null;
  const cursorKey = cursor?.key ?? null;

  const shouldIncludeByCursor = (
    data: ContractDoc,
    docId: string,
    ownerEmail: string
  ): boolean => {
    if (!cursorTs) return true;
    const sortDate = contractSortDate(data);
    if (!sortDate) return false;
    const ts = sortDate.getTime();
    if (ts < cursorTs) return true;
    if (ts > cursorTs) return false;
    if (!cursorKey) return false;
    const itemKey = contractCursorKey(ownerEmail, docId);
    return itemKey < cursorKey;
  };

  const pushCollected = (docId: string, ownerEmail: string, data: ContractDoc) => {
    if (!shouldIncludeByCursor(data, docId, ownerEmail)) return;
    const key = `${ownerEmail}___${docId}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({
      ...data,
      contractSignedDate: toMillis(data.contractSignedDate),
      createdAt: toMillis(data.createdAt),
      policyStartDate: toMillis((data as any).policyStartDate),
      stornoDate: toMillis((data as any).stornoDate),
      id: docId,
      adviserEmail: ownerEmail,
      userEmail: data.userEmail ?? ownerEmail,
    });
  };

  // collectionGroup queries (userEmail stored)
  // Pull by both date fields so records without contractSignedDate are still included.
  if (shouldUseCollectionGroup) {
    for (let i = 0; i < owners.length; i += 10) {
      const chunk = owners.slice(i, i + 10);
      try {
        let qBySigned = db
          .collectionGroup("entries")
          .where("userEmail", "in", chunk)
          .orderBy("contractSignedDate", "desc");
        let qByCreated = db
          .collectionGroup("entries")
          .where("userEmail", "in", chunk)
          .orderBy("createdAt", "desc");
        if (cursor) {
          qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
          qByCreated = qByCreated.where("createdAt", "<=", cursor.date);
        }

        const [signedSnap, createdSnap] = await Promise.all([
          qBySigned.limit(pageLimit).get(),
          qByCreated.limit(pageLimit).get(),
        ]);

        const consumeSnap = (snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => {
          snap.docs.forEach((doc) => {
            const data = doc.data() as any as ContractDoc;
            const ownerEmail = normalizeEmail(
              (data.userEmail as string | undefined) ??
                doc.ref.parent.parent?.id ??
                chunk[0]
            );
            pushCollected(doc.id, ownerEmail, data);
          });
        };

        consumeSnap(signedSnap);
        consumeSnap(createdSnap);
      } catch {
        // Keep the endpoint functional even when collectionGroup index is missing/misconfigured.
        collectionGroupFailed = true;
        break;
      }
    }
  }

  if (collectionGroupFailed) {
    collected.length = 0;
    seen.clear();
  }

  // fallback: per-user path (covers records without userEmail)
  for (let i = 0; i < owners.length; i += 10) {
    const ownerChunk = owners.slice(i, i + 10);
    const chunkResults = await Promise.all(
      ownerChunk.map(async (owner) => {
        try {
          let qBySigned = db
            .collection("users")
            .doc(owner)
            .collection("entries")
            .orderBy("contractSignedDate", "desc");
          let qByCreated = db
            .collection("users")
            .doc(owner)
            .collection("entries")
            .orderBy("createdAt", "desc");
          if (cursor) {
            qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
            qByCreated = qByCreated.where("createdAt", "<=", cursor.date);
          }

          const [signedSnap, createdSnap] = await Promise.all([
            qBySigned.limit(pageLimit).get(),
            qByCreated.limit(pageLimit).get(),
          ]);

          return { owner, signedSnap, createdSnap };
        } catch {
          // Ignore one broken owner branch instead of failing the whole response.
          return null;
        }
      })
    );

    chunkResults.forEach((result) => {
      if (!result) return;

      const consumeSnap = (snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => {
        snap.docs.forEach((doc) => {
          const data = doc.data() as any as ContractDoc;
          pushCollected(doc.id, result.owner, data);
        });
      };

      consumeSnap(result.signedSnap);
      consumeSnap(result.createdSnap);
    });
  }

  collected.sort((a, b) => {
    const da = contractSortDate(a);
    const db = contractSortDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const diff = db.getTime() - da.getTime();
    if (diff !== 0) return diff;
    const keyA = responseCursorKey(a);
    const keyB = responseCursorKey(b);
    if (keyA === keyB) return 0;
    return keyA > keyB ? -1 : 1;
  });

  const page = collected.slice(0, pageSize);
  const hasMore = collected.length > pageSize;
  const oldest = page.length > 0 ? contractSortDate(page[page.length - 1]) : null;
  const oldestKey =
    page.length > 0 ? responseCursorKey(page[page.length - 1]) : null;
  const nextCursor = oldest ? oldest.getTime() : null;
  const nextCursorToken =
    oldest && oldestKey ? encodeCursorToken(oldest.getTime(), oldestKey) : null;

  return {
    list: page,
    hasMore,
    nextCursor,
    nextCursorToken,
  };
}

async function findEntriesByContractNumberAcrossUsers(
  contractNumber: string
): Promise<
  FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const db = adminDb;

  try {
    const byGroup = await db
      .collectionGroup("entries")
      .where("contractNumber", "==", contractNumber)
      .get();
    return byGroup.docs;
  } catch (err) {
    console.warn(
      "Refresh storno: collectionGroup(contractNumber) selhal, pouštím fallback přes users/*/entries.",
      err
    );
  }

  const usersSnap = await db.collection("users").get();
  const ownerIds = usersSnap.docs.map((doc) => doc.id).filter(Boolean);
  const hits: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];

  for (let i = 0; i < ownerIds.length; i += 20) {
    const chunk = ownerIds.slice(i, i + 20);
    const chunkSnaps = await Promise.all(
      chunk.map(async (ownerId) => {
        try {
          return await db
            .collection("users")
            .doc(ownerId)
            .collection("entries")
            .where("contractNumber", "==", contractNumber)
            .get();
        } catch (scanErr) {
          console.warn(
            `Refresh storno: fallback query selhal pro users/${ownerId}/entries.`,
            scanErr
          );
          return null;
        }
      })
    );

    chunkSnaps.forEach((snap) => {
      if (!snap) return;
      hits.push(...snap.docs);
    });
  }

  return hits;
}

async function getAuthContext(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return { error: "Server není správně nakonfigurován (chybí Firebase Admin credentials).", status: 500 } as const;
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return { error: "Missing bearer token", status: 401 } as const;
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (err: any) {
    const msg = err?.message || "Invalid or expired token";
    const code = err?.code || "auth/invalid-token";
    return { error: `Invalid or expired token (${code}): ${msg}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  const { users, childrenByManager } = await getCachedUserTree();
  const me = users.find((u) => u.email === email) ?? null;
  const position = (me?.position as Position | null | undefined) ?? null;
  const hasDirectSubs = (childrenByManager.get(email) ?? []).length > 0;
  const teamEmails =
    isManagerPosition(position) || hasDirectSubs
      ? collectSubordinateHierarchy(email, childrenByManager).subordinateEmails
      : [];

  return {
    email,
    position,
    teamEmails,
    users,
    childrenByManager,
  };
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const { email, position, teamEmails, users } = ctx;
  const search = req.nextUrl.searchParams;
  const detailOwnerEmail = normalizeEmail(search.get("ownerEmail"));
  const detailEntryId = (search.get("entryId") ?? "").trim();

  if (detailOwnerEmail && detailEntryId) {
    const detailRef = adminDb
      ?.collection("users")
      .doc(detailOwnerEmail)
      .collection("entries")
      .doc(detailEntryId);
    const detailSnap = await detailRef?.get();
    if (!detailSnap?.exists) {
      return NextResponse.json(
        { ok: false, error: "Smlouva nebyla nalezena." } satisfies ErrorResponse,
        { status: 404 }
      );
    }

    const contractRaw = detailSnap.data() as ContractDoc;
    const canAccess = hasContractAccess({
      viewerEmail: email,
      teamEmails,
      ownerEmail: detailOwnerEmail,
      contract: contractRaw,
    });
    if (!canAccess) {
      return NextResponse.json(
        { ok: false, error: "Nemáš oprávnění pro tuto smlouvu." } satisfies ErrorResponse,
        { status: 403 }
      );
    }

    const contract = toContractResponseItem(
      detailSnap.id,
      detailOwnerEmail,
      contractRaw
    );

    const includeTimeline =
      search.get("includeTimeline") !== "0" && search.get("includeTimeline") !== "false";

    let timeline: ContractResponseItem[] = [contract];
    const productKey = contract.productKey as Product | undefined;
    const contractNumber = (contract.contractNumber ?? "").trim();
    if (
      includeTimeline &&
      productKey &&
      LIFE_TIMELINE_PRODUCTS.has(productKey) &&
      contractNumber
    ) {
      try {
        const timelineSnap = await adminDb
          ?.collection("users")
          .doc(detailOwnerEmail)
          .collection("entries")
          .where("contractNumber", "==", contractNumber)
          .get();
        const timelineEntries = (timelineSnap?.docs ?? []).map((snap) =>
          toContractResponseItem(
            snap.id,
            detailOwnerEmail,
            snap.data() as ContractDoc
          )
        );

        const targetRootId = normalizeRootEntryId(contract);
        const sameProductEntries = timelineEntries.filter(
          (entry) => entry.productKey === productKey
        );
        const hasExplicitChainIds =
          Boolean((contract.rootContractEntryId ?? "").trim()) ||
          sameProductEntries.some((entry) =>
            Boolean((entry.rootContractEntryId ?? "").trim())
          );
        let scopedTimeline = sameProductEntries;
        if (hasExplicitChainIds && targetRootId) {
          scopedTimeline = sameProductEntries.filter(
            (entry) => normalizeRootEntryId(entry) === targetRootId
          );
        }

        if (!scopedTimeline.some((entry) => entry.id === contract.id)) {
          scopedTimeline.push(contract);
        }
        if (scopedTimeline.length === 0) {
          scopedTimeline = [contract];
        }

        scopedTimeline.sort((a, b) => {
          const byDate =
            (timelineSortDate(a)?.getTime() ?? 0) -
            (timelineSortDate(b)?.getTime() ?? 0);
          if (byDate !== 0) return byDate;
          return a.id.localeCompare(b.id, "cs");
        });
        timeline = scopedTimeline;
      } catch (timelineErr) {
        console.warn("GET /api/contracts detail timeline selhalo:", timelineErr);
        timeline = [contract];
      }
    }

    const usersByEmail = new Map(users.map((item) => [item.email, item]));
    const ownerNode = usersByEmail.get(detailOwnerEmail) ?? null;
    const ownerPosition = ownerNode?.position ?? null;
    let managerEmail = normalizeEmail(ownerNode?.managerEmail ?? null);

    const currentChainEmails: string[] = [];
    const seen = new Set<string>();
    let cursor = detailOwnerEmail;
    let depth = 0;
    while (cursor && depth < 12) {
      const node = usersByEmail.get(cursor) ?? null;
      const mgr = normalizeEmail(node?.managerEmail ?? null);
      if (!mgr || seen.has(mgr)) break;
      currentChainEmails.push(mgr);
      seen.add(mgr);
      cursor = mgr;
      depth += 1;
    }
    if (!managerEmail && currentChainEmails.length > 0) {
      managerEmail = currentChainEmails[0] ?? "";
    }
    if (!managerEmail) {
      managerEmail = normalizeEmail(contract.managerEmailSnapshot ?? null);
    }
    const managerPosition =
      (managerEmail ? usersByEmail.get(managerEmail)?.position : null) ?? null;

    const response: ContractDetailResponse = {
      ok: true,
      mode: "detail",
      position,
      hasTeam: teamEmails.length > 0,
      teamEmails,
      contract,
      timeline,
      ownerMeta: {
        position: ownerPosition,
        managerEmail: managerEmail || null,
        managerPosition,
        currentChainEmails,
      },
    };

    return NextResponse.json(response);
  }

  const scopeParam = search.get("scope") === "team" ? "team" : "my";
  const includeTeam = search.get("includeTeam") === "1" || search.get("includeTeam") === "true";
  const cursor = parseCursor(search);
  const limitParam = Number(search.get("limit"));
  const pageSize =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(1, limitParam), PAGE_SIZE_MAX)
      : PAGE_SIZE_DEFAULT;

  if (scopeParam === "team" && teamEmails.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nemáš práva pro zobrazení týmových smluv." } satisfies ErrorResponse,
      { status: 403 }
    );
  }

  const owners = scopeParam === "team" ? teamEmails : [email];
  const shouldFetchTeamInParallel =
    scopeParam === "my" && includeTeam && teamEmails.length > 0;

  let primaryRes: Awaited<ReturnType<typeof fetchContractsForOwners>>;
  let teamRes: Awaited<ReturnType<typeof fetchContractsForOwners>> | null = null;

  if (shouldFetchTeamInParallel) {
    [primaryRes, teamRes] = await Promise.all([
      fetchContractsForOwners(owners, cursor, pageSize),
      fetchContractsForOwners(teamEmails, null, pageSize),
    ]);
  } else {
    primaryRes = await fetchContractsForOwners(owners, cursor, pageSize);
    if (includeTeam && teamEmails.length > 0) {
      teamRes = await fetchContractsForOwners(teamEmails, null, pageSize);
    }
  }

  const { list, hasMore, nextCursor, nextCursorToken } = primaryRes;
  const teamContracts = teamRes?.list;
  const teamHasMore = teamRes?.hasMore;
  const teamNextCursor = teamRes?.nextCursor;
  const teamNextCursorToken = teamRes?.nextCursorToken;

  const response: ContractsResponse = {
    ok: true,
    scope: scopeParam,
    position,
    hasTeam: teamEmails.length > 0,
    teamEmails,
    contracts: list,
    hasMore,
    nextCursor,
    nextCursorToken,
    teamContracts,
    teamHasMore,
    teamNextCursor,
    teamNextCursorToken,
  };

  return NextResponse.json(response);
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  const { email, teamEmails } = ctx;

  const rateLimitResult = consumeRateLimit({
    namespace: "api:contracts:patch",
    key: email,
    limit: CONTRACTS_MUTATION_RATE_LIMIT,
    windowMs: CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 });
  }

  const action =
    typeof body?.action === "string" ? body.action.trim() : "";
  if (action === "refreshNeonStorno") {
    try {
      const originalContractNumber =
        typeof body?.originalContractNumber === "string"
          ? body.originalContractNumber.trim()
          : "";
      const newEntryId =
        typeof body?.newEntryId === "string" ? body.newEntryId.trim() : "";
      const stornoDateMs = Number(body?.stornoDateMs);
      const refreshSignedDateMs = Number(body?.refreshSignedDateMs);

      if (!originalContractNumber) {
        return NextResponse.json(
          { ok: false, error: "Chybí číslo původní smlouvy." },
          { status: 400 }
        );
      }
      if (!isValidContractNumber(originalContractNumber)) {
        return NextResponse.json(
          { ok: false, error: "Číslo původní smlouvy má neplatný formát." },
          { status: 400 }
        );
      }
      if (!newEntryId) {
        return NextResponse.json(
          { ok: false, error: "Chybí ID nové smlouvy." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(stornoDateMs) || !Number.isFinite(refreshSignedDateMs)) {
        return NextResponse.json(
          { ok: false, error: "Chybí validní data refreshu." },
          { status: 400 }
        );
      }

      const stornoDate = new Date(stornoDateMs);
      const refreshSignedDate = new Date(refreshSignedDateMs);
      if (
        Number.isNaN(stornoDate.getTime()) ||
        Number.isNaN(refreshSignedDate.getTime())
      ) {
        return NextResponse.json(
          { ok: false, error: "Neplatné datum storna nebo sjednání refreshu." },
          { status: 400 }
        );
      }

      const newEntryRef = adminDb
        ?.collection("users")
        .doc(email)
        .collection("entries")
        .doc(newEntryId);
      const newEntrySnap = await newEntryRef?.get();
      if (!newEntrySnap?.exists) {
        return NextResponse.json(
          { ok: false, error: "Nová smlouva pro refresh nebyla nalezena." },
          { status: 404 }
        );
      }

      const newEntryData = newEntrySnap.data() as ContractDoc | undefined;
      if ((newEntryData?.productKey as Product | undefined) !== "neon") {
        return NextResponse.json(
          { ok: false, error: "Refresh storno je dostupné jen pro ČPP ŽP NEON." },
          { status: 400 }
        );
      }

      const refreshTargets = await findEntriesByContractNumberAcrossUsers(
        originalContractNumber
      );

      let updated = 0;
      for (const snap of refreshTargets) {
        const data = snap.data() as ContractDoc;
        if ((data.productKey as Product | undefined) !== "neon") continue;

        const owner = normalizeEmail(
          (snap.ref.parent.parent?.id as string | undefined) ??
            (data.userEmail as string | undefined)
        );
        if (owner === email && snap.id === newEntryId) continue;

        await snap.ref.set(
          {
            status: "storno",
            stornoDate,
            refreshReplacedByEntryId: newEntryId,
            refreshReplacedByOwnerEmail: email,
            refreshReplacedBySignedDate: refreshSignedDate,
          },
          { merge: true }
        );
        updated += 1;
      }

      return NextResponse.json({ ok: true, updated });
    } catch (refreshErr: any) {
      const message =
        typeof refreshErr?.message === "string" && refreshErr.message.trim()
          ? refreshErr.message.trim()
          : "Neznámá chyba při refresh storno.";
      console.error("PATCH /api/contracts refreshNeonStorno selhal:", refreshErr);
      return NextResponse.json(
        { ok: false, error: `Refresh storno selhalo: ${message}` },
        { status: 500 }
      );
    }
  }

  if (action === "replacementStorno") {
    try {
      const originalContractNumber =
        typeof body?.originalContractNumber === "string"
          ? body.originalContractNumber.trim()
          : "";
      const newEntryId =
        typeof body?.newEntryId === "string" ? body.newEntryId.trim() : "";
      const stornoDateMs = Number(body?.stornoDateMs);
      const replacementSignedDateMs = Number(body?.replacementSignedDateMs);

      if (!originalContractNumber) {
        return NextResponse.json(
          { ok: false, error: "Chybí číslo nahrazované smlouvy." },
          { status: 400 }
        );
      }
      if (!isValidContractNumber(originalContractNumber)) {
        return NextResponse.json(
          { ok: false, error: "Číslo nahrazované smlouvy má neplatný formát." },
          { status: 400 }
        );
      }
      if (!newEntryId) {
        return NextResponse.json(
          { ok: false, error: "Chybí ID nové smlouvy." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(stornoDateMs) || !Number.isFinite(replacementSignedDateMs)) {
        return NextResponse.json(
          { ok: false, error: "Chybí validní data náhrady." },
          { status: 400 }
        );
      }

      const stornoDate = new Date(stornoDateMs);
      const replacementSignedDate = new Date(replacementSignedDateMs);
      if (
        Number.isNaN(stornoDate.getTime()) ||
        Number.isNaN(replacementSignedDate.getTime())
      ) {
        return NextResponse.json(
          { ok: false, error: "Neplatné datum storna nebo sjednání náhrady." },
          { status: 400 }
        );
      }

      const newEntryRef = adminDb
        ?.collection("users")
        .doc(email)
        .collection("entries")
        .doc(newEntryId);
      const newEntrySnap = await newEntryRef?.get();
      if (!newEntrySnap?.exists) {
        return NextResponse.json(
          { ok: false, error: "Nová smlouva pro náhradu nebyla nalezena." },
          { status: 404 }
        );
      }

      const newEntryData = newEntrySnap.data() as ContractDoc | undefined;
      const newEntryProduct = newEntryData?.productKey as Product | undefined;
      if (!newEntryProduct || !REPLACEMENT_STORNO_PRODUCTS.has(newEntryProduct)) {
        return NextResponse.json(
          { ok: false, error: "Náhrada storno není pro tento produkt podporovaná." },
          { status: 400 }
        );
      }

      const replacementTargets = await findEntriesByContractNumberAcrossUsers(
        originalContractNumber
      );

      let updated = 0;
      for (const snap of replacementTargets) {
        const data = snap.data() as ContractDoc;
        if ((data.productKey as Product | undefined) !== newEntryProduct) continue;

        const owner = normalizeEmail(
          (snap.ref.parent.parent?.id as string | undefined) ??
            (data.userEmail as string | undefined)
        );
        if (owner === email && snap.id === newEntryId) continue;

        await snap.ref.set(
          {
            status: "storno",
            stornoDate,
            replacementReplacedByEntryId: newEntryId,
            replacementReplacedByOwnerEmail: email,
            replacementReplacedBySignedDate: replacementSignedDate,
          },
          { merge: true }
        );
        updated += 1;
      }

      return NextResponse.json({ ok: true, updated });
    } catch (replacementErr: any) {
      const message =
        typeof replacementErr?.message === "string" && replacementErr.message.trim()
          ? replacementErr.message.trim()
          : "Neznámá chyba při náhradě storno.";
      console.error("PATCH /api/contracts replacementStorno selhal:", replacementErr);
      return NextResponse.json(
        { ok: false, error: `Náhrada storno selhala: ${message}` },
        { status: 500 }
      );
    }
  }

  if (action === "syncCppStatus") {
    try {
      const ownerEmail = normalizeEmail(
        typeof body?.ownerEmail === "string" ? body.ownerEmail : ""
      );
      const entryId =
        typeof body?.entryId === "string" ? body.entryId.trim() : "";

      if (!ownerEmail || !entryId) {
        return NextResponse.json(
          { ok: false, error: "Chybí ownerEmail nebo entryId." },
          { status: 400 }
        );
      }

      const allowedOwners = new Set<string>([email, ...teamEmails]);
      if (!allowedOwners.has(ownerEmail)) {
        return NextResponse.json(
          { ok: false, error: "Nemáš oprávnění pro tuto smlouvu." },
          { status: 403 }
        );
      }

      const cppIdPartner =
        process.env.CPP_WSEXTRA_IDPARTNER?.trim() ??
        process.env.CPP_IDPARTNER?.trim() ??
        "";
      if (!cppIdPartner) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Chybí konfigurace ČPP WS (CPP_WSEXTRA_IDPARTNER / CPP_IDPARTNER).",
          },
          { status: 500 }
        );
      }

      const entryRef = adminDb
        ?.collection("users")
        .doc(ownerEmail)
        .collection("entries")
        .doc(entryId);
      const entrySnap = await entryRef?.get();
      if (!entrySnap?.exists) {
        return NextResponse.json(
          { ok: false, error: "Smlouva nebyla nalezena." },
          { status: 404 }
        );
      }

      const entryData = entrySnap.data() as ContractDoc | undefined;
      const productKey = entryData?.productKey as Product | undefined;
      if (!productKey || !CPP_STATUS_SYNC_PRODUCTS.has(productKey)) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "unsupported-product",
        });
      }

      const contractNumberRaw =
        typeof entryData?.contractNumber === "string"
          ? entryData.contractNumber.trim()
          : "";
      const contractNumber = normalizeContractNumber(contractNumberRaw);
      if (!contractNumber) {
        return NextResponse.json(
          { ok: false, error: "Smlouva nemá vyplněné číslo smlouvy." },
          { status: 400 }
        );
      }

      const signedDate =
        toDate(entryData?.contractSignedDate) ?? toDate(entryData?.createdAt);
      const primaryDateFrom = signedDate
        ? `01.01.${signedDate.getFullYear()}`
        : "01.01.2000";
      const fallbackDateFrom =
        primaryDateFrom === "01.01.2000" ? null : "01.01.2000";

      let wsResult = await fetchCppStavSmlouvyZp({
        idPartner: cppIdPartner,
        dateFrom: primaryDateFrom,
      });
      if (wsResult.errors.length > 0) {
        return NextResponse.json(
          { ok: false, error: wsResult.errors[0] },
          { status: 502 }
        );
      }

      let matched = findCppStatusItemByContractNumber(
        wsResult.items,
        contractNumber
      );

      if (!matched && fallbackDateFrom) {
        wsResult = await fetchCppStavSmlouvyZp({
          idPartner: cppIdPartner,
          dateFrom: fallbackDateFrom,
        });
        if (wsResult.errors.length > 0) {
          return NextResponse.json(
            { ok: false, error: wsResult.errors[0] },
            { status: 502 }
          );
        }
        matched = findCppStatusItemByContractNumber(wsResult.items, contractNumber);
      }

      if (!matched) {
        return NextResponse.json({
          ok: true,
          matched: false,
          contractNumber,
          dateFrom: fallbackDateFrom ?? primaryDateFrom,
        });
      }

      const remoteStatus = normalizeCppContractState(matched.status);
      const appliedStatus: "active" | "storno" = remoteStatus.includes("STORN")
        ? "storno"
        : "active";

      const parsedRemoteStornoDate =
        appliedStatus === "storno" ? parseCzechDate(matched.endDate) : null;
      const stornoDateValue =
        appliedStatus === "storno"
          ? parsedRemoteStornoDate ?? toDate(entryData?.stornoDate) ?? new Date()
          : null;

      const ownerEntriesRef = adminDb
        ?.collection("users")
        .doc(ownerEmail)
        .collection("entries");
      let targetDocs = await ownerEntriesRef
        ?.where("contractNumber", "==", contractNumberRaw)
        .get();

      if ((targetDocs?.docs.length ?? 0) === 0) {
        targetDocs = await ownerEntriesRef
          ?.where("contractNumber", "==", contractNumber)
          .get();
      }

      const targetRefs = new Map<
        string,
        FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
      >();
      for (const docSnap of targetDocs?.docs ?? []) {
        const data = docSnap.data() as ContractDoc;
        const docProduct = data.productKey as Product | undefined;
        if (!docProduct || !CPP_STATUS_SYNC_PRODUCTS.has(docProduct)) continue;
        targetRefs.set(docSnap.ref.path, docSnap.ref);
      }

      if (targetRefs.size === 0 && ownerEntriesRef) {
        const allOwnerEntries = await ownerEntriesRef.get();
        for (const docSnap of allOwnerEntries.docs) {
          const data = docSnap.data() as ContractDoc;
          const docProduct = data.productKey as Product | undefined;
          if (!docProduct || !CPP_STATUS_SYNC_PRODUCTS.has(docProduct)) continue;
          if (
            normalizeContractNumber(data.contractNumber ?? null) !== contractNumber
          ) {
            continue;
          }
          targetRefs.set(docSnap.ref.path, docSnap.ref);
        }
      }

      if (targetRefs.size === 0) {
        targetRefs.set(entrySnap.ref.path, entrySnap.ref);
      }

      const updatePayload =
        appliedStatus === "storno"
          ? {
              status: "storno",
              stornoDate: stornoDateValue,
              cppRemoteStatus: remoteStatus,
              cppStatusUpdatedAt: new Date(),
            }
          : {
              status: "active",
              stornoDate: null,
              cppRemoteStatus: remoteStatus,
              cppStatusUpdatedAt: new Date(),
            };

      let updated = 0;
      for (const ref of targetRefs.values()) {
        await ref.set(updatePayload, { merge: true });
        updated += 1;
      }

      return NextResponse.json({
        ok: true,
        matched: true,
        contractNumber,
        remoteStatus,
        appliedStatus,
        stornoDateMs: stornoDateValue ? stornoDateValue.getTime() : null,
        updated,
      });
    } catch (cppSyncErr: any) {
      const message =
        typeof cppSyncErr?.message === "string" && cppSyncErr.message.trim()
          ? cppSyncErr.message.trim()
          : "Neznámá chyba při synchronizaci ČPP stavu smlouvy.";
      console.error("PATCH /api/contracts syncCppStatus selhal:", cppSyncErr);
      return NextResponse.json(
        { ok: false, error: `Synchronizace ČPP selhala: ${message}` },
        { status: 500 }
      );
    }
  }

  if (action === "updateFields") {
    const ownerEmail = normalizeEmail(
      typeof body?.ownerEmail === "string" ? body.ownerEmail : ""
    );
    const singleEntryId =
      typeof body?.entryId === "string" ? body.entryId.trim() : "";
    const entryIds = Array.from(
      new Set(
        [
          singleEntryId,
          ...(Array.isArray(body?.entryIds)
            ? body.entryIds
                .map((item: unknown) =>
                  typeof item === "string" ? item.trim() : ""
                )
                .filter(Boolean)
            : []),
        ].filter(Boolean)
      )
    ) as string[];

    const updatesRaw =
      body?.updates && typeof body.updates === "object" && !Array.isArray(body.updates)
        ? (body.updates as Record<string, unknown>)
        : null;

    if (!ownerEmail || entryIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Chybí ownerEmail nebo entryId." },
        { status: 400 }
      );
    }
    if (entryIds.length > UPDATE_FIELDS_MAX_ENTRY_IDS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Najednou můžeš upravit maximálně ${UPDATE_FIELDS_MAX_ENTRY_IDS} smluv.`,
        },
        { status: 400 }
      );
    }
    if (!updatesRaw) {
      return NextResponse.json(
        { ok: false, error: "Chybí objekt updates." },
        { status: 400 }
      );
    }

    const allowedOwners = new Set<string>([email, ...teamEmails]);
    if (!allowedOwners.has(ownerEmail)) {
      return NextResponse.json(
        { ok: false, error: "Nemáš oprávnění upravit tuto smlouvu." },
        { status: 403 }
      );
    }

    const normalizedUpdates = normalizePatchUpdates(updatesRaw);
    if (!normalizedUpdates.ok) {
      return NextResponse.json(
        { ok: false, error: normalizedUpdates.error },
        { status: 400 }
      );
    }

    const payload = normalizedUpdates.payload;
    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Updates neobsahují žádná pole." },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." },
        { status: 500 }
      );
    }
    const db = adminDb;

    const entryRefs = entryIds.map((entryId) =>
      db.collection("users").doc(ownerEmail).collection("entries").doc(entryId)
    );
    const entrySnaps = await Promise.all(entryRefs.map((ref) => ref.get()));

    const missingEntryIds = entrySnaps
      .map((snap, idx) => (!snap.exists ? entryIds[idx] : null))
      .filter((value): value is string => value != null);
    if (missingEntryIds.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Některé smlouvy nebyly nalezeny: ${missingEntryIds.join(", ")}`,
        },
        { status: 404 }
      );
    }

    for (let i = 0; i < entrySnaps.length; i += 1) {
      const snap = entrySnaps[i];
      const currentData = (snap.data() ?? {}) as ContractDoc;
      const coreValidation = validateContractCoreInvariants(currentData, payload);
      if (!coreValidation.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Neplatná data pro entryId ${entryIds[i]}: ${coreValidation.error}`,
          },
          { status: 400 }
        );
      }
    }

    const batch = db.batch();
    entryRefs.forEach((ref) => {
      batch.update(ref, payload);
    });
    await batch.commit();

    return NextResponse.json({ ok: true, updated: entryRefs.length });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  const paid = body.paid === true;

  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Chybí položky k úpravě." }, { status: 400 });
  }

  const allowedOwners = new Set<string>([email, ...teamEmails]);
  let updated = 0;
  for (const item of entries) {
    const owner = normalizeEmail(item.ownerEmail);
    const entryId = item.entryId as string | undefined;
    if (!owner || !entryId) continue;
    if (!allowedOwners.has(owner)) continue;

    await adminDb
      ?.collection("users")
      .doc(owner)
      .collection("entries")
      .doc(entryId)
      .set({ paid }, { merge: true });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  const { email, teamEmails } = ctx;

  const rateLimitResult = consumeRateLimit({
    namespace: "api:contracts:delete",
    key: email,
    limit: CONTRACTS_MUTATION_RATE_LIMIT,
    windowMs: CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Chybí položky ke smazání." }, { status: 400 });
  }

  const allowedOwners = new Set<string>([email, ...teamEmails]);
  let deleted = 0;

  for (const item of entries) {
    const owner = normalizeEmail(item.ownerEmail);
    const entryId = item.entryId as string | undefined;
    if (!owner || !entryId) continue;
    if (!allowedOwners.has(owner)) continue;

    await adminDb
      ?.collection("users")
      .doc(owner)
      .collection("entries")
      .doc(entryId)
      .delete();
    deleted += 1;
  }

  return NextResponse.json({ ok: true, deleted });
}
