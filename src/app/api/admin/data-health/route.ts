import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import type {
  AggregateMetrics,
  Category,
  ContractStats,
} from "@/app/api/team-overview/teamOverview.types";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import {
  isLifeProduct,
  productCategory,
  productInstitutionLabel,
  PRODUCT_ORDER,
} from "@/app/lib/productCatalog";
import { SUPPORTED_PRODUCTS } from "@/app/lib/productFormulas";
import type { PaymentFrequency, Product } from "@/app/types/domain";
import { adminAuthErrorResponse, getAdminAuthContext } from "@/lib/server/adminAuth";
import {
  deleteContractPdfAttachment,
  normalizeStoredContractPdfAttachment,
} from "@/lib/server/contractPdfStorage";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  buildTeamOverviewReadModelDocuments,
  TEAM_OVERVIEW_MODEL_VERSION,
} from "@/lib/server/teamOverviewReadModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthCheckSeverity = "ok" | "info" | "warning" | "critical";
type HealthCheckStatus = "pass" | "warn" | "fail";
const BUSINESS_PRODUCTS = new Set<Product>([
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
]);

type HealthSample = {
  label: string;
  detail?: string;
  href?: string;
  ownerEmail?: string | null;
  entryId?: string | null;
  contractNumber?: string | null;
  productKey?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  duplicateMembers?: DuplicateContractMember[];
};

type HealthCheck = {
  key: string;
  title: string;
  severity: HealthCheckSeverity;
  status: HealthCheckStatus;
  count: number;
  scanned: number;
  truncated?: boolean;
  description: string;
  samples: HealthSample[];
};

type ScanResult<T> =
  | { ok: true; rows: T[]; scanned: number; truncated: boolean }
  | { ok: false; error: string };

type UserProfile = {
  email: string;
  fullName: string | null;
  accountType: string | null;
  managerEmail: string | null;
  position: string | null;
  active: boolean;
};

type ContractEntry = {
  id: string;
  path: string;
  ownerEmail: string;
  rawData: Record<string, unknown>;
  entryType: string;
  clientName: string | null;
  contractNumber: string | null;
  normalizedNumber: string;
  productKey: string | null;
  status: string | null;
  total: number | null;
  paid: boolean | null;
  managerEmailSnapshot: string | null;
  managerChain: unknown[];
  contractSignedDateMs: number | null;
  policyStartDateMs: number | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  stornoDateMs: number | null;
};

type DuplicateContractMember = {
  ownerEmail: string;
  entryId: string;
  href: string;
  contractNumber: string;
  clientName: string | null;
  productKey: string | null;
  signedDateMs: number | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  total: number | null;
  paid: boolean | null;
  status: string | null;
};

type ContractRefRow = {
  id: string;
  path: string;
  ownerEmail: string | null;
  entryId: string | null;
  entryPath: string | null;
  contractNumberRaw: string | null;
  contractNumberNormalized: string;
  contractNumberLoose: string;
  productKey: string | null;
  updatedAtMs: number | null;
};

type TeamOverviewTotal = {
  id: string;
  ownerEmail: string;
  version: number | null;
  updatedAtMs: number | null;
};

type CommissionStatement = {
  id: string;
  path: string;
  ownerEmail: string;
  fileName: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
  processedAtMs: number | null;
  createdAtMs: number | null;
  processingResult: Record<string, unknown> | null;
};

const DEFAULT_SCAN_LIMIT = 2_000;
const MAX_SCAN_LIMIT = 8_000;
const DEFAULT_SAMPLE_LIMIT = 12;
const MAX_SAMPLE_LIMIT = 40;
const ORPHAN_REF_BATCH_SIZE = 30;
const TEAM_TOTALS_STALE_MS = 24 * 60 * 60 * 1000;
const CONTRACT_REFS_COLLECTION = "contractRefs";
const CONTRACT_NUMBER_CLAIMS_COLLECTION = "contractNumberClaims";
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";
const TIP_PAYOUTS_SUBCOLLECTION = "tipPayouts";
const TIP_PAYOUTS_BATCH_LIMIT = 300;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const nullableText = (value: unknown): string | null => {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
};

const finiteNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeContractNumber = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";

const normalizeContractNumberLoose = (value: unknown): string =>
  normalizeContractNumber(value).replace(/^0+/, "");

const toMillis = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: unknown;
      nanoseconds?: unknown;
      _seconds?: unknown;
      _nanoseconds?: unknown;
    };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      const ms = date.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds =
      typeof maybeTimestamp.seconds === "number"
        ? maybeTimestamp.seconds
        : typeof maybeTimestamp._seconds === "number"
          ? maybeTimestamp._seconds
          : null;
    if (seconds != null) {
      const nanos =
        typeof maybeTimestamp.nanoseconds === "number"
          ? maybeTimestamp.nanoseconds
          : typeof maybeTimestamp._nanoseconds === "number"
            ? maybeTimestamp._nanoseconds
            : 0;
      return seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
};

const parsePositiveInt = (
  value: string | null,
  fallback: number,
  max: number,
  min: number
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const entryHref = (ownerEmail: string | null | undefined, entryId: string | null | undefined) => {
  const owner = normalizeEmail(ownerEmail);
  const id = normalizeText(entryId);
  if (!owner || !id) return undefined;
  return `/smlouvy/${encodeURIComponent(`${owner}___${id}`)}?source=data-health`;
};

const entryPath = (ownerEmail: string, entryId: string): string =>
  `users/${normalizeEmail(ownerEmail)}/entries/${normalizeText(entryId)}`;

const contractRefDocId = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${normalizeText(entryId)}`;

const contractNumberClaimDocId = (contractNumber: string): string =>
  encodeURIComponent(normalizeContractNumber(contractNumber).toLowerCase());

const tipPayoutSourceKey = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${normalizeText(entryId)}`;

const entryIdFromPath = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const parts = path.split("/");
  return parts.length >= 4 && parts[0] === "users" && parts[2] === "entries"
    ? parts[3] || null
    : null;
};

const ownerEmailFromPath = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const parts = path.split("/");
  return parts.length >= 4 && parts[0] === "users" && parts[2] === "entries"
    ? normalizeEmail(parts[1])
    : null;
};

const hasValidDocumentPathShape = (path: string | null): path is string => {
  if (!path) return false;
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 && parts.length % 2 === 0;
};

const pushSample = (samples: HealthSample[], sampleLimit: number, sample: HealthSample) => {
  if (samples.length < sampleLimit) samples.push(sample);
};

const currentYearMonth = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const previousYearMonth = (now: Date): string =>
  currentYearMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const previousMonthToDateEnd = (now: Date): number => {
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousYear = previousMonth.getFullYear();
  const previousMonthIndex = previousMonth.getMonth();
  const lastDay = new Date(previousYear, previousMonthIndex + 1, 0).getDate();
  return new Date(
    previousYear,
    previousMonthIndex,
    Math.min(now.getDate(), lastDay),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).getTime();
};

const utcDayIndex = (ms: number): number => Math.floor(ms / (24 * 60 * 60 * 1000));

const teamOverviewMonthDocId = (ownerEmail: string, yearMonth: string): string =>
  `${normalizeEmail(ownerEmail)}___${yearMonth}`;

function paymentsPerYear(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

function productFromEntry(value: unknown): Product | null {
  const productKey = nullableText(value);
  if (!productKey) return null;
  return (PRODUCT_ORDER as readonly string[]).includes(productKey)
    ? (productKey as Product)
    : null;
}

function categorizeProduct(product?: Product | null): Category {
  if (product && BUSINESS_PRODUCTS.has(product)) return "business";
  if (product === "maxcizinkomplex") return "foreigners";

  switch (productCategory(product)) {
    case "life":
      return "life";
    case "auto":
      return "auto";
    case "property":
      return "property";
    case "travel":
      return "travel";
    case "comfort":
      return "comfort";
    default:
      return "other";
  }
}

function annualPremiumFromEntry(data: Record<string, unknown>, category: Category): number {
  const raw = Number(data.inputAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const product = productFromEntry(data.productKey);
  if (isLifeProduct(product)) return raw * 12;
  if (category === "comfort") return raw;
  return raw * paymentsPerYear((data.frequencyRaw ?? "annual") as PaymentFrequency);
}

function emptyAggregateMetrics(): AggregateMetrics {
  return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    life: 0,
    auto: 0,
    property: 0,
    business: 0,
    travel: 0,
    foreigners: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics(): Record<Category, AggregateMetrics> {
  return {
    life: emptyAggregateMetrics(),
    auto: emptyAggregateMetrics(),
    property: emptyAggregateMetrics(),
    business: emptyAggregateMetrics(),
    travel: emptyAggregateMetrics(),
    foreigners: emptyAggregateMetrics(),
    comfort: emptyAggregateMetrics(),
    other: emptyAggregateMetrics(),
  };
}

function emptyInstitutionByCategory(): Record<Category, Record<string, AggregateMetrics>> {
  return {
    life: {},
    auto: {},
    property: {},
    business: {},
    travel: {},
    foreigners: {},
    comfort: {},
    other: {},
  };
}

function emptyContractStats(): ContractStats {
  return {
    total: 0,
    month: 0,
    previousMonth: 0,
    previousMonthToDate: 0,
    monthMetrics: emptyAggregateMetrics(),
    previousMonthMetrics: emptyAggregateMetrics(),
    categories: emptyCategoryCounts(),
    categoryMetrics: emptyCategoryMetrics(),
    institutionMetrics: {},
    institutionByCategory: emptyInstitutionByCategory(),
  };
}

function addAggregateContract(
  metrics: AggregateMetrics,
  annualPremium: number,
  monthlyPremium: number
): void {
  metrics.contracts += 1;
  metrics.annualPremium += annualPremium;
  metrics.monthlyPremium += monthlyPremium;
}

function contractEntryFromData({
  id,
  path,
  ownerEmail,
  data,
}: {
  id: string;
  path: string;
  ownerEmail: string;
  data: Record<string, unknown>;
}): ContractEntry | null {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const entryType = normalizeText(data.entryType || "contract").toLowerCase();
  if (!normalizedOwner || entryType !== "contract") return null;
  const contractNumber = nullableText(data.contractNumber);
  return {
    id,
    path,
    ownerEmail: normalizedOwner,
    rawData: data,
    entryType,
    clientName: nullableText(data.clientName),
    contractNumber,
    normalizedNumber: normalizeContractNumber(contractNumber),
    productKey: nullableText(data.productKey),
    status: nullableText(data.status)?.toLowerCase() ?? null,
    total: finiteNumber(data.total),
    paid: typeof data.paid === "boolean" ? data.paid : null,
    managerEmailSnapshot: normalizeEmail(data.managerEmailSnapshot) || null,
    managerChain: Array.isArray(data.managerChain) ? data.managerChain : [],
    contractSignedDateMs: toMillis(data.contractSignedDate),
    policyStartDateMs: toMillis(data.policyStartDate),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
    stornoDateMs: toMillis(data.stornoDate),
  };
}

function duplicateMemberFromEntry(entry: ContractEntry): DuplicateContractMember {
  return {
    ownerEmail: entry.ownerEmail,
    entryId: entry.id,
    href: entryHref(entry.ownerEmail, entry.id) ?? "",
    contractNumber: entry.contractNumber ?? entry.normalizedNumber,
    clientName: entry.clientName,
    productKey: entry.productKey,
    signedDateMs: entry.contractSignedDateMs,
    createdAtMs: entry.createdAtMs,
    updatedAtMs: entry.updatedAtMs,
    total: entry.total,
    paid: entry.paid,
    status: entry.status,
  };
}

async function markTeamOverviewOwnersDirty(ownerEmails: Iterable<string>): Promise<void> {
  if (!adminDb) return;
  const owners = Array.from(
    new Set(Array.from(ownerEmails).map(normalizeEmail).filter(Boolean))
  );
  if (owners.length === 0) return;

  const db = adminDb;
  const yearMonth = currentYearMonth(new Date());
  const batch = db.batch();
  owners.forEach((ownerEmail) => {
    batch.delete(db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail));
    batch.delete(
      db
        .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
        .doc(teamOverviewMonthDocId(ownerEmail, yearMonth))
    );
  });
  await batch.commit();
}

const createCheck = ({
  key,
  title,
  count,
  scanned,
  samples,
  description,
  truncated,
  severityWhenFound = "warning",
}: {
  key: string;
  title: string;
  count: number;
  scanned: number;
  samples: HealthSample[];
  description: string;
  truncated?: boolean;
  severityWhenFound?: Exclude<HealthCheckSeverity, "ok">;
}): HealthCheck => ({
  key,
  title,
  count,
  scanned,
  samples,
  description,
  truncated,
  severity: count > 0 ? severityWhenFound : "ok",
  status: count > 0 ? "warn" : "pass",
});

const failedCheck = (
  key: string,
  title: string,
  error: string,
  description: string
): HealthCheck => ({
  key,
  title,
  severity: "warning",
  status: "fail",
  count: 1,
  scanned: 0,
  description,
  samples: [{ label: "Kontrola se nepodařila spustit", detail: error }],
});

async function scanUsers(limit: number): Promise<ScanResult<UserProfile>> {
  try {
    const snap = await adminDb!.collection("users").limit(limit).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const email = normalizeEmail(data.email) || normalizeEmail(doc.id);
      const accountType = nullableText(data.accountType ?? data.userRole);
      const rawStatus = normalizeText(data.status).toLowerCase();
      return {
        email,
        fullName: nullableText(data.fullName ?? data.displayName ?? data.name),
        accountType,
        managerEmail: normalizeEmail(data.managerEmail) || null,
        position: nullableText(data.position),
        active:
          data.disabled !== true &&
          data.deleted !== true &&
          rawStatus !== "deleted" &&
          rawStatus !== "disabled",
      };
    });
    return { ok: true, rows, scanned: snap.size, truncated: snap.size >= limit };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

async function scanContractEntries(limit: number): Promise<ScanResult<ContractEntry>> {
  try {
    const snap = await adminDb!.collectionGroup("entries").limit(limit).get();
    const rows = snap.docs
      .map((doc) => {
        return contractEntryFromData({
          id: doc.id,
          path: doc.ref.path,
          ownerEmail: normalizeEmail(doc.ref.parent.parent?.id),
          data: doc.data(),
        });
      })
      .filter((row): row is ContractEntry => Boolean(row));
    return { ok: true, rows, scanned: snap.size, truncated: snap.size >= limit };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

async function scanContractRefs(limit: number): Promise<ScanResult<ContractRefRow>> {
  try {
    const snap = await adminDb!.collection("contractRefs").limit(limit).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const ownerEmail = normalizeEmail(data.ownerEmail) || ownerEmailFromPath(normalizeText(data.entryPath));
      const entryId = nullableText(data.entryId) || entryIdFromPath(normalizeText(data.entryPath));
      const entryPath =
        nullableText(data.entryPath) ||
        (ownerEmail && entryId ? `users/${ownerEmail}/entries/${entryId}` : null);
      const rawNumber = nullableText(data.contractNumberRaw);
      const normalized =
        normalizeContractNumber(data.contractNumberNormalized) ||
        normalizeContractNumber(rawNumber);
      return {
        id: doc.id,
        path: doc.ref.path,
        ownerEmail,
        entryId,
        entryPath,
        contractNumberRaw: rawNumber,
        contractNumberNormalized: normalized,
        contractNumberLoose:
          normalizeContractNumber(data.contractNumberLoose) ||
          normalizeContractNumberLoose(rawNumber) ||
          normalizeContractNumberLoose(normalized),
        productKey: nullableText(data.productKey),
        updatedAtMs: toMillis(data.updatedAt ?? data.updatedAtMs),
      };
    });
    return { ok: true, rows, scanned: snap.size, truncated: snap.size >= limit };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

async function scanTeamTotals(limit: number): Promise<ScanResult<TeamOverviewTotal>> {
  try {
    const snap = await adminDb!.collection("teamOverviewTotals").limit(limit).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const ownerEmail = normalizeEmail(data.ownerEmail) || normalizeEmail(doc.id);
      const rawVersion = Number(data.modelVersion ?? data.version);
      return {
        id: doc.id,
        ownerEmail,
        version: Number.isFinite(rawVersion) ? rawVersion : null,
        updatedAtMs: toMillis(data.updatedAtMs ?? data.updatedAt),
      };
    });
    return { ok: true, rows, scanned: snap.size, truncated: snap.size >= limit };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

async function scanCommissionStatements(limit: number): Promise<ScanResult<CommissionStatement>> {
  try {
    const snap = await adminDb!.collectionGroup("commissionStatements").limit(limit).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const ownerEmail = normalizeEmail(doc.ref.parent.parent?.id);
      const result =
        data.processingResult && typeof data.processingResult === "object"
          ? (data.processingResult as Record<string, unknown>)
          : null;
      return {
        id: doc.id,
        path: doc.ref.path,
        ownerEmail,
        fileName: nullableText(data.fileName),
        statementNumber: nullableText(data.statementNumber),
        statementPeriod: nullableText(data.statementPeriod),
        processedAtMs: toMillis(data.processedAtMs ?? data.processedAt),
        createdAtMs: toMillis(data.createdAtMs ?? data.createdAt),
        processingResult: result,
      };
    });
    return { ok: true, rows, scanned: snap.size, truncated: snap.size >= limit };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 100);
};

const sortedStrings = (values: Iterable<string>): string[] =>
  Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b, "cs"));

function buildDuplicateContractNumbersCheck({
  entries,
  sampleLimit,
  truncated,
}: {
  entries: ContractEntry[];
  sampleLimit: number;
  truncated: boolean;
}): HealthCheck {
  type DuplicateSource = {
    ownerEmail: string | null;
    entryId: string | null;
    entryPath: string;
    clientName: string | null;
    contractNumber: string | null;
    productKey: string | null;
    signedDateMs: number | null;
    createdAtMs: number | null;
    updatedAtMs: number | null;
    total: number | null;
    paid: boolean | null;
    status: string | null;
  };
  const byNumber = new Map<string, Map<string, DuplicateSource>>();

  const addSource = (number: string, source: DuplicateSource) => {
    const normalized = normalizeContractNumber(number);
    if (!normalized || !source.entryPath) return;
    const group = byNumber.get(normalized) ?? new Map<string, DuplicateSource>();
    const existing = group.get(source.entryPath);
    if (!existing) {
      group.set(source.entryPath, source);
    }
    byNumber.set(normalized, group);
  };

  entries.forEach((entry) => {
    if (!entry.normalizedNumber) return;
    addSource(entry.normalizedNumber, {
      ownerEmail: entry.ownerEmail,
      entryId: entry.id,
      entryPath: entry.path,
      clientName: entry.clientName,
      contractNumber: entry.contractNumber,
      productKey: entry.productKey,
      signedDateMs: entry.contractSignedDateMs,
      createdAtMs: entry.createdAtMs,
      updatedAtMs: entry.updatedAtMs,
      total: entry.total,
      paid: entry.paid,
      status: entry.status,
    });
  });

  let duplicateGroups = 0;
  const samples: HealthSample[] = [];
  for (const [number, groupedSources] of sortedStrings(byNumber.keys()).map(
    (number) => [number, byNumber.get(number)!] as const
  )) {
    const uniqueSources = Array.from(groupedSources.values());
    if (uniqueSources.length < 2) continue;
    duplicateGroups += 1;
    const first = uniqueSources[0];
    const duplicateMembers = uniqueSources
      .map((item) => ({
        ownerEmail: item.ownerEmail ?? "",
        entryId: item.entryId ?? entryIdFromPath(item.entryPath) ?? "",
        href: entryHref(item.ownerEmail, item.entryId) ?? "",
        contractNumber: item.contractNumber ?? number,
        clientName: item.clientName,
        productKey: item.productKey,
        signedDateMs: item.signedDateMs,
        createdAtMs: item.createdAtMs,
        updatedAtMs: item.updatedAtMs,
        total: item.total,
        paid: item.paid,
        status: item.status,
      }))
      .filter((item) => item.ownerEmail && item.entryId)
      .sort((a, b) => {
        const signedDiff = (a.signedDateMs ?? 0) - (b.signedDateMs ?? 0);
        if (signedDiff !== 0) return signedDiff;
        const createdDiff = (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
        if (createdDiff !== 0) return createdDiff;
        return a.entryId.localeCompare(b.entryId, "cs");
      });
    pushSample(samples, sampleLimit, {
      label: number,
      detail: uniqueSources
        .slice(0, 5)
        .map((item) => `${item.ownerEmail ?? "bez ownera"} / ${item.entryId ?? item.entryPath}`)
        .join(" · "),
      href: entryHref(first.ownerEmail, first.entryId),
      ownerEmail: first.ownerEmail,
      entryId: first.entryId,
      contractNumber: first.contractNumber ?? number,
      productKey: first.productKey,
      meta: { uniqueContracts: uniqueSources.length },
      duplicateMembers,
    });
  }

  return createCheck({
    key: "duplicateContractNumbers",
    title: "Duplicitní čísla smluv",
    count: duplicateGroups,
    scanned: entries.length,
    truncated,
    samples,
    severityWhenFound: "critical",
    description:
      "Stejné normalizované číslo smlouvy se vyskytuje u více různých contract entries.",
  });
}

async function buildOrphanContractRefsCheck({
  refs,
  sampleLimit,
  truncated,
}: {
  refs: ContractRefRow[];
  sampleLimit: number;
  truncated: boolean;
}): Promise<HealthCheck> {
  const samples: HealthSample[] = [];
  let issues = 0;

  for (let i = 0; i < refs.length; i += ORPHAN_REF_BATCH_SIZE) {
    const batch = refs.slice(i, i + ORPHAN_REF_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (ref) => {
        if (!hasValidDocumentPathShape(ref.entryPath)) {
          return {
            ref,
            issue: "contractRef nemá platnou entryPath.",
            entryData: null as Record<string, unknown> | null,
          };
        }
        try {
          const snap = await adminDb!.doc(ref.entryPath).get();
          if (!snap.exists) {
            return {
              ref,
              issue: "contractRef ukazuje na neexistující smlouvu.",
              entryData: null as Record<string, unknown> | null,
            };
          }
          return { ref, issue: null, entryData: snap.data() ?? null };
        } catch (error) {
          return {
            ref,
            issue: `Nepodařilo se přečíst cílovou smlouvu: ${formatError(error)}`,
            entryData: null as Record<string, unknown> | null,
          };
        }
      })
    );

    for (const result of results) {
      if (result.issue) {
        issues += 1;
        pushSample(samples, sampleLimit, {
          label: result.ref.id,
          detail: result.issue,
          href: entryHref(result.ref.ownerEmail, result.ref.entryId),
          ownerEmail: result.ref.ownerEmail,
          entryId: result.ref.entryId,
          contractNumber: result.ref.contractNumberRaw ?? result.ref.contractNumberNormalized,
          productKey: result.ref.productKey,
        });
        continue;
      }

      const data = result.entryData;
      if (!data) continue;
      const entryType = normalizeText(data.entryType || "contract").toLowerCase();
      const targetNumber = normalizeContractNumber(data.contractNumber);
      const targetLoose = normalizeContractNumberLoose(data.contractNumber);
      const refNumber =
        result.ref.contractNumberNormalized ||
        normalizeContractNumber(result.ref.contractNumberRaw);
      const refLoose =
        result.ref.contractNumberLoose ||
        normalizeContractNumberLoose(result.ref.contractNumberRaw) ||
        normalizeContractNumberLoose(refNumber);
      const targetProduct = nullableText(data.productKey);

      let mismatch: string | null = null;
      if (entryType && entryType !== "contract" && entryType !== "endorsement") {
        mismatch = `contractRef cílí na neplatný entryType "${entryType}".`;
      } else if (refNumber && targetNumber && refNumber !== targetNumber) {
        mismatch = `Číslo ve smlouvě (${targetNumber}) neodpovídá contractRef (${refNumber}).`;
      } else if (refLoose && targetLoose && refLoose !== targetLoose) {
        mismatch = `Loose číslo ve smlouvě (${targetLoose}) neodpovídá contractRef (${refLoose}).`;
      } else if (result.ref.productKey && targetProduct && result.ref.productKey !== targetProduct) {
        mismatch = `Produkt ve smlouvě (${targetProduct}) neodpovídá contractRef (${result.ref.productKey}).`;
      }

      if (!mismatch) continue;
      issues += 1;
      pushSample(samples, sampleLimit, {
        label: result.ref.id,
        detail: mismatch,
        href: entryHref(result.ref.ownerEmail, result.ref.entryId),
        ownerEmail: result.ref.ownerEmail,
        entryId: result.ref.entryId,
        contractNumber: result.ref.contractNumberRaw ?? result.ref.contractNumberNormalized,
        productKey: result.ref.productKey,
      });
    }
  }

  return createCheck({
    key: "orphanContractRefs",
    title: "Neplatné contractRefs",
    count: issues,
    scanned: refs.length,
    truncated,
    samples,
    severityWhenFound: "critical",
    description:
      "Pomocný index contractRefs obsahuje odkazy bez cílové entry nebo s neodpovídajícím číslem/produktem.",
  });
}

function buildMissingManagerChainCheck({
  entries,
  usersByEmail,
  sampleLimit,
  truncated,
}: {
  entries: ContractEntry[];
  usersByEmail: Map<string, UserProfile>;
  sampleLimit: number;
  truncated: boolean;
}): HealthCheck {
  const samples: HealthSample[] = [];
  let issues = 0;

  for (const entry of entries) {
    const owner = usersByEmail.get(entry.ownerEmail);
    if (owner?.accountType === "tipster") continue;
    const expectedManager = entry.managerEmailSnapshot || owner?.managerEmail || null;
    if (!expectedManager) continue;

    const chainEmails = entry.managerChain
      .map((item) =>
        item && typeof item === "object"
          ? normalizeEmail((item as Record<string, unknown>).email)
          : normalizeEmail(item)
      )
      .filter(Boolean);

    let malformedChainIssue: string | null = null;
    let malformedChainEmail: string | null = null;
    for (const item of entry.managerChain) {
      if (!item || typeof item !== "object") {
        malformedChainIssue = "managerChain obsahuje řádek v neplatném formátu.";
        break;
      }
      const row = item as Record<string, unknown>;
      const rowEmail = normalizeEmail(row.email);
      const rowPosition = nullableText(row.position);
      if (!rowEmail && !rowPosition) {
        malformedChainIssue = "managerChain obsahuje řádek bez e-mailu i pozice.";
        break;
      }
      if (!rowEmail) {
        malformedChainIssue = `managerChain obsahuje řádek bez e-mailu pro pozici ${rowPosition}.`;
        break;
      }
      if (!rowPosition) {
        malformedChainEmail = rowEmail;
        malformedChainIssue = `managerChain obsahuje managera ${rowEmail}, ale nemá uloženou jeho pozici.`;
        break;
      }
    }

    let issue: string | null = null;
    if (expectedManager === entry.ownerEmail) {
      issue = "Owner má jako nadřízeného sám sebe.";
    } else if (chainEmails.length === 0) {
      issue = "Smlouva má nadřízeného, ale managerChain je prázdný.";
    } else if (!chainEmails.includes(expectedManager)) {
      issue = "Přímý nadřízený není v managerChain.";
    } else if (malformedChainIssue) {
      issue = malformedChainIssue;
    }

    if (!issue) continue;
    issues += 1;
    pushSample(samples, sampleLimit, {
      label: entry.contractNumber ?? entry.id,
      detail: issue,
      href: entryHref(entry.ownerEmail, entry.id),
      ownerEmail: entry.ownerEmail,
      entryId: entry.id,
      contractNumber: entry.contractNumber,
      productKey: entry.productKey,
      meta: {
        expectedManager,
        chainLength: entry.managerChain.length,
        chainRowEmail: malformedChainEmail,
      },
    });
  }

  return createCheck({
    key: "missingManagerChain",
    title: "Neúplný managerChain",
    count: issues,
    scanned: entries.length,
    truncated,
    samples,
    severityWhenFound: "warning",
    description:
      "Smlouvy s nadřízeným musí mít v managerChain uložený e-mail i pozici managera kvůli přístupům a manažerským provizím.",
  });
}

async function buildProductDriftCheck(sampleLimit: number): Promise<HealthCheck> {
  const catalog = new Set(PRODUCT_ORDER.map(String));
  const formulas = new Set(SUPPORTED_PRODUCTS.map(String));
  let rules = new Set<string>();
  let rulesReadError: string | null = null;

  try {
    const source = await readFile(join(process.cwd(), "firestore.rules"), "utf8");
    const match = source.match(
      /function\s+isValidProductKey\s*\([^)]*\)\s*\{[\s\S]*?value\s+in\s+\[([\s\S]*?)\]\s*;/
    );
    if (!match) {
      rulesReadError = "Ve firestore.rules se nepodařilo najít function isValidProductKey.";
    } else {
      rules = new Set(
        Array.from(match[1].matchAll(/"([^"]+)"/g))
          .map((item) => item[1])
          .filter(Boolean)
      );
    }
  } catch (error) {
    rulesReadError = formatError(error);
  }

  const samples: HealthSample[] = [];
  if (rulesReadError) {
    pushSample(samples, sampleLimit, {
      label: "firestore.rules",
      detail: rulesReadError,
    });
  }

  const allProducts = new Set([...catalog, ...formulas, ...rules]);
  let driftCount = rulesReadError ? 1 : 0;

  for (const product of sortedStrings(allProducts)) {
    const missing: string[] = [];
    if (!catalog.has(product)) missing.push("catalog");
    if (!formulas.has(product)) missing.push("formulas");
    if (!rulesReadError && !rules.has(product)) missing.push("rules");
    if (missing.length === 0) continue;
    driftCount += 1;
    pushSample(samples, sampleLimit, {
      label: product,
      detail: `Chybí ve zdroji: ${missing.join(", ")}.`,
      productKey: product,
      meta: {
        inCatalog: catalog.has(product),
        inFormulas: formulas.has(product),
        inRules: rules.has(product),
      },
    });
  }

  return createCheck({
    key: "productDrift",
    title: "Rozdíl produktů katalog / API / rules",
    count: driftCount,
    scanned: allProducts.size,
    samples,
    severityWhenFound: "warning",
    description:
      "Porovnává PRODUCT_ORDER, SUPPORTED_PRODUCTS a seznam povolených productKey ve firestore.rules.",
  });
}

function buildUnmatchedStatementsCheck({
  statements,
  sampleLimit,
  truncated,
}: {
  statements: CommissionStatement[];
  sampleLimit: number;
  truncated: boolean;
}): HealthCheck {
  const samples: HealthSample[] = [];
  let issueStatements = 0;
  let totalProcessingErrors = 0;

  for (const statement of statements) {
    const result = statement.processingResult;
    const notFound = readStringArray(result?.notFoundContracts);
    const ambiguous = readStringArray(result?.ambiguousContracts);
    const errors = readStringArray(result?.errors);
    const hasIssue = !statement.processedAtMs || errors.length > 0;
    if (!hasIssue) continue;

    issueStatements += 1;
    totalProcessingErrors += errors.length;
    const parts = [
      !statement.processedAtMs ? "nezpracováno" : null,
      errors.length ? `chyby: ${errors.slice(0, 2).join(" | ")}` : null,
    ].filter(Boolean);

    pushSample(samples, sampleLimit, {
      label: statement.fileName ?? statement.statementNumber ?? statement.id,
      detail: parts.join(" · "),
      ownerEmail: statement.ownerEmail,
      meta: {
        statementPeriod: statement.statementPeriod,
        notFound: notFound.length,
        ambiguous: ambiguous.length,
        errors: errors.length,
      },
    });
  }

  return createCheck({
    key: "unmatchedCommissionStatements",
    title: "Chyby zpracování provizních výpisů",
    count: issueStatements,
    scanned: statements.length,
    truncated,
    samples,
    severityWhenFound: "warning",
    description:
      `Kontroluje jen nezpracované výpisy a technické chyby zpracování. Nenalezené nebo nejednoznačně spárované smlouvy nejsou samy o sobě chyba. Chyb zpracování: ${totalProcessingErrors}.`,
  });
}

function buildSuspiciousStornosCheck({
  entries,
  sampleLimit,
  truncated,
}: {
  entries: ContractEntry[];
  sampleLimit: number;
  truncated: boolean;
}): HealthCheck {
  const samples: HealthSample[] = [];
  let issues = 0;

  for (const entry of entries) {
    const status = entry.status || "active";
    const reasons: string[] = [];
    if (status === "storno" && !entry.stornoDateMs) {
      reasons.push("status storno bez stornoDate");
    }
    if (status !== "storno" && entry.stornoDateMs) {
      reasons.push("aktivní smlouva má stornoDate");
    }
    if (status === "storno" && entry.stornoDateMs) {
      const startDateMs = entry.policyStartDateMs ?? entry.contractSignedDateMs;
      if (
        startDateMs != null &&
        utcDayIndex(entry.stornoDateMs) < utcDayIndex(startDateMs)
      ) {
        reasons.push(
          entry.policyStartDateMs != null
            ? "stornoDate je před datem počátku"
            : "stornoDate je před datem podpisu"
        );
      }
    }

    if (reasons.length === 0) continue;
    issues += 1;
    pushSample(samples, sampleLimit, {
      label: entry.contractNumber ?? entry.id,
      detail: reasons.join(" · "),
      href: entryHref(entry.ownerEmail, entry.id),
      ownerEmail: entry.ownerEmail,
      entryId: entry.id,
      contractNumber: entry.contractNumber,
      productKey: entry.productKey,
      meta: {
        status,
        contractSignedDateMs: entry.contractSignedDateMs,
        policyStartDateMs: entry.policyStartDateMs,
        stornoDateMs: entry.stornoDateMs,
      },
    });
  }

  return createCheck({
    key: "suspiciousStornos",
    title: "Podezřelá storna",
    count: issues,
    scanned: entries.length,
    truncated,
    samples,
    severityWhenFound: "warning",
    description:
      "Kontroluje storna bez data, aktivní smlouvy se stornoDate a storna před počátkem smlouvy.",
  });
}

function expectedTeamOverviewOwners(
  users: UserProfile[],
  entries: ContractEntry[],
  totals: TeamOverviewTotal[]
): UserProfile[] {
  const entryOwners = new Set(entries.map((entry) => entry.ownerEmail));
  const totalsByEmail = new Set(totals.map((total) => total.ownerEmail));
  return users.filter((user) => {
    if (!user.active || !user.email || user.accountType === "tipster") return false;
    const advisorLike = user.accountType === "advisor" || Boolean(user.position);
    return advisorLike && (entryOwners.has(user.email) || totalsByEmail.has(user.email));
  });
}

function accumulateTeamOverviewEntry({
  stats,
  ownerEmail,
  data,
  previousMonthStart,
  previousMonthToDateEndMs,
  monthStart,
  currentMonthToDateEnd,
}: {
  stats: Record<string, ContractStats>;
  ownerEmail: string;
  data: Record<string, unknown>;
  previousMonthStart: number;
  previousMonthToDateEndMs: number;
  monthStart: number;
  currentMonthToDateEnd: number;
}): void {
  const current = stats[ownerEmail] ?? emptyContractStats();
  current.total += 1;

  const product = productFromEntry(data.productKey);
  const category = categorizeProduct(product);
  current.categories[category] = (current.categories[category] ?? 0) + 1;

  const annualPremium = annualPremiumFromEntry(data, category);
  const monthlyPremium = annualPremium / 12;
  addAggregateContract(current.categoryMetrics[category], annualPremium, monthlyPremium);

  const institution = productInstitutionLabel(product, "Ostatní") ?? "Ostatní";
  const byInstitution = current.institutionMetrics[institution] ?? emptyAggregateMetrics();
  addAggregateContract(byInstitution, annualPremium, monthlyPremium);
  current.institutionMetrics[institution] = byInstitution;

  const byInstitutionForCategory =
    current.institutionByCategory[category][institution] ?? emptyAggregateMetrics();
  addAggregateContract(byInstitutionForCategory, annualPremium, monthlyPremium);
  current.institutionByCategory[category][institution] = byInstitutionForCategory;

  const signedMs = toMillis(data.contractSignedDate ?? data.createdAt);
  if (signedMs != null && signedMs >= monthStart && signedMs <= currentMonthToDateEnd) {
    current.month += 1;
    addAggregateContract(current.monthMetrics, annualPremium, monthlyPremium);
  } else if (signedMs != null && signedMs >= previousMonthStart && signedMs < monthStart) {
    current.previousMonth += 1;
    addAggregateContract(current.previousMonthMetrics, annualPremium, monthlyPremium);
    if (signedMs <= previousMonthToDateEndMs) {
      current.previousMonthToDate += 1;
    }
  }

  stats[ownerEmail] = current;
}

function consumeTeamOverviewEntry({
  stats,
  activeStats,
  ownerSet,
  entry,
  seen,
  now,
  previousMonthStart,
  previousMonthToDateEndMs,
  monthStart,
  currentMonthToDateEnd,
}: {
  stats: Record<string, ContractStats>;
  activeStats: Record<string, ContractStats>;
  ownerSet: Set<string>;
  entry: ContractEntry;
  seen: Set<string>;
  now: Date;
  previousMonthStart: number;
  previousMonthToDateEndMs: number;
  monthStart: number;
  currentMonthToDateEnd: number;
}): boolean {
  const data = entry.rawData;
  const ownerEmail = normalizeEmail(data.userEmail ?? entry.ownerEmail);
  if (!ownerEmail || !ownerSet.has(ownerEmail)) return false;

  const key = `${ownerEmail}___${entry.id}`;
  if (seen.has(key)) return false;
  seen.add(key);

  const options = {
    ownerEmail,
    data,
    previousMonthStart,
    previousMonthToDateEndMs,
    monthStart,
    currentMonthToDateEnd,
  };
  accumulateTeamOverviewEntry({ stats, ...options });
  if (contractLifecycleStatus(data, now) === "active") {
    accumulateTeamOverviewEntry({ stats: activeStats, ...options });
  }
  return true;
}

async function rebuildTeamOverviewReadModels({
  users,
  entries,
  totals,
}: {
  users: UserProfile[];
  entries: ContractEntry[];
  totals: TeamOverviewTotal[];
}): Promise<{
  rebuiltOwners: number;
  scannedEntries: number;
  consumedEntries: number;
  deletedOrphanTotals: number;
  yearMonth: string;
  previousMonth: string;
  updatedAtMs: number;
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const expectedOwners = expectedTeamOverviewOwners(users, entries, totals);
  const ownerEmails = expectedOwners.map((user) => user.email);
  const ownerSet = new Set(ownerEmails);
  const stats: Record<string, ContractStats> = {};
  const activeStats: Record<string, ContractStats> = {};
  ownerEmails.forEach((ownerEmail) => {
    stats[ownerEmail] = emptyContractStats();
    activeStats[ownerEmail] = emptyContractStats();
  });

  const now = new Date();
  const yearMonth = currentYearMonth(now);
  const previousMonth = previousYearMonth(now);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const previousMonthToDateEndMs = previousMonthToDateEnd(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const currentMonthToDateEnd = now.getTime();
  const seen = new Set<string>();
  let consumedEntries = 0;

  for (const entry of entries) {
    if (
      consumeTeamOverviewEntry({
        stats,
        activeStats,
        ownerSet,
        entry,
        seen,
        now,
        previousMonthStart,
        previousMonthToDateEndMs,
        monthStart,
        currentMonthToDateEnd,
      })
    ) {
      consumedEntries += 1;
    }
  }

  const db = adminDb;
  const usersByEmail = new Set(users.map((user) => user.email));
  const orphanTotals = totals.filter(
    (total) => !total.ownerEmail || !usersByEmail.has(total.ownerEmail)
  );
  const updatedAtMs = Date.now();
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let ops = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const [ownerEmail, stat] of Object.entries(stats)) {
    const activeStat = activeStats[ownerEmail] ?? emptyContractStats();
    const documents = buildTeamOverviewReadModelDocuments({
      ownerEmail,
      stat,
      activeStat,
      yearMonth,
      previousMonth,
      updatedAtMs,
    });
    batch.set(
      db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail),
      documents.totals,
      { merge: true }
    );
    batch.set(
      db
        .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
        .doc(teamOverviewMonthDocId(ownerEmail, yearMonth)),
      documents.currentMonth,
      { merge: true }
    );
    batch.set(
      db
        .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
        .doc(teamOverviewMonthDocId(ownerEmail, previousMonth)),
      documents.previousMonth,
      { merge: true }
    );
    ops += 3;
    if (ops >= BATCH_LIMIT) await commit();
  }

  for (const total of orphanTotals) {
    batch.delete(db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(total.id));
    ops += 1;
    if (total.ownerEmail) {
      batch.delete(
        db
          .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
          .doc(teamOverviewMonthDocId(total.ownerEmail, yearMonth))
      );
      batch.delete(
        db
          .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
          .doc(teamOverviewMonthDocId(total.ownerEmail, previousMonth))
      );
      ops += 2;
    }
    if (ops >= BATCH_LIMIT) await commit();
  }

  await commit();

  return {
    rebuiltOwners: ownerEmails.length,
    scannedEntries: entries.length,
    consumedEntries,
    deletedOrphanTotals: orphanTotals.length,
    yearMonth,
    previousMonth,
    updatedAtMs,
  };
}

function buildStaleTeamTotalsCheck({
  users,
  entries,
  totals,
  sampleLimit,
  truncated,
}: {
  users: UserProfile[];
  entries: ContractEntry[];
  totals: TeamOverviewTotal[];
  sampleLimit: number;
  truncated: boolean;
}): HealthCheck {
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const totalsByEmail = new Map(totals.map((total) => [total.ownerEmail, total]));
  const samples: HealthSample[] = [];
  let issues = 0;
  const now = Date.now();

  const expectedOwners = expectedTeamOverviewOwners(users, entries, totals);

  for (const user of expectedOwners) {
    const total = totalsByEmail.get(user.email);
    const reasons: string[] = [];
    if (!total) {
      reasons.push("chybí teamOverviewTotals doc");
    } else {
      if (total.version !== TEAM_OVERVIEW_MODEL_VERSION) {
        reasons.push(
          `modelVersion ${total.version ?? "?"} místo ${TEAM_OVERVIEW_MODEL_VERSION}`
        );
      }
      if (!total.updatedAtMs) {
        reasons.push("chybí updatedAtMs");
      } else if (now - total.updatedAtMs > TEAM_TOTALS_STALE_MS) {
        reasons.push("updatedAtMs je starší než 24 hodin");
      }
    }
    if (reasons.length === 0) continue;
    issues += 1;
    pushSample(samples, sampleLimit, {
      label: user.fullName ?? user.email,
      detail: reasons.join(" · "),
      ownerEmail: user.email,
      meta: {
        position: user.position,
        modelVersion: total?.version ?? null,
        updatedAtMs: total?.updatedAtMs ?? null,
      },
    });
  }

  for (const total of totals) {
    if (!total.ownerEmail || usersByEmail.has(total.ownerEmail)) continue;
    issues += 1;
    pushSample(samples, sampleLimit, {
      label: total.ownerEmail || total.id,
      detail: "teamOverviewTotals existuje pro uživatele, který není v users.",
      ownerEmail: total.ownerEmail,
      meta: {
        modelVersion: total.version,
        updatedAtMs: total.updatedAtMs,
      },
    });
  }

  return createCheck({
    key: "staleTeamTotals",
    title: "Neaktuální týmové součty",
    count: issues,
    scanned: expectedOwners.length + totals.length,
    truncated,
    samples,
    severityWhenFound: "info",
    description:
      "Kontroluje chybějící, staré nebo verzně nekompatibilní teamOverviewTotals read modely.",
  });
}

async function loadContractEntriesWithExactNumber(
  contractNumber: string
): Promise<ContractEntry[]> {
  const normalizedNumber = normalizeContractNumber(contractNumber);
  if (!normalizedNumber) return [];
  const looseNumber = normalizeContractNumberLoose(contractNumber);
  const rowsByPath = new Map<string, ContractEntry>();

  const addEntry = (
    id: string,
    path: string,
    ownerEmail: string | null | undefined,
    data: Record<string, unknown>
  ) => {
    const entry = contractEntryFromData({
      id,
      path,
      ownerEmail: normalizeEmail(ownerEmail),
      data,
    });
    if (entry && entry.normalizedNumber === normalizedNumber) {
      rowsByPath.set(entry.path, entry);
    }
  };

  const addEntrySnap = (
    docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
  ) => {
    addEntry(
      docSnap.id,
      docSnap.ref.path,
      docSnap.ref.parent.parent?.id,
      docSnap.data()
    );
  };

  try {
    const claimSnap = await adminDb!
      .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
      .doc(contractNumberClaimDocId(normalizedNumber))
      .get();
    const claimEntryPath = normalizeText(claimSnap.data()?.entryPath);
    if (hasValidDocumentPathShape(claimEntryPath)) {
      const claimedEntrySnap = await adminDb!.doc(claimEntryPath).get();
      if (claimedEntrySnap.exists) {
        addEntry(
          claimedEntrySnap.id,
          claimedEntrySnap.ref.path,
          ownerEmailFromPath(claimEntryPath),
          claimedEntrySnap.data() ?? {}
        );
      }
    }
  } catch {
    // Claim je jen rychlý index; při chybě pokračujeme přes contractRefs / entries.
  }

  try {
    const refQueries: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = [
      adminDb!
        .collection(CONTRACT_REFS_COLLECTION)
        .where("contractNumberNormalized", "==", normalizedNumber)
        .get(),
    ];
    if (looseNumber && looseNumber !== normalizedNumber) {
      refQueries.push(
        adminDb!
          .collection(CONTRACT_REFS_COLLECTION)
          .where("contractNumberLoose", "==", looseNumber)
          .get()
      );
    }

    const refSnaps = await Promise.all(refQueries);
    const entryPaths = new Set<string>();
    for (const refSnap of refSnaps) {
      for (const docSnap of refSnap.docs) {
        const data = docSnap.data();
        const ownerEmail = normalizeEmail(data.ownerEmail);
        const entryId = normalizeText(data.entryId);
        const refEntryPath =
          nullableText(data.entryPath) ||
          (ownerEmail && entryId ? entryPath(ownerEmail, entryId) : null);
        if (hasValidDocumentPathShape(refEntryPath)) {
          entryPaths.add(refEntryPath);
        }
      }
    }

    await Promise.all(
      Array.from(entryPaths).map(async (path) => {
        const docSnap = await adminDb!.doc(path).get();
        if (!docSnap.exists) return;
        addEntry(
          docSnap.id,
          docSnap.ref.path,
          ownerEmailFromPath(path),
          docSnap.data() ?? {}
        );
      })
    );
  } catch {
    // Starší databáze nemusí mít index; fallback níže projde entries.
  }

  const possibleStoredNumbers = new Set<string>();
  const rawNumber = contractNumber.trim();
  if (rawNumber) possibleStoredNumbers.add(rawNumber);
  possibleStoredNumbers.add(normalizedNumber);
  if (looseNumber) possibleStoredNumbers.add(looseNumber);

  try {
    const entrySnaps = await Promise.all(
      Array.from(possibleStoredNumbers).map((number) =>
        adminDb!.collectionGroup("entries").where("contractNumber", "==", number).get()
      )
    );
    entrySnaps.forEach((snap) => snap.docs.forEach(addEntrySnap));
  } catch {
    const scan = await scanContractEntries(MAX_SCAN_LIMIT);
    if (!scan.ok) {
      throw new Error(scan.error);
    }
    scan.rows
      .filter((entry) => entry.normalizedNumber === normalizedNumber)
      .forEach((entry) => rowsByPath.set(entry.path, entry));
  }

  if (rowsByPath.size < 2) {
    const scan = await scanContractEntries(MAX_SCAN_LIMIT);
    if (scan.ok) {
      scan.rows
        .filter((entry) => entry.normalizedNumber === normalizedNumber)
        .forEach((entry) => rowsByPath.set(entry.path, entry));
    }
  }

  return Array.from(rowsByPath.values());
}

async function resolveUserDocIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !adminDb) return null;

  const directSnap = await adminDb.collection("users").doc(normalized).get();
  if (directSnap.exists) return directSnap.id;

  const querySnap = await adminDb
    .collection("users")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  return querySnap.docs[0]?.id ?? normalized;
}

async function deleteTipPayoutDocsForSource({
  tipsterEmail,
  sourceKey,
}: {
  tipsterEmail: string | null;
  sourceKey: string;
}): Promise<number> {
  if (!adminDb) return 0;
  const tipsterUserDocId = tipsterEmail ? await resolveUserDocIdByEmail(tipsterEmail) : null;
  if (!tipsterUserDocId) return 0;

  const payoutsCol = adminDb
    .collection("users")
    .doc(tipsterUserDocId)
    .collection(TIP_PAYOUTS_SUBCOLLECTION);

  let deleted = 0;
  while (true) {
    const existingSnap = await payoutsCol
      .where("sourceKey", "==", sourceKey)
      .limit(TIP_PAYOUTS_BATCH_LIMIT)
      .get();
    if (existingSnap.empty) break;

    const batch = adminDb.batch();
    existingSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deleted += 1;
    });
    await batch.commit();

    if (existingSnap.size < TIP_PAYOUTS_BATCH_LIMIT) break;
  }
  return deleted;
}

function collectDirtyOwnersFromEntry(ownerEmail: string, data: Record<string, unknown>): string[] {
  const owners = new Set<string>();
  const push = (value: unknown) => {
    const email = normalizeEmail(value);
    if (email) owners.add(email);
  };

  push(ownerEmail);
  push(data.managerEmailSnapshot);
  if (Array.isArray(data.managerChain)) {
    data.managerChain.forEach((row) => {
      if (row && typeof row === "object") push((row as Record<string, unknown>).email);
    });
  }
  if (Array.isArray(data.managerOverrides)) {
    data.managerOverrides.forEach((row) => {
      if (row && typeof row === "object") push((row as Record<string, unknown>).email);
    });
  }

  return Array.from(owners);
}

function compareDuplicateSurvivors(a: ContractEntry, b: ContractEntry): number {
  if (a.paid !== b.paid) return a.paid ? -1 : 1;
  const signedDiff = (a.contractSignedDateMs ?? 0) - (b.contractSignedDateMs ?? 0);
  if (signedDiff !== 0) return signedDiff;
  const createdDiff = (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
  if (createdDiff !== 0) return createdDiff;
  return a.path.localeCompare(b.path, "cs");
}

function contractNumberClaimPayloadFromEntry(entry: ContractEntry) {
  const normalizedNumber = normalizeContractNumber(entry.contractNumber ?? entry.normalizedNumber);
  if (!entry.ownerEmail || !entry.id || !normalizedNumber) return null;
  return {
    contractNumberRaw: entry.contractNumber ?? normalizedNumber,
    contractNumberNormalized: normalizedNumber,
    contractNumberLoose: normalizeContractNumberLoose(entry.contractNumber ?? normalizedNumber),
    ownerEmail: entry.ownerEmail,
    entryId: entry.id,
    entryPath: entry.path,
    updatedAt: new Date(),
  };
}

function contractRefPayloadFromEntry(entry: ContractEntry) {
  const normalizedNumber = normalizeContractNumber(entry.contractNumber ?? entry.normalizedNumber);
  if (!entry.ownerEmail || !entry.id || !normalizedNumber) return null;
  return {
    ownerEmail: entry.ownerEmail,
    entryId: entry.id,
    entryPath: entry.path,
    contractNumberRaw: entry.contractNumber ?? normalizedNumber,
    contractNumberNormalized: normalizedNumber,
    contractNumberLoose: normalizeContractNumberLoose(entry.contractNumber ?? normalizedNumber),
    productKey: entry.productKey ?? null,
    updatedAt: new Date(),
  };
}

async function readActionBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const authCtx = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "kontrolu datové kvality",
  });
  if ("error" in authCtx) return adminAuthErrorResponse(authCtx);
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const scanLimit = parsePositiveInt(searchParams.get("limit"), DEFAULT_SCAN_LIMIT, MAX_SCAN_LIMIT, 50);
  const sampleLimit = parsePositiveInt(
    searchParams.get("sample"),
    DEFAULT_SAMPLE_LIMIT,
    MAX_SAMPLE_LIMIT,
    4
  );

  const [usersScan, entriesScan, refsScan, totalsScan, statementsScan, productDriftCheck] =
    await Promise.all([
      scanUsers(scanLimit),
      scanContractEntries(scanLimit),
      scanContractRefs(scanLimit),
      scanTeamTotals(scanLimit),
      scanCommissionStatements(scanLimit),
      buildProductDriftCheck(sampleLimit),
    ]);

  const checks: HealthCheck[] = [];
  const entries = entriesScan.ok ? entriesScan.rows : [];
  const refs = refsScan.ok ? refsScan.rows : [];
  const users = usersScan.ok ? usersScan.rows : [];
  const totals = totalsScan.ok ? totalsScan.rows : [];

  if (!entriesScan.ok) {
    checks.push(
      failedCheck(
        "duplicateContractNumbers",
        "Duplicitní čísla smluv",
        entriesScan.error,
        "Kontrola vyžaduje collection-group čtení entries."
      )
    );
  } else {
    checks.push(
      buildDuplicateContractNumbersCheck({
        entries,
        sampleLimit,
        truncated: entriesScan.truncated,
      })
    );
  }

  if (!refsScan.ok) {
    checks.push(
      failedCheck(
        "orphanContractRefs",
        "Orphan contractRefs",
        refsScan.error,
        "Kontrola vyžaduje čtení kolekce contractRefs."
      )
    );
  } else {
    checks.push(
      await buildOrphanContractRefsCheck({
        refs,
        sampleLimit,
        truncated: refsScan.truncated,
      })
    );
  }

  if (!entriesScan.ok || !usersScan.ok) {
    checks.push(
      failedCheck(
        "missingManagerChain",
        "Neúplný managerChain",
        [entriesScan.ok ? null : entriesScan.error, usersScan.ok ? null : usersScan.error]
          .filter(Boolean)
          .join(" / "),
        "Kontrola vyžaduje entries a users."
      )
    );
  } else {
    checks.push(
      buildMissingManagerChainCheck({
        entries,
        usersByEmail: new Map(users.map((user) => [user.email, user])),
        sampleLimit,
        truncated: entriesScan.truncated || usersScan.truncated,
      })
    );
  }

  checks.push(productDriftCheck);

  if (!statementsScan.ok) {
    checks.push(
      failedCheck(
        "unmatchedCommissionStatements",
        "Chyby zpracování provizních výpisů",
        statementsScan.error,
        "Kontrola vyžaduje collection-group čtení usersPrivate/*/commissionStatements."
      )
    );
  } else {
    checks.push(
      buildUnmatchedStatementsCheck({
        statements: statementsScan.rows,
        sampleLimit,
        truncated: statementsScan.truncated,
      })
    );
  }

  if (!entriesScan.ok) {
    checks.push(
      failedCheck(
        "suspiciousStornos",
        "Podezřelá storna",
        entriesScan.error,
        "Kontrola vyžaduje collection-group čtení entries."
      )
    );
  } else {
    checks.push(
      buildSuspiciousStornosCheck({
        entries,
        sampleLimit,
        truncated: entriesScan.truncated,
      })
    );
  }

  if (!usersScan.ok || !entriesScan.ok || !totalsScan.ok) {
    checks.push(
      failedCheck(
        "staleTeamTotals",
        "Neaktuální týmové součty",
        [usersScan.ok ? null : usersScan.error, entriesScan.ok ? null : entriesScan.error, totalsScan.ok ? null : totalsScan.error]
          .filter(Boolean)
          .join(" / "),
        "Kontrola vyžaduje users, entries a teamOverviewTotals."
      )
    );
  } else {
    checks.push(
      buildStaleTeamTotalsCheck({
        users,
        entries,
        totals,
        sampleLimit,
        truncated: usersScan.truncated || entriesScan.truncated || totalsScan.truncated,
      })
    );
  }

  const generatedAtMs = Date.now();
  const summary = {
    checks: checks.length,
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
    critical: checks.filter((check) => check.severity === "critical").length,
    totalFindings: checks.reduce((sum, check) => sum + check.count, 0),
    truncatedChecks: checks.filter((check) => check.truncated).length,
  };

  return NextResponse.json({
    ok: true,
    generatedAtMs,
    generatedAtIso: new Date(generatedAtMs).toISOString(),
    generatedBy: authCtx.adminEmail,
    durationMs: generatedAtMs - startedAt,
    limits: {
      scanLimit,
      sampleLimit,
      maxScanLimit: MAX_SCAN_LIMIT,
    },
    scanned: {
      users: usersScan.ok ? usersScan.scanned : null,
      entries: entriesScan.ok ? entriesScan.scanned : null,
      contractRefs: refsScan.ok ? refsScan.scanned : null,
      commissionStatements: statementsScan.ok ? statementsScan.scanned : null,
      teamOverviewTotals: totalsScan.ok ? totalsScan.scanned : null,
    },
    summary,
    checks,
  });
}

export async function POST(req: NextRequest) {
  const authCtx = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "opravu týmových součtů",
  });
  if ("error" in authCtx) return adminAuthErrorResponse(authCtx);
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
  }

  const body = await readActionBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Neplatný JSON payload." },
      { status: 400 }
    );
  }

  const action = normalizeText(body.action);
  if (action !== "refreshTeamOverviewTotals") {
    return NextResponse.json(
      { ok: false, error: "Nepodporovaná admin data-health akce." },
      { status: 400 }
    );
  }

  const [usersScan, entriesScan, totalsScan] = await Promise.all([
    scanUsers(MAX_SCAN_LIMIT),
    scanContractEntries(MAX_SCAN_LIMIT),
    scanTeamTotals(MAX_SCAN_LIMIT),
  ]);

  if (!usersScan.ok || !entriesScan.ok || !totalsScan.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: [
          usersScan.ok ? null : usersScan.error,
          entriesScan.ok ? null : entriesScan.error,
          totalsScan.ok ? null : totalsScan.error,
        ]
          .filter(Boolean)
          .join(" / "),
      },
      { status: 500 }
    );
  }

  if (usersScan.truncated || entriesScan.truncated || totalsScan.truncated) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Přepočet odmítnut. Scan narazil na limit, takže by mohl zapsat neúplné týmové součty.",
        scanned: {
          users: usersScan.scanned,
          entries: entriesScan.scanned,
          teamOverviewTotals: totalsScan.scanned,
        },
        maxScanLimit: MAX_SCAN_LIMIT,
      },
      { status: 409 }
    );
  }

  const result = await rebuildTeamOverviewReadModels({
    users: usersScan.rows,
    entries: entriesScan.rows,
    totals: totalsScan.rows,
  });

  return NextResponse.json({
    ok: true,
    action,
    ...result,
    refreshedBy: authCtx.adminEmail,
  });
}

export async function DELETE(req: NextRequest) {
  const authCtx = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "smazání duplicitní smlouvy",
  });
  if ("error" in authCtx) return adminAuthErrorResponse(authCtx);
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
  }

  const body = await readActionBody(req);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Neplatný JSON payload." },
      { status: 400 }
    );
  }

  const action = normalizeText(body.action);
  if (action !== "deleteDuplicateContract") {
    return NextResponse.json(
      { ok: false, error: "Nepodporovaná admin data-health akce." },
      { status: 400 }
    );
  }

  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = normalizeText(body.entryId);
  const requestedContractNumber = normalizeContractNumber(body.contractNumber);
  const confirmationNumber = normalizeContractNumber(body.confirmContractNumber);
  if (!ownerEmail || !entryId || !requestedContractNumber) {
    return NextResponse.json(
      { ok: false, error: "Chybí ownerEmail, entryId nebo contractNumber." },
      { status: 400 }
    );
  }
  if (confirmationNumber !== requestedContractNumber) {
    return NextResponse.json(
      { ok: false, error: "Potvrzení čísla smlouvy neodpovídá mazanému záznamu." },
      { status: 400 }
    );
  }

  const db = adminDb;
  const targetPath = entryPath(ownerEmail, entryId);
  const entryRef = db.doc(targetPath);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    return NextResponse.json(
      { ok: false, error: "Smlouva už nebyla nalezena." },
      { status: 404 }
    );
  }

  const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
  const targetEntry = contractEntryFromData({
    id: entrySnap.id,
    path: entrySnap.ref.path,
    ownerEmail,
    data: entryData,
  });
  if (!targetEntry) {
    return NextResponse.json(
      { ok: false, error: "Cílový záznam není smlouva." },
      { status: 400 }
    );
  }
  if (targetEntry.normalizedNumber !== requestedContractNumber) {
    return NextResponse.json(
      {
        ok: false,
        error: `Číslo smlouvy se změnilo na ${targetEntry.contractNumber ?? "bez čísla"}.`,
      },
      { status: 409 }
    );
  }

  const duplicateEntries = await loadContractEntriesWithExactNumber(
    targetEntry.contractNumber ?? targetEntry.normalizedNumber
  );
  const duplicateByPath = new Map<string, ContractEntry>();
  duplicateByPath.set(targetEntry.path, targetEntry);
  duplicateEntries
    .filter((entry) => entry.normalizedNumber === targetEntry.normalizedNumber)
    .forEach((entry) => duplicateByPath.set(entry.path, entry));

  if (duplicateByPath.size < 2) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Smazání odmítnuto. Záznam už podle aktuálních dat není součástí duplicitní skupiny.",
      },
      { status: 409 }
    );
  }

  const cleanupWarnings: string[] = [];
  const contractPdfAttachment = normalizeStoredContractPdfAttachment(
    entryData.contractPdfAttachment
  );
  const dirtyOwners = collectDirtyOwnersFromEntry(ownerEmail, entryData);
  const tipsterEmail = normalizeEmail(entryData.tipContractTipsterEmail);
  const sourceKey = tipPayoutSourceKey(ownerEmail, entryId);
  const contractRef = db.collection(CONTRACT_REFS_COLLECTION).doc(contractRefDocId(ownerEmail, entryId));
  const claimRef = db
    .collection(CONTRACT_NUMBER_CLAIMS_COLLECTION)
    .doc(contractNumberClaimDocId(targetEntry.normalizedNumber));
  const claimSnap = await claimRef.get();
  const claimData = (claimSnap.data() ?? {}) as Record<string, unknown>;
  const remainingEntries = Array.from(duplicateByPath.values())
    .filter((entry) => entry.path !== targetEntry.path)
    .sort(compareDuplicateSurvivors);
  const claimEntryPath = normalizeText(claimData.entryPath);
  const claimPointsToRemaining = remainingEntries.some(
    (entry) => entry.path === claimEntryPath
  );
  const survivorForIndex =
    remainingEntries.find((entry) => entry.path === claimEntryPath) ??
    remainingEntries[0] ??
    null;
  const replacementClaimPayload =
    !claimPointsToRemaining && survivorForIndex
      ? contractNumberClaimPayloadFromEntry(survivorForIndex)
      : null;
  const survivorContractRefPayload = survivorForIndex
    ? contractRefPayloadFromEntry(survivorForIndex)
    : null;
  const shouldDeleteClaim =
    claimSnap.exists && claimEntryPath === targetEntry.path && !replacementClaimPayload;

  const batch = db.batch();
  batch.delete(entryRef);
  batch.delete(contractRef);
  if (shouldDeleteClaim) batch.delete(claimRef);
  if (replacementClaimPayload) {
    batch.set(
      claimRef,
      {
        ...replacementClaimPayload,
        ...(claimSnap.exists ? {} : { createdAt: new Date() }),
        reassignedAt: new Date(),
        reassignedFromEntryPath: targetEntry.path,
      },
      { merge: true }
    );
  }
  if (survivorForIndex && survivorContractRefPayload) {
    batch.set(
      db
        .collection(CONTRACT_REFS_COLLECTION)
        .doc(contractRefDocId(survivorForIndex.ownerEmail, survivorForIndex.id)),
      survivorContractRefPayload,
      { merge: true }
    );
  }
  await batch.commit();

  let deletedTipPayouts = 0;
  try {
    deletedTipPayouts = await deleteTipPayoutDocsForSource({
      tipsterEmail,
      sourceKey,
    });
  } catch (error) {
    cleanupWarnings.push(`TIP payout cleanup selhal: ${formatError(error)}`);
  }

  try {
    await markTeamOverviewOwnersDirty(dirtyOwners);
  } catch (error) {
    cleanupWarnings.push(`Invalidace týmových součtů selhala: ${formatError(error)}`);
  }

  if (contractPdfAttachment) {
    try {
      await deleteContractPdfAttachment(contractPdfAttachment);
    } catch (error) {
      cleanupWarnings.push(`PDF přílohu se nepodařilo smazat: ${formatError(error)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: 1,
    deletedTipPayouts,
    deletedContractRef: true,
    deletedContractNumberClaim: shouldDeleteClaim,
    reassignedContractNumberClaim: Boolean(replacementClaimPayload),
    dirtyOwners,
    remainingDuplicates: Math.max(0, remainingEntries.length - 1),
    remainingDuplicateMembers: remainingEntries.length,
    survivorContract: survivorForIndex ? duplicateMemberFromEntry(survivorForIndex) : null,
    warnings: cleanupWarnings,
    deletedContract: duplicateMemberFromEntry(targetEntry),
    deletedBy: authCtx.adminEmail,
  });
}
