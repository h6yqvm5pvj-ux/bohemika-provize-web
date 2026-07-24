// src/app/api/contracts/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import type { ServerImpersonationContext } from "@/lib/server/impersonation";
import {
  adminRoleAtLeast,
  resolveAdminRoleFromClaims,
} from "@/lib/adminAccess";
import {
  type CommissionMode,
  type CommissionCoefficientSet,
  type CommissionResultItemDTO,
  type MaxCizinKomplexVariant,
  type NeonCoefficientSet,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  buildChildrenByManager,
} from "@/app/lib/teamHierarchy";
import { toDate } from "@/app/lib/formatters";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { totalWithMultipliers } from "@/app/lib/commissionTotals";
import { computeLegacyFrequencyOverrideTotal } from "@/app/lib/managerOverrideTotals";
import {
  applyTipContractAdjustmentToCommissionItems,
  normalizeTipContractTitle,
} from "@/app/lib/tipContractCommission";
import {
  AUTO_PRODUCTS,
  COMFORT_PRODUCTS,
  LIFE_PRODUCTS as CATALOG_LIFE_PRODUCTS,
  LIABILITY_PRODUCTS,
  PROPERTY_PRODUCTS,
  TRAVEL_PRODUCTS,
  productLabel,
} from "@/app/lib/productCatalog";
import type {
  AuthContextOptions,
  ContractDetailResponse,
  ContractDoc,
  ContractLifePremiumChange,
  ContractListFilters,
  ContractListResponseShape,
  ContractResponseItem,
  ContractsFindResponse,
  ContractsPrecheckEntry,
  ContractsPrecheckResponse,
  ContractsResponse,
  ErrorResponse,
  PositionTimelineEntry,
  SubscriptionStatus,
  TipPayoutDoc,
  UserNode,
  UserProfileSnapshot,
  UserTreeResult,
} from "./contractsApi.types";
import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateKoopOdzam,
  calculateKoopPmop,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateSlaviaFlotila,
  calculateCppSimplex,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateKoopFlotila,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCC,
  isSlaviaAutoSupportedForSignedDate,
  isSlaviaFlotilaSupportedForSignedDate,
  SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE,
} from "@/app/lib/productFormulas";
import {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} from "@/app/lib/productFormulas/coefficientSets";
import {
  calculateNeonRefreshCommissionBase,
  isNeonHistoricalPeriod,
  NEON_REFRESH_STORNO_MONTHS,
  normalizeNeonDurationYears,
} from "@/app/lib/productFormulas/neon";
import { calculateMaxCizinKomplex } from "@/app/lib/productFormulas/maxcizinkomplex";
import { calculateCppHafan } from "@/app/lib/productFormulas/cpphafan";
import { calculateAllianzMujDomov } from "@/app/lib/productFormulas/allianzMujDomov";
import {
  evaluateSubscriptionAccess,
  normalizeIsoDay,
  normalizeSubscriptionStatus as normalizeSubscriptionStatusValue,
  type SubscriptionEffectiveState,
} from "@/lib/subscriptionAccess";
import {
  deleteContractPdfAttachment,
  normalizeStoredContractPdfAttachment,
  toPublicContractPdfAttachment,
  type StoredContractPdfAttachment,
} from "@/lib/server/contractPdfStorage";
import {
  isValidContractNumber,
  validateContractCoreInvariants,
} from "./contractsApi.validation";
import {
  contractMatchesListFilters,
  contractSortDate,
  hasContractListClientFilters,
  hasContractListFilters,
  parseContractListFilters,
} from "./contractsApi.listFilters";
import {
  DOMEX_DETAIL_ALLOWED_KEYS,
  FLEXI_DETAIL_ALLOWED_KEYS,
  NEON_DETAIL_ALLOWED_KEYS,
  SUPPORTED_PRODUCTS,
  TIP_CONTRACT_PERCENT_MAX,
  TIP_CONTRACT_PERCENT_MIN,
  isPlainObject,
  normalizeCreateEntryPayload,
  parseOptionalBoolean,
  parseOptionalFiniteNumber,
  parseOptionalInteger,
  parseOptionalMaxCizinKomplexVariant,
  parseOptionalTrimmedText,
  parseRequiredTrimmedText,
  sanitizeDetailObject,
  type NormalizedCreateEntryPayload,
  type NormalizedManagerChainEntry,
  type NormalizedManagerOverrideEntry,
  type ParseResult,
  type RefreshCommissionBasePayload,
} from "./contractsApi.createPayload";
import {
  buildDuplicateLookupKey,
  buildIdempotentEntryId,
  contractNumberClaimDocId,
  createDuplicateContractError,
  idempotentReplayMatchesPayload,
  isoDayFromUnknown,
  normalizeClientNameForDuplicate,
  normalizeContractEntryType,
  normalizeContractNumber,
  normalizeContractNumberLoose,
} from "./contractsApi.identity";
import {
  CONTRACT_NUMBER_CLAIMS_COLLECTION,
  CONTRACT_REFS_COLLECTION,
  applyContractRefToBatch,
  collectContractDuplicateGuardRefs,
  contractRefDocId,
  contractRefFromData,
  findExistingContractByNumber,
  resolveEntryRefsByContractNumber,
  type ExistingContractByNumber,
} from "./contractsApi.duplicates";
import {
  buildFindAllowedOwnerSet,
  canManageContractOwner,
  extractEmailFromUnknown,
  hasContractAccess,
  resolveAccountType,
  resolveContractFindScope,
  resolveContractListScope,
  resolveContractTeamAccess,
  selectedSubordinateEmailsFromParam,
  selectContractListOwners,
  shouldFetchTeamContractsInParallel,
} from "./contractsApi.access";

export { hasContractAccess } from "./contractsApi.access";

export type ContractsGetMode = "auto" | "detail" | "list";
export type ContractsPatchAction =
  | "syncCppStatus"
  | "syncEntryIndex"
  | "updateFields"
  | "setPaid";

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 50;
const CASHFLOW_PAGE_SIZE_MAX = 100;
const FILTERED_LIST_QUERY_LIMIT = 250;
const CONTRACTS_MUTATION_RATE_LIMIT = 60;
const CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;
const CONTRACTS_GET_RATE_LIMIT = 180;
const CONTRACTS_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const UPDATE_FIELDS_MAX_ENTRY_IDS = 50;
const USER_TREE_CACHE_TTL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTRACTS_CREATE_RATE_LIMIT = 30;
const CONTRACTS_CREATE_RATE_LIMIT_WINDOW_MS = 60_000;
const CONTRACTS_CREATE_IDEMPOTENCY_HEADER = "x-idempotency-key";
const CONTRACTS_CREATE_IDEMPOTENCY_MAX_LEN = 200;
const TIP_PAYOUTS_SUBCOLLECTION = "tipPayouts";
const TIP_PAYOUTS_BATCH_LIMIT = 350;
const TIP_PAYOUT_CUTOFF_DAY = 25;
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
const CPP_STATUS_SYNC_PRODUCTS = new Set<Product>([
  "neon",
  "zamex",
  "domex",
  "cpphafan",
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
  "policyEndDate",
  "stornoDate",
  "refreshReplacedBySignedDate",
  "replacementReplacedBySignedDate",
]);
const UPDATE_FIELDS_ALLOWED_DATE_FIELDS = new Set<string>([
  "contractSignedDate",
  "policyStartDate",
  "policyEndDate",
  "stornoDate",
]);
const UPDATE_FIELDS_ALLOWED_TOP_LEVEL_FIELDS = new Set<string>([
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientAddress",
  "contractNumber",
  "maxxContractDetailUrl",
  "cppExtranetEntityTypeId",
  "cppExtranetEntityId",
  "contractSignedDate",
  "policyStartDate",
  "policyEndDate",
  "carMake",
  "carPlate",
  "carVin",
  "carTp",
  "carOrv",
  "carAnnualMileage",
  "carAllianzScope",
  "carLiabilityLimit",
  "carHullSumInsured",
  "carHullSumInsuredText",
  "carHullDeductible",
  "carHullDeductibleText",
  "carHullRiskAccident",
  "carHullRiskTheft",
  "carHullRiskNatural",
  "carHullRiskVandalism",
  "carHullRiskAnimalCollision",
  "carAssistancePlan",
  "carAddonEso",
  "carAddonNaturalRisks",
  "carAddonKlika",
  "carAddonGlass",
  "carAddonGlassLimit",
  "carAddonAnimalCollision",
  "carAddonAnimalCollisionLimit",
  "carAddonAnimalDamage",
  "carAddonAnimalDamageLimit",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonTheftLimit",
  "carAddonNatural",
  "carAddonNaturalLimit",
  "carAddonOwnDamage",
  "carAddonOwnDamageLimit",
  "carAddonPothole",
  "carAddonNonFaultAccident",
  "carAddonGap",
  "carAddonGapLimit",
  "carAddonSmartGap",
  "carAddonServisPro",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonTransportedGoods",
  "carAddonFireExplosion",
  "carAddonLegalAdvice",
  "carAddonPassengerInjury",
  "carAddonKeyLossTheft",
  "neonDetail",
  "flexiDetail",
  "domexDetail",
  "maxdomovDetail",
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
  "maxxContractDetailUrl",
  "carMake",
  "carPlate",
  "carVin",
  "carTp",
  "carOrv",
  "carAnnualMileage",
  "carAllianzScope",
  "carAssistancePlan",
  "carHullSumInsuredText",
  "carHullDeductibleText",
  "cppExtranetEntityTypeId",
  "cppExtranetEntityId",
  "note",
]);
const UPDATE_FIELDS_OPTIONAL_NUMBER_FIELDS = new Set<string>([
  "carLiabilityLimit",
  "carHullSumInsured",
  "carHullDeductible",
  "carAddonGlassLimit",
  "carAddonAnimalCollisionLimit",
  "carAddonAnimalDamageLimit",
  "carAddonTheftLimit",
  "carAddonNaturalLimit",
  "carAddonOwnDamageLimit",
  "carAddonGapLimit",
]);
const UPDATE_FIELDS_OPTIONAL_BOOLEAN_FIELDS = new Set<string>([
  "carHullRiskAccident",
  "carHullRiskTheft",
  "carHullRiskNatural",
  "carHullRiskVandalism",
  "carHullRiskAnimalCollision",
  "carAddonEso",
  "carAddonNaturalRisks",
  "carAddonKlika",
  "carAddonGlass",
  "carAddonAnimalCollision",
  "carAddonAnimalDamage",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonNatural",
  "carAddonOwnDamage",
  "carAddonPothole",
  "carAddonNonFaultAccident",
  "carAddonGap",
  "carAddonSmartGap",
  "carAddonServisPro",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonTransportedGoods",
  "carAddonFireExplosion",
  "carAddonLegalAdvice",
  "carAddonPassengerInjury",
  "carAddonKeyLossTheft",
]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MANAGER_CHAIN_DEPTH = 9;
const CPP_WSEXTRA_URL = "https://wsextra.cpp.cz/extranet/extranet.asmx";
const CPP_SOAP_ACTION_STAV_SMLOUVY_ZP = "https://extranet.cpp.cz/StavSmlouvyZP";
const CPP_STATUS_SYNC_ENABLED = false;
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";
export const CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL = "jakub.rauscher@bohemika.eu";
const ENABLE_CONTRACT_CREATE_PUSH = true;
const NEW_CONTRACT_PUSH_RECENT_SIGNED_DAYS = 45;
const NEW_CONTRACT_PUSH_MAX_RECIPIENTS = 40;
const NEW_CONTRACT_PUSH_MAX_TOKENS_PER_USER = 30;
const NEW_CONTRACT_PUSH_MAX_TOKENS_PER_MULTICAST = 500;
const UNLINKED_ORIGINAL_REPLACEMENT_PRODUCTS = new Set<Product>(["domex", "cppAuto"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PUBLIC_APP_ORIGIN = "https://bohemka.app";

let cachedUserTree: { value: UserTreeResult; expiresAtMs: number } | null = null;
let cachedUserTreePromise: Promise<UserTreeResult> | null = null;
type CachedSubscriptionAccess = {
  status: SubscriptionStatus;
  paidUntil: string | null;
  effectiveState: SubscriptionEffectiveState;
};
const cachedSubscriptionStatus = new Map<
  string,
  { value: CachedSubscriptionAccess | null; expiresAtMs: number }
>();

const readCachedSubscriptionStatus = (
  key: string
): CachedSubscriptionAccess | null | undefined => {
  const now = Date.now();
  const cached = cachedSubscriptionStatus.get(key);
  if (!cached) return undefined;
  if (cached.expiresAtMs <= now) {
    cachedSubscriptionStatus.delete(key);
    return undefined;
  }
  return cached.value;
};

const writeCachedSubscriptionStatus = (
  key: string,
  value: CachedSubscriptionAccess | null
) => {
  const now = Date.now();
  cachedSubscriptionStatus.set(key, {
    value,
    expiresAtMs: now + SUBSCRIPTION_STATUS_CACHE_TTL_MS,
  });

  // Keep cache bounded in long-lived node runtimes.
  if (cachedSubscriptionStatus.size > 2000) {
    for (const [cacheKey, entry] of cachedSubscriptionStatus) {
      if (entry.expiresAtMs <= now || cachedSubscriptionStatus.size > 1500) {
        cachedSubscriptionStatus.delete(cacheKey);
      }
      if (cachedSubscriptionStatus.size <= 1500) {
        break;
      }
    }
  }
};

const toMillis = (value: any): number | null => {
  const d = toDate(value);
  return d ? d.getTime() : null;
};

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

const canSaveUnlinkedOriginalReplacement = (productKey: Product): boolean =>
  UNLINKED_ORIGINAL_REPLACEMENT_PRODUCTS.has(productKey);

const responseCursorKey = (item: ContractResponseItem) =>
  contractCursorKey(
    normalizeEmail(item.adviserEmail ?? item.userEmail ?? ""),
    item.id
  );

const cursorDocIdForOwner = (
  cursor: ParsedCursor | null,
  ownerEmail: string
): string | null => {
  const key = cursor?.key;
  if (!key) return null;
  const prefix = `${normalizeEmail(ownerEmail)}___`;
  if (!key.startsWith(prefix)) return null;
  const docId = key.slice(prefix.length).trim();
  return docId || null;
};

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

const tipsterContractsMutationResponse = () =>
  NextResponse.json(
    { ok: false, error: "Tipařské účty nemají oprávnění ukládat ani upravovat smlouvy." },
    { status: 403 }
  );

const normalizeOptionalDisplayName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
};

const formatNameFromEmailAddress = (emailRaw: string | null | undefined): string | null => {
  const normalized = normalizeEmail(emailRaw);
  if (!normalized) return null;

  const localPartRaw = normalized.split("@")[0] ?? "";
  const localPart = localPartRaw.split("+")[0] ?? localPartRaw;
  const parts = localPart.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return null;

  const cap = (value: string) => {
    const chars = Array.from(value);
    const first = chars[0];
    if (!first) return value;
    return (
      first.toLocaleUpperCase("cs-CZ") + chars.slice(1).join("").toLocaleLowerCase("cs-CZ")
    );
  };

  return parts.map(cap).join(" ");
};

const currentYearMonth = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const teamOverviewMonthDocId = (ownerEmail: string, yearMonth: string): string =>
  `${normalizeEmail(ownerEmail)}___${yearMonth}`;

const toContractResponseItem = (
  docId: string,
  ownerEmail: string,
  data: ContractDoc,
  adviserName?: string | null,
  ownerContext?: ContractOwnerPositionContext | null
): ContractResponseItem => {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const signedDate = toDate(data.contractSignedDate);
  const signedDateIso = signedDate ? toIsoDay(signedDate) : null;
  const timelinePosition = resolveContractTimelinePosition(ownerContext, signedDateIso);
  const storedPosition = normalizePositionValue(data.position);
  return {
    ...data,
    contractPdfAttachment: toPublicContractPdfAttachment(
      (data as { contractPdfAttachment?: unknown }).contractPdfAttachment
    ),
    contractSignedDate: toMillis(data.contractSignedDate),
    createdAt: toMillis(data.createdAt),
    policyStartDate: toMillis((data as any).policyStartDate),
    policyEndDate: toMillis((data as any).policyEndDate),
    stornoDate: toMillis((data as any).stornoDate),
    id: docId,
    adviserEmail: normalizedOwner,
    adviserName: normalizeOptionalDisplayName(adviserName) ?? null,
    userEmail: normalizeEmail(data.userEmail) || normalizedOwner,
    effectivePosition: timelinePosition ?? storedPosition ?? null,
    timelinePosition,
  };
};

const toContractListResponseItem = ({
  docId,
  ownerEmail,
  data,
  shape,
  adviserName,
  ownerContext,
}: {
  docId: string;
  ownerEmail: string;
  data: ContractDoc;
  shape: ContractListResponseShape;
  adviserName?: string | null;
  ownerContext?: ContractOwnerPositionContext | null;
}): ContractResponseItem => {
  const normalizedAdviserName = normalizeOptionalDisplayName(adviserName) ?? null;
  const signedDate = toDate(data.contractSignedDate);
  const signedDateIso = signedDate ? toIsoDay(signedDate) : null;
  const timelinePosition = resolveContractTimelinePosition(ownerContext, signedDateIso);
  const storedPosition = normalizePositionValue(data.position);
  if (shape === "clientNames") {
    const normalizedOwner = normalizeEmail(ownerEmail);
    return {
      id: docId,
      adviserEmail: normalizedOwner,
      adviserName: normalizedAdviserName,
      userEmail: normalizeEmail(data.userEmail) || normalizedOwner,
      effectivePosition: timelinePosition ?? storedPosition ?? null,
      timelinePosition,
      clientName: normalizeOptionalDisplayName(data.clientName) ?? null,
      contractSignedDate: toMillis(data.contractSignedDate),
      createdAt: toMillis(data.createdAt),
    };
  }

  if (shape === "home") {
    const normalizedOwner = normalizeEmail(ownerEmail);
    return {
      id: docId,
      adviserEmail: normalizedOwner,
      adviserName: normalizedAdviserName,
      userEmail: normalizeEmail(data.userEmail) || normalizedOwner,
      effectivePosition: timelinePosition ?? storedPosition ?? null,
      timelinePosition,
      clientName: normalizeOptionalDisplayName(data.clientName) ?? null,
      contractSignedDate: toMillis(data.contractSignedDate),
      createdAt: toMillis(data.createdAt),
      productKey: data.productKey,
      inputAmount: data.inputAmount,
      frequencyRaw: data.frequencyRaw ?? null,
      comfortPayment: data.comfortPayment ?? null,
      items: Array.isArray(data.items) ? data.items : [],
      managerOverrides: Array.isArray(data.managerOverrides)
        ? data.managerOverrides
        : [],
    };
  }

  if (shape === "cashflow") {
    const normalizedOwner = normalizeEmail(ownerEmail);
    return {
      id: docId,
      adviserEmail: normalizedOwner,
      adviserName: normalizedAdviserName,
      userEmail: normalizeEmail(data.userEmail) || normalizedOwner,
      effectivePosition: timelinePosition ?? storedPosition ?? null,
      timelinePosition,
      status: data.status ?? null,
      stornoDate: toMillis((data as any).stornoDate),
      productKey: data.productKey,
      frequencyRaw: data.frequencyRaw ?? null,
      entryType: data.entryType ?? null,
      rootContractEntryId: data.rootContractEntryId ?? null,
      parentContractEntryId: data.parentContractEntryId ?? null,
      inputAmount:
        typeof data.inputAmount === "number" && Number.isFinite(data.inputAmount)
          ? data.inputAmount
          : undefined,
      calculationInputAmount:
        typeof data.calculationInputAmount === "number" &&
        Number.isFinite(data.calculationInputAmount)
          ? data.calculationInputAmount
          : undefined,
      effectiveInputAmount:
        typeof data.effectiveInputAmount === "number" &&
        Number.isFinite(data.effectiveInputAmount)
          ? data.effectiveInputAmount
          : undefined,
      previousInputAmount:
        typeof data.previousInputAmount === "number" &&
        Number.isFinite(data.previousInputAmount)
          ? data.previousInputAmount
          : undefined,
      newInputAmount:
        typeof data.newInputAmount === "number" && Number.isFinite(data.newInputAmount)
          ? data.newInputAmount
          : undefined,
      premiumDelta:
        typeof data.premiumDelta === "number" && Number.isFinite(data.premiumDelta)
          ? data.premiumDelta
          : undefined,
      refreshCommissionBase: data.refreshCommissionBase ?? null,
      items: Array.isArray(data.items) ? data.items : [],
      commissionPayouts: Array.isArray(data.commissionPayouts)
        ? data.commissionPayouts
        : [],
      contractSignedDate: toMillis(data.contractSignedDate),
      policyStartDate: toMillis((data as any).policyStartDate),
      policyEndDate: toMillis((data as any).policyEndDate),
      createdAt: toMillis(data.createdAt),
      durationYears:
        typeof data.durationYears === "number" && Number.isFinite(data.durationYears)
          ? data.durationYears
          : undefined,
      durationMonths:
        typeof data.durationMonths === "number" && Number.isFinite(data.durationMonths)
          ? data.durationMonths
          : undefined,
      contractNumber: data.contractNumber ?? null,
      clientName: normalizeOptionalDisplayName(data.clientName) ?? null,
      position: data.position ?? null,
      commissionMode: data.commissionMode ?? null,
      ownerCurrentPosition: ownerContext?.position ?? null,
      managerEmailSnapshot: data.managerEmailSnapshot ?? null,
      managerPositionSnapshot: data.managerPositionSnapshot ?? null,
      managerModeSnapshot: data.managerModeSnapshot ?? null,
      managerOverrides: Array.isArray(data.managerOverrides)
        ? data.managerOverrides
        : [],
    };
  }

  return toContractResponseItem(
    docId,
    ownerEmail,
    data,
    normalizedAdviserName,
    ownerContext
  );
};

const normalizeRootEntryId = (entry: ContractDoc): string => {
  const raw =
    entry.rootContractEntryId ??
    (entry.entryType === "endorsement" ? entry.parentContractEntryId : entry.id) ??
    entry.id;
  return typeof raw === "string" ? raw.trim() : "";
};

const roundPremiumAmount = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const positivePremiumAmount = (value: unknown): number | null => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return roundPremiumAmount(numberValue);
};

const lifePremiumAmountForEntry = (entry: ContractDoc): number | null => {
  const raw =
    entry.entryType === "endorsement"
      ? entry.newInputAmount ?? entry.effectiveInputAmount ?? entry.inputAmount
      : entry.inputAmount;
  return positivePremiumAmount(raw);
};

const previousLifePremiumAmountForEntry = (entry: ContractDoc): number | null => {
  const explicitPrevious = positivePremiumAmount(entry.previousInputAmount);
  if (explicitPrevious != null) return explicitPrevious;

  const current = lifePremiumAmountForEntry(entry);
  const explicitDelta = Number(entry.premiumDelta);
  if (current != null && Number.isFinite(explicitDelta)) {
    const previous = current - explicitDelta;
    if (previous > 0) return roundPremiumAmount(previous);
  }

  return null;
};

const lifePremiumDeltaForEntry = (entry: ContractDoc): number | null => {
  const explicitDelta = Number(entry.premiumDelta);
  if (Number.isFinite(explicitDelta)) return roundPremiumAmount(explicitDelta);

  const current = lifePremiumAmountForEntry(entry);
  const previous = previousLifePremiumAmountForEntry(entry);
  if (current == null || previous == null) return null;
  return roundPremiumAmount(current - previous);
};

const buildLifePremiumChanges = (
  timeline: ContractResponseItem[]
): ContractLifePremiumChange[] =>
  timeline
    .map((entry, index): ContractLifePremiumChange | null => {
      const premiumAmount = lifePremiumAmountForEntry(entry);
      if (premiumAmount == null) return null;

      const previousPremium = previousLifePremiumAmountForEntry(entry);
      const premiumDelta = lifePremiumDeltaForEntry(entry);
      return {
        id: entry.id,
        entryType: entry.entryType ?? null,
        step: index + 1,
        premiumAmount,
        annualPremium: roundPremiumAmount(premiumAmount * 12),
        previousPremium,
        previousAnnualPremium:
          previousPremium == null ? null : roundPremiumAmount(previousPremium * 12),
        premiumDelta,
        annualPremiumDelta:
          premiumDelta == null ? null : roundPremiumAmount(premiumDelta * 12),
        policyStartDate: toMillis(entry.policyStartDate),
        contractSignedDate: toMillis(entry.contractSignedDate),
        createdAt: toMillis(entry.createdAt),
      };
    })
    .filter(
      (change): change is ContractLifePremiumChange => change != null
    );

const loadLifePremiumChangesForFindMatch = async ({
  ownerEmail,
  contract,
  adviserName,
  ownerContext,
}: {
  ownerEmail: string;
  contract: ContractResponseItem;
  adviserName?: string | null;
  ownerContext?: ContractOwnerPositionContext | null;
}): Promise<ContractLifePremiumChange[]> => {
  const productKey = contract.productKey as Product | undefined;
  const contractNumber = (contract.contractNumber ?? "").trim();
  if (!adminDb || !productKey || !LIFE_TIMELINE_PRODUCTS.has(productKey) || !contractNumber) {
    return [];
  }

  try {
    const timelineSnap = await adminDb
      .collection("users")
      .doc(ownerEmail)
      .collection("entries")
      .where("contractNumber", "==", contractNumber)
      .get();

    const timelineEntries = timelineSnap.docs.map((snap) =>
      toContractResponseItem(
        snap.id,
        ownerEmail,
        snap.data() as ContractDoc,
        adviserName,
        ownerContext
      )
    );
    const sameProductEntries = timelineEntries.filter(
      (entry) => entry.productKey === productKey
    );
    const targetRootId = normalizeRootEntryId(contract);
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

    return buildLifePremiumChanges(scopedTimeline);
  } catch (err) {
    console.warn("GET /api/contracts/find: načtení historie životní základny selhalo:", err);
    return [];
  }
};

const resolveRefreshOriginalPremiumInfo = async ({
  ownerEmail,
  contract,
}: {
  ownerEmail: string;
  contract: ContractResponseItem;
}): Promise<{
  premiumAmount: number;
  stornoBasePremiumAmount: number;
  stornoStartDateIso: string | null;
} | null> => {
  const changes = await loadLifePremiumChangesForFindMatch({
    ownerEmail,
    contract,
    adviserName: contract.adviserName ?? null,
  });
  const latestPremiumChange = [...changes]
    .reverse()
    .find((change) => positivePremiumAmount(change.premiumAmount) != null);
  const premiumAmount =
    positivePremiumAmount(latestPremiumChange?.premiumAmount) ??
    lifePremiumAmountForEntry(contract);
  if (premiumAmount == null) return null;
  const storedRefreshBaseMonthly = positivePremiumAmount(
    contract.refreshCommissionBase?.calculationMonthlyPremium
  );
  const storedRefreshBaseAnnual = positivePremiumAmount(
    contract.refreshCommissionBase?.calculationAnnualPremium
  );
  const stornoBasePremiumAmount =
    storedRefreshBaseMonthly ??
    (storedRefreshBaseAnnual != null ? storedRefreshBaseAnnual / 12 : null) ??
    premiumAmount;

  const firstChangeWithDate = changes.find(
    (change) =>
      Boolean(isoDayFromUnknown(change.contractSignedDate)) ||
      Boolean(isoDayFromUnknown(change.policyStartDate))
  );
  const stornoStartDateIso =
    isoDayFromUnknown(firstChangeWithDate?.policyStartDate) ??
    isoDayFromUnknown(contract.policyStartDate) ??
    isoDayFromUnknown(firstChangeWithDate?.contractSignedDate) ??
    isoDayFromUnknown(contract.contractSignedDate);

  return {
    premiumAmount,
    stornoBasePremiumAmount,
    stornoStartDateIso,
  };
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);


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

const resolveTimelinePositionForSignedDate = (
  profile: UserProfileSnapshot,
  signedDateIso: string | null
): Position | null => {
  if (!signedDateIso || !isIsoDay(signedDateIso)) return null;
  const timeline = parsePositionTimeline(profile.positionTimeline);
  const timelineMatch = resolvePositionTimelineMatch(signedDateIso, timeline);
  return timelineMatch?.position ?? null;
};

type ContractOwnerPositionContext = {
  name?: string | null;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
  positionTimeline?: unknown;
};

const resolveContractTimelinePosition = (
  ownerContext: ContractOwnerPositionContext | null | undefined,
  signedDateIso: string | null
): Position | null => {
  if (!ownerContext || !signedDateIso || !isIsoDay(signedDateIso)) return null;
  const timeline = parsePositionTimeline(ownerContext.positionTimeline);
  const timelineMatch = resolvePositionTimelineMatch(signedDateIso, timeline);
  return timelineMatch?.position ?? null;
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
    name:
      normalizeOptionalDisplayName(raw.fullName) ||
      normalizeOptionalDisplayName(raw.name) ||
      null,
    userId:
      typeof raw.userId === "string" && raw.userId.trim().length > 0
        ? raw.userId.trim()
        : null,
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

const resolveManagerCommissionModeForProduct = (
  productKey: Product,
  managerMode: CommissionMode | null | undefined,
  adviserMode: CommissionMode
): CommissionMode =>
  CATALOG_LIFE_PRODUCTS.includes(productKey)
    ? "standard"
    : managerMode ?? adviserMode;

const normalizeManagerChainModesForProduct = (
  chain: NormalizedManagerChainEntry[],
  productKey: Product
): NormalizedManagerChainEntry[] => {
  if (!CATALOG_LIFE_PRODUCTS.includes(productKey)) return chain;
  return chain.map((row) => ({
    ...row,
    commissionMode: "standard",
  }));
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

type NewContractPushRecipient = {
  email: string;
  tokens: string[];
};

const collectManagerNotificationEmailsForNewContract = ({
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
  const normalizedOwner = normalizeEmail(ownerEmail);
  const out = new Set<string>();

  const pushEmail = (value: unknown) => {
    const email = extractEmailFromUnknown(value);
    if (!email || email === normalizedOwner) return;
    out.add(email);
  };

  pushEmail(managerEmailSnapshot);
  managerChain.forEach((row) => pushEmail(row.email));
  managerOverrides.forEach((row) => pushEmail(row.email));

  return [...out].slice(0, NEW_CONTRACT_PUSH_MAX_RECIPIENTS);
};

const isNewContractPushEnabled = (profile: Record<string, unknown>): boolean => {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;

  const typesRaw = isPlainObject(settingsRaw.types) ? settingsRaw.types : null;
  const channelsRaw = isPlainObject(settingsRaw.channels)
    ? settingsRaw.channels
    : null;

  const newContractFlag = typesRaw?.newContract;
  const pushChannelFlag = channelsRaw?.push;
  const isTypeEnabled =
    typeof newContractFlag === "boolean" ? newContractFlag : true;
  const isPushChannelEnabled =
    typeof pushChannelFlag === "boolean" ? pushChannelFlag : true;

  return isTypeEnabled && isPushChannelEnabled;
};

const isRecentEnoughForNewContractPush = (
  contractSignedDate: Date,
  nowMs = Date.now()
): boolean => {
  const signedMs = contractSignedDate.getTime();
  if (!Number.isFinite(signedMs)) return false;

  const ageMs = nowMs - signedMs;
  return ageMs <= NEW_CONTRACT_PUSH_RECENT_SIGNED_DAYS * DAY_MS;
};

const normalizeOriginUrl = (value: string | null | undefined): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

const resolvePublicAppOrigin = (req: NextRequest): string => {
  const fromEnv =
    normalizeOriginUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOriginUrl(process.env.PUBLIC_APP_URL) ??
    normalizeOriginUrl(process.env.APP_URL) ??
    normalizeOriginUrl(process.env.NEXTAUTH_URL);
  if (fromEnv) return fromEnv;

  const fromVercelProdDomain = normalizeOriginUrl(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  );
  if (fromVercelProdDomain) return fromVercelProdDomain;

  const fromRequest = normalizeOriginUrl(`${req.nextUrl.protocol}//${req.nextUrl.host}`);
  if (fromRequest) return fromRequest;

  return DEFAULT_PUBLIC_APP_ORIGIN;
};

const loadNewContractPushRecipients = async (
  emails: string[]
): Promise<NewContractPushRecipient[]> => {
  if (!adminDb) return [];
  const db = adminDb;

  const uniqueEmails = [...new Set(emails.map((value) => normalizeEmail(value)).filter(Boolean))]
    .slice(0, NEW_CONTRACT_PUSH_MAX_RECIPIENTS);
  if (uniqueEmails.length === 0) return [];

  const recipients = await Promise.all(
    uniqueEmails.map(async (email) => {
      const [publicSnap, privateSnap] = await Promise.all([
        db.collection("users").doc(email).get(),
        db.collection("usersPrivate").doc(email).get(),
      ]);

      const mergedProfile = {
        ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
        ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
      };

      if (!isNewContractPushEnabled(mergedProfile)) return null;

      const tokens = collectPushTokens(mergedProfile).slice(
        0,
        NEW_CONTRACT_PUSH_MAX_TOKENS_PER_USER
      );
      return { email, tokens };
    })
  );

  return recipients.filter((row): row is NewContractPushRecipient => Boolean(row));
};

const sendNewContractPushNotification = async ({
  req,
  recipientEmails,
  ownerEmail,
  ownerName,
  entryId,
  contractNumber,
  productKey,
  inputAmount,
  frequencyRaw,
}: {
  req: NextRequest;
  recipientEmails: string[];
  ownerEmail: string;
  ownerName: string | null;
  entryId: string;
  contractNumber: string | null;
  productKey: Product | null | undefined;
  inputAmount: number;
  frequencyRaw: PaymentFrequency | null | undefined;
}) => {
  const ownerNameFromProfile = normalizeOptionalDisplayName(ownerName);
  const ownerDisplayName =
    ownerNameFromProfile && !ownerNameFromProfile.includes("@")
      ? ownerNameFromProfile
      : formatNameFromEmailAddress(ownerNameFromProfile ?? ownerEmail) ?? ownerEmail;
  const normalizedFrequency: PaymentFrequency =
    frequencyRaw === "monthly" ||
    frequencyRaw === "quarterly" ||
    frequencyRaw === "semiannual" ||
    frequencyRaw === "annual"
      ? frequencyRaw
      : "annual";
  const safeInputAmount = Number.isFinite(inputAmount) ? Math.max(0, inputAmount) : 0;
  const annualPremium = safeInputAmount * paymentsPerYear(normalizedFrequency);
  const isLifeProduct = Boolean(productKey && CATALOG_LIFE_PRODUCTS.includes(productKey));
  const premiumForMessage = isLifeProduct ? annualPremium / 12 : annualPremium;
  const premiumFormatted = `${new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 0,
  }).format(Math.round(premiumForMessage))} Kč`;
  const productName = productLabel(productKey, "Neznámý produkt").toLocaleUpperCase("cs-CZ");
  const thematicEmoji = productKey
    ? AUTO_PRODUCTS.includes(productKey)
      ? "🚗"
      : TRAVEL_PRODUCTS.includes(productKey)
      ? "✈️"
      : COMFORT_PRODUCTS.includes(productKey)
      ? "⚡"
      : LIABILITY_PRODUCTS.includes(productKey)
      ? "🛡️"
      : PROPERTY_PRODUCTS.includes(productKey)
      ? "🏠"
      : CATALOG_LIFE_PRODUCTS.includes(productKey)
      ? "❤️"
      : "📄"
    : "📄";
  const message = `🎉 ${ownerDisplayName} sepsal právě ${productName} za ${premiumFormatted} ${thematicEmoji}`;

  const contractDetailSlug = encodeURIComponent(`${ownerEmail}___${entryId}`);
  const deepLink = `/smlouvy/${contractDetailSlug}?from=list&source=push`;
  const baseUrl = resolvePublicAppOrigin(req);
  const webPushLink = `${baseUrl}${deepLink}`;
  const createdAtIso = new Date().toISOString();
  const recipients = await loadNewContractPushRecipients(recipientEmails);
  if (recipients.length === 0) return;

  try {
    await writeMailboxEntries({
      recipientEmails: recipients.map((row) => row.email),
      type: "new_contract",
      title: "Nová smlouva v týmu",
      body: message,
      deepLink,
      metadata: {
        ownerEmail,
        entryId,
        contractNumber: contractNumber ?? "",
        productKey: productKey ?? "",
      },
    });
  } catch (error) {
    console.error("Writing mailbox notification for new contract failed:", error);
  }

  if (!adminMessaging) return;

  const tokenSet = new Set<string>();
  recipients.forEach((recipient) => {
    recipient.tokens.forEach((token) => tokenSet.add(token));
  });
  const tokens = [...tokenSet];
  if (tokens.length === 0) return;

  for (let i = 0; i < tokens.length; i += NEW_CONTRACT_PUSH_MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + NEW_CONTRACT_PUSH_MAX_TOKENS_PER_MULTICAST);
    await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: "Bohemka.App",
        body: message,
      },
      data: {
        type: "new_contract",
        ownerEmail,
        entryId,
        contractNumber: contractNumber ?? "",
        createdAt: createdAtIso,
        deepLink,
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-new-contract-${entryId}`,
          requireInteraction: false,
        },
      },
    });
  }
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
      return [1, 80];
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
      return 30;
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
    case "cpphafan":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
    case "kooperativaAuto":
    case "koopflotila":
    case "allianzAuto":
    case "slaviaflotila":
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

const normalizeCommissionCodeKey = (code: unknown): string => {
  if (typeof code !== "string") return "";
  return code.trim().toUpperCase().replace(/\s+/g, "");
};

const commissionItemDiffKey = (item: CommissionResultItemDTO): string => {
  const code = normalizeCommissionCodeKey(item.code);
  return code ? `code:${code}` : normalizeTitleKey(item.title ?? "");
};

const stripTotalRows = (
  items: CommissionResultItemDTO[] = []
): CommissionResultItemDTO[] =>
  items.filter((item) => {
    const code = normalizeCommissionCodeKey(item.code);
    return code !== "TOTAL" && !normalizeTitleKey(item.title ?? "").includes("celkem");
  });

const roundToCents = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

type TipPayoutOccurrence = {
  sequence: number;
  payoutDate: Date;
  amount: number;
  note: string;
};

const paymentsPerYearFromFrequency = (frequency: PaymentFrequency | null | undefined): number => {
  switch (frequency) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
    default:
      return 1;
  }
};

const monthsBetweenPaymentsFromFrequency = (
  frequency: PaymentFrequency | null | undefined
): number => {
  switch (frequency) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semiannual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
};

const estimateTipFirstPayoutDate = ({
  policyStart,
  agreementDate,
}: {
  policyStart: Date;
  agreementDate: Date;
}): Date => {
  const dayForCutoff = Math.max(policyStart.getDate(), agreementDate.getDate());
  const monthsToAdd = dayForCutoff > TIP_PAYOUT_CUTOFF_DAY ? 2 : 1;
  return new Date(policyStart.getFullYear(), policyStart.getMonth() + monthsToAdd, 1);
};

const tipPayoutDateKey = (date: Date): string =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;

const tipPayoutSourceKey = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${entryId.trim()}`;

const normalizeContractStatusForTip = (status: unknown): "active" | "storno" => {
  if (typeof status !== "string") return "active";
  const normalized = status.trim().toLowerCase();
  return normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
    ? "storno"
    : "active";
};

const monthSerial = (value: Date): number =>
  value.getFullYear() * 12 + value.getMonth();

const isFromStornoMonth = (payoutDate: Date, stornoDate: Date): boolean =>
  monthSerial(payoutDate) >= monthSerial(stornoDate);

const resolveTipAmountFirstYear = ({
  entry,
  tipsterPercent,
}: {
  entry: ContractDoc;
  tipsterPercent: number;
}): number => {
  const fromStored = entry.tipContractTipsterAmountFirstYear;
  if (typeof fromStored === "number" && Number.isFinite(fromStored)) {
    return roundToCents(Math.max(0, fromStored));
  }

  const fromGross = entry.tipContractImmediateFirstYearGross;
  if (typeof fromGross === "number" && Number.isFinite(fromGross)) {
    return roundToCents(Math.max(0, fromGross * (tipsterPercent / 100)));
  }

  const fromNet = entry.tipContractImmediateFirstYearNet;
  if (
    typeof fromNet === "number" &&
    Number.isFinite(fromNet) &&
    tipsterPercent > 0 &&
    tipsterPercent < 100
  ) {
    const ratio = 1 - tipsterPercent / 100;
    const gross = fromNet / ratio;
    return roundToCents(Math.max(0, gross * (tipsterPercent / 100)));
  }

  return 0;
};

const shouldSplitTipByFrequency = (entry: ContractDoc): boolean => {
  const paymentMultiplier = paymentsPerYearFromFrequency(entry.frequencyRaw);
  if (paymentMultiplier <= 1) return false;
  const titles = Array.isArray(entry.items)
    ? entry.items.map((item) => normalizeTipContractTitle(item.title))
    : [];
  if (titles.length === 0) return false;
  const hasAnnualHint = titles.some((title) => title.includes("za rok"));
  const hasPaymentHint = titles.some((title) => title.includes("(z platby)"));
  return hasAnnualHint || hasPaymentHint;
};

const buildTipPayoutOccurrences = ({
  entry,
  tipAmountFirstYear,
}: {
  entry: ContractDoc;
  tipAmountFirstYear: number;
}): TipPayoutOccurrence[] => {
  const normalizedTipAmount = roundToCents(Math.max(0, tipAmountFirstYear));
  if (!(normalizedTipAmount > 0)) return [];

  const policyStart =
    toDate(entry.policyStartDate) ??
    toDate(entry.contractSignedDate) ??
    toDate(entry.createdAt) ??
    new Date();
  const agreementDate =
    toDate(entry.contractSignedDate) ??
    toDate(entry.createdAt) ??
    toDate(entry.policyStartDate) ??
    policyStart;
  const firstPayoutDate = estimateTipFirstPayoutDate({
    policyStart,
    agreementDate,
  });

  const paymentCount = shouldSplitTipByFrequency(entry)
    ? paymentsPerYearFromFrequency(entry.frequencyRaw)
    : 1;
  const stepMonths = monthsBetweenPaymentsFromFrequency(entry.frequencyRaw);

  const status = normalizeContractStatusForTip(entry.status);
  const stornoCutoffDate =
    status === "storno" ? toDate(entry.stornoDate) ?? new Date() : null;

  const occurrences: TipPayoutOccurrence[] = [];
  let allocated = 0;

  for (let index = 0; index < paymentCount; index += 1) {
    const payoutDate = new Date(
      firstPayoutDate.getFullYear(),
      firstPayoutDate.getMonth() + stepMonths * index,
      firstPayoutDate.getDate()
    );
    if (stornoCutoffDate && isFromStornoMonth(payoutDate, stornoCutoffDate)) {
      continue;
    }

    const amount =
      index === paymentCount - 1
        ? roundToCents(normalizedTipAmount - allocated)
        : roundToCents(normalizedTipAmount / paymentCount);
    if (!(amount > 0)) continue;

    allocated = roundToCents(allocated + amount);
    occurrences.push({
      sequence: index + 1,
      payoutDate,
      amount,
      note:
        paymentCount > 1
          ? `TIP provize (${index + 1}/${paymentCount})`
          : "TIP provize",
    });
  }

  return occurrences;
};

const tipPayoutDocId = ({
  sourceKey,
  payoutDate,
  sequence,
}: {
  sourceKey: string;
  payoutDate: Date;
  sequence: number;
}): string =>
  `${sourceKey}__${tipPayoutDateKey(payoutDate)}__${String(sequence).padStart(2, "0")}`;

const deleteTipPayoutDocsForSource = async ({
  tipsterUserDocId,
  sourceKey,
}: {
  tipsterUserDocId: string;
  sourceKey: string;
}): Promise<void> => {
  if (!adminDb) return;
  const normalizedTipsterUserDocId = tipsterUserDocId.trim();
  const normalizedSourceKey = sourceKey.trim();
  if (!normalizedTipsterUserDocId || !normalizedSourceKey) return;

  const payoutsCol = adminDb
    .collection("users")
    .doc(normalizedTipsterUserDocId)
    .collection(TIP_PAYOUTS_SUBCOLLECTION);

  while (true) {
    const existingSnap = await payoutsCol
      .where("sourceKey", "==", normalizedSourceKey)
      .limit(TIP_PAYOUTS_BATCH_LIMIT)
      .get();
    if (existingSnap.empty) break;

    const batch = adminDb.batch();
    existingSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    if (existingSnap.size < TIP_PAYOUTS_BATCH_LIMIT) break;
  }
};

const syncTipPayoutDocsForEntry = async ({
  ownerEmail,
  entryId,
  entryData,
}: {
  ownerEmail: string;
  entryId: string;
  entryData: ContractDoc | null | undefined;
}): Promise<void> => {
  if (!adminDb) return;
  const normalizedOwner = normalizeEmail(ownerEmail);
  const normalizedEntryId = entryId.trim();
  if (!normalizedOwner || !normalizedEntryId || !entryData) return;

  const tipsterEmail = normalizeEmail(entryData.tipContractTipsterEmail);
  if (!tipsterEmail) return;
  const tipsterProfile = await loadUserProfileByEmail(tipsterEmail);
  const tipsterUserDocId = (tipsterProfile?.docId ?? tipsterEmail).trim();
  if (!tipsterUserDocId) return;
  const sourceOwnerProfile = await loadUserProfileByEmail(normalizedOwner);

  const sourceKey = tipPayoutSourceKey(normalizedOwner, normalizedEntryId);
  await deleteTipPayoutDocsForSource({
    tipsterUserDocId,
    sourceKey,
  });

  const entryType = normalizeContractEntryType(entryData.entryType ?? "contract");
  if (entryType !== "contract") return;

  const rawPercent = entryData.tipContractTipsterPercent;
  if (typeof rawPercent !== "number" || !Number.isFinite(rawPercent)) return;
  const tipsterPercent = Math.round(rawPercent);
  if (
    tipsterPercent < TIP_CONTRACT_PERCENT_MIN ||
    tipsterPercent > TIP_CONTRACT_PERCENT_MAX
  ) {
    return;
  }

  const tipAmountFirstYear = resolveTipAmountFirstYear({
    entry: entryData,
    tipsterPercent,
  });
  if (!(tipAmountFirstYear > 0)) return;

  const occurrences = buildTipPayoutOccurrences({
    entry: entryData,
    tipAmountFirstYear,
  });
  if (occurrences.length === 0) return;

  const tipsterName =
    normalizeOptionalDisplayName(entryData.tipContractTipsterName) ??
    tipsterProfile?.name ??
    null;
  const sourceOwnerName = sourceOwnerProfile?.name ?? null;
  const clientName = normalizeOptionalDisplayName(entryData.clientName) ?? null;
  const sourceStatus = normalizeContractStatusForTip(entryData.status);
  const sourceStornoDate =
    sourceStatus === "storno" ? toDate(entryData.stornoDate) ?? new Date() : null;
  const sourceContractSignedDate = toDate(entryData.contractSignedDate) ?? null;
  const sourcePolicyStartDate = toDate(entryData.policyStartDate) ?? null;

  const payoutsCol = adminDb
    .collection("users")
    .doc(tipsterUserDocId)
    .collection(TIP_PAYOUTS_SUBCOLLECTION);
  const now = new Date();
  let batch = adminDb.batch();
  let opsInBatch = 0;

  for (const occurrence of occurrences) {
    const docRef = payoutsCol.doc(
      tipPayoutDocId({
        sourceKey,
        payoutDate: occurrence.payoutDate,
        sequence: occurrence.sequence,
      })
    );
    const payload: TipPayoutDoc = {
      sourceKey,
      sourceOwnerEmail: normalizedOwner,
      sourceOwnerName,
      sourceEntryId: normalizedEntryId,
      sourceEntryType: entryType,
      adviserEmail: normalizedOwner,
      tipsterEmail,
      tipsterUserDocId,
      tipsterName,
      clientName,
      tipsterPercent,
      productKey:
        (entryData.productKey as Product | null | undefined) ?? null,
      frequencyRaw:
        (entryData.frequencyRaw as PaymentFrequency | null | undefined) ?? null,
      payoutDate: occurrence.payoutDate,
      amount: occurrence.amount,
      note: occurrence.note,
      sourceStatus,
      sourceStornoDate,
      sourcePaid: entryData.paid === true,
      sourceContractSignedDate,
      sourcePolicyStartDate,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(docRef, payload, { merge: true });
    opsInBatch += 1;

    if (opsInBatch >= TIP_PAYOUTS_BATCH_LIMIT) {
      await batch.commit();
      batch = adminDb.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }
};

const markLinkedAdvisorTipAsContracted = async ({
  ownerEmail,
  entryId,
  entryData,
}: {
  ownerEmail: string;
  entryId: string;
  entryData: ContractDoc | null | undefined;
}): Promise<void> => {
  if (!adminDb || !entryData) return;
  const normalizedOwner = normalizeEmail(ownerEmail);
  const normalizedEntryId = entryId.trim();
  const sourceTipId =
    typeof entryData.tipContractSourceTipId === "string"
      ? entryData.tipContractSourceTipId.trim()
      : "";
  const tipsterEmail = normalizeEmail(entryData.tipContractTipsterEmail);
  if (!normalizedOwner || !normalizedEntryId || !sourceTipId || !tipsterEmail) return;

  const mailboxRef = adminDb
    .collection("usersPrivate")
    .doc(normalizedOwner)
    .collection("mailbox")
    .doc(sourceTipId);
  const mailboxSnap = await mailboxRef.get();
  if (!mailboxSnap.exists) return;

  const data = (mailboxSnap.data() ?? {}) as Record<string, unknown>;
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  if (
    data.type !== "direct_message" ||
    metadata.tipsterTip !== true ||
    metadata.mailboxDirection !== "received" ||
    normalizeEmail(metadata.senderEmail as string | null | undefined) !== tipsterEmail
  ) {
    return;
  }

  const nowMs = Date.now();
  const linkedContractPath = `users/${normalizedOwner}/entries/${normalizedEntryId}`;
  const linkedContractNumber =
    typeof entryData.contractNumber === "string" && entryData.contractNumber.trim()
      ? entryData.contractNumber.trim()
      : null;
  const batch = adminDb.batch();
  batch.set(
    adminDb
      .collection("usersPrivate")
      .doc(normalizedOwner)
      .collection("advisorTipStatuses")
      .doc(sourceTipId),
    {
      status: "contracted",
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtMs: nowMs,
      linkedContractOwnerEmail: normalizedOwner,
      linkedContractEntryId: normalizedEntryId,
      linkedContractPath,
      linkedContractNumber,
    },
    { merge: true }
  );

  const mailboxMessageId =
    typeof metadata.messageId === "string" ? metadata.messageId.trim() : "";
  const tipsterTipsCol = adminDb
    .collection("usersPrivate")
    .doc(tipsterEmail)
    .collection("tipsterTips");
  const tipSnap = await tipsterTipsCol
    .where("recipientMailboxId", "==", sourceTipId)
    .limit(1)
    .get();
  const fallbackSnap =
    tipSnap.empty && mailboxMessageId
      ? await tipsterTipsCol
          .where("mailboxMessageId", "==", mailboxMessageId)
          .limit(1)
          .get()
      : null;
  const tipDoc = tipSnap.docs[0] ?? fallbackSnap?.docs[0] ?? null;
  if (tipDoc) {
    batch.set(
      tipDoc.ref,
      {
        status: "contracted",
        statusUpdatedAt: FieldValue.serverTimestamp(),
        statusUpdatedAtMs: nowMs,
        statusUpdatedByEmail: normalizedOwner,
        linkedContractOwnerEmail: normalizedOwner,
        linkedContractEntryId: normalizedEntryId,
        linkedContractPath,
        linkedContractNumber,
      },
      { merge: true }
    );
  }

  await batch.commit();
};

const computeItemsForProductPositionAndMode = ({
  productKey,
  position,
  commissionMode,
  contractSignedDateIso,
  commissionCoefficientSetOverride,
  neonCoefficientSetOverride,
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
  contractSignedDateIso: string | null;
  commissionCoefficientSetOverride?: CommissionCoefficientSet | null;
  neonCoefficientSetOverride?: NeonCoefficientSet | null;
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
  const normalizedCoefficientSetOverride =
    normalizeCommissionCoefficientSet(commissionCoefficientSetOverride);
  const normalizedNeonCoefficientSetOverride =
    neonCoefficientSetOverride === "historical" || neonCoefficientSetOverride === "current"
      ? neonCoefficientSetOverride
      : normalizedCoefficientSetOverride === "historical" ||
          normalizedCoefficientSetOverride === "current"
        ? normalizedCoefficientSetOverride
        : null;
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso,
    coefficientSetOverride: normalizedCoefficientSetOverride,
  });

  switch (productKey) {
    case "neon": {
      const years = normalizeNeonDurationYears(
        durationYears,
        contractSignedDateIso,
        normalizedNeonCoefficientSetOverride
      );
      return calculateNeon(
        safeAmount,
        position,
        years,
        commissionMode,
        contractSignedDateIso,
        normalizedNeonCoefficientSetOverride
      );
    }
    case "flexi": {
      const years = normalizedDurationYears("flexi", durationYears);
      return calculateFlexi(safeAmount, position, commissionMode, years);
    }
    case "maximaMaxEfekt": {
      const years = normalizedDurationYears("maximaMaxEfekt", durationYears);
      return calculateMaxEfekt(
        safeAmount,
        years,
        position,
        commissionMode,
        coefficientSignedDateIso
      );
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
    case "cpphafan":
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
    case "zamex": {
      const dto =
        productKey === "domex"
          ? calculateDomex(safeAmount, usedFrequency, position, coefficientSignedDateIso)
          : productKey === "cpphafan"
          ? calculateCppHafan(safeAmount, usedFrequency, position)
          : productKey === "koopodzam"
          ? calculateKoopOdzam(safeAmount, usedFrequency, position)
          : productKey === "kooppmop"
          ? calculateKoopPmop(safeAmount, usedFrequency, position)
          : productKey === "zamex"
          ? calculateZamex(safeAmount, usedFrequency, position)
          : calculateKoopMajetekObcan(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item: CommissionResultItemDTO) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return {
        items: filtered,
        total: totals.immediate,
      };
    }
    case "pillowmajetek":
      return calculatePillowMajetek(safeAmount, usedFrequency, position);
    case "maxdomov": {
      const dto = calculateMaxdomov(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item: CommissionResultItemDTO) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate };
    }
    case "allianzmujdomov":
      return calculateAllianzMujDomov(safeAmount, usedFrequency, position);
    case "cppsimplex": {
      const dto = calculateCppSimplex(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item: CommissionResultItemDTO) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate };
    }
    case "cppAuto":
      return calculateCppAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "slaviaauto":
      return calculateSlaviaAuto(safeAmount, usedFrequency, position);
    case "slaviaflotila":
      return calculateSlaviaFlotila(safeAmount, usedFrequency, position);
    case "cppPPRbez": {
      const dto = calculateCppPPRbez(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item: CommissionResultItemDTO) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate };
    }
    case "cppPPRs": {
      const dto = calculateCppPPRs(safeAmount, usedFrequency, position);
      const filtered = dto.items.filter((item: CommissionResultItemDTO) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(usedFrequency));
      return { items: filtered, total: totals.immediate };
    }
    case "allianzAuto":
      return calculateAllianzAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "csobAuto":
      return calculateCsobAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "uniqaAuto":
      return calculateUniqaAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "uniqaflotila":
      return calculateUniqaFlotila(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "pillowAuto":
      return calculatePillowAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "kooperativaAuto":
      return calculateKooperativaAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "koopflotila":
      return calculateKoopFlotila(safeAmount, usedFrequency, position);
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

const effectiveCommissionModeForStoredProduct = (
  productKey: Product,
  mode: CommissionMode,
  contractSignedDateIso: string | null,
  commissionCoefficientSetOverride?: CommissionCoefficientSet | null,
  neonCoefficientSetOverride?: NeonCoefficientSet | null
): CommissionMode => {
  const normalizedCoefficientSetOverride =
    normalizeCommissionCoefficientSet(commissionCoefficientSetOverride);
  const effectiveNeonCoefficientSetOverride =
    neonCoefficientSetOverride === "historical" || neonCoefficientSetOverride === "current"
      ? neonCoefficientSetOverride
      : normalizedCoefficientSetOverride;
  if (
    productKey === "neon" &&
    effectiveNeonCoefficientSetOverride !== "current" &&
    isNeonHistoricalPeriod(contractSignedDateIso)
  ) {
    return "standard";
  }

  return mode;
};

const trustedCreateCommissionMode = ({
  productKey,
  profileMode,
  requestedMode,
}: {
  productKey: Product;
  profileMode: CommissionMode;
  requestedMode: CommissionMode | null;
}): CommissionMode => {
  if (CATALOG_LIFE_PRODUCTS.includes(productKey) && requestedMode) {
    return requestedMode;
  }

  return profileMode;
};

const computeManagerOverridesForChain = ({
  managerChain,
  adviserPosition,
  adviserMode,
  productKey,
  contractSignedDateIso,
  commissionCoefficientSetOverride,
  neonCoefficientSetOverride,
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
  contractSignedDateIso: string | null;
  commissionCoefficientSetOverride?: CommissionCoefficientSet | null;
  neonCoefficientSetOverride?: NeonCoefficientSet | null;
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
    const managerMode = effectiveCommissionModeForStoredProduct(
      productKey,
      resolveManagerCommissionModeForProduct(
        productKey,
        manager.commissionMode,
        adviserMode
      ),
      contractSignedDateIso,
      commissionCoefficientSetOverride,
      neonCoefficientSetOverride
    );

    const managerResult = computeItemsForProductPositionAndMode({
      productKey,
      position: manager.position,
      commissionMode: managerMode,
      contractSignedDateIso,
      commissionCoefficientSetOverride,
      neonCoefficientSetOverride,
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
          contractSignedDateIso,
          commissionCoefficientSetOverride,
          neonCoefficientSetOverride,
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

    const managerMap = new Map<
      string,
      {
        title: string;
        amount: number;
        code?: string | null;
        note?: string | null;
        excludeFromTotal?: boolean;
      }
    >();
    managerItems.forEach((item) => {
      const key = commissionItemDiffKey(item);
      const prev = managerMap.get(key);
      managerMap.set(key, {
        title: item.title ?? prev?.title ?? key,
        amount: (prev?.amount ?? 0) + (item.amount ?? 0),
        code: item.code ?? prev?.code ?? null,
        note: item.note ?? prev?.note ?? null,
        excludeFromTotal: Boolean(prev?.excludeFromTotal || item.excludeFromTotal),
      });
    });

    const diffItems: CommissionResultItemDTO[] = [];
    baselineItems.forEach((item) => {
      const key = commissionItemDiffKey(item);
      const managerValue = managerMap.get(key);
      const managerAmount = managerValue?.amount ?? 0;
      const baselineAmount = item.amount ?? 0;
      const remaining = managerAmount - baselineAmount;
      if (remaining > 0) {
        diffItems.push({
          title: managerValue?.title ?? item.title,
          amount: remaining,
          code: managerValue?.code ?? item.code ?? null,
          ...(managerValue?.excludeFromTotal || item.excludeFromTotal
            ? { excludeFromTotal: true }
            : {}),
          ...(managerValue?.note || item.note
            ? { note: managerValue?.note ?? item.note }
            : {}),
        });
      }
      managerMap.delete(key);
    });

    managerMap.forEach((value) => {
      if (value.amount > 0) {
        diffItems.push({
          title: value.title,
          amount: value.amount,
          code: value.code ?? null,
          ...(value.excludeFromTotal ? { excludeFromTotal: true } : {}),
          ...(value.note ? { note: value.note } : {}),
        });
      }
    });

    const diffTotal = computeLegacyFrequencyOverrideTotal({
      productKey,
      frequencyRaw,
      items: diffItems,
      fallbackTotal: totalWithMultipliers(diffItems),
    });
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
      const maxLen =
        field === "note" ? 2_000 : field === "maxxContractDetailUrl" ? 1_000 : 200;
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

    if (field === "maxdomovDetail") {
      const parsed = sanitizeDetailObject(rawValue, field, DOMEX_DETAIL_ALLOWED_KEYS);
      if (!parsed.ok) return parsed;
      normalized[field] = parsed.value;
      continue;
    }

    return { ok: false, error: `Pole ${field} není podporované.` };
  }
  return { ok: true, payload: normalized };
};

const isLifecycleStatusPatch = (payload: Record<string, unknown>): boolean => {
  const fields = Object.keys(payload);
  return (
    fields.length > 0 &&
    fields.every((field) => field === "status" || field === "stornoDate") &&
    Object.prototype.hasOwnProperty.call(payload, "status")
  );
};

type CppStavSmlouvyItem = {
  contractNumber: string;
  status: string;
  endDate: string | null;
};

const normalizeComparableContractText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isoDayFromUnknownDate = (value: unknown): string => {
  const ms = toMillis(value);
  return ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
};

const responseItemEntryType = (item: ContractResponseItem): string =>
  normalizeComparableContractText(item.entryType);

const responseItemIsEndorsement = (item: ContractResponseItem): boolean =>
  responseItemEntryType(item) === "endorsement" ||
  Boolean(
    normalizeOptionalDisplayName(item.rootContractEntryId) &&
      normalizeOptionalDisplayName(item.parentContractEntryId)
  );

const responseItemMonthlyPremium = (item: ContractResponseItem): number | null => {
  const raw = responseItemIsEndorsement(item)
    ? item.newInputAmount ?? item.effectiveInputAmount ?? item.inputAmount
    : item.refreshCommissionBase?.calculationMonthlyPremium ??
      item.calculationInputAmount ??
      item.effectiveInputAmount ??
      item.inputAmount;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
};

const responseItemAnnualPremium = (item: ContractResponseItem): number | null => {
  const monthlyPremium = responseItemMonthlyPremium(item);
  return monthlyPremium == null ? null : Math.round(monthlyPremium * 12 * 100) / 100;
};

const responseItemEquivalentSignature = (item: ContractResponseItem): string => {
  if (responseItemIsEndorsement(item)) {
    return `${normalizeEmail(item.adviserEmail ?? item.userEmail ?? "")}::entry::${item.id}`;
  }

  return [
    normalizeEmail(item.adviserEmail ?? item.userEmail ?? ""),
    normalizeContractNumber(item.contractNumber),
    item.productKey ?? "",
    normalizeComparableContractText(item.clientName),
    isoDayFromUnknownDate(item.contractSignedDate),
    isoDayFromUnknownDate(item.policyStartDate),
    responseItemAnnualPremium(item) ?? 0,
    normalizePositionValue(item.position) ?? "",
    normalizeCommissionModeValue(item.commissionMode) ?? "",
  ].join("::");
};

const responseItemCompletenessScore = (item: ContractResponseItem): number => {
  let score = 0;
  if (normalizeOptionalDisplayName(item.entryType)) score += 20;
  if (Number.isFinite(Number(item.effectiveInputAmount))) score += 10;
  if (Number.isFinite(Number(item.calculationInputAmount))) score += 8;
  if (item.maxxContractDetailUrl) score += 5;
  if (item.cppExtranetEntityId || item.cppExtranetEntityTypeId) score += 5;
  if ((item.items ?? []).length > 0) score += 3;
  const updatedTime =
    toMillis((item as { updatedAt?: unknown }).updatedAt) ?? toMillis(item.createdAt) ?? 0;
  return score + updatedTime / 1_000_000_000_000;
};

const dedupeEquivalentContractResponseItems = (
  items: ContractResponseItem[]
): ContractResponseItem[] => {
  const bySignature = new Map<string, ContractResponseItem>();
  const order: string[] = [];

  for (const item of items) {
    const signature = responseItemEquivalentSignature(item) || responseCursorKey(item);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, item);
      order.push(signature);
      continue;
    }

    bySignature.set(
      signature,
      responseItemCompletenessScore(item) > responseItemCompletenessScore(existing)
        ? item
        : existing
    );
  }

  return order
    .map((key) => bySignature.get(key))
    .filter((item): item is ContractResponseItem => Boolean(item));
};

const parseIdempotencyKeyFromRequest = (req: NextRequest): string | null => {
  const raw = req.headers.get(CONTRACTS_CREATE_IDEMPOTENCY_HEADER);
  if (!raw) return null;
  const normalized = raw.trim();
  if (!normalized) return null;
  return normalized.slice(0, CONTRACTS_CREATE_IDEMPOTENCY_MAX_LEN);
};

const idempotentReplayResponse = (
  snap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  expectedPayload: NormalizedCreateEntryPayload
): NextResponse => {
  const existing = (snap.data() ?? {}) as Record<string, unknown>;
  if (!idempotentReplayMatchesPayload(existing, expectedPayload)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Opakované uložení neodpovídá původnímu požadavku. Obnov stránku a zkus smlouvu uložit znovu.",
        idempotentReplayConflict: true,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    entryId: snap.id,
    idempotentReplay: true,
  });
};

const isFirestoreAlreadyExists = (error: unknown): boolean => {
  const numericCode =
    typeof (error as { code?: unknown })?.code === "number"
      ? (error as { code?: number }).code
      : null;
  if (numericCode === 6) return true;

  const stringCode =
    typeof (error as { code?: unknown })?.code === "string"
      ? ((error as { code?: string }).code ?? "").toLowerCase()
      : "";
  if (stringCode === "already-exists" || stringCode === "already_exists") return true;

  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message?: string }).message ?? ""
      : "";
  return /already exists/i.test(message) || /ALREADY_EXISTS/i.test(message);
};

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
      name:
        normalizeOptionalDisplayName(data.fullName) ||
        normalizeOptionalDisplayName(data.name) ||
        null,
      managerEmail: managerEmail || null,
      position,
      commissionMode: normalizeCommissionModeValue(data.commissionMode),
      positionTimeline: data.positionTimeline ?? null,
      accountType: resolveAccountType(data),
    };
    const existing = usersByEmail.get(email);
    if (!existing) {
      usersByEmail.set(email, candidate);
      return;
    }

    // Keep the record that contains more hierarchy information.
    const existingScore =
      (existing.position ? 1 : 0) +
      (existing.managerEmail ? 1 : 0) +
      (existing.name ? 1 : 0) +
      (parsePositionTimeline(existing.positionTimeline).length > 0 ? 1 : 0);
    const candidateScore =
      (candidate.position ? 1 : 0) +
      (candidate.managerEmail ? 1 : 0) +
      (candidate.name ? 1 : 0) +
      (parsePositionTimeline(candidate.positionTimeline).length > 0 ? 1 : 0);
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
      name: user.name,
      managerEmail,
      position: user.position,
      commissionMode: user.commissionMode,
      positionTimeline: user.positionTimeline ?? null,
      accountType: user.accountType,
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
  pageSize: number,
  filters?: ContractListFilters,
  responseShape: ContractListResponseShape = "full",
  ownerNames?: Map<string, string | null>,
  ownerContexts?: Map<string, ContractOwnerPositionContext | null>
): Promise<{
  list: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
}> {
  // Fetch one extra record to detect if more pages exist (so the UI can show the load-more button)
  const filtersActive = filters ? hasContractListFilters(filters) : false;
  const clientFiltersActive = filters ? hasContractListClientFilters(filters) : false;
  const pageLimit = clientFiltersActive
    ? Math.max(pageSize + 1, FILTERED_LIST_QUERY_LIMIT)
    : pageSize + 1;
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

  // Fast path for single-owner lists without client-side filters: let Firestore
  // page by date fields and keep the older full-scan path as a safe fallback.
  if (owners.length === 1) {
    const ownerEmail = owners[0]!;
    const buildPage = () => {
      collected.sort((a, b) => {
        const da = contractSortDate(a);
        const dbDate = contractSortDate(b);
        if (!da && !dbDate) return 0;
        if (!da) return 1;
        if (!dbDate) return -1;
        const diff = dbDate.getTime() - da.getTime();
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
    };

    const pushOwnerDoc = (docId: string, data: ContractDoc) => {
      if (!shouldIncludeByCursor(data, docId, ownerEmail)) return;
      if (
        filtersActive &&
        filters &&
        !contractMatchesListFilters(data, filters, ownerEmail)
      ) {
        return;
      }
      const key = `${ownerEmail}___${docId}`;
      if (seen.has(key)) return;
      seen.add(key);
      collected.push(
        toContractListResponseItem({
          docId,
          ownerEmail,
          data,
          shape: responseShape,
          adviserName: ownerNames?.get(ownerEmail) ?? null,
          ownerContext: ownerContexts?.get(ownerEmail) ?? null,
        })
      );
    };

    if (!clientFiltersActive) {
      try {
        const entriesRef = db.collection("users").doc(ownerEmail).collection("entries");
        const signedFrom = filters?.signedFrom ?? null;
        const cursorDocId = cursorDocIdForOwner(cursor, ownerEmail);

        let qBySigned = entriesRef
          .orderBy("contractSignedDate", "desc")
          .orderBy(FieldPath.documentId(), "desc");
        let qByCreated = entriesRef
          .orderBy("createdAt", "desc")
          .orderBy(FieldPath.documentId(), "desc");

        if (signedFrom) {
          qBySigned = qBySigned.where("contractSignedDate", ">=", signedFrom);
          qByCreated = qByCreated.where("createdAt", ">=", signedFrom);
        }

        if (cursor) {
          if (cursorDocId) {
            qBySigned = qBySigned.startAfter(cursor.date, cursorDocId);
            qByCreated = qByCreated.startAfter(cursor.date, cursorDocId);
          } else {
            qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
            qByCreated = qByCreated.where("createdAt", "<=", cursor.date);
          }
        }

        const [signedSnap, createdSnap] = await Promise.all([
          qBySigned.limit(pageLimit).get(),
          qByCreated.limit(pageLimit).get(),
        ]);

        const consumeSnap = (
          snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
        ) => {
          snap.docs.forEach((doc) => {
            pushOwnerDoc(doc.id, doc.data() as ContractDoc);
          });
        };

        consumeSnap(signedSnap);
        consumeSnap(createdSnap);

        return buildPage();
      } catch (err) {
        console.warn(
          "GET /api/contracts/list: optimized single-owner query failed, falling back to full scan.",
          err
        );
        collected.length = 0;
        seen.clear();
      }
    }

    const ownerSnap = await db.collection("users").doc(ownerEmail).collection("entries").get();

    ownerSnap.docs.forEach((doc) => {
      const data = doc.data() as ContractDoc;
      pushOwnerDoc(doc.id, data);
    });

    return buildPage();
  }

  const pushCollected = (docId: string, ownerEmail: string, data: ContractDoc) => {
    if (!shouldIncludeByCursor(data, docId, ownerEmail)) return;
    if (
      filtersActive &&
      filters &&
      !contractMatchesListFilters(data, filters, ownerEmail)
    ) {
      return;
    }
    const key = `${ownerEmail}___${docId}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(
      toContractListResponseItem({
        docId,
        ownerEmail,
        data,
        shape: responseShape,
        adviserName: ownerNames?.get(ownerEmail) ?? null,
        ownerContext: ownerContexts?.get(ownerEmail) ?? null,
      })
    );
  };

  // collectionGroup queries (userEmail stored)
  // Pull by both date fields so records without contractSignedDate are still included.
  if (shouldUseCollectionGroup) {
    for (let i = 0; i < owners.length; i += 10) {
      const chunk = owners.slice(i, i + 10);
      try {
        const signedFrom = filters?.signedFrom ?? null;
        let qBySigned = db
          .collectionGroup("entries")
          .where("userEmail", "in", chunk)
          .orderBy("contractSignedDate", "desc");
        let qByCreated = db
          .collectionGroup("entries")
          .where("userEmail", "in", chunk)
          .orderBy("createdAt", "desc");
        if (signedFrom) {
          qBySigned = qBySigned.where("contractSignedDate", ">=", signedFrom);
          qByCreated = qByCreated.where("createdAt", ">=", signedFrom);
        }
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
  // For multi-owner queries we only run this expensive fallback when
  // collectionGroup did not yield enough items for the requested page.
  const shouldRunPerOwnerFallback =
    !shouldUseCollectionGroup || collectionGroupFailed || collected.length < pageLimit;
  if (shouldRunPerOwnerFallback) {
    for (let i = 0; i < owners.length; i += 10) {
      if (shouldUseCollectionGroup && !collectionGroupFailed && collected.length >= pageLimit) {
        break;
      }

      const ownerChunk = owners.slice(i, i + 10);
      const chunkResults = await Promise.all(
        ownerChunk.map(async (owner) => {
          try {
            const signedFrom = filters?.signedFrom ?? null;
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
            if (signedFrom) {
              qBySigned = qBySigned.where("contractSignedDate", ">=", signedFrom);
              qByCreated = qByCreated.where("createdAt", ">=", signedFrom);
            }
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

const resolveSubscriptionSnapshotFromSources = (
  sources: Array<Record<string, unknown> | null | undefined>
): { status: SubscriptionStatus; paidUntil: string | null } | null => {
  for (const source of sources) {
    if (!source) continue;
    const status = normalizeSubscriptionStatusValue(
      source.subscriptionStatus ?? source.subscriptionstatus
    ) as SubscriptionStatus;
    const paidUntil = normalizeIsoDay(
      source.subscriptionPaidUntil ?? source.subscriptionpaiduntil
    );
    if (status !== "none" || paidUntil) {
      return { status, paidUntil };
    }
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
}): Promise<CachedSubscriptionAccess | null> => {
  if (!adminDb) return null;

  const cacheKey = normalizeEmail(email || rawTokenEmail || uid);
  if (cacheKey) {
    const cached = readCachedSubscriptionStatus(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

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
  const privateSnapshot = resolveSubscriptionSnapshotFromSources(privateSources);
  if (privateSnapshot) {
    const evaluated = evaluateSubscriptionAccess({
      subscriptionStatus: privateSnapshot.status,
      subscriptionPaidFrom: null,
      subscriptionPaidUntil: privateSnapshot.paidUntil,
    });
    const resolved: CachedSubscriptionAccess = {
      status: privateSnapshot.status,
      paidUntil: privateSnapshot.paidUntil,
      effectiveState: evaluated.state,
    };
    if (cacheKey) {
      writeCachedSubscriptionStatus(cacheKey, resolved);
    }
    return resolved;
  }

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

  const publicSnapshot = resolveSubscriptionSnapshotFromSources(publicSources);
  const resolved = publicSnapshot
    ? ({
        status: publicSnapshot.status,
        paidUntil: publicSnapshot.paidUntil,
        effectiveState: evaluateSubscriptionAccess({
          subscriptionStatus: publicSnapshot.status,
          subscriptionPaidFrom: null,
          subscriptionPaidUntil: publicSnapshot.paidUntil,
        }).state,
      } satisfies CachedSubscriptionAccess)
    : null;
  if (cacheKey) {
    writeCachedSubscriptionStatus(cacheKey, resolved);
  }
  return resolved;
};

async function getAuthContext(
  identity: {
    email: string;
    uid: string;
    rawTokenEmail: string;
    claims: Record<string, unknown>;
  },
  options: AuthContextOptions = {}
) {
  const {
    requireKnownUser = false,
    requireActiveSubscription = false,
  } = options;

  if (!adminDb) {
    return { error: "Server není správně nakonfigurován (chybí Firebase Admin credentials).", status: 500 } as const;
  }
  const email = normalizeEmail(identity.email);
  if (!email) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }
  const rawTokenEmail = identity.rawTokenEmail;

  const { users, childrenByManager } = await getCachedUserTree();
  const me = users.find((u) => u.email === email) ?? null;
  if (requireKnownUser && !me) {
    return { error: "Uživatel nemá interní profil v systému.", status: 403 } as const;
  }

  if (requireActiveSubscription) {
    const subscriptionAccess = await loadUserSubscriptionStatus({
      email,
      rawTokenEmail,
      uid: identity.uid,
    });
    if (subscriptionAccess?.effectiveState === "blocked") {
      if (subscriptionAccess.status === "unpaid") {
        return { error: "Účet je označený jako nezaplacený.", status: 403 } as const;
      }
      return { error: "Účet má expirované předplatné.", status: 403 } as const;
    }
  }

  const position = (me?.position as Position | null | undefined) ?? null;
  const commissionMode = normalizeCommissionModeValue(me?.commissionMode) ?? null;
  const adminRole = resolveAdminRoleFromClaims(email, identity.claims);
  const canManageContractsAsAdmin = adminRoleAtLeast(adminRole, "admin");
  const { teamEmails, contractAccessEmails } = resolveContractTeamAccess({
    viewerEmail: email,
    position,
    childrenByManager,
    users,
    canManageContractsAsAdmin,
  });

  return {
    email,
    uid: identity.uid,
    accountType: me?.accountType ?? "advisor",
    adminRole,
    canManageContractsAsAdmin,
    position,
    commissionMode,
    teamEmails,
    contractAccessEmails,
    users,
    childrenByManager,
  };
}

type ContractsEntryGuardResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      ctx: (Awaited<ReturnType<typeof getAuthContext>> extends infer T
        ? T extends { error: string; status: number }
          ? never
          : T
        : never) & {
        actorEmail: string;
        actorUid: string;
        isImpersonating: boolean;
        impersonation: ServerImpersonationContext | null;
      };
      withRateLimit: (response: NextResponse) => NextResponse;
    };

export async function requireContractsEntryGuard(
  req: NextRequest,
  rateLimit: {
    namespace: string;
    limit: number;
    windowMs: number;
  }
): Promise<ContractsEntryGuardResult> {
  const guard = await requireAuthedRateLimited(req, {
    ...rateLimit,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard;

  const tokenEmail =
    typeof guard.ctx.decoded.email === "string"
      ? guard.ctx.decoded.email.trim()
      : "";
  const rawTokenEmail = guard.ctx.isImpersonating ? guard.ctx.email : tokenEmail;
  const authCtx = await getAuthContext(
    {
      email: guard.ctx.email,
      uid: guard.ctx.uid,
      rawTokenEmail,
      claims: guard.ctx.isImpersonating
        ? {}
        : (guard.ctx.decoded as Record<string, unknown>),
    },
    {
      requireKnownUser: true,
      requireActiveSubscription: true,
    }
  );
  if ("error" in authCtx) {
    return {
      ok: false,
      response: withRateLimitHeaders(
        NextResponse.json({ ok: false, error: authCtx.error }, { status: authCtx.status }),
        guard.ctx
      ),
    };
  }
  if (authCtx.accountType === "tipster") {
    return {
      ok: false,
      response: withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Tipařské účty nemají přístup ke smluvnímu systému." },
          { status: 403 }
        ),
        guard.ctx
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      ...authCtx,
      actorEmail: guard.ctx.actorEmail,
      actorUid: guard.ctx.actorUid,
      isImpersonating: guard.ctx.isImpersonating,
      impersonation: guard.ctx.impersonation,
    },
    withRateLimit: (response: NextResponse) =>
      withRateLimitHeaders(response, guard.ctx),
  };
}

export async function handleContractsGet(
  req: NextRequest,
  mode: ContractsGetMode = "auto"
) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:get",
    limit: CONTRACTS_GET_RATE_LIMIT,
    windowMs: CONTRACTS_GET_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const { email, position, teamEmails, contractAccessEmails, users } = ctx;
  const usersByEmail = new Map(users.map((item) => [item.email, item]));

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
      teamEmails: contractAccessEmails,
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
      contractRaw,
      usersByEmail.get(detailOwnerEmail)?.name ?? null,
      usersByEmail.get(detailOwnerEmail) ?? null
    );
    const canManageContract = canManageContractOwner({
      viewerEmail: email,
      teamEmails: contractAccessEmails,
      ownerEmail: detailOwnerEmail,
      canManageContractsAsAdmin: ctx.canManageContractsAsAdmin,
    });

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
            snap.data() as ContractDoc,
            usersByEmail.get(detailOwnerEmail)?.name ?? null,
            usersByEmail.get(detailOwnerEmail) ?? null
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
      canManageContract,
      contract,
      timeline,
      ownerMeta: {
        position: ownerPosition,
        managerEmail: managerEmail || null,
        managerPosition,
        currentChainEmails,
      },
    };

    return withRateLimit(NextResponse.json(response));
  }

  const scopeParam = resolveContractListScope(search.get("scope"));
  const includeTeam = search.get("includeTeam") === "1" || search.get("includeTeam") === "true";
  const shapeParam = search.get("shape");
  const responseShape: ContractListResponseShape =
    shapeParam === "clientNames"
      ? "clientNames"
      : shapeParam === "home"
      ? "home"
      : shapeParam === "cashflow"
      ? "cashflow"
      : "full";
  const ownerNamesByEmail = new Map(
    users.map((item) => [item.email, normalizeOptionalDisplayName(item.name) ?? null] as const)
  );
  const cursor = parseCursor(search);
  const listFilters = parseContractListFilters(search);
  const limitParam = Number(search.get("limit"));
  const pageSizeMax = responseShape === "cashflow" ? CASHFLOW_PAGE_SIZE_MAX : PAGE_SIZE_MAX;
  const pageSize =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(1, limitParam), pageSizeMax)
      : PAGE_SIZE_DEFAULT;

  if (scopeParam === "team" && teamEmails.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nemáš práva pro zobrazení týmových smluv." } satisfies ErrorResponse,
      { status: 403 }
    );
  }

  const selectedSubordinates = selectedSubordinateEmailsFromParam(
    search.get("subordinates")
  );
  const owners = selectContractListOwners({
    scope: scopeParam,
    viewerEmail: email,
    teamEmails,
    selectedSubordinates,
  });
  const shouldFetchTeamInParallel = shouldFetchTeamContractsInParallel({
    scope: scopeParam,
    includeTeam,
    teamEmails,
  });

  let primaryRes: Awaited<ReturnType<typeof fetchContractsForOwners>>;
  let teamRes: Awaited<ReturnType<typeof fetchContractsForOwners>> | null = null;

  if (shouldFetchTeamInParallel) {
    [primaryRes, teamRes] = await Promise.all([
      fetchContractsForOwners(
        owners,
        cursor,
        pageSize,
        listFilters,
        responseShape,
        ownerNamesByEmail,
        usersByEmail
      ),
      fetchContractsForOwners(
        teamEmails,
        null,
        pageSize,
        undefined,
        responseShape,
        ownerNamesByEmail,
        usersByEmail
      ),
    ]);
  } else {
    primaryRes = await fetchContractsForOwners(
      owners,
      cursor,
      pageSize,
      listFilters,
      responseShape,
      ownerNamesByEmail,
      usersByEmail
    );
    if (includeTeam && teamEmails.length > 0) {
      teamRes = await fetchContractsForOwners(
        teamEmails,
        null,
        pageSize,
        undefined,
        responseShape,
        ownerNamesByEmail,
        usersByEmail
      );
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
    commissionMode: ctx.commissionMode,
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

  return withRateLimit(NextResponse.json(response));
}

export async function handleContractsFind(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:find",
    limit: CONTRACTS_GET_RATE_LIMIT,
    windowMs: CONTRACTS_GET_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const { email, teamEmails, users } = ctx;
  const usersByEmail = new Map(users.map((item) => [item.email, item]));

  const search = req.nextUrl.searchParams;
  const queryRaw = (search.get("q") ?? "").trim();
  if (!queryRaw) {
    return NextResponse.json(
      { ok: false, error: "Chybí parametr q." } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  const scope = resolveContractFindScope(search.get("scope"));
  if (scope === "team" && teamEmails.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nemáš práva pro zobrazení týmových smluv." } satisfies ErrorResponse,
      { status: 403 }
    );
  }

  const normalizedContractNumber = normalizeContractNumber(queryRaw);
  if (!normalizedContractNumber) {
    const emptyResponse: ContractsFindResponse = {
      ok: true,
      scope,
      query: queryRaw,
      contracts: [],
    };
    return withRateLimit(NextResponse.json(emptyResponse));
  }

  const allowedOwners = buildFindAllowedOwnerSet({
    scope,
    viewerEmail: email,
    teamEmails,
  });

  let entryRefs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[];
  try {
    entryRefs = await resolveEntryRefsByContractNumber(queryRaw);
  } catch (err) {
    console.error("GET /api/contracts/find: resolveEntryRefsByContractNumber selhalo:", err);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se dohledat smlouvu podle čísla." } satisfies ErrorResponse,
      { status: 500 }
    );
  }

  const contracts: ContractResponseItem[] = [];
  const seenKeys = new Set<string>();
  const ownerProfileByEmail = new Map<string, UserProfileSnapshot | ContractOwnerPositionContext | null>();

  const resolveOwnerProfile = async (
    ownerEmail: string
  ): Promise<UserProfileSnapshot | ContractOwnerPositionContext | null> => {
    const normalizedOwner = normalizeEmail(ownerEmail);
    if (!normalizedOwner) return null;
    if (ownerProfileByEmail.has(normalizedOwner)) {
      return ownerProfileByEmail.get(normalizedOwner) ?? null;
    }
    const profile = usersByEmail.get(normalizedOwner) ?? (await loadUserProfileByEmail(normalizedOwner));
    ownerProfileByEmail.set(normalizedOwner, profile ?? null);
    return profile ?? null;
  };

  for (const ref of entryRefs) {
    const ownerFromPath = normalizeEmail(ref.path.split("/")[1] ?? "");
    if (!ownerFromPath) continue;
    if (allowedOwners && !allowedOwners.has(ownerFromPath)) continue;

    try {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const contract = snap.data() as ContractDoc;
      if (normalizeContractNumber(contract.contractNumber ?? null) !== normalizedContractNumber) {
        continue;
      }
      if (scope === "tip") {
        const tipsterEmail = normalizeEmail(contract.tipContractTipsterEmail);
        if (!tipsterEmail || tipsterEmail !== normalizeEmail(email)) continue;
      } else if (
        !hasContractAccess({
          viewerEmail: email,
          teamEmails,
          ownerEmail: ownerFromPath,
          contract,
        })
      ) {
        continue;
      }

      const itemKey = `${ownerFromPath}___${snap.id}`;
      if (seenKeys.has(itemKey)) continue;
      seenKeys.add(itemKey);
      const ownerProfile = await resolveOwnerProfile(ownerFromPath);
      const item = toContractResponseItem(
        snap.id,
        ownerFromPath,
        contract,
        normalizeOptionalDisplayName(ownerProfile?.name) ?? null,
        ownerProfile
      );
      if (
        item.productKey &&
        LIFE_TIMELINE_PRODUCTS.has(item.productKey as Product)
      ) {
        item.lifePremiumChanges = await loadLifePremiumChangesForFindMatch({
          ownerEmail: ownerFromPath,
          contract: item,
          adviserName: item.adviserName ?? null,
          ownerContext: ownerProfile,
        });
      }
      contracts.push(item);
    } catch (entryErr) {
      console.warn("GET /api/contracts/find: načtení entry selhalo:", ref.path, entryErr);
    }
  }

  const uniqueContracts = dedupeEquivalentContractResponseItems(contracts);

  uniqueContracts.sort((a, b) => {
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

  const response: ContractsFindResponse = {
    ok: true,
    scope,
    query: queryRaw,
    contracts: uniqueContracts,
  };
  return withRateLimit(NextResponse.json(response));
}

export async function handleContractsPrecheck(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:precheck",
    limit: CONTRACTS_GET_RATE_LIMIT,
    windowMs: CONTRACTS_GET_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const { email } = ctx;

  const search = req.nextUrl.searchParams;
  const productRaw = (search.get("productKey") ?? "").trim();
  const signedDateRaw = (search.get("signedDate") ?? "").trim();
  const clientNameRaw = (search.get("clientName") ?? "").trim();
  const contractNumberRaw = (search.get("contractNumber") ?? "").trim();

  const productKey = productRaw ? (productRaw as Product) : null;
  if (productKey && !SUPPORTED_PRODUCTS.has(productKey)) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Pole productKey má nepodporovanou hodnotu." } satisfies ErrorResponse,
        { status: 400 }
      )
    );
  }

  if (signedDateRaw && !isIsoDay(signedDateRaw)) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Pole signedDate musí být ve formátu YYYY-MM-DD." } satisfies ErrorResponse,
        { status: 400 }
      )
    );
  }

  const signedDate = signedDateRaw || null;
  const normalizedClient = normalizeClientNameForDuplicate(clientNameRaw);
  const normalizedContractNumber = normalizeContractNumber(contractNumberRaw);

  if (!productKey || !signedDate || !normalizedClient || !normalizedContractNumber) {
    const emptyResponse: ContractsPrecheckResponse = {
      ok: true,
      productKey,
      clientName: clientNameRaw || null,
      signedDate,
      similarContracts: [],
    };
    return withRateLimit(NextResponse.json(emptyResponse));
  }

  if (!adminDb) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (chybí Firebase Admin credentials)." } satisfies ErrorResponse,
        { status: 500 }
      )
    );
  }

  const entriesRef = adminDb.collection("users").doc(email).collection("entries");
  const lookupKey = buildDuplicateLookupKey({
    entryType: "contract",
    productKey,
    clientName: clientNameRaw,
    contractSignedDate: signedDate,
  });
  if (!lookupKey) {
    const emptyResponse: ContractsPrecheckResponse = {
      ok: true,
      productKey,
      clientName: clientNameRaw || null,
      signedDate,
      similarContracts: [],
    };
    return withRateLimit(NextResponse.json(emptyResponse));
  }

  const similarContracts: ContractsPrecheckEntry[] = [];
  const keyedSnap = await entriesRef.where("duplicateLookupKey", "==", lookupKey).get();
  keyedSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() ?? {}) as ContractDoc;
    if (normalizeContractEntryType(data.entryType) !== "contract") return;
    if (normalizeContractNumber(data.contractNumber ?? null) !== normalizedContractNumber) return;
    similarContracts.push({
      id: docSnap.id,
      contractNumber:
        typeof data.contractNumber === "string" && data.contractNumber.trim()
          ? data.contractNumber.trim()
          : null,
      ownerEmail: email,
    });
  });

  if (similarContracts.length === 0) {
    // Fallback pro starší záznamy bez duplicateLookupKey; zároveň průběžný backfill indexu.
    const productSnap = await entriesRef.where("productKey", "==", productKey).get();
    const backfillBatch = adminDb.batch();
    let backfillOps = 0;

    productSnap.docs.forEach((docSnap) => {
      const data = (docSnap.data() ?? {}) as ContractDoc;
      const resolvedLookupKey = buildDuplicateLookupKey({
        entryType: data.entryType,
        productKey: data.productKey,
        clientName: data.clientName,
        contractSignedDate: data.contractSignedDate,
      });
      if (resolvedLookupKey && !data.duplicateLookupKey && backfillOps < 350) {
        backfillBatch.set(docSnap.ref, { duplicateLookupKey: resolvedLookupKey }, { merge: true });
        backfillOps += 1;
      }

      if (normalizeContractEntryType(data.entryType) !== "contract") return;
      if (normalizeClientNameForDuplicate(data.clientName) !== normalizedClient) return;
      if (isoDayFromUnknown(data.contractSignedDate) !== signedDate) return;
      if (normalizeContractNumber(data.contractNumber ?? null) !== normalizedContractNumber) return;

      similarContracts.push({
        id: docSnap.id,
        contractNumber:
          typeof data.contractNumber === "string" && data.contractNumber.trim()
            ? data.contractNumber.trim()
            : null,
        ownerEmail: email,
      });
    });

    if (backfillOps > 0) {
      try {
        await backfillBatch.commit();
      } catch (backfillErr) {
        console.warn("GET /api/contracts/precheck: duplicateLookupKey backfill selhal:", backfillErr);
      }
    }
  }

  const response: ContractsPrecheckResponse = {
    ok: true,
    productKey,
    clientName: clientNameRaw || null,
    signedDate,
    similarContracts,
  };
  return withRateLimit(NextResponse.json(response));
}

export async function handleContractsCreate(req: NextRequest) {
  let withRateLimit: ((response: NextResponse) => NextResponse) | null = null;
  try {
    const guard = await requireContractsEntryGuard(req, {
      namespace: "api:contracts:create",
      limit: CONTRACTS_CREATE_RATE_LIMIT,
      windowMs: CONTRACTS_CREATE_RATE_LIMIT_WINDOW_MS,
    });
    if (!guard.ok) return guard.response;
    withRateLimit = guard.withRateLimit;
    const ctx = guard.ctx;
    if (ctx.accountType === "tipster") {
      return withRateLimit(tipsterContractsMutationResponse());
    }
    const { email, uid, teamEmails } = ctx;

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

    const requestedOwnerRaw =
      isPlainObject(body) && typeof body.ownerEmail === "string"
        ? body.ownerEmail.trim()
        : "";
    const requestedOwnerEmail = normalizeEmail(requestedOwnerRaw);
    if (requestedOwnerRaw && (!requestedOwnerEmail || !EMAIL_RE.test(requestedOwnerEmail))) {
      return NextResponse.json(
        { ok: false, error: "Pole ownerEmail má neplatný formát." },
        { status: 400 }
      );
    }

    const adminImpersonationCanManage =
      ctx.isImpersonating &&
      adminRoleAtLeast(ctx.impersonation?.actorRole ?? null, "admin");
    const actorEmail = normalizeEmail(ctx.actorEmail);
    const targetOwnerEmail =
      adminImpersonationCanManage &&
      (!requestedOwnerEmail || requestedOwnerEmail === actorEmail)
        ? email
        : requestedOwnerEmail || email;
    const isOwnerOverride = targetOwnerEmail !== email;
    if (isOwnerOverride) {
      const canUseLegacyOwnerOverride =
        email === CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL;
      if (!canUseLegacyOwnerOverride && !adminImpersonationCanManage) {
        return NextResponse.json(
          { ok: false, error: "Nemáš oprávnění uložit smlouvu za jiného uživatele." },
          { status: 403 }
        );
      }
      if (!adminImpersonationCanManage && !teamEmails.includes(targetOwnerEmail)) {
        return NextResponse.json(
          { ok: false, error: "Vybraný uživatel není mezi tvými podřízenými." },
          { status: 403 }
        );
      }
    }

    let trustedProfile: UserProfileSnapshot | null = null;
    if (isOwnerOverride) {
      trustedProfile = await loadUserProfileByEmail(targetOwnerEmail);
      if (!trustedProfile) {
        return NextResponse.json(
          { ok: false, error: "Nepodařilo se načíst profil vybraného podřízeného." },
          { status: 404 }
        );
      }
    } else {
      trustedProfile = await loadCallerProfile({
        uid,
        tokenEmail: email,
      });
      if (!trustedProfile) {
        return NextResponse.json(
          { ok: false, error: "Nepodařilo se načíst profil přihlášeného uživatele." },
          { status: 403 }
        );
      }
    }
    if (!trustedProfile) {
      return NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst profil vlastníka smlouvy." },
        { status: 403 }
      );
    }

    const ownerUidForPayload = trustedProfile.userId || uid;

    const normalizedEntry = normalizeCreateEntryPayload({
      raw: entryRaw,
      ownerEmail: targetOwnerEmail,
      ownerUid: ownerUidForPayload,
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
    const db = adminDb;
    const ownerEntriesRef = db.collection("users").doc(targetOwnerEmail).collection("entries");
    const idempotencyKey = parseIdempotencyKeyFromRequest(req);
    const idempotentEntryId = idempotencyKey
      ? buildIdempotentEntryId(targetOwnerEmail, idempotencyKey)
      : null;
    const idempotentEntryRef = idempotentEntryId
      ? ownerEntriesRef.doc(idempotentEntryId)
      : null;

    const signedDateIso = toIsoDay(normalizedEntry.payload.contractSignedDate);
    if (
      normalizedEntry.payload.productKey === "slaviaauto" &&
      !isSlaviaAutoSupportedForSignedDate(signedDateIso)
    ) {
      return NextResponse.json(
        { ok: false, error: SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE },
        { status: 400 }
      );
    }
    if (
      normalizedEntry.payload.productKey === "slaviaflotila" &&
      !isSlaviaFlotilaSupportedForSignedDate(signedDateIso)
    ) {
      return NextResponse.json(
        { ok: false, error: SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE },
        { status: 400 }
      );
    }

    const trustedPosition = resolveTimelinePositionForSignedDate(trustedProfile, signedDateIso);
    if (!trustedPosition) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Pro datum sjednání není v timeline vlastníka nastavená pozice. Bez timeline není možné smlouvu uložit.",
        },
        { status: 400 }
      );
    }

    const profileTrustedMode = trustedProfile.commissionMode ?? "standard";
    const trustedMode = trustedCreateCommissionMode({
      productKey: normalizedEntry.payload.productKey,
      profileMode: profileTrustedMode,
      requestedMode: normalizedEntry.payload.commissionMode,
    });
    const effectiveTrustedMode = effectiveCommissionModeForStoredProduct(
      normalizedEntry.payload.productKey,
      trustedMode,
      signedDateIso,
      null
    );
    const trustedManagerEmail = normalizeEmail(trustedProfile.managerEmail) || null;
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
    trustedManagerChain = normalizeManagerChainModesForProduct(
      trustedManagerChain,
      normalizedEntry.payload.productKey
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

    let refreshOriginalLink: ExistingContractByNumber | null = null;
    let refreshOriginalForSync: { ownerEmail: string; entryId: string } | null = null;
    let refreshCommissionBase: RefreshCommissionBasePayload | null = null;
    let commissionInputAmount =
      normalizedEntry.payload.entryType === "endorsement"
        ? normalizedEntry.payload.calculationInputAmount ?? normalizedEntry.payload.inputAmount
        : normalizedEntry.payload.inputAmount;

    const refreshWithoutOriginalInSystem =
      normalizedEntry.payload.entryType === "contract" &&
      normalizedEntry.payload.productKey === "neon" &&
      normalizedEntry.payload.isRefresh === true &&
      normalizedEntry.payload.refreshOriginalMissingInSystem === true;
    const allowUnlinkedOriginalReplacement =
      normalizedEntry.payload.entryType === "contract" &&
      normalizedEntry.payload.isRefresh === true &&
      canSaveUnlinkedOriginalReplacement(normalizedEntry.payload.productKey);

    if (
      normalizedEntry.payload.entryType === "contract" &&
      normalizedEntry.payload.isRefresh === true &&
      !refreshWithoutOriginalInSystem
    ) {
      const skipUnlinkedOriginalIfAllowed = (
        error: string,
        status: number = 400
      ): NextResponse | null => {
        if (!allowUnlinkedOriginalReplacement) {
          return NextResponse.json({ ok: false, error }, { status });
        }
        refreshOriginalLink = null;
        refreshOriginalForSync = null;
        return null;
      };
      const originalContractNumber =
        normalizedEntry.payload.refreshOriginalContractNumber ?? "";
      refreshOriginalLink = await findExistingContractByNumber(originalContractNumber);
      const ownerEntryPrefix = `users/${targetOwnerEmail}/entries/`;
      if (!refreshOriginalLink || !refreshOriginalLink.entryPath.startsWith(ownerEntryPrefix)) {
        const response = skipUnlinkedOriginalIfAllowed(
          "Původní smlouva pro Refresh/Náhradu nebyla nalezena u vlastníka nové smlouvy."
        );
        if (response) return response;
      }

      if (refreshOriginalLink) {
        const refreshOriginalEntryId =
          refreshOriginalLink.entryId ??
          refreshOriginalLink.entryPath.split("/").pop()?.trim() ??
          "";
        if (!refreshOriginalEntryId) {
          const response = skipUnlinkedOriginalIfAllowed(
            "Původní smlouva pro Refresh/Náhradu nemá platné entryId."
          );
          if (response) return response;
        }

        const refreshOriginalSnap = await db.doc(refreshOriginalLink.entryPath).get();
        if (!refreshOriginalSnap.exists) {
          const response = skipUnlinkedOriginalIfAllowed(
            "Původní smlouva pro Refresh/Náhradu už nebyla nalezena."
          );
          if (response) return response;
        }

        if (refreshOriginalLink && refreshOriginalSnap.exists) {
          const originalData = (refreshOriginalSnap.data() ?? {}) as ContractDoc;
          if (normalizeContractEntryType(originalData.entryType ?? "contract") !== "contract") {
            const response = skipUnlinkedOriginalIfAllowed(
              "Původní záznam pro Refresh/Náhradu není smlouva."
            );
            if (response) return response;
          }
          if (refreshOriginalLink && originalData.productKey !== normalizedEntry.payload.productKey) {
            const response = skipUnlinkedOriginalIfAllowed(
              "Původní smlouva pro Refresh/Náhradu musí mít stejný produkt jako nová smlouva."
            );
            if (response) return response;
          }
          if (
            refreshOriginalLink &&
            normalizeContractNumber(originalData.contractNumber) !==
              normalizeContractNumber(originalContractNumber)
          ) {
            const response = skipUnlinkedOriginalIfAllowed(
              "Původní smlouva pro Refresh/Náhradu neodpovídá zadanému číslu."
            );
            if (response) return response;
          }

          if (refreshOriginalLink) {
            const existingReplacementEntryId =
              typeof originalData.refreshReplacedByEntryId === "string"
                ? originalData.refreshReplacedByEntryId.trim()
                : "";
            if (
              existingReplacementEntryId &&
              existingReplacementEntryId !== (idempotentEntryRef?.id ?? "")
            ) {
              return NextResponse.json(
                { ok: false, error: "Původní smlouva už má navazující Refresh/Náhradu." },
                { status: 409 }
              );
            }
            refreshOriginalForSync = {
              ownerEmail: targetOwnerEmail,
              entryId: refreshOriginalEntryId,
            };
            if (normalizedEntry.payload.productKey === "neon") {
              const originalItem = toContractResponseItem(
                refreshOriginalSnap.id,
                targetOwnerEmail,
                originalData,
                trustedProfile.name,
                trustedProfile
              );
              const originalPremiumInfo = await resolveRefreshOriginalPremiumInfo({
                ownerEmail: targetOwnerEmail,
                contract: originalItem,
              });
              const refreshBase = originalPremiumInfo
                ? calculateNeonRefreshCommissionBase({
                    newMonthlyPremium:
                      normalizedEntry.payload.effectiveInputAmount ||
                      normalizedEntry.payload.inputAmount,
                    originalMonthlyPremium: originalPremiumInfo.premiumAmount,
                    stornoBaseMonthlyPremium: originalPremiumInfo.stornoBasePremiumAmount,
                    originalStornoStartDateIso: originalPremiumInfo.stornoStartDateIso,
                    refreshPolicyStartDateIso: toIsoDay(normalizedEntry.payload.policyStartDate),
                  })
                : null;
              if (!refreshBase) {
                return NextResponse.json(
                  {
                    ok: false,
                    error:
                      "Nepodařilo se spočítat Refresh základnu pro ČPP ŽP NEON. Zkontroluj pojistné a datum původní smlouvy.",
                  },
                  { status: 400 }
                );
              }
              commissionInputAmount = refreshBase.calculationMonthlyPremium;
              refreshCommissionBase = {
                productKey: "neon",
                method: "cpp_neon_5y_storno",
                calculationMethod: refreshBase.calculationMethod,
                originalContractNumber: originalContractNumber || null,
                originalStornoStartDateIso: originalPremiumInfo?.stornoStartDateIso ?? null,
                refreshPolicyStartDateIso: toIsoDay(normalizedEntry.payload.policyStartDate),
                stornoMonths: NEON_REFRESH_STORNO_MONTHS,
                elapsedMonths: refreshBase.elapsedMonths,
                remainingMonths: refreshBase.remainingMonths,
                earnedRatio: refreshBase.earnedRatio,
                remainingRatio: refreshBase.remainingRatio,
                newMonthlyPremium: refreshBase.newMonthlyPremium,
                newAnnualPremium: refreshBase.newMonthlyPremium * 12,
                originalMonthlyPremium: refreshBase.originalMonthlyPremium,
                originalAnnualPremium: refreshBase.originalMonthlyPremium * 12,
                premiumIncreaseMonthly: refreshBase.premiumIncreaseMonthly,
                premiumIncreaseAnnual: refreshBase.premiumIncreaseAnnual,
                stornoBaseMonthlyPremium: refreshBase.stornoBaseMonthlyPremium,
                stornoBaseAnnualPremium: refreshBase.stornoBaseAnnualPremium,
                stornedOriginalMonthlyPremium: refreshBase.stornedOriginalMonthlyPremium,
                stornedOriginalAnnualPremium: refreshBase.stornedOriginalAnnualPremium,
                motivationalMonthlyPremium: refreshBase.motivationalMonthlyPremium,
                motivationalAnnualPremium: refreshBase.motivationalAnnualPremium,
                calculationMonthlyPremium: refreshBase.calculationMonthlyPremium,
                calculationAnnualPremium: refreshBase.calculationAnnualPremium,
              };
            }
          }
        }
      }
    }

    const trustedResult = computeItemsForProductPositionAndMode({
      productKey: normalizedEntry.payload.productKey,
      position: trustedPosition,
      commissionMode: effectiveTrustedMode,
      contractSignedDateIso: signedDateIso,
      commissionCoefficientSetOverride: null,
      neonCoefficientSetOverride: null,
      inputAmount: commissionInputAmount,
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

    let trustedItems = trustedResult.items;
    let trustedTotal = trustedResult.total;
    let tipContractTipsterName: string | null = null;
    let tipContractImmediateFirstYearGross: number | null = null;
    let tipContractImmediateFirstYearNet: number | null = null;
    let tipContractTipsterAmountFirstYear: number | null = null;

    if (normalizedEntry.payload.tipContractTipsterPercent != null) {
      if (normalizedEntry.payload.tipContractTipsterEmail) {
        const tipsterProfile = await loadUserProfileByEmail(
          normalizedEntry.payload.tipContractTipsterEmail
        );
        if (!tipsterProfile) {
          return NextResponse.json(
            {
              ok: false,
              error: "Tipař s tímto e-mailem neexistuje v systému.",
            },
            { status: 400 }
          );
        }
        tipContractTipsterName = tipsterProfile.name ?? null;
      }

      const tipAdjusted = applyTipContractAdjustmentToCommissionItems({
        product: normalizedEntry.payload.productKey,
        items: trustedResult.items,
        tipsterPercent: normalizedEntry.payload.tipContractTipsterPercent,
      });
      trustedItems = tipAdjusted.items;
      trustedTotal = roundToCents(
        Math.max(0, trustedResult.total - tipAdjusted.tipsterAmount)
      );
      tipContractImmediateFirstYearGross = tipAdjusted.grossBase;
      tipContractImmediateFirstYearNet = tipAdjusted.netBase;
      tipContractTipsterAmountFirstYear = tipAdjusted.tipsterAmount;
    }

    const trustedManagerOverrides = computeManagerOverridesForChain({
      managerChain: trustedManagerChain,
      adviserPosition: trustedPosition,
      adviserMode: effectiveTrustedMode,
      productKey: normalizedEntry.payload.productKey,
      contractSignedDateIso: signedDateIso,
      commissionCoefficientSetOverride: null,
      neonCoefficientSetOverride: null,
      inputAmount: commissionInputAmount,
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
      ownerEmail: targetOwnerEmail,
      managerEmailSnapshot: trustedManagerEmail,
      managerChain: trustedManagerChain,
      managerOverrides: trustedManagerOverrides,
    });

    const trustedPayload: NormalizedCreateEntryPayload = {
      ...normalizedEntry.payload,
      calculationInputAmount: commissionInputAmount,
      refreshCommissionBase,
      position: trustedPosition,
      commissionMode: effectiveTrustedMode,
      items: trustedItems,
      total: trustedTotal,
      result: {
        items: trustedItems,
        total: trustedTotal,
      },
      tipContractTipsterName,
      tipContractImmediateFirstYearGross,
      tipContractImmediateFirstYearNet,
      tipContractTipsterAmountFirstYear,
      managerEmailSnapshot: trustedManagerEmail,
      managerPositionSnapshot: trustedManagerPosition,
      managerModeSnapshot: trustedManagerMode,
      managerChain: trustedManagerChain,
      managerOverrides: trustedManagerOverrides,
      allowedEmails: trustedAllowedEmails,
      duplicateLookupKey: buildDuplicateLookupKey({
        entryType: normalizedEntry.payload.entryType,
        productKey: normalizedEntry.payload.productKey,
        clientName: normalizedEntry.payload.clientName,
        contractSignedDate: normalizedEntry.payload.contractSignedDate,
      }),
    };

    const newContractPushRecipients =
      ENABLE_CONTRACT_CREATE_PUSH &&
      trustedPayload.entryType === "contract" &&
      isRecentEnoughForNewContractPush(trustedPayload.contractSignedDate)
        ? collectManagerNotificationEmailsForNewContract({
            ownerEmail: targetOwnerEmail,
            managerEmailSnapshot: trustedManagerEmail,
            managerChain: trustedManagerChain,
            managerOverrides: trustedManagerOverrides,
          })
        : [];

    if (idempotentEntryRef) {
      const existingIdempotentSnap = await idempotentEntryRef.get();
      if (existingIdempotentSnap.exists) {
        return withRateLimit(idempotentReplayResponse(existingIdempotentSnap, trustedPayload));
      }
    }

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
      const createdRef = idempotentEntryRef ?? ownerEntriesRef.doc();

      const duplicateGuardRefs =
        trustedPayload.entryType === "contract"
          ? await collectContractDuplicateGuardRefs({
              ownerEntriesRef,
              contractNumber: trustedPayload.contractNumber,
              excludeEntryPath: createdRef.path,
            })
          : [];

      if (trustedPayload.entryType === "contract") {
        const contractNumberNormalized = normalizeContractNumber(
          trustedPayload.contractNumber
        );
        const contractNumberLoose = normalizeContractNumberLoose(
          trustedPayload.contractNumber
        );
        const refreshOriginalNumberNormalized = normalizeContractNumber(
          trustedPayload.refreshOriginalContractNumber
        );
        const refreshOriginalRef = refreshOriginalLink
          ? db.doc(refreshOriginalLink.entryPath)
          : null;
        const claimRef = db
          .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
          .doc(contractNumberClaimDocId(contractNumberNormalized));
        const claimPayload = {
          contractNumberRaw: trustedPayload.contractNumber,
          contractNumberNormalized,
          contractNumberLoose,
          ownerEmail: targetOwnerEmail,
          entryId: createdRef.id,
          entryPath: createdRef.path,
          updatedAt: new Date(),
          createdAt: new Date(),
        };

        await db.runTransaction(async (tx) => {
          const claimSnap = await tx.get(claimRef);
          let refreshOriginalSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
          for (const duplicateRef of duplicateGuardRefs) {
            const duplicateSnap = await tx.get(duplicateRef);
            if (!duplicateSnap.exists) continue;

            const duplicateData = (duplicateSnap.data() ?? {}) as ContractDoc;
            if (
              normalizeContractEntryType(duplicateData.entryType ?? "contract") ===
                "contract" &&
              normalizeContractNumber(duplicateData.contractNumber) ===
                contractNumberNormalized
            ) {
              throw createDuplicateContractError(duplicateRef.path);
            }
          }

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
                  throw createDuplicateContractError(claimEntryPath);
                }
              }
            }
          }

          if (refreshOriginalRef) {
            refreshOriginalSnap = await tx.get(refreshOriginalRef);
            if (!refreshOriginalSnap.exists) {
              const missingOriginalErr = new Error(
                "Původní smlouva pro Refresh/Náhradu už nebyla nalezena."
              ) as Error & { statusCode?: number };
              missingOriginalErr.statusCode = 400;
              throw missingOriginalErr;
            }

            const originalData = (refreshOriginalSnap.data() ?? {}) as ContractDoc;
            if (normalizeContractEntryType(originalData.entryType ?? "contract") !== "contract") {
              const entryTypeErr = new Error(
                "Původní záznam pro Refresh/Náhradu není smlouva."
              ) as Error & { statusCode?: number };
              entryTypeErr.statusCode = 400;
              throw entryTypeErr;
            }
            if (originalData.productKey !== trustedPayload.productKey) {
              const productErr = new Error(
                "Původní smlouva pro Refresh/Náhradu musí mít stejný produkt jako nová smlouva."
              ) as Error & { statusCode?: number };
              productErr.statusCode = 400;
              throw productErr;
            }
            if (
              normalizeContractNumber(originalData.contractNumber) !==
              refreshOriginalNumberNormalized
            ) {
              const numberErr = new Error(
                "Původní smlouva pro Refresh/Náhradu neodpovídá zadanému číslu."
              ) as Error & { statusCode?: number };
              numberErr.statusCode = 400;
              throw numberErr;
            }

            const existingReplacementEntryId =
              typeof originalData.refreshReplacedByEntryId === "string"
                ? originalData.refreshReplacedByEntryId.trim()
                : "";
            if (existingReplacementEntryId && existingReplacementEntryId !== createdRef.id) {
              const linkedErr = new Error(
                "Původní smlouva už má navazující Refresh/Náhradu."
              ) as Error & { statusCode?: number };
              linkedErr.statusCode = 409;
              throw linkedErr;
            }
          }

          if (claimSnap.exists) {
            tx.set(claimRef, claimPayload, { merge: true });
          } else {
            tx.create(claimRef, claimPayload);
          }

          tx.create(createdRef, trustedPayload);

          const contractRefPayload = contractRefFromData({
            ownerEmail: targetOwnerEmail,
            entryId: createdRef.id,
            contractNumber: trustedPayload.contractNumber,
            productKey: trustedPayload.productKey,
          });
          const contractRef = db
            .collection(CONTRACT_REFS_COLLECTION)
            .doc(contractRefDocId(targetOwnerEmail, createdRef.id));
          if (contractRefPayload) {
            tx.set(contractRef, contractRefPayload, { merge: true });
          } else {
            tx.delete(contractRef);
          }

          if (refreshOriginalRef && refreshOriginalSnap?.exists) {
            const refreshOriginalData = (refreshOriginalSnap.data() ?? {}) as ContractDoc;
            const originalAlreadyStorno =
              contractLifecycleStatus(refreshOriginalData) === "storno";
            tx.set(
              refreshOriginalRef,
              {
                ...(originalAlreadyStorno
                  ? {}
                  : {
                      status: "storno",
                      stornoDate: trustedPayload.policyStartDate,
                    }),
                refreshReplacedByEntryId: createdRef.id,
                refreshReplacedByOwnerEmail: targetOwnerEmail,
                refreshReplacedBySignedDate: trustedPayload.contractSignedDate,
              },
              { merge: true }
            );
          }
        });
      } else {
        await createdRef.create(trustedPayload);
        const batch = db.batch();
        applyContractRefToBatch({
          batch,
          ownerEmail: targetOwnerEmail,
          entryId: createdRef.id,
          contractNumber: trustedPayload.contractNumber,
          productKey: trustedPayload.productKey,
        });
        await batch.commit();
      }

      try {
        await markTeamOverviewOwnersDirty([targetOwnerEmail]);
      } catch (markErr) {
        console.warn(
          "POST /api/contracts create: team-overview invalidace selhala:",
          markErr
        );
      }

      try {
        await syncTipPayoutDocsForEntry({
          ownerEmail: targetOwnerEmail,
          entryId: createdRef.id,
          entryData: trustedPayload,
        });
      } catch (tipSyncErr) {
        console.warn(
          "POST /api/contracts create: TIP payout sync selhal:",
          tipSyncErr
        );
      }

      if (refreshOriginalForSync) {
        try {
          const refreshOriginalSnap = await db
            .collection("users")
            .doc(refreshOriginalForSync.ownerEmail)
            .collection("entries")
            .doc(refreshOriginalForSync.entryId)
            .get();
          if (refreshOriginalSnap.exists) {
            await syncTipPayoutDocsForEntry({
              ownerEmail: refreshOriginalForSync.ownerEmail,
              entryId: refreshOriginalSnap.id,
              entryData: refreshOriginalSnap.data() as ContractDoc,
            });
          }
        } catch (refreshTipSyncErr) {
          console.warn(
            "POST /api/contracts create: TIP payout sync původní refresh smlouvy selhal:",
            refreshTipSyncErr
          );
        }
      }

      try {
        await markLinkedAdvisorTipAsContracted({
          ownerEmail: targetOwnerEmail,
          entryId: createdRef.id,
          entryData: trustedPayload,
        });
      } catch (tipLinkErr) {
        console.warn(
          "POST /api/contracts create: napojení smlouvy na TIP selhalo:",
          tipLinkErr
        );
      }

      if (newContractPushRecipients.length > 0) {
        try {
          await sendNewContractPushNotification({
            req,
            recipientEmails: newContractPushRecipients,
            ownerEmail: targetOwnerEmail,
            ownerName: trustedProfile.name,
            entryId: createdRef.id,
            contractNumber: trustedPayload.contractNumber,
            productKey: trustedPayload.productKey,
            inputAmount: trustedPayload.inputAmount,
            frequencyRaw: trustedPayload.frequencyRaw,
          });
        } catch (pushErr) {
          console.warn(
            "POST /api/contracts create: push notifikace o nové smlouvě selhala:",
            pushErr
          );
        }
      }

      const response = NextResponse.json({
        ok: true,
        entryId: createdRef.id,
        refreshOriginalEntryId: refreshOriginalForSync?.entryId ?? null,
      });
      return withRateLimit(response);
    } catch (createErr: any) {
      if (idempotentEntryRef && isFirestoreAlreadyExists(createErr)) {
        try {
          const replaySnap = await idempotentEntryRef.get();
          if (replaySnap.exists) {
            return withRateLimit(idempotentReplayResponse(replaySnap, trustedPayload));
          }
        } catch (replayErr) {
          console.warn("POST /api/contracts create: idempotent replay read selhal:", replayErr);
        }
      }

      const message =
        typeof createErr?.message === "string" && createErr.message.trim()
          ? createErr.message.trim()
          : "Neznámá chyba při ukládání smlouvy.";
      const statusCode = Number((createErr as any)?.statusCode);
      if ([400, 403, 404, 409].includes(statusCode)) {
        return NextResponse.json(
          {
            ok: false,
            error: message,
            duplicatePath:
              typeof (createErr as any)?.duplicatePath === "string"
                ? (createErr as any).duplicatePath
                : null,
          },
          { status: statusCode }
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
    const response = NextResponse.json(
      { ok: false, error: `Uložení smlouvy selhalo: ${message}` },
      { status: 500 }
    );
    return withRateLimit ? withRateLimit(response) : response;
  }
}

export async function handleContractsPatch(
  req: NextRequest,
  forcedAction?: ContractsPatchAction
) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:patch",
    limit: CONTRACTS_MUTATION_RATE_LIMIT,
    windowMs: CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  if (ctx.accountType === "tipster") {
    return withRateLimit(tipsterContractsMutationResponse());
  }
  const { email, teamEmails, contractAccessEmails } = ctx;

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

      const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
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
        const duplicateLookupKey = buildDuplicateLookupKey({
          entryType: data.entryType,
          productKey: data.productKey,
          clientName: data.clientName,
          contractSignedDate: data.contractSignedDate,
        });
        batch.set(entryRef, { duplicateLookupKey }, { merge: true });
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

      return withRateLimit(NextResponse.json({
        ok: true,
        indexed: entrySnap.exists,
      }));
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
    return withRateLimit(NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cpp-sync-disabled",
    }));
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

      const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
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
        return withRateLimit(NextResponse.json({
          ok: true,
          skipped: true,
          reason: "unsupported-product",
        }));
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
        return withRateLimit(NextResponse.json({
          ok: true,
          matched: false,
          contractNumber,
          dateFrom: fallbackDateFrom ?? primaryDateFrom,
        }));
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
        const currentSnap = await ref.get();
        const currentData = (currentSnap.data() ?? {}) as ContractDoc;
        const lifecycleValidation = validateContractCoreInvariants(
          currentData,
          updatePayload
        );
        if (!lifecycleValidation.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: `ČPP stav nebyl uložen pro ${ref.id}: ${lifecycleValidation.error}`,
            },
            { status: 400 }
          );
        }
        await ref.set(updatePayload, { merge: true });
        updated += 1;
      }

      for (const ref of filteredTargetRefs.values()) {
        try {
          const syncedSnap = await ref.get();
          if (!syncedSnap.exists) continue;
          await syncTipPayoutDocsForEntry({
            ownerEmail,
            entryId: syncedSnap.id,
            entryData: syncedSnap.data() as ContractDoc,
          });
        } catch (tipSyncErr) {
          console.warn(
            "PATCH /api/contracts syncCppStatus: TIP payout sync selhal:",
            tipSyncErr
          );
        }
      }

      return withRateLimit(NextResponse.json({
        ok: true,
        matched: true,
        contractNumber,
        remoteStatus,
        appliedStatus,
        stornoDateMs: stornoDateValue ? stornoDateValue.getTime() : null,
        updated,
      }));
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
    const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
    const canManageOwnerDirectly = allowedOwners.has(ownerEmail);
    const lifecycleStatusPatch = isLifecycleStatusPatch(payload);
    if (!canManageOwnerDirectly && !lifecycleStatusPatch) {
      return NextResponse.json(
        { ok: false, error: "Nemáš oprávnění upravit tuto smlouvu." },
        { status: 403 }
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

    if (!canManageOwnerDirectly) {
      const inaccessibleEntryIds = entrySnaps
        .map((snap, idx) => {
          const currentData = (snap.data() ?? {}) as ContractDoc;
          return hasContractAccess({
            viewerEmail: email,
            teamEmails,
            ownerEmail,
            contract: currentData,
          })
            ? null
            : entryIds[idx];
        })
        .filter((value): value is string => Boolean(value));
      if (inaccessibleEntryIds.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Nemáš oprávnění upravit tuto smlouvu." },
          { status: 403 }
        );
      }
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
      const currentData = (entrySnaps[idx]?.data() ?? {}) as ContractDoc;
      const updatePayload: Record<string, unknown> = { ...payload };
      const finalDuplicateLookupKey = buildDuplicateLookupKey({
        entryType: currentData.entryType ?? "contract",
        productKey: currentData.productKey,
        clientName: hasOwn(updatePayload, "clientName")
          ? updatePayload.clientName
          : currentData.clientName,
        contractSignedDate: hasOwn(updatePayload, "contractSignedDate")
          ? updatePayload.contractSignedDate
          : currentData.contractSignedDate,
      });
      updatePayload.duplicateLookupKey = finalDuplicateLookupKey;

      batch.update(ref, updatePayload);
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

    for (const ref of entryRefs) {
      try {
        const syncedSnap = await ref.get();
        if (!syncedSnap.exists) continue;
        await syncTipPayoutDocsForEntry({
          ownerEmail,
          entryId: syncedSnap.id,
          entryData: syncedSnap.data() as ContractDoc,
        });
      } catch (tipSyncErr) {
        console.warn(
          "PATCH /api/contracts updateFields: TIP payout sync selhal:",
          tipSyncErr
        );
      }
    }

    return withRateLimit(NextResponse.json({ ok: true, updated: entryRefs.length }));
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  const paid = body.paid === true;

  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Chybí položky k úpravě." }, { status: 400 });
  }

  const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
  let updated = 0;
  const updatedRefs: { owner: string; entryId: string }[] = [];
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
    updatedRefs.push({ owner, entryId });
  }

  for (const target of updatedRefs) {
    try {
      const syncedSnap = await adminDb
        ?.collection("users")
        .doc(target.owner)
        .collection("entries")
        .doc(target.entryId)
        .get();
      if (!syncedSnap?.exists) continue;
      await syncTipPayoutDocsForEntry({
        ownerEmail: target.owner,
        entryId: target.entryId,
        entryData: syncedSnap.data() as ContractDoc,
      });
    } catch (tipSyncErr) {
      console.warn(
        "PATCH /api/contracts setPaid: TIP payout sync selhal:",
        tipSyncErr
      );
    }
  }

  return withRateLimit(NextResponse.json({ ok: true, updated }));
}

export async function handleContractsDelete(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:delete",
    limit: CONTRACTS_MUTATION_RATE_LIMIT,
    windowMs: CONTRACTS_MUTATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  if (ctx.accountType === "tipster") {
    return withRateLimit(tipsterContractsMutationResponse());
  }
  const { email, contractAccessEmails } = ctx;

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

  const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
  const dirtyOwners = new Set<string>();
  const tipCleanupTargets = new Set<string>();
  const contractPdfCleanupTargets: StoredContractPdfAttachment[] = [];
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
    try {
      const entrySnap = await entryRef.get();
      if (entrySnap.exists) {
        const entryData = entrySnap.data() as ContractDoc;
        const contractPdfAttachment = normalizeStoredContractPdfAttachment(
          (entryData as { contractPdfAttachment?: unknown }).contractPdfAttachment
        );
        if (contractPdfAttachment) {
          contractPdfCleanupTargets.push(contractPdfAttachment);
        }
        const tipsterEmail = normalizeEmail(entryData.tipContractTipsterEmail);
        if (tipsterEmail) {
          const tipsterProfile = await loadUserProfileByEmail(tipsterEmail);
          const tipsterUserDocId = (tipsterProfile?.docId ?? tipsterEmail).trim();
          if (tipsterUserDocId) {
            const sourceKey = tipPayoutSourceKey(owner, entryId);
            tipCleanupTargets.add(
              JSON.stringify({
                tipsterUserDocId,
                sourceKey,
              })
            );
          }
        }
      }
    } catch (tipReadErr) {
      console.warn(
        "DELETE /api/contracts: načtení TIP metadata selhalo:",
        tipReadErr
      );
    }
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

  for (const packedTarget of tipCleanupTargets) {
    let target: { tipsterUserDocId?: string; sourceKey?: string } | null = null;
    try {
      target = JSON.parse(packedTarget) as {
        tipsterUserDocId?: string;
        sourceKey?: string;
      };
    } catch {
      target = null;
    }
    const tipsterUserDocId = (target?.tipsterUserDocId ?? "").trim();
    const sourceKey = (target?.sourceKey ?? "").trim();
    if (!tipsterUserDocId || !sourceKey) continue;
    try {
      await deleteTipPayoutDocsForSource({
        tipsterUserDocId,
        sourceKey,
      });
    } catch (tipDeleteErr) {
      console.warn(
        "DELETE /api/contracts: TIP payout cleanup selhal:",
        tipDeleteErr
      );
    }
  }

  for (const attachment of contractPdfCleanupTargets) {
    try {
      await deleteContractPdfAttachment(attachment);
    } catch (pdfDeleteErr) {
      console.warn(
        "DELETE /api/contracts: PDF přílohu se nepodařilo smazat ze Storage:",
        pdfDeleteErr
      );
    }
  }

  return withRateLimit(NextResponse.json({ ok: true, deleted }));
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
