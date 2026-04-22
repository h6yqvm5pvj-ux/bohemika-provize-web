// src/app/api/contracts/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type MaxCizinKomplexVariant,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import { toDate } from "@/app/lib/formatters";
import { totalWithMultipliers } from "@/app/lib/commissionTotals";
import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculateMaxCizinKomplex,
  calculatePillowInjury,
  calculateDomex,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppSimplex,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateAllianzAuto,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCC,
} from "@/app/lib/productFormulas";
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
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
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
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
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
type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};
type UserProfileSnapshot = {
  docId: string;
  email: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  positionTimeline: unknown;
};
type SubscriptionStatus = "active" | "expired" | "none";
type AuthContextOptions = {
  requireKnownUser?: boolean;
  requireActiveSubscription?: boolean;
};

export type ContractsGetMode = "auto" | "detail" | "list";
export type ContractsPatchAction =
  | "syncCppStatus"
  | "syncEntryIndex"
  | "updateFields"
  | "setPaid";

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 50;
const CONTRACTS_MUTATION_RATE_LIMIT = 60;
const CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;
const CONTRACTS_GET_RATE_LIMIT = 180;
const CONTRACTS_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const UPDATE_FIELDS_MAX_ENTRY_IDS = 50;
const USER_TREE_CACHE_TTL_MS = 30_000;
const CONTRACT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$/;
const CONTRACTS_CREATE_RATE_LIMIT = 30;
const CONTRACTS_CREATE_RATE_LIMIT_WINDOW_MS = 60_000;
const CREATE_ENTRY_ALLOWED_TOP_LEVEL_FIELDS = new Set<string>([
  "productKey",
  "entryType",
  "inputAmount",
  "effectiveInputAmount",
  "comfortPayment",
  "comfortGradual",
  "comfortTargetAmount",
  "frequencyRaw",
  "clientName",
  "contractSignedDate",
  "policyStartDate",
  "durationYears",
  "durationMonths",
  "maxCizinKomplexVariant",
  "contractNumber",
  "isRefresh",
  "refreshOriginalContractNumber",
  "rootContractEntryId",
  "parentContractEntryId",
  "parentContractEntryPath",
  "calculationInputAmount",
  "previousInputAmount",
  "newInputAmount",
  "premiumDelta",
  "premiumIncreaseAmount",
  "premiumDecreaseAmount",
  "changeType",
]);
const SUPPORTED_ENTRY_TYPES = new Set(["contract", "endorsement"] as const);
const SUPPORTED_PRODUCTS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "maxcizinkomplex",
  "pillowInjury",
  "zamex",
  "domex",
  "pillowmajetek",
  "koopmajetekobcan",
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "allianzmujdomov",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopcestovko",
  "cppcestovko",
  "axacestovko",
  "comfortcc",
  "cppPPRs",
  "cppPPRbez",
]);
const POSITION_ORDER: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const SUPPORTED_POSITIONS = new Set<Position>(POSITION_ORDER);
const SUPPORTED_PAYMENT_FREQUENCIES = new Set<PaymentFrequency>([
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);
const SUPPORTED_ENDORSEMENT_CHANGE_TYPES = new Set([
  "increase",
  "decrease",
  "same",
] as const);
const SUPPORTED_MAX_CIZIN_KOMPLEX_VARIANTS = new Set<MaxCizinKomplexVariant>([
  "exclusiveStandard",
  "premium",
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
  "durationMonths",
  "maxCizinKomplexVariant",
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
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MANAGER_CHAIN_DEPTH = 9;
const CPP_WSEXTRA_URL = "https://wsextra.cpp.cz/extranet/extranet.asmx";
const CPP_SOAP_ACTION_STAV_SMLOUVY_ZP = "https://extranet.cpp.cz/StavSmlouvyZP";
const CPP_STATUS_SYNC_ENABLED = false;
const CONTRACT_REFS_COLLECTION = "contractRefs";
const CONTRACT_NUMBER_CLAIMS_COLLECTION = "contractNumberClaims";
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";

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

const currentYearMonth = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const teamOverviewMonthDocId = (ownerEmail: string, yearMonth: string): string =>
  `${normalizeEmail(ownerEmail)}___${yearMonth}`;

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

const parseEntryType = (
  value: unknown
): ParseResult<"contract" | "endorsement"> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole entryType musí být text." };
  }
  const normalized = value.trim() as "contract" | "endorsement";
  if (!SUPPORTED_ENTRY_TYPES.has(normalized)) {
    return { ok: false, error: "Pole entryType má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

const parseProductKey = (value: unknown): ParseResult<Product> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole productKey musí být text." };
  }
  const normalized = value.trim() as Product;
  if (!SUPPORTED_PRODUCTS.has(normalized)) {
    return { ok: false, error: "Pole productKey má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

const parseFrequencyField = (
  value: unknown
): ParseResult<PaymentFrequency> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole frequencyRaw musí být text." };
  }
  const normalized = value.trim() as PaymentFrequency;
  if (!SUPPORTED_PAYMENT_FREQUENCIES.has(normalized)) {
    return { ok: false, error: "Pole frequencyRaw má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

const parseOptionalMaxCizinKomplexVariant = (
  value: unknown
): ParseResult<MaxCizinKomplexVariant | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return {
      ok: false,
      error: "Pole maxCizinKomplexVariant musí být text nebo null.",
    };
  }
  const normalized = value.trim() as MaxCizinKomplexVariant;
  if (!SUPPORTED_MAX_CIZIN_KOMPLEX_VARIANTS.has(normalized)) {
    return {
      ok: false,
      error: "Pole maxCizinKomplexVariant má nepodporovanou hodnotu.",
    };
  }
  return { ok: true, value: normalized };
};

type NormalizedManagerChainEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

type NormalizedManagerOverrideEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  items: CommissionResultItemDTO[];
  total: number;
};

const parseRequiredDateField = (value: unknown, field: string): ParseResult<Date> => {
  const parsed = toDate(value);
  if (!parsed || !isReasonableContractDate(parsed)) {
    return { ok: false, error: `Pole ${field} má neplatné datum.` };
  }
  return { ok: true, value: parsed };
};

type NormalizedCreateEntryPayload = {
  productKey: Product;
  entryType: "contract" | "endorsement";
  position: Position;
  commissionMode: CommissionMode;
  inputAmount: number;
  effectiveInputAmount: number;
  comfortPayment: number | null;
  comfortGradual: boolean | null;
  comfortTargetAmount: number | null;
  frequencyRaw: PaymentFrequency;
  items: CommissionResultItemDTO[];
  total: number;
  result: {
    items: CommissionResultItemDTO[];
    total: number;
  };
  clientName: string;
  userId: string;
  contractSignedDate: Date;
  policyStartDate: Date;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  userEmail: string;
  contractNumber: string;
  paid: boolean;
  managerEmailSnapshot: string | null;
  managerPositionSnapshot: Position | null;
  managerModeSnapshot: CommissionMode | null;
  managerChain: NormalizedManagerChainEntry[];
  managerOverrides: NormalizedManagerOverrideEntry[];
  allowedEmails: string[];
  createdAt: Date;
  isRefresh: boolean | null;
  refreshOriginalContractNumber: string | null;
  rootContractEntryId: string | null;
  parentContractEntryId: string | null;
  parentContractEntryPath: string | null;
  calculationInputAmount: number | null;
  previousInputAmount: number | null;
  newInputAmount: number | null;
  premiumDelta: number | null;
  premiumIncreaseAmount: number | null;
  premiumDecreaseAmount: number | null;
  changeType: "increase" | "decrease" | "same" | null;
};

const normalizeCreateEntryPayload = ({
  raw,
  ownerEmail,
  ownerUid,
}: {
  raw: unknown;
  ownerEmail: string;
  ownerUid: string;
}): { ok: true; payload: NormalizedCreateEntryPayload } | { ok: false; error: string } => {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Payload musí být objekt." };
  }

  const unknownFields = Object.keys(raw).filter(
    (field) => !CREATE_ENTRY_ALLOWED_TOP_LEVEL_FIELDS.has(field)
  );
  if (unknownFields.length > 0) {
    return {
      ok: false,
      error: `Nepovolená pole v entry: ${unknownFields.join(", ")}.`,
    };
  }

  const entryTypeParsed = parseEntryType(raw.entryType);
  if (!entryTypeParsed.ok) return entryTypeParsed;
  const productParsed = parseProductKey(raw.productKey);
  if (!productParsed.ok) return productParsed;
  const freqParsed = parseFrequencyField(raw.frequencyRaw);
  if (!freqParsed.ok) return freqParsed;

  const clientNameParsed = parseRequiredTrimmedText(raw.clientName, "clientName", 200);
  if (!clientNameParsed.ok) return clientNameParsed;
  const contractNumberParsed = parseRequiredTrimmedText(raw.contractNumber, "contractNumber", 120);
  if (!contractNumberParsed.ok) return contractNumberParsed;
  if (!isValidContractNumber(contractNumberParsed.value)) {
    return { ok: false, error: "Pole contractNumber má neplatný formát." };
  }

  const signedDateParsed = parseRequiredDateField(raw.contractSignedDate, "contractSignedDate");
  if (!signedDateParsed.ok) return signedDateParsed;
  const policyStartParsed = parseRequiredDateField(raw.policyStartDate, "policyStartDate");
  if (!policyStartParsed.ok) return policyStartParsed;
  if (policyStartParsed.value.getTime() < signedDateParsed.value.getTime()) {
    return {
      ok: false,
      error: "Pole policyStartDate nemůže být dřív než contractSignedDate.",
    };
  }

  const inputAmountParsed = parseOptionalFiniteNumber(raw.inputAmount, "inputAmount");
  if (!inputAmountParsed.ok) return inputAmountParsed;
  const effectiveInputAmountParsed = parseOptionalFiniteNumber(
    raw.effectiveInputAmount,
    "effectiveInputAmount"
  );
  if (!effectiveInputAmountParsed.ok) return effectiveInputAmountParsed;
  const comfortPaymentParsed = parseOptionalFiniteNumber(raw.comfortPayment, "comfortPayment");
  if (!comfortPaymentParsed.ok) return comfortPaymentParsed;
  const comfortGradualParsed = parseOptionalBoolean(raw.comfortGradual, "comfortGradual");
  if (!comfortGradualParsed.ok) return comfortGradualParsed;
  const comfortTargetAmountParsed = parseOptionalFiniteNumber(
    raw.comfortTargetAmount,
    "comfortTargetAmount"
  );
  if (!comfortTargetAmountParsed.ok) return comfortTargetAmountParsed;
  const durationYearsParsed = parseOptionalInteger(raw.durationYears, "durationYears", {
    min: 1,
    max: 120,
  });
  if (!durationYearsParsed.ok) return durationYearsParsed;
  const durationMonthsParsed = parseOptionalInteger(raw.durationMonths, "durationMonths", {
    min: 1,
    max: 240,
  });
  if (!durationMonthsParsed.ok) return durationMonthsParsed;
  const maxCizinKomplexVariantParsed = parseOptionalMaxCizinKomplexVariant(
    raw.maxCizinKomplexVariant
  );
  if (!maxCizinKomplexVariantParsed.ok) return maxCizinKomplexVariantParsed;

  const isRefreshParsed = parseOptionalBoolean(raw.isRefresh, "isRefresh");
  if (!isRefreshParsed.ok) return isRefreshParsed;
  const refreshOriginalParsed = parseOptionalTrimmedText(
    raw.refreshOriginalContractNumber,
    "refreshOriginalContractNumber",
    120
  );
  if (!refreshOriginalParsed.ok) return refreshOriginalParsed;

  const rootEntryIdParsed = parseOptionalTrimmedText(
    raw.rootContractEntryId,
    "rootContractEntryId",
    120
  );
  if (!rootEntryIdParsed.ok) return rootEntryIdParsed;
  const parentEntryIdParsed = parseOptionalTrimmedText(
    raw.parentContractEntryId,
    "parentContractEntryId",
    120
  );
  if (!parentEntryIdParsed.ok) return parentEntryIdParsed;
  const parentPathParsed = parseOptionalTrimmedText(
    raw.parentContractEntryPath,
    "parentContractEntryPath",
    400
  );
  if (!parentPathParsed.ok) return parentPathParsed;

  const calcInputParsed = parseOptionalFiniteNumber(
    raw.calculationInputAmount,
    "calculationInputAmount"
  );
  if (!calcInputParsed.ok) return calcInputParsed;
  const previousInputParsed = parseOptionalFiniteNumber(
    raw.previousInputAmount,
    "previousInputAmount"
  );
  if (!previousInputParsed.ok) return previousInputParsed;
  const newInputParsed = parseOptionalFiniteNumber(raw.newInputAmount, "newInputAmount");
  if (!newInputParsed.ok) return newInputParsed;
  const premiumDeltaParsed = parseOptionalFiniteNumber(raw.premiumDelta, "premiumDelta", {
    min: -1_000_000_000,
    max: 1_000_000_000,
  });
  if (!premiumDeltaParsed.ok) return premiumDeltaParsed;
  const premiumIncreaseParsed = parseOptionalFiniteNumber(
    raw.premiumIncreaseAmount,
    "premiumIncreaseAmount"
  );
  if (!premiumIncreaseParsed.ok) return premiumIncreaseParsed;
  const premiumDecreaseParsed = parseOptionalFiniteNumber(
    raw.premiumDecreaseAmount,
    "premiumDecreaseAmount"
  );
  if (!premiumDecreaseParsed.ok) return premiumDecreaseParsed;

  let changeType: "increase" | "decrease" | "same" | null = null;
  if (raw.changeType != null && raw.changeType !== "") {
    if (typeof raw.changeType !== "string") {
      return { ok: false, error: "Pole changeType musí být text nebo null." };
    }
    const normalized = raw.changeType.trim() as "increase" | "decrease" | "same";
    if (!SUPPORTED_ENDORSEMENT_CHANGE_TYPES.has(normalized)) {
      return { ok: false, error: "Pole changeType má nepodporovanou hodnotu." };
    }
    changeType = normalized;
  }

  if (entryTypeParsed.value === "endorsement") {
    if (!rootEntryIdParsed.value || !parentEntryIdParsed.value) {
      return {
        ok: false,
        error: "Dodatek musí obsahovat rootContractEntryId i parentContractEntryId.",
      };
    }
  }

  if (
    productParsed.value === "maxcizinkomplex" &&
    durationMonthsParsed.value == null
  ) {
    return {
      ok: false,
      error: "Pro produkt MAXIMA Cizinci je povinné pole durationMonths.",
    };
  }

  return {
    ok: true,
    payload: {
      productKey: productParsed.value,
      entryType: entryTypeParsed.value,
      position: "poradce1",
      commissionMode: "standard",
      inputAmount: inputAmountParsed.value ?? 0,
      effectiveInputAmount: effectiveInputAmountParsed.value ?? inputAmountParsed.value ?? 0,
      comfortPayment: comfortPaymentParsed.value,
      comfortGradual: comfortGradualParsed.value,
      comfortTargetAmount: comfortTargetAmountParsed.value,
      frequencyRaw: freqParsed.value,
      items: [],
      total: 0,
      result: {
        items: [],
        total: 0,
      },
      clientName: clientNameParsed.value,
      userId: ownerUid,
      contractSignedDate: signedDateParsed.value,
      policyStartDate: policyStartParsed.value,
      durationYears: durationYearsParsed.value,
      durationMonths:
        productParsed.value === "maxcizinkomplex"
          ? durationMonthsParsed.value
          : null,
      maxCizinKomplexVariant:
        productParsed.value === "maxcizinkomplex"
          ? maxCizinKomplexVariantParsed.value ?? "exclusiveStandard"
          : null,
      userEmail: ownerEmail,
      contractNumber: contractNumberParsed.value,
      paid: false,
      managerEmailSnapshot: null,
      managerPositionSnapshot: null,
      managerModeSnapshot: null,
      managerChain: [],
      managerOverrides: [],
      allowedEmails: [ownerEmail],
      createdAt: new Date(),
      isRefresh: isRefreshParsed.value,
      refreshOriginalContractNumber: refreshOriginalParsed.value,
      rootContractEntryId:
        entryTypeParsed.value === "endorsement" ? rootEntryIdParsed.value : null,
      parentContractEntryId:
        entryTypeParsed.value === "endorsement" ? parentEntryIdParsed.value : null,
      parentContractEntryPath:
        entryTypeParsed.value === "endorsement" ? parentPathParsed.value : null,
      calculationInputAmount:
        entryTypeParsed.value === "endorsement" ? calcInputParsed.value : null,
      previousInputAmount:
        entryTypeParsed.value === "endorsement" ? previousInputParsed.value : null,
      newInputAmount: entryTypeParsed.value === "endorsement" ? newInputParsed.value : null,
      premiumDelta: entryTypeParsed.value === "endorsement" ? premiumDeltaParsed.value : null,
      premiumIncreaseAmount:
        entryTypeParsed.value === "endorsement" ? premiumIncreaseParsed.value : null,
      premiumDecreaseAmount:
        entryTypeParsed.value === "endorsement" ? premiumDecreaseParsed.value : null,
      changeType: entryTypeParsed.value === "endorsement" ? changeType : null,
    },
  };
};

const normalizePositionValue = (value: unknown): Position | null => {
  if (typeof value !== "string") return null;
  return SUPPORTED_POSITIONS.has(value as Position) ? (value as Position) : null;
};

const normalizeCommissionModeValue = (value: unknown): CommissionMode | null =>
  value === "accelerated" || value === "standard" ? value : null;

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
};

const toIsoDay = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parsePositionTimeline = (raw: unknown): PositionTimelineEntry[] => {
  if (!Array.isArray(raw)) return [];

  const rows: PositionTimelineEntry[] = [];
  raw.forEach((item, index) => {
    if (!isPlainObject(item)) return;
    const position = normalizePositionValue(item.position);
    if (!position) return;

    const validFrom =
      typeof item.validFrom === "string" ? item.validFrom.trim() : "";
    const validToRaw = typeof item.validTo === "string" ? item.validTo.trim() : "";
    const validTo = validToRaw || null;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof item.id === "string" && item.id.trim().length > 0
          ? item.id.trim()
          : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

const resolvePositionTimelineMatch = (
  signedDateIso: string,
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null => {
  if (!isIsoDay(signedDateIso) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDateIso) return false;
    if (row.validTo && signedDateIso >= row.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });

  return candidates[0] ?? null;
};

const resolvePositionForSignedDate = (
  profile: UserProfileSnapshot,
  signedDateIso: string | null
): Position | null => {
  const timeline = parsePositionTimeline(profile.positionTimeline);
  const timelineMatch =
    signedDateIso && isIsoDay(signedDateIso)
      ? resolvePositionTimelineMatch(signedDateIso, timeline)
      : null;
  return timelineMatch?.position ?? profile.position ?? null;
};

const profileFromRaw = (
  docId: string,
  raw: Record<string, unknown> | null
): UserProfileSnapshot | null => {
  if (!raw) return null;
  const email = normalizeEmail(typeof raw.email === "string" ? raw.email : docId);
  if (!email) return null;

  return {
    docId,
    email,
    managerEmail: normalizeEmail(raw.managerEmail as string | null | undefined) || null,
    position: normalizePositionValue(raw.position),
    commissionMode: normalizeCommissionModeValue(raw.commissionMode),
    positionTimeline: raw.positionTimeline ?? null,
  };
};

const pickBetterProfile = (
  current: UserProfileSnapshot,
  next: UserProfileSnapshot,
  emailKey: string
): UserProfileSnapshot => {
  const currentDocCanonical = current.docId.toLowerCase() === emailKey ? 0 : 1;
  const nextDocCanonical = next.docId.toLowerCase() === emailKey ? 0 : 1;
  if (currentDocCanonical !== nextDocCanonical) {
    return currentDocCanonical < nextDocCanonical ? current : next;
  }

  const currentHasPosition = current.position ? 0 : 1;
  const nextHasPosition = next.position ? 0 : 1;
  if (currentHasPosition !== nextHasPosition) {
    return currentHasPosition < nextHasPosition ? current : next;
  }

  const currentHasManager = current.managerEmail ? 0 : 1;
  const nextHasManager = next.managerEmail ? 0 : 1;
  if (currentHasManager !== nextHasManager) {
    return currentHasManager < nextHasManager ? current : next;
  }

  return current.docId.localeCompare(next.docId, "cs") <= 0 ? current : next;
};

const loadUserProfileByEmail = async (email: string): Promise<UserProfileSnapshot | null> => {
  if (!adminDb) return null;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const usersCol = adminDb.collection("users");
  const candidates = new Map<string, UserProfileSnapshot>();

  const directSnap = await usersCol.doc(normalizedEmail).get();
  if (directSnap.exists) {
    const profile = profileFromRaw(
      directSnap.id,
      (directSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (profile) candidates.set(profile.docId, profile);
  }

  const byEmailSnap = await usersCol
    .where("email", "==", normalizedEmail)
    .limit(5)
    .get();
  byEmailSnap.docs.forEach((docSnap) => {
    const profile = profileFromRaw(
      docSnap.id,
      (docSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (profile) candidates.set(profile.docId, profile);
  });

  let best: UserProfileSnapshot | null = null;
  candidates.forEach((candidate) => {
    best = best ? pickBetterProfile(best, candidate, normalizedEmail) : candidate;
  });
  return best;
};

const loadCallerProfile = async ({
  uid,
  tokenEmail,
}: {
  uid: string;
  tokenEmail: string | null;
}): Promise<UserProfileSnapshot | null> => {
  if (!adminDb) return null;

  if (tokenEmail) {
    const byEmail = await loadUserProfileByEmail(tokenEmail);
    if (byEmail) return byEmail;
  }

  const usersCol = adminDb.collection("users");
  const byUidSnap = await usersCol.where("userId", "==", uid).limit(5).get();

  let best: UserProfileSnapshot | null = null;
  byUidSnap.docs.forEach((docSnap) => {
    const profile = profileFromRaw(
      docSnap.id,
      (docSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (!profile) return;
    if (!best) {
      best = profile;
      return;
    }
    const emailKey = tokenEmail ?? profile.email;
    best = pickBetterProfile(best, profile, emailKey);
  });

  return best;
};

const buildTrustedManagerChainForSignedDate = async ({
  directManagerEmail,
  signedDateIso,
}: {
  directManagerEmail: string | null;
  signedDateIso: string | null;
}): Promise<NormalizedManagerChainEntry[]> => {
  const startEmail = normalizeEmail(directManagerEmail);
  if (!startEmail) return [];

  const chain: NormalizedManagerChainEntry[] = [];
  const visited = new Set<string>();
  let currentEmail: string | null = startEmail;
  let depth = 0;

  while (
    currentEmail &&
    depth < MAX_MANAGER_CHAIN_DEPTH &&
    !visited.has(currentEmail)
  ) {
    visited.add(currentEmail);
    const profile = await loadUserProfileByEmail(currentEmail);
    if (!profile) break;

    chain.push({
      email: profile.email,
      position: resolvePositionForSignedDate(profile, signedDateIso),
      commissionMode: profile.commissionMode,
    });

    currentEmail = normalizeEmail(profile.managerEmail);
    depth += 1;
  }

  return chain;
};

const ensureManagerChainWithDirectManager = (
  chain: NormalizedManagerChainEntry[],
  managerEmail: string | null | undefined,
  managerPosition: Position | null,
  managerMode: CommissionMode | null
): NormalizedManagerChainEntry[] => {
  if (chain.length > 0) return chain;
  const normalizedEmail = normalizeEmail(managerEmail);
  if (!normalizedEmail) return chain;
  return [
    {
      email: normalizedEmail,
      position: managerPosition ?? null,
      commissionMode: managerMode ?? null,
    },
  ];
};

const hasResolvedTopManagerPosition = (
  chain: NormalizedManagerChainEntry[],
  managerEmail: string | null | undefined
): boolean => {
  const normalizedEmail = normalizeEmail(managerEmail);
  if (!normalizedEmail) return true;

  const directManager =
    chain.find((row) => normalizeEmail(row.email) === normalizedEmail) ??
    chain[0] ??
    null;

  return Boolean(directManager?.position);
};

const paymentsPerYear = (frequency: PaymentFrequency): number =>
  frequency === "monthly"
    ? 12
    : frequency === "quarterly"
    ? 4
    : frequency === "semiannual"
    ? 2
    : 1;

const durationRange = (product: Product): [number, number] => {
  switch (product) {
    case "neon":
      return [1, 99];
    case "flexi":
      return [1, 80];
    case "maximaMaxEfekt":
      return [1, 20];
    default:
      return [1, 1];
  }
};

const durationFallback = (product: Product): number => {
  switch (product) {
    case "neon":
      return 15;
    case "flexi":
      return 30;
    case "maximaMaxEfekt":
      return 20;
    default:
      return 1;
  }
};

const normalizedDurationYears = (
  product: Product,
  years: number | null | undefined
): number => {
  const [min, max] = durationRange(product);
  const raw =
    typeof years === "number" && Number.isFinite(years)
      ? years
      : durationFallback(product);
  const wholeYears = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeYears));
};

const allowedFrequenciesForProduct = (product: Product): PaymentFrequency[] => {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
    case "koopmajetekobcan":
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
    case "kooperativaAuto":
    case "allianzAuto":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "cppAuto":
    case "slaviaauto":
    case "csobAuto":
    case "uniqaAuto":
    case "uniqaflotila":
    case "zamex":
    case "cppsimplex":
    case "cppPPRbez":
    case "cppPPRs":
      return ["quarterly", "semiannual", "annual"];
    case "cppcestovko":
    case "axacestovko":
    case "koopcestovko":
    case "maxcizinkomplex":
    case "comfortcc":
      return ["annual"];
    default:
      return ["annual"];
  }
};

const paymentBasedTotals = (
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } => {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const title = (it.title ?? "").toLowerCase();
    if (title.includes("okamžitá")) {
      immediate += it.amount ?? 0;
    } else if (title.includes("následná")) {
      subsequent += it.amount ?? 0;
    }
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
};

const normalizeTitleKey = (title: string): string => {
  const normalized = title.toLowerCase();
  if (normalized.includes("z platby")) return `payment-${normalized}`;
  if (normalized.includes("za rok")) return `annual-${normalized}`;
  if (normalized.includes("okamžitá")) return "immediate";
  if (normalized.includes("po 3")) return "po3";
  if (normalized.includes("po 4")) return "po4";
  if (normalized.includes("2.–5.")) return "nasl25";
  if (normalized.includes("5.–10.")) return "nasl510";
  if (normalized.includes("od 6.")) return "nasl6plus";
  return normalized;
};

const stripTotalRows = (
  items: CommissionResultItemDTO[] = []
): CommissionResultItemDTO[] =>
  items.filter((item) => !normalizeTitleKey(item.title ?? "").includes("celkem"));

const computeItemsForProductPositionAndMode = ({
  productKey,
  position,
  commissionMode,
  inputAmount,
  frequencyRaw,
  durationYears,
  durationMonths,
  maxCizinKomplexVariant,
  comfortPayment,
  comfortGradual,
  comfortTargetAmount,
}: {
  productKey: Product;
  position: Position;
  commissionMode: CommissionMode;
  inputAmount: number;
  frequencyRaw: PaymentFrequency;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPayment: number | null;
  comfortGradual: boolean | null;
  comfortTargetAmount: number | null;
}): { items: CommissionResultItemDTO[]; total: number } | null => {
  const safeAmount = Number.isFinite(inputAmount) ? Math.max(0, inputAmount) : 0;
  const allowedFrequencies = allowedFrequenciesForProduct(productKey);
  const usedFrequency = allowedFrequencies.includes(frequencyRaw)
    ? frequencyRaw
    : allowedFrequencies[0];

  switch (productKey) {
    case "neon": {
      const years = Math.min(15, normalizedDurationYears("neon", durationYears));
      return calculateNeon(safeAmount, position, years, commissionMode);
    }
    case "flexi": {
      const years = normalizedDurationYears("flexi", durationYears);
      return calculateFlexi(safeAmount, position, commissionMode, years);
    }
    case "maximaMaxEfekt": {
      const years = normalizedDurationYears("maximaMaxEfekt", durationYears);
      return calculateMaxEfekt(safeAmount, years, position, commissionMode);
    }
    case "maxcizinkomplex": {
      const normalizedMonths =
        typeof durationMonths === "number" && Number.isFinite(durationMonths)
          ? Math.max(1, Math.floor(durationMonths))
          : null;
      void normalizedMonths;
      const variant = maxCizinKomplexVariant ?? "exclusiveStandard";
      return calculateMaxCizinKomplex(safeAmount, position, variant);
    }
    case "pillowInjury":
      return calculatePillowInjury(safeAmount, position, commissionMode);
    case "domex":
    case "koopmajetekobcan": {
      const dto =
        productKey === "domex"
          ? calculateDomex(safeAmount, usedFrequency, position)
          : calculateKoopMajetekObcan(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case "pillowmajetek":
      return calculatePillowMajetek(safeAmount, usedFrequency, position);
    case "maxdomov": {
      const dto = calculateMaxdomov(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate + totals.subsequent };
    }
    case "allianzmujdomov":
      return calculateAllianzMujDomov(safeAmount, usedFrequency, position);
    case "cppsimplex":
      return calculateCppSimplex(safeAmount, usedFrequency, position);
    case "cppAuto":
      return calculateCppAuto(safeAmount, usedFrequency, position);
    case "slaviaauto":
      return calculateSlaviaAuto(safeAmount, usedFrequency, position);
    case "cppPPRbez": {
      const dto = calculateCppPPRbez(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const total = filtered.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      return { items: filtered, total };
    }
    case "cppPPRs":
      return calculateCppPPRs(safeAmount, usedFrequency, position);
    case "allianzAuto":
      return calculateAllianzAuto(safeAmount, usedFrequency, position);
    case "csobAuto":
      return calculateCsobAuto(safeAmount, usedFrequency, position);
    case "uniqaAuto":
    case "uniqaflotila":
      return calculateUniqaAuto(safeAmount, usedFrequency, position);
    case "pillowAuto":
      return calculatePillowAuto(safeAmount, usedFrequency, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(safeAmount, usedFrequency, position);
    case "zamex":
      return calculateZamex(safeAmount, usedFrequency, position);
    case "cppcestovko":
      return calculateCppCestovko(safeAmount, position);
    case "axacestovko":
      return calculateAxaCestovko(safeAmount, position);
    case "koopcestovko":
      return calculateKoopCestovko(safeAmount, position);
    case "comfortcc":
      return calculateComfortCC({
        fee: safeAmount,
        payment:
          typeof comfortPayment === "number" && Number.isFinite(comfortPayment)
            ? Math.max(0, comfortPayment)
            : 0,
        targetAmount:
          comfortGradual &&
          typeof comfortTargetAmount === "number" &&
          Number.isFinite(comfortTargetAmount)
            ? Math.max(0, comfortTargetAmount)
            : 0,
        isSavings: Boolean(comfortGradual),
        isGradualFee: Boolean(comfortGradual),
        position,
      });
    default:
      return null;
  }
};

const computeManagerOverridesForChain = ({
  managerChain,
  adviserPosition,
  adviserMode,
  productKey,
  inputAmount,
  frequencyRaw,
  durationYears,
  durationMonths,
  maxCizinKomplexVariant,
  comfortPayment,
  comfortGradual,
  comfortTargetAmount,
}: {
  managerChain: NormalizedManagerChainEntry[];
  adviserPosition: Position;
  adviserMode: CommissionMode;
  productKey: Product;
  inputAmount: number;
  frequencyRaw: PaymentFrequency;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPayment: number | null;
  comfortGradual: boolean | null;
  comfortTargetAmount: number | null;
}): NormalizedManagerOverrideEntry[] => {
  const overrides: NormalizedManagerOverrideEntry[] = [];
  let childPositionForBaseline: Position | null = adviserPosition;

  managerChain.forEach((manager) => {
    if (!manager.position) return;
    const managerMode = manager.commissionMode ?? adviserMode;

    const managerResult = computeItemsForProductPositionAndMode({
      productKey,
      position: manager.position,
      commissionMode: managerMode,
      inputAmount,
      frequencyRaw,
      durationYears,
      durationMonths,
      maxCizinKomplexVariant,
      comfortPayment,
      comfortGradual,
      comfortTargetAmount,
    });
    const baselineResult = childPositionForBaseline
      ? computeItemsForProductPositionAndMode({
          productKey,
          position: childPositionForBaseline,
          commissionMode: managerMode,
          inputAmount,
          frequencyRaw,
          durationYears,
          durationMonths,
          maxCizinKomplexVariant,
          comfortPayment,
          comfortGradual,
          comfortTargetAmount,
        })
      : null;

    if (!managerResult || !baselineResult) {
      childPositionForBaseline = manager.position;
      return;
    }

    const managerItems = stripTotalRows(managerResult.items);
    const baselineItems = stripTotalRows(baselineResult.items);

    const managerMap = new Map<string, { title: string; amount: number }>();
    managerItems.forEach((item) => {
      const key = normalizeTitleKey(item.title ?? "");
      const prev = managerMap.get(key);
      managerMap.set(key, {
        title: item.title ?? prev?.title ?? key,
        amount: (prev?.amount ?? 0) + (item.amount ?? 0),
      });
    });

    const diffItems: CommissionResultItemDTO[] = [];
    baselineItems.forEach((item) => {
      const key = normalizeTitleKey(item.title ?? "");
      const managerValue = managerMap.get(key);
      const managerAmount = managerValue?.amount ?? 0;
      const baselineAmount = item.amount ?? 0;
      const remaining = managerAmount - baselineAmount;
      if (remaining > 0) {
        diffItems.push({
          title: managerValue?.title ?? item.title,
          amount: remaining,
        });
      }
      managerMap.delete(key);
    });

    managerMap.forEach((value) => {
      if (value.amount > 0) {
        diffItems.push({ title: value.title, amount: value.amount });
      }
    });

    const diffTotal = totalWithMultipliers(diffItems);
    if (diffItems.length > 0 && diffTotal > 0) {
      overrides.push({
        email: manager.email ?? null,
        position: manager.position,
        commissionMode: managerMode,
        items: diffItems,
        total: diffTotal,
      });
    }

    childPositionForBaseline = manager.position;
  });

  return overrides;
};

const collectAllowedEmailsForCreate = ({
  ownerEmail,
  managerEmailSnapshot,
  managerChain,
  managerOverrides,
}: {
  ownerEmail: string;
  managerEmailSnapshot: string | null;
  managerChain: NormalizedManagerChainEntry[];
  managerOverrides: NormalizedManagerOverrideEntry[];
}): string[] => {
  const allowedEmailsSet = new Set<string>([ownerEmail]);
  if (managerEmailSnapshot) allowedEmailsSet.add(managerEmailSnapshot);
  managerChain.forEach((row) => {
    if (row.email) allowedEmailsSet.add(row.email);
  });
  managerOverrides.forEach((row) => {
    if (row.email) allowedEmailsSet.add(row.email);
  });
  return Array.from(allowedEmailsSet);
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

    if (field === "durationMonths") {
      const parsed = parseOptionalInteger(rawValue, field, { min: 1, max: 240 });
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    if (field === "maxCizinKomplexVariant") {
      const parsed = parseOptionalMaxCizinKomplexVariant(rawValue);
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

const contractNumberClaimDocId = (value: string | null | undefined): string =>
  encodeURIComponent(normalizeContractNumber(value).toLowerCase());

const isFirestoreFailedPrecondition = (error: unknown): boolean => {
  const code =
    typeof (error as { code?: unknown })?.code === "number"
      ? (error as { code?: number }).code
      : null;
  if (code === 9) return true;
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message?: string }).message ?? ""
      : "";
  return /FAILED_PRECONDITION/i.test(message);
};

const normalizeContractEntryType = (
  value: unknown
): "contract" | "endorsement" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "contract" || normalized === "endorsement") {
    return normalized;
  }
  return null;
};

type ExistingContractByNumber = {
  entryPath: string;
  ownerEmail: string | null;
  entryId: string | null;
};

async function findExistingContractByNumber(
  contractNumber: string,
  options: { excludeEntryPath?: string | null } = {}
): Promise<ExistingContractByNumber | null> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const normalized = normalizeContractNumber(contractNumber);
  const excludeEntryPath = (options.excludeEntryPath ?? "").trim();
  if (!normalized) return null;

  const claimRef = db
    .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
    .doc(contractNumberClaimDocId(normalized));
  const claimSnap = await claimRef.get();
  if (claimSnap.exists) {
    const claimData = (claimSnap.data() ?? {}) as {
      entryPath?: string | null;
      ownerEmail?: string | null;
      entryId?: string | null;
    };
    const claimedEntryPath = (claimData.entryPath ?? "").trim();
    if (claimedEntryPath && claimedEntryPath !== excludeEntryPath) {
      const claimedEntrySnap = await db.doc(claimedEntryPath).get();
      if (claimedEntrySnap.exists) {
        const claimedEntry = (claimedEntrySnap.data() ?? {}) as ContractDoc;
        if (
          normalizeContractEntryType(claimedEntry.entryType ?? "contract") === "contract" &&
          normalizeContractNumber(claimedEntry.contractNumber) === normalized
        ) {
          return {
            entryPath: claimedEntryPath,
            ownerEmail:
              normalizeEmail(claimData.ownerEmail) ||
              normalizeEmail(
                (claimedEntry.userEmail as string | undefined) ??
                  claimedEntrySnap.ref.path.split("/")[1]
              ) ||
              null,
            entryId: (claimData.entryId ?? "").trim() || claimedEntrySnap.id,
          };
        }
      }
    }
  }

  const refs = await resolveEntryRefsByContractNumber(normalized);
  const refsByPath = new Map<string, FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>>();
  refs.forEach((ref) => refsByPath.set(ref.path, ref));
  for (const ref of refsByPath.values()) {
    if (excludeEntryPath && ref.path === excludeEntryPath) continue;
    const snap = await ref.get();
    if (!snap.exists) continue;

    const data = (snap.data() ?? {}) as ContractDoc;
    if (normalizeContractEntryType(data.entryType ?? "contract") !== "contract") continue;
    if (normalizeContractNumber(data.contractNumber) !== normalized) continue;

    const ownerFromPath = ref.path.split("/")[1] ?? "";
    return {
      entryPath: ref.path,
      ownerEmail: normalizeEmail((data.userEmail as string | undefined) ?? ownerFromPath) || null,
      entryId: ref.id,
    };
  }

  return null;
}

const contractRefDocId = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${entryId.trim()}`;

const entryRefPath = (ownerEmail: string, entryId: string): string =>
  `users/${normalizeEmail(ownerEmail)}/entries/${entryId.trim()}`;

const contractRefFromData = ({
  ownerEmail,
  entryId,
  contractNumber,
  productKey,
}: {
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null | undefined;
  productKey: Product | null | undefined;
}) => {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const trimmedEntryId = entryId.trim();
  const contractNumberNormalized = normalizeContractNumber(contractNumber);
  const contractNumberLoose = normalizeContractNumberLoose(contractNumber);

  if (!normalizedOwner || !trimmedEntryId || !contractNumberNormalized) {
    return null;
  }

  return {
    ownerEmail: normalizedOwner,
    entryId: trimmedEntryId,
    entryPath: entryRefPath(normalizedOwner, trimmedEntryId),
    contractNumberRaw:
      typeof contractNumber === "string" ? contractNumber.trim() : "",
    contractNumberNormalized,
    contractNumberLoose,
    productKey: productKey ?? null,
    updatedAt: new Date(),
  };
};

const applyContractRefToBatch = ({
  batch,
  ownerEmail,
  entryId,
  contractNumber,
  productKey,
}: {
  batch: FirebaseFirestore.WriteBatch;
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null | undefined;
  productKey: Product | null | undefined;
}) => {
  if (!adminDb) return;
  const ref = adminDb
    .collection(CONTRACT_REFS_COLLECTION)
    .doc(contractRefDocId(ownerEmail, entryId));
  const payload = contractRefFromData({
    ownerEmail,
    entryId,
    contractNumber,
    productKey,
  });
  if (!payload) {
    batch.delete(ref);
    return;
  }
  batch.set(ref, payload, { merge: true });
};

async function resolveEntryRefsByContractNumber(
  contractNumber: string
): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[]> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const normalized = normalizeContractNumber(contractNumber);
  if (!normalized) return [];
  const loose = normalizeContractNumberLoose(contractNumber);

  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();

  const consumeContractRefSnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as {
        ownerEmail?: string | null;
        entryId?: string | null;
        entryPath?: string | null;
      };
      const ownerEmail = normalizeEmail(data.ownerEmail);
      const entryId = (data.entryId ?? "").trim();
      const entryPathRaw = (data.entryPath ?? "").trim();
      const entryPath =
        entryPathRaw || (ownerEmail && entryId ? entryRefPath(ownerEmail, entryId) : "");
      if (!entryPath) continue;
      refsByPath.set(entryPath, db.doc(entryPath));
    }
  };

  const consumeEntrySnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      refsByPath.set(docSnap.ref.path, docSnap.ref);
    }
  };

  const contractRefQueries: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = [
    db
      .collection(CONTRACT_REFS_COLLECTION)
      .where("contractNumberNormalized", "==", normalized)
      .get(),
  ];
  if (loose && loose !== normalized) {
    contractRefQueries.push(
      db.collection(CONTRACT_REFS_COLLECTION).where("contractNumberLoose", "==", loose).get()
    );
  }

  try {
    const contractRefSnaps = await Promise.all(contractRefQueries);
    contractRefSnaps.forEach(consumeContractRefSnap);
  } catch (queryErr) {
    if (isFirestoreFailedPrecondition(queryErr)) {
      console.warn(
        "resolveEntryRefsByContractNumber: contractRefs query failed with FAILED_PRECONDITION, skipping deep duplicate lookup.",
        queryErr
      );
      return [...refsByPath.values()];
    }
    throw queryErr;
  }

  if (refsByPath.size === 0) {
    const entryQueries: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = [
      db.collectionGroup("entries").where("contractNumber", "==", contractNumber).get(),
    ];
    if (normalized && normalized !== contractNumber) {
      entryQueries.push(
        db.collectionGroup("entries").where("contractNumber", "==", normalized).get()
      );
    }
    if (loose && loose !== normalized && loose !== contractNumber) {
      entryQueries.push(
        db.collectionGroup("entries").where("contractNumber", "==", loose).get()
      );
    }
    try {
      const entrySnaps = await Promise.all(entryQueries);
      entrySnaps.forEach(consumeEntrySnap);
    } catch (queryErr) {
      if (isFirestoreFailedPrecondition(queryErr)) {
        console.warn(
          "resolveEntryRefsByContractNumber: collectionGroup entries query failed with FAILED_PRECONDITION, returning refs from contractRefs only.",
          queryErr
        );
        return [...refsByPath.values()];
      }
      throw queryErr;
    }
  }

  return [...refsByPath.values()];
}

async function markTeamOverviewOwnersDirty(
  ownerEmails: Iterable<string>
): Promise<void> {
  if (!adminDb) return;

  const owners = Array.from(
    new Set(
      Array.from(ownerEmails)
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
    )
  );
  if (owners.length === 0) return;

  const db = adminDb;
  const yearMonth = currentYearMonth(new Date());
  const BATCH_LIMIT = 400;

  let batch = db.batch();
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const ownerEmail of owners) {
    const totalsRef = db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail);
    const monthlyRef = db
      .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
      .doc(teamOverviewMonthDocId(ownerEmail, yearMonth));

    batch.delete(totalsRef);
    batch.delete(monthlyRef);
    ops += 2;

    if (ops >= BATCH_LIMIT) {
      await commitBatch();
    }
  }

  await commitBatch();
}

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
  const usersByEmail = new Map<string, UserNode>();

  snap.forEach((doc) => {
    const data = doc.data() as any;
    // Never trust mutable data.email for authorization graph building.
    // Document id is the canonical user identity.
    const email = normalizeEmail(doc.id);
    if (!email) return;
    const managerEmail = normalizeEmail(data.managerEmail as string | undefined);
    const position = (data.position as Position | null | undefined) ?? null;
    const candidate: UserNode = {
      email,
      managerEmail: managerEmail || null,
      position,
    };
    const existing = usersByEmail.get(email);
    if (!existing) {
      usersByEmail.set(email, candidate);
      return;
    }

    // Keep the record that contains more hierarchy information.
    const existingScore =
      (existing.position ? 1 : 0) + (existing.managerEmail ? 1 : 0);
    const candidateScore =
      (candidate.position ? 1 : 0) + (candidate.managerEmail ? 1 : 0);
    if (candidateScore > existingScore) {
      usersByEmail.set(email, candidate);
    }
  });

  const knownEmails = new Set<string>(usersByEmail.keys());
  const users = Array.from(usersByEmail.values()).map((user) => {
    const managerEmail =
      user.managerEmail &&
      user.managerEmail !== user.email &&
      knownEmails.has(user.managerEmail)
        ? user.managerEmail
        : null;
    return {
      email: user.email,
      managerEmail,
      position: user.position,
    };
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
        const qByCreated = db
          .collectionGroup("entries")
          .where("userEmail", "in", chunk)
          .orderBy("createdAt", "desc");
        // Keep createdAt query uncursored. Backfilled contracts can have old
        // contractSignedDate with fresh createdAt; cursoring createdAt would
        // skip them permanently in subsequent pages.
        if (cursor) {
          qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
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
          const qByCreated = db
            .collection("users")
            .doc(owner)
            .collection("entries")
            .orderBy("createdAt", "desc");
          // Keep createdAt query uncursored. Backfilled contracts can have old
          // contractSignedDate with fresh createdAt; cursoring createdAt would
          // skip them permanently in subsequent pages.
          if (cursor) {
            qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
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

const toNonEmptyCandidateValues = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );

const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatus | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "active") return "active";
  if (normalized === "expired") return "expired";
  return "none";
};

const resolveSubscriptionStatusFromSources = (
  sources: Array<Record<string, unknown> | null | undefined>
): SubscriptionStatus | null => {
  for (const source of sources) {
    if (!source) continue;
    const direct = normalizeSubscriptionStatus(source.subscriptionStatus);
    if (direct) return direct;
    const legacy = normalizeSubscriptionStatus(source.subscriptionstatus);
    if (legacy) return legacy;
  }
  return null;
};

const loadUserSubscriptionStatus = async ({
  email,
  rawTokenEmail,
  uid,
}: {
  email: string;
  rawTokenEmail: string;
  uid: string;
}): Promise<SubscriptionStatus | null> => {
  if (!adminDb) return null;

  const db = adminDb;
  const candidateValues = toNonEmptyCandidateValues([
    email,
    rawTokenEmail,
    rawTokenEmail.toLowerCase(),
  ]);

  const privateSnaps = await Promise.all(
    candidateValues.map((value) => db.collection("usersPrivate").doc(value).get())
  );
  const privateSources = privateSnaps
    .filter((snap) => snap.exists)
    .map(
      (snap) =>
        (snap.data() as Record<string, unknown> | undefined) ?? ({} as Record<string, unknown>)
    );
  const privateStatus = resolveSubscriptionStatusFromSources(privateSources);
  if (privateStatus) return privateStatus;

  const [directPublicSnaps, byEmailSnaps, byUidSnap] = await Promise.all([
    Promise.all(candidateValues.map((value) => db.collection("users").doc(value).get())),
    Promise.all(
      candidateValues.map((value) =>
        db.collection("users").where("email", "==", value).limit(5).get()
      )
    ),
    uid ? db.collection("users").where("userId", "==", uid).limit(5).get() : null,
  ]);

  const publicSources: Record<string, unknown>[] = [];
  directPublicSnaps.forEach((snap) => {
    if (!snap.exists) return;
    publicSources.push(
      (snap.data() as Record<string, unknown> | undefined) ?? ({} as Record<string, unknown>)
    );
  });
  byEmailSnaps.forEach((querySnap) => {
    querySnap.docs.forEach((docSnap) => {
      publicSources.push(
        (docSnap.data() as Record<string, unknown> | undefined) ?? ({} as Record<string, unknown>)
      );
    });
  });
  byUidSnap?.docs.forEach((docSnap) => {
    publicSources.push(
      (docSnap.data() as Record<string, unknown> | undefined) ?? ({} as Record<string, unknown>)
    );
  });

  return resolveSubscriptionStatusFromSources(publicSources);
};

async function getAuthContext(
  req: NextRequest,
  options: AuthContextOptions = {}
) {
  const {
    requireKnownUser = false,
    requireActiveSubscription = false,
  } = options;

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
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const msg = err?.message || "Invalid or expired token";
    const code = err?.code || "auth/invalid-token";
    return { error: `Invalid or expired token (${code}): ${msg}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }
  const rawTokenEmail = typeof decoded.email === "string" ? decoded.email.trim() : "";

  const { users, childrenByManager } = await getCachedUserTree();
  const me = users.find((u) => u.email === email) ?? null;
  if (requireKnownUser && !me) {
    return { error: "Uživatel nemá interní profil v systému.", status: 403 } as const;
  }

  if (requireActiveSubscription) {
    const subscriptionStatus = await loadUserSubscriptionStatus({
      email,
      rawTokenEmail,
      uid: decoded.uid,
    });
    if (subscriptionStatus === "expired") {
      return { error: "Účet má expirované předplatné.", status: 403 } as const;
    }
  }

  const position = (me?.position as Position | null | undefined) ?? null;
  const hasDirectSubs = (childrenByManager.get(email) ?? []).length > 0;
  const teamEmails =
    isManagerPosition(position) || hasDirectSubs
      ? collectSubordinateHierarchy(email, childrenByManager).subordinateEmails
      : [];

  return {
    email,
    uid: decoded.uid,
    position,
    teamEmails,
    users,
    childrenByManager,
  };
}

export async function handleContractsGet(
  req: NextRequest,
  mode: ContractsGetMode = "auto"
) {
  const ctx = await getAuthContext(req, {
    requireKnownUser: true,
    requireActiveSubscription: true,
  });
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const { email, position, teamEmails, users } = ctx;
  const rateLimitResult = consumeRateLimit({
    namespace: "api:contracts:get",
    key: email,
    limit: CONTRACTS_GET_RATE_LIMIT,
    windowMs: CONTRACTS_GET_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimitResult.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  }
  const withGetRateLimitHeaders = (response: NextResponse) => {
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  };

  const search = req.nextUrl.searchParams;
  const detailOwnerEmail = normalizeEmail(search.get("ownerEmail"));
  const detailEntryId = (search.get("entryId") ?? "").trim();
  const detailRequested =
    mode === "detail" ||
    (mode === "auto" && Boolean(detailOwnerEmail && detailEntryId));

  if (mode === "detail" && (!detailOwnerEmail || !detailEntryId)) {
    return NextResponse.json(
      { ok: false, error: "Chybí ownerEmail nebo entryId." } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  if (detailRequested && detailOwnerEmail && detailEntryId) {
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

    return withGetRateLimitHeaders(NextResponse.json(response));
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

  return withGetRateLimitHeaders(NextResponse.json(response));
}

export async function handleContractsCreate(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req, {
      requireKnownUser: true,
      requireActiveSubscription: true,
    });
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { email, uid } = ctx;

    const rateLimitResult = consumeRateLimit({
      namespace: "api:contracts:create",
      key: email,
      limit: CONTRACTS_CREATE_RATE_LIMIT,
      windowMs: CONTRACTS_CREATE_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Neplatný JSON payload." },
        { status: 400 }
      );
    }

    const entryRaw =
      isPlainObject(body) && isPlainObject(body.entry)
        ? body.entry
        : body;

    const normalizedEntry = normalizeCreateEntryPayload({
      raw: entryRaw,
      ownerEmail: email,
      ownerUid: uid,
    });
    if (!normalizedEntry.ok) {
      return NextResponse.json(
        { ok: false, error: normalizedEntry.error },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." },
        { status: 500 }
      );
    }

    const signedDateIso = toIsoDay(normalizedEntry.payload.contractSignedDate);
    const callerProfile = await loadCallerProfile({
      uid,
      tokenEmail: email,
    });
    if (!callerProfile) {
      return NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst profil přihlášeného uživatele." },
        { status: 403 }
      );
    }

    const trustedPosition = resolvePositionForSignedDate(callerProfile, signedDateIso);
    if (!trustedPosition) {
      return NextResponse.json(
        { ok: false, error: "Nelze určit důvěryhodnou pozici uživatele pro výpočet." },
        { status: 400 }
      );
    }

    const trustedMode = callerProfile.commissionMode ?? "standard";
    const trustedManagerEmail = normalizeEmail(callerProfile.managerEmail) || null;
    let trustedManagerChain = await buildTrustedManagerChainForSignedDate({
      directManagerEmail: trustedManagerEmail,
      signedDateIso,
    });

    trustedManagerChain = ensureManagerChainWithDirectManager(
      trustedManagerChain,
      trustedManagerEmail,
      trustedManagerChain[0]?.position ?? null,
      trustedManagerChain[0]?.commissionMode ?? null
    );

    if (!hasResolvedTopManagerPosition(trustedManagerChain, trustedManagerEmail)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nepodařilo se načíst pozici nadřízeného. Uložení je zablokované, aby nechyběla meziprovize.",
        },
        { status: 400 }
      );
    }

    const trustedResult = computeItemsForProductPositionAndMode({
      productKey: normalizedEntry.payload.productKey,
      position: trustedPosition,
      commissionMode: trustedMode,
      inputAmount: normalizedEntry.payload.inputAmount,
      frequencyRaw: normalizedEntry.payload.frequencyRaw,
      durationYears: normalizedEntry.payload.durationYears,
      durationMonths: normalizedEntry.payload.durationMonths,
      maxCizinKomplexVariant: normalizedEntry.payload.maxCizinKomplexVariant,
      comfortPayment: normalizedEntry.payload.comfortPayment,
      comfortGradual: normalizedEntry.payload.comfortGradual,
      comfortTargetAmount: normalizedEntry.payload.comfortTargetAmount,
    });
    if (!trustedResult) {
      return NextResponse.json(
        { ok: false, error: "Nepodařilo se serverově přepočítat provizi pro daný produkt." },
        { status: 400 }
      );
    }
    if (
      normalizedEntry.payload.entryType === "contract" &&
      trustedResult.items.length === 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Smlouva musí obsahovat alespoň jednu položku provize." },
        { status: 400 }
      );
    }

    const trustedManagerOverrides = computeManagerOverridesForChain({
      managerChain: trustedManagerChain,
      adviserPosition: trustedPosition,
      adviserMode: trustedMode,
      productKey: normalizedEntry.payload.productKey,
      inputAmount: normalizedEntry.payload.inputAmount,
      frequencyRaw: normalizedEntry.payload.frequencyRaw,
      durationYears: normalizedEntry.payload.durationYears,
      durationMonths: normalizedEntry.payload.durationMonths,
      maxCizinKomplexVariant: normalizedEntry.payload.maxCizinKomplexVariant,
      comfortPayment: normalizedEntry.payload.comfortPayment,
      comfortGradual: normalizedEntry.payload.comfortGradual,
      comfortTargetAmount: normalizedEntry.payload.comfortTargetAmount,
    });
    const trustedManagerPosition = trustedManagerChain[0]?.position ?? null;
    const trustedManagerMode = trustedManagerChain[0]?.commissionMode ?? null;
    const trustedAllowedEmails = collectAllowedEmailsForCreate({
      ownerEmail: email,
      managerEmailSnapshot: trustedManagerEmail,
      managerChain: trustedManagerChain,
      managerOverrides: trustedManagerOverrides,
    });

    const trustedPayload: NormalizedCreateEntryPayload = {
      ...normalizedEntry.payload,
      position: trustedPosition,
      commissionMode: trustedMode,
      items: trustedResult.items,
      total: trustedResult.total,
      result: {
        items: trustedResult.items,
        total: trustedResult.total,
      },
      managerEmailSnapshot: trustedManagerEmail,
      managerPositionSnapshot: trustedManagerPosition,
      managerModeSnapshot: trustedManagerMode,
      managerChain: trustedManagerChain,
      managerOverrides: trustedManagerOverrides,
      allowedEmails: trustedAllowedEmails,
    };

    if (trustedPayload.entryType === "contract") {
      const existingContract = await findExistingContractByNumber(
        trustedPayload.contractNumber
      );
      if (existingContract) {
        return NextResponse.json(
          {
            ok: false,
            error: "Smlouva s tímto číslem už v systému existuje.",
            duplicate: existingContract,
          },
          { status: 409 }
        );
      }
    }

    try {
      const db = adminDb;
      const ownerEntriesRef = db.collection("users").doc(email).collection("entries");
      const createdRef = ownerEntriesRef.doc();

      if (trustedPayload.entryType === "contract") {
        const contractNumberNormalized = normalizeContractNumber(
          trustedPayload.contractNumber
        );
        const contractNumberLoose = normalizeContractNumberLoose(
          trustedPayload.contractNumber
        );
        const claimRef = db
          .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
          .doc(contractNumberClaimDocId(contractNumberNormalized));
        const claimPayload = {
          contractNumberRaw: trustedPayload.contractNumber,
          contractNumberNormalized,
          contractNumberLoose,
          ownerEmail: email,
          entryId: createdRef.id,
          entryPath: createdRef.path,
          updatedAt: new Date(),
          createdAt: new Date(),
        };

        await db.runTransaction(async (tx) => {
          const claimSnap = await tx.get(claimRef);
          if (claimSnap.exists) {
            const claimData = (claimSnap.data() ?? {}) as {
              entryPath?: string | null;
            };
            const claimEntryPath = (claimData.entryPath ?? "").trim();
            if (claimEntryPath && claimEntryPath !== createdRef.path) {
              const claimEntrySnap = await tx.get(db.doc(claimEntryPath));
              if (claimEntrySnap.exists) {
                const claimEntryData = (claimEntrySnap.data() ?? {}) as ContractDoc;
                if (
                  normalizeContractEntryType(
                    claimEntryData.entryType ?? "contract"
                  ) === "contract" &&
                  normalizeContractNumber(claimEntryData.contractNumber) ===
                    contractNumberNormalized
                ) {
                  const duplicateErr = new Error(
                    "Smlouva s tímto číslem už v systému existuje."
                  ) as Error & { statusCode?: number; duplicatePath?: string };
                  duplicateErr.statusCode = 409;
                  duplicateErr.duplicatePath = claimEntryPath;
                  throw duplicateErr;
                }
              }
            }
            tx.set(claimRef, claimPayload, { merge: true });
          } else {
            tx.create(claimRef, claimPayload);
          }

          tx.create(createdRef, trustedPayload);

          const contractRefPayload = contractRefFromData({
            ownerEmail: email,
            entryId: createdRef.id,
            contractNumber: trustedPayload.contractNumber,
            productKey: trustedPayload.productKey,
          });
          const contractRef = db
            .collection(CONTRACT_REFS_COLLECTION)
            .doc(contractRefDocId(email, createdRef.id));
          if (contractRefPayload) {
            tx.set(contractRef, contractRefPayload, { merge: true });
          } else {
            tx.delete(contractRef);
          }
        });
      } else {
        await createdRef.create(trustedPayload);
        const batch = db.batch();
        applyContractRefToBatch({
          batch,
          ownerEmail: email,
          entryId: createdRef.id,
          contractNumber: trustedPayload.contractNumber,
          productKey: trustedPayload.productKey,
        });
        await batch.commit();
      }

      try {
        await markTeamOverviewOwnersDirty([email]);
      } catch (markErr) {
        console.warn(
          "POST /api/contracts create: team-overview invalidace selhala:",
          markErr
        );
      }

      const response = NextResponse.json({
        ok: true,
        entryId: createdRef.id,
      });
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    } catch (createErr: any) {
      const message =
        typeof createErr?.message === "string" && createErr.message.trim()
          ? createErr.message.trim()
          : "Neznámá chyba při ukládání smlouvy.";
      const statusCode = Number((createErr as any)?.statusCode);
      if (statusCode === 409) {
        return NextResponse.json(
          {
            ok: false,
            error: message,
            duplicatePath:
              typeof (createErr as any)?.duplicatePath === "string"
                ? (createErr as any).duplicatePath
                : null,
          },
          { status: 409 }
        );
      }
      console.error("POST /api/contracts create selhal:", createErr);
      return NextResponse.json(
        { ok: false, error: `Uložení smlouvy selhalo: ${message}` },
        { status: 500 }
      );
    }
  } catch (unexpectedErr: any) {
    const message =
      typeof unexpectedErr?.message === "string" && unexpectedErr.message.trim()
        ? unexpectedErr.message.trim()
        : "Neznámá neočekávaná chyba při ukládání smlouvy.";
    console.error("POST /api/contracts create neočekávaně selhal:", unexpectedErr);
    return NextResponse.json(
      { ok: false, error: `Uložení smlouvy selhalo: ${message}` },
      { status: 500 }
    );
  }
}

export async function handleContractsPatch(
  req: NextRequest,
  forcedAction?: ContractsPatchAction
) {
  const ctx = await getAuthContext(req, {
    requireKnownUser: true,
    requireActiveSubscription: true,
  });
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

  body =
    body && typeof body === "object" && !Array.isArray(body)
      ? body
      : {};
  if (forcedAction) {
    body.action = forcedAction;
  }

  const action =
    typeof body?.action === "string" ? body.action.trim() : "";
  if (action === "syncEntryIndex") {
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
      if (!adminDb) {
        return NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován." },
          { status: 500 }
        );
      }

      const entryRef = adminDb
        .collection("users")
        .doc(ownerEmail)
        .collection("entries")
        .doc(entryId);
      const entrySnap = await entryRef.get();

      const batch = adminDb.batch();
      if (entrySnap.exists) {
        const data = (entrySnap.data() ?? {}) as ContractDoc;
        applyContractRefToBatch({
          batch,
          ownerEmail,
          entryId: entrySnap.id,
          contractNumber: data.contractNumber,
          productKey: (data.productKey as Product | undefined) ?? null,
        });
      } else {
        applyContractRefToBatch({
          batch,
          ownerEmail,
          entryId,
          contractNumber: null,
          productKey: null,
        });
      }
      await batch.commit();

      try {
        await markTeamOverviewOwnersDirty([ownerEmail]);
      } catch (markErr) {
        console.warn(
          "PATCH /api/contracts syncEntryIndex: team-overview invalidace selhala:",
          markErr
        );
      }

      return NextResponse.json({
        ok: true,
        indexed: entrySnap.exists,
      });
    } catch (syncErr: any) {
      const message =
        typeof syncErr?.message === "string" && syncErr.message.trim()
          ? syncErr.message.trim()
          : "Neznámá chyba při synchronizaci indexu smlouvy.";
      console.error("PATCH /api/contracts syncEntryIndex selhal:", syncErr);
      return NextResponse.json(
        { ok: false, error: `Synchronizace indexu selhala: ${message}` },
        { status: 500 }
      );
    }
  }
  if (action === "syncCppStatus" && !CPP_STATUS_SYNC_ENABLED) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cpp-sync-disabled",
    });
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

      const indexedRefs = await resolveEntryRefsByContractNumber(contractNumber);
      const ownerEntryPrefix = `users/${ownerEmail}/entries/`;
      for (const indexedRef of indexedRefs) {
        if (!indexedRef.path.startsWith(ownerEntryPrefix)) continue;
        targetRefs.set(indexedRef.path, indexedRef);
      }

      const filteredTargetRefs = new Map<
        string,
        FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
      >();
      for (const ref of targetRefs.values()) {
        const snap = await ref.get();
        if (!snap.exists) continue;
        const data = snap.data() as ContractDoc;
        const docProduct = data.productKey as Product | undefined;
        if (!docProduct || !CPP_STATUS_SYNC_PRODUCTS.has(docProduct)) continue;
        if (normalizeContractNumber(data.contractNumber ?? null) !== contractNumber) continue;
        filteredTargetRefs.set(ref.path, ref);
      }

      if (filteredTargetRefs.size === 0) {
        filteredTargetRefs.set(entrySnap.ref.path, entrySnap.ref);
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
      for (const ref of filteredTargetRefs.values()) {
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
    entryRefs.forEach((ref, idx) => {
      batch.update(ref, payload);
      const currentData = (entrySnaps[idx]?.data() ?? {}) as ContractDoc;
      const hasContractNumberUpdate = Object.prototype.hasOwnProperty.call(
        payload,
        "contractNumber"
      );
      const nextContractNumber = hasContractNumberUpdate
        ? (payload.contractNumber as string | null | undefined)
        : currentData.contractNumber;
      applyContractRefToBatch({
        batch,
        ownerEmail,
        entryId: entryIds[idx] ?? ref.id,
        contractNumber: nextContractNumber,
        productKey: (currentData.productKey as Product | undefined) ?? null,
      });
    });
    await batch.commit();
    try {
      await markTeamOverviewOwnersDirty([ownerEmail]);
    } catch (markErr) {
      console.warn(
        "PATCH /api/contracts updateFields: team-overview invalidace selhala:",
        markErr
      );
    }

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

export async function handleContractsDelete(req: NextRequest) {
  const ctx = await getAuthContext(req, {
    requireKnownUser: true,
    requireActiveSubscription: true,
  });
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
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován." },
      { status: 500 }
    );
  }

  const allowedOwners = new Set<string>([email, ...teamEmails]);
  const dirtyOwners = new Set<string>();
  let deleted = 0;
  const db = adminDb;
  let batch = db.batch();
  let opsInBatch = 0;
  const BATCH_LIMIT = 400;

  const commitBatch = async () => {
    if (opsInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    opsInBatch = 0;
  };

  for (const item of entries) {
    const owner = normalizeEmail(item.ownerEmail);
    const entryId = item.entryId as string | undefined;
    if (!owner || !entryId) continue;
    if (!allowedOwners.has(owner)) continue;

    const entryRef = db
      .collection("users")
      .doc(owner)
      .collection("entries")
      .doc(entryId);
    const contractRef = db
      .collection(CONTRACT_REFS_COLLECTION)
      .doc(contractRefDocId(owner, entryId));

    batch.delete(entryRef);
    batch.delete(contractRef);
    opsInBatch += 2;
    deleted += 1;
    dirtyOwners.add(owner);

    if (opsInBatch >= BATCH_LIMIT) {
      await commitBatch();
    }
  }
  await commitBatch();
  try {
    await markTeamOverviewOwnersDirty(dirtyOwners);
  } catch (markErr) {
    console.warn(
      "DELETE /api/contracts: team-overview invalidace selhala:",
      markErr
    );
  }

  return NextResponse.json({ ok: true, deleted });
}

export async function handleContractsList(req: NextRequest) {
  return handleContractsGet(req, "list");
}

export async function handleContractDetail(req: NextRequest) {
  return handleContractsGet(req, "detail");
}

export async function handleContractsSyncCppStatus(req: NextRequest) {
  return handleContractsPatch(req, "syncCppStatus");
}

export async function handleContractsSyncEntryIndex(req: NextRequest) {
  return handleContractsPatch(req, "syncEntryIndex");
}

export async function handleContractsUpdateFields(req: NextRequest) {
  return handleContractsPatch(req, "updateFields");
}

export async function handleContractsSetPaid(req: NextRequest) {
  return handleContractsPatch(req, "setPaid");
}
