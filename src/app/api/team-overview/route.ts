import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { toDate } from "@/app/lib/formatters";
import {
  isLifeProduct,
  productCategory,
  productInstitutionLabel,
} from "@/app/lib/productCatalog";
import {
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
} from "@/lib/server/rateLimit";

type TeamMember = {
  email: string;
  name: string;
  position: Position | null;
  managerEmail: string | null;
  docId: string;
  lastActiveTs: number | null;
  adminFunction: boolean;
};

type Category =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "foreigners"
  | "comfort"
  | "other";
type AggregateMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};
type ContractStats = {
  total: number;
  month: number;
  categories: Record<Category, number>;
  categoryMetrics: Record<Category, AggregateMetrics>;
  institutionMetrics: Record<string, AggregateMetrics>;
  institutionByCategory: Record<Category, Record<string, AggregateMetrics>>;
};

type TeamOverviewSuccess = {
  ok: true;
  position: Position | null;
  canManagePositions: boolean;
  members: Array<{
    email: string;
    name: string;
    position: Position | null;
    managerEmail: string | null;
    docId: string;
  }>;
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, ContractStats>;
};

type TeamOverviewError = {
  ok: false;
  error: string;
};
type TeamOverviewPatchSuccess = {
  ok: true;
  targetEmail: string;
  updated: Array<
    | "position"
    | "positionTimeline"
    | "collaborationEnded"
    | "collaborationPreview"
    | "positionTimelineRead"
  >;
  summary?: {
    successorEmail: string;
    transferredContracts: number;
    reassignedSubordinates: number;
  };
  preview?: {
    successorEmail: string;
    transferableContracts: number;
    directSubordinates: number;
    generatedAtMs: number;
  };
  positionTimeline?: Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }>;
};

const TEAM_OVERVIEW_RATE_LIMIT = 120;
const TEAM_OVERVIEW_RATE_LIMIT_WINDOW_MS = 60_000;
const TEAM_OVERVIEW_PATCH_RATE_LIMIT = 60;
const TEAM_OVERVIEW_PATCH_RATE_LIMIT_WINDOW_MS = 60_000;
const TEAM_OVERVIEW_MODEL_VERSION = 2;
const TEAM_OVERVIEW_MODEL_STALE_MS = 5 * 60 * 1000;
const TEAM_OVERVIEW_TOTALS_COLLECTION = "teamOverviewTotals";
const TEAM_OVERVIEW_MONTHLY_COLLECTION = "teamOverviewMonthly";
const CONTRACT_REFS_COLLECTION = "contractRefs";
const FIRESTORE_IN_LIMIT = 10;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TIMELINE_ROWS = 150;
const TRANSFER_BATCH_LIMIT = 360;
const POSITION_VALUES: Position[] = [
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
const POSITION_SET = new Set<Position>(POSITION_VALUES);

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function sanitizePositionTimeline(value: unknown): Array<{
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
}> | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_TIMELINE_ROWS) return null;

  const rows: Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }> = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!isPlainObject(raw)) return null;

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const position = typeof raw.position === "string" ? raw.position.trim() : "";
    const validFrom = typeof raw.validFrom === "string" ? raw.validFrom.trim() : "";
    const validToRaw = typeof raw.validTo === "string" ? raw.validTo.trim() : "";
    const validTo = validToRaw || null;

    if (!id || id.length > 120) return null;
    if (!POSITION_SET.has(position as Position)) return null;
    if (!isIsoDay(validFrom)) return null;
    if (validTo && !isIsoDay(validTo)) return null;
    if (validTo && validTo < validFrom) return null;

    rows.push({
      id,
      position: position as Position,
      validFrom,
      validTo,
    });
  }

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  const openEndedIndexes = rows
    .map((row, index) => (!row.validTo ? index : -1))
    .filter((index) => index >= 0);
  if (openEndedIndexes.length > 1) return null;
  if (openEndedIndexes.length === 1 && openEndedIndexes[0] !== rows.length - 1) {
    return null;
  }

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const current = rows[i];
    const prevTo = prev.validTo ?? "9999-12-31";
    if (prevTo > current.validFrom) return null;
  }

  return rows;
}

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý uživatel";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
}

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

function categorizeProduct(p?: Product | null): Category {
  if (p === "maxcizinkomplex") {
    return "foreigners";
  }

  switch (productCategory(p)) {
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

function annualPremiumFromEntry(data: any, category: Category): number {
  const raw = Number(data?.inputAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const product = data?.productKey as Product | undefined;
  if (isLifeProduct(product)) return raw * 12;
  if (category === "comfort") return raw;
  return raw * paymentsPerYear((data?.frequencyRaw ?? "annual") as PaymentFrequency);
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    life: 0,
    auto: 0,
    property: 0,
    travel: 0,
    foreigners: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics(): Record<Category, AggregateMetrics> {
  return {
    life: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    foreigners: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  };
}

function emptyInstitutionByCategory(): Record<Category, Record<string, AggregateMetrics>> {
  return {
    life: {},
    auto: {},
    property: {},
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
    categories: emptyCategoryCounts(),
    categoryMetrics: emptyCategoryMetrics(),
    institutionMetrics: {},
    institutionByCategory: emptyInstitutionByCategory(),
  };
}

function cloneContractStats(source: ContractStats): ContractStats {
  return {
    total: source.total,
    month: source.month,
    categories: { ...source.categories },
    categoryMetrics: {
      life: { ...source.categoryMetrics.life },
      auto: { ...source.categoryMetrics.auto },
      property: { ...source.categoryMetrics.property },
      travel: { ...source.categoryMetrics.travel },
      foreigners: { ...source.categoryMetrics.foreigners },
      comfort: { ...source.categoryMetrics.comfort },
      other: { ...source.categoryMetrics.other },
    },
    institutionMetrics: Object.fromEntries(
      Object.entries(source.institutionMetrics).map(([name, value]) => [
        name,
        { ...value },
      ])
    ),
    institutionByCategory: {
      life: Object.fromEntries(
        Object.entries(source.institutionByCategory.life).map(([name, value]) => [
          name,
          { ...value },
        ])
      ),
      auto: Object.fromEntries(
        Object.entries(source.institutionByCategory.auto).map(([name, value]) => [
          name,
          { ...value },
        ])
      ),
      property: Object.fromEntries(
        Object.entries(source.institutionByCategory.property).map(
          ([name, value]) => [name, { ...value }]
        )
      ),
      travel: Object.fromEntries(
        Object.entries(source.institutionByCategory.travel).map(([name, value]) => [
          name,
          { ...value },
        ])
      ),
      foreigners: Object.fromEntries(
        Object.entries(source.institutionByCategory.foreigners).map(
          ([name, value]) => [name, { ...value }]
        )
      ),
      comfort: Object.fromEntries(
        Object.entries(source.institutionByCategory.comfort).map(([name, value]) => [
          name,
          { ...value },
        ])
      ),
      other: Object.fromEntries(
        Object.entries(source.institutionByCategory.other).map(([name, value]) => [
          name,
          { ...value },
        ])
      ),
    },
  };
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAggregateMetrics(value: unknown): AggregateMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
  }
  const row = value as Record<string, unknown>;
  return {
    contracts: finiteNumber(row.contracts),
    annualPremium: finiteNumber(row.annualPremium),
    monthlyPremium: finiteNumber(row.monthlyPremium),
  };
}

function parseCategoryCounts(value: unknown): Record<Category, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyCategoryCounts();
  }
  const row = value as Record<string, unknown>;
  return {
    life: finiteNumber(row.life),
    auto: finiteNumber(row.auto),
    property: finiteNumber(row.property),
    travel: finiteNumber(row.travel),
    foreigners: finiteNumber(row.foreigners),
    comfort: finiteNumber(row.comfort),
    other: finiteNumber(row.other),
  };
}

function parseCategoryMetrics(
  value: unknown
): Record<Category, AggregateMetrics> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyCategoryMetrics();
  }
  const row = value as Record<string, unknown>;
  return {
    life: parseAggregateMetrics(row.life),
    auto: parseAggregateMetrics(row.auto),
    property: parseAggregateMetrics(row.property),
    travel: parseAggregateMetrics(row.travel),
    foreigners: parseAggregateMetrics(row.foreigners),
    comfort: parseAggregateMetrics(row.comfort),
    other: parseAggregateMetrics(row.other),
  };
}

function parseInstitutionMetrics(
  value: unknown
): Record<string, AggregateMetrics> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const row = value as Record<string, unknown>;
  const out: Record<string, AggregateMetrics> = {};
  for (const [name, rawMetrics] of Object.entries(row)) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) continue;
    out[trimmed] = parseAggregateMetrics(rawMetrics);
  }
  return out;
}

function parseInstitutionByCategory(
  value: unknown
): Record<Category, Record<string, AggregateMetrics>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyInstitutionByCategory();
  }
  const row = value as Record<string, unknown>;
  return {
    life: parseInstitutionMetrics(row.life),
    auto: parseInstitutionMetrics(row.auto),
    property: parseInstitutionMetrics(row.property),
    travel: parseInstitutionMetrics(row.travel),
    foreigners: parseInstitutionMetrics(row.foreigners),
    comfort: parseInstitutionMetrics(row.comfort),
    other: parseInstitutionMetrics(row.other),
  };
}

function parseContractStatsFromTotalsDoc(data: Record<string, unknown>): ContractStats {
  return {
    total: finiteNumber(data.total),
    month: 0,
    categories: parseCategoryCounts(data.categories),
    categoryMetrics: parseCategoryMetrics(data.categoryMetrics),
    institutionMetrics: parseInstitutionMetrics(data.institutionMetrics),
    institutionByCategory: parseInstitutionByCategory(data.institutionByCategory),
  };
}

function currentYearMonth(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthDocId(ownerEmail: string, yearMonth: string): string {
  return `${ownerEmail}___${yearMonth}`;
}

const normalizeContractNumber = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, "").trim();

const normalizeContractNumberLoose = (value: string | null | undefined): string =>
  normalizeContractNumber(value).replace(/^0+/, "");

const contractRefDocId = (ownerEmail: string, entryId: string): string =>
  `${normalizeEmail(ownerEmail)}___${entryId.trim()}`;

const entryRefPath = (ownerEmail: string, entryId: string): string =>
  `users/${normalizeEmail(ownerEmail)}/entries/${entryId.trim()}`;

function buildContractRefPayload({
  ownerEmail,
  entryId,
  contractNumber,
  productKey,
  now,
}: {
  ownerEmail: string;
  entryId: string;
  contractNumber: unknown;
  productKey: unknown;
  now: Date;
}):
  | {
      ownerEmail: string;
      entryId: string;
      entryPath: string;
      contractNumberRaw: string;
      contractNumberNormalized: string;
      contractNumberLoose: string;
      productKey: string | null;
      updatedAt: Date;
    }
  | null {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const trimmedEntryId = entryId.trim();
  const contractNumberRaw =
    typeof contractNumber === "string" ? contractNumber.trim() : "";
  const contractNumberNormalized = normalizeContractNumber(contractNumberRaw);
  const contractNumberLoose = normalizeContractNumberLoose(contractNumberRaw);

  if (!normalizedOwner || !trimmedEntryId || !contractNumberNormalized) {
    return null;
  }

  return {
    ownerEmail: normalizedOwner,
    entryId: trimmedEntryId,
    entryPath: entryRefPath(normalizedOwner, trimmedEntryId),
    contractNumberRaw,
    contractNumberNormalized,
    contractNumberLoose,
    productKey: typeof productKey === "string" ? productKey.trim() || null : null,
    updatedAt: now,
  };
}

async function getAuthEmail(req: NextRequest): Promise<string> {
  if (!adminAuth || !adminDb) {
    throw Object.assign(new Error("Server není správně nakonfigurován."), {
      status: 500,
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    throw Object.assign(new Error(`Invalid or expired token (${code}): ${message}`), {
      status: 401,
    });
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    throw Object.assign(new Error("User e-mail missing in token"), { status: 401 });
  }
  return email;
}

function candidateFromDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): TeamMember | null {
  if (!docSnap.exists) return null;
  const data = docSnap.data() as Record<string, unknown>;
  // Document id is canonical identity. Do not trust mutable data.email here.
  const email = normalizeEmail(docSnap.id);
  if (!email) return null;

  return {
    email,
    name: nameFromEmail(email),
    position: (data.position as Position | undefined) ?? null,
    managerEmail: normalizeEmail(data.managerEmail as string | undefined) || null,
    docId: String(docSnap.id ?? email),
    lastActiveTs: (() => {
      const ts = toDate(data.lastActive)?.getTime();
      return Number.isFinite(ts) ? Number(ts) : null;
    })(),
    adminFunction: data.adminFunction === true || data.adminfunction === true,
  };
}

function pickBestMember(current: TeamMember, next: TeamMember, emailKey: string): TeamMember {
  const currentDoc = current.docId.trim().toLowerCase();
  const nextDoc = next.docId.trim().toLowerCase();

  const currentCanonical = currentDoc === emailKey ? 0 : 1;
  const nextCanonical = nextDoc === emailKey ? 0 : 1;
  if (currentCanonical !== nextCanonical) {
    return currentCanonical < nextCanonical ? current : next;
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

  return currentDoc.localeCompare(nextDoc, "cs") <= 0 ? current : next;
}

async function loadTeamContext(ownEmail: string): Promise<{
  ownPosition: Position | null;
  canManagePositions: boolean;
  members: TeamMember[];
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const db = adminDb;
  const usersCol = db.collection("users");

  let ownCandidate: TeamMember | null = null;
  const ownDocSnap = await usersCol.doc(ownEmail).get();
  ownCandidate = candidateFromDoc(ownDocSnap);

  if (!ownCandidate) {
    try {
      const ownByEmailSnap = await usersCol.where("email", "==", ownEmail).limit(1).get();
      if (!ownByEmailSnap.empty) {
        const first = ownByEmailSnap.docs[0];
        if (first) ownCandidate = candidateFromDoc(first);
      }
    } catch {
      ownCandidate = null;
    }
  }

  if (!ownCandidate) {
    ownCandidate = {
      email: ownEmail,
      name: nameFromEmail(ownEmail),
      position: null,
      managerEmail: null,
      docId: ownEmail,
      lastActiveTs: null,
      adminFunction: false,
    };
  }

  const membersByEmail = new Map<string, TeamMember>();
  membersByEmail.set(ownCandidate.email, ownCandidate);

  const visited = new Set<string>([ownCandidate.email]);
  let frontier: string[] = [ownCandidate.email];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (let i = 0; i < frontier.length; i += FIRESTORE_IN_LIMIT) {
      const chunk = frontier.slice(i, i + FIRESTORE_IN_LIMIT);
      if (chunk.length === 0) continue;

      let subsSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
      if (chunk.length === 1) {
        subsSnap = await usersCol.where("managerEmail", "==", chunk[0]).get();
      } else {
        subsSnap = await usersCol.where("managerEmail", "in", chunk).get();
      }

      for (const docSnap of subsSnap.docs) {
        const candidate = candidateFromDoc(docSnap);
        if (!candidate) continue;

        const existing = membersByEmail.get(candidate.email);
        if (existing) {
          membersByEmail.set(
            candidate.email,
            pickBestMember(existing, candidate, candidate.email)
          );
        } else {
          membersByEmail.set(candidate.email, candidate);
        }

        if (!visited.has(candidate.email)) {
          visited.add(candidate.email);
          nextFrontier.push(candidate.email);
        }
      }
    }
    frontier = nextFrontier;
  }

  const ownNode = membersByEmail.get(ownEmail) ?? ownCandidate;

  let privateAdminFunction = false;
  try {
    const privateSnap = await db.collection("usersPrivate").doc(ownEmail).get();
    if (privateSnap.exists) {
      const privateData = privateSnap.data() as any;
      privateAdminFunction =
        privateData?.adminFunction === true || privateData?.adminfunction === true;
    }
  } catch {
    // best effort, public admin flag is still honored
  }

  const canManagePositions = Boolean(privateAdminFunction || ownNode.adminFunction);

  const members = [...membersByEmail.values()].sort((a, b) => {
    if (a.email === ownEmail) return -1;
    if (b.email === ownEmail) return 1;
    return a.name.localeCompare(b.name, "cs");
  });

  return {
    ownPosition: ownNode.position,
    canManagePositions,
    members,
  };
}

function consumeOwnerEntry({
  stats,
  ownerSet,
  data,
  ownerEmailRaw,
  entryId,
  seen,
  monthStart,
  nextMonthStart,
}: {
  stats: Record<string, ContractStats>;
  ownerSet: Set<string>;
  data: Record<string, unknown>;
  ownerEmailRaw: string | null | undefined;
  entryId: string;
  seen: Set<string>;
  monthStart: number;
  nextMonthStart: number;
}) {
  const ownerEmail = normalizeEmail((data.userEmail as string | undefined) ?? ownerEmailRaw);
  if (!ownerEmail || !ownerSet.has(ownerEmail)) return;

  const key = `${ownerEmail}___${entryId}`;
  if (seen.has(key)) return;
  seen.add(key);

  const current = stats[ownerEmail] ?? emptyContractStats();
  current.total += 1;

  const category = categorizeProduct(data.productKey as Product | undefined);
  current.categories[category] = (current.categories[category] ?? 0) + 1;

  const annualPremium = annualPremiumFromEntry(data, category);
  const monthlyPremium = annualPremium / 12;

  const byCategory = current.categoryMetrics[category] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byCategory.contracts += 1;
  byCategory.annualPremium += annualPremium;
  byCategory.monthlyPremium += monthlyPremium;
  current.categoryMetrics[category] = byCategory;

  const institution =
    productInstitutionLabel(data.productKey as Product | undefined, "Ostatní") ?? "Ostatní";
  const byInstitution = current.institutionMetrics[institution] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byInstitution.contracts += 1;
  byInstitution.annualPremium += annualPremium;
  byInstitution.monthlyPremium += monthlyPremium;
  current.institutionMetrics[institution] = byInstitution;

  const byInstitutionForCategory = current.institutionByCategory[category][institution] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byInstitutionForCategory.contracts += 1;
  byInstitutionForCategory.annualPremium += annualPremium;
  byInstitutionForCategory.monthlyPremium += monthlyPremium;
  current.institutionByCategory[category][institution] = byInstitutionForCategory;

  const signed = toDate(data.contractSignedDate ?? data.createdAt);
  const ts = signed?.getTime();
  if (ts != null && ts >= monthStart && ts < nextMonthStart) {
    current.month += 1;
  }

  stats[ownerEmail] = current;
}

async function buildContractStatsByOwnerFromEntries(
  owners: string[]
): Promise<Record<string, ContractStats>> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const stats: Record<string, ContractStats> = {};
  if (owners.length === 0) return stats;

  const ownerSet = new Set(owners.map((email) => normalizeEmail(email)).filter(Boolean));
  const seen = new Set<string>();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  for (let i = 0; i < owners.length; i += FIRESTORE_IN_LIMIT) {
    const chunk = owners.slice(i, i + FIRESTORE_IN_LIMIT);
    if (chunk.length === 0) continue;

    const groupSnap = await db
      .collectionGroup("entries")
      .where("userEmail", "in", chunk)
      .get();

    for (const docSnap of groupSnap.docs) {
      consumeOwnerEntry({
        stats,
        ownerSet,
        data: docSnap.data() as Record<string, unknown>,
        ownerEmailRaw: docSnap.ref.parent.parent?.id ?? null,
        entryId: docSnap.id,
        seen,
        monthStart,
        nextMonthStart,
      });
    }
  }

  return stats;
}

async function loadContractStatsFromReadModel(
  owners: string[],
  yearMonth: string,
  nowMs: number
): Promise<{
  stats: Record<string, ContractStats>;
  ownersToRefresh: string[];
}> {
  if (!adminDb || owners.length === 0) {
    return { stats: {}, ownersToRefresh: owners };
  }

  const db = adminDb;
  const stats: Record<string, ContractStats> = {};
  const ownersToRefresh = new Set<string>();

  const totalsRefs = owners.map((owner) =>
    db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(owner)
  );
  const monthRefs = owners.map((owner) =>
    db.collection(TEAM_OVERVIEW_MONTHLY_COLLECTION).doc(monthDocId(owner, yearMonth))
  );

  const [totalsSnaps, monthSnaps] = await Promise.all([
    Promise.all(totalsRefs.map((ref) => ref.get())),
    Promise.all(monthRefs.map((ref) => ref.get())),
  ]);

  owners.forEach((owner, idx) => {
    const totalsSnap = totalsSnaps[idx];
    if (!totalsSnap?.exists) {
      ownersToRefresh.add(owner);
      return;
    }

    const totalsRaw = totalsSnap.data() as Record<string, unknown>;
    const version = finiteNumber(totalsRaw.version);
    const updatedAtMs = finiteNumber(totalsRaw.updatedAtMs);

    if (version !== TEAM_OVERVIEW_MODEL_VERSION) {
      ownersToRefresh.add(owner);
      return;
    }
    if (!updatedAtMs || nowMs - updatedAtMs > TEAM_OVERVIEW_MODEL_STALE_MS) {
      ownersToRefresh.add(owner);
    }

    const parsed = parseContractStatsFromTotalsDoc(totalsRaw);
    const monthSnap = monthSnaps[idx];
    if (monthSnap?.exists) {
      const monthRaw = monthSnap.data() as Record<string, unknown>;
      const monthVersion = finiteNumber(monthRaw.version);
      const monthKey = String(monthRaw.yearMonth ?? "").trim();
      if (
        monthVersion === TEAM_OVERVIEW_MODEL_VERSION &&
        monthKey === yearMonth
      ) {
        parsed.month = finiteNumber(monthRaw.monthCount);
      } else {
        ownersToRefresh.add(owner);
      }
    } else {
      ownersToRefresh.add(owner);
    }

    stats[owner] = parsed;
  });

  return { stats, ownersToRefresh: [...ownersToRefresh] };
}

async function persistContractStatsToReadModel(
  stats: Record<string, ContractStats>,
  yearMonth: string,
  updatedAtMs: number
): Promise<void> {
  if (!adminDb) return;
  const db = adminDb;

  const entries = Object.entries(stats);
  if (entries.length === 0) return;

  let batch = db.batch();
  let ops = 0;
  const BATCH_LIMIT = 400;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const [ownerEmail, stat] of entries) {
    const totalsRef = db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail);
    const monthRef = db
      .collection(TEAM_OVERVIEW_MONTHLY_COLLECTION)
      .doc(monthDocId(ownerEmail, yearMonth));

    batch.set(
      totalsRef,
      {
        version: TEAM_OVERVIEW_MODEL_VERSION,
        ownerEmail,
        total: finiteNumber(stat.total),
        categories: stat.categories,
        categoryMetrics: stat.categoryMetrics,
        institutionMetrics: stat.institutionMetrics,
        institutionByCategory: stat.institutionByCategory,
        updatedAtMs,
      },
      { merge: true }
    );
    batch.set(
      monthRef,
      {
        version: TEAM_OVERVIEW_MODEL_VERSION,
        ownerEmail,
        yearMonth,
        monthCount: finiteNumber(stat.month),
        updatedAtMs,
      },
      { merge: true }
    );

    ops += 2;
    if (ops >= BATCH_LIMIT) {
      await commit();
    }
  }

  await commit();
}

async function invalidateTeamOverviewOwners(ownerEmails: Iterable<string>): Promise<void> {
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

  let batch = db.batch();
  let ops = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const ownerEmail of owners) {
    batch.delete(db.collection(TEAM_OVERVIEW_TOTALS_COLLECTION).doc(ownerEmail));
    batch.delete(db.collection(TEAM_OVERVIEW_MONTHLY_COLLECTION).doc(monthDocId(ownerEmail, yearMonth)));
    ops += 2;
    if (ops >= TRANSFER_BATCH_LIMIT) {
      await commit();
    }
  }

  await commit();
}

async function loadSuccessorUserId(successorEmail: string): Promise<string | null> {
  if (!adminDb) return null;
  const snap = await adminDb.collection("users").doc(successorEmail).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const userIdRaw = typeof data.userId === "string" ? data.userId.trim() : "";
  return userIdRaw || null;
}

async function transferOwnerEntriesToSuccessor({
  fromOwnerEmail,
  toOwnerEmail,
  successorUserId,
  actorEmail,
}: {
  fromOwnerEmail: string;
  toOwnerEmail: string;
  successorUserId: string | null;
  actorEmail: string;
}): Promise<number> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const fromRef = db.collection("users").doc(fromOwnerEmail).collection("entries");
  const toRef = db.collection("users").doc(toOwnerEmail).collection("entries");
  const oldPrefix = `users/${fromOwnerEmail}/entries/`;
  const newPrefix = `users/${toOwnerEmail}/entries/`;
  const now = new Date();

  let transferredContracts = 0;
  let cursorId: string | null = null;
  let batch = db.batch();
  let ops = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  const PAGE_SIZE = 250;

  while (true) {
    let query = fromRef.orderBy("__name__").limit(PAGE_SIZE);
    if (cursorId) {
      query = query.startAfter(cursorId);
    }
    const page = await query.get();
    if (page.empty) break;

    for (const entrySnap of page.docs) {
      const entryData = (entrySnap.data() ?? {}) as Record<string, unknown>;
      const entryId = entrySnap.id;

      const originalAdviserEmail =
        normalizeEmail(
          typeof entryData.originalAdviserEmail === "string"
            ? entryData.originalAdviserEmail
            : typeof entryData.userEmail === "string"
            ? entryData.userEmail
            : fromOwnerEmail
        ) || fromOwnerEmail;

      const nextData: Record<string, unknown> = {
        ...entryData,
        userEmail: toOwnerEmail,
        originalAdviserEmail,
        servicingOwnerEmail: toOwnerEmail,
        commissionOwnerEmail: toOwnerEmail,
        transferReason: "career_end",
        transferFromEmail: fromOwnerEmail,
        transferToEmail: toOwnerEmail,
        transferAt: now,
        transferredByEmail: actorEmail,
        ownershipTransfer: {
          type: "career_end",
          fromEmail: fromOwnerEmail,
          toEmail: toOwnerEmail,
          transferredAt: now,
          transferredByEmail: actorEmail,
        },
      };

      if (successorUserId) {
        nextData.userId = successorUserId;
      } else if ("userId" in nextData) {
        delete nextData.userId;
      }

      const parentPathRaw =
        typeof entryData.parentContractEntryPath === "string"
          ? entryData.parentContractEntryPath
          : "";
      if (parentPathRaw.startsWith(oldPrefix)) {
        nextData.parentContractEntryPath = `${newPrefix}${parentPathRaw.slice(oldPrefix.length)}`;
      }

      const destinationRef = toRef.doc(entryId);
      batch.set(destinationRef, nextData, { merge: false });
      ops += 1;

      batch.delete(entrySnap.ref);
      ops += 1;

      batch.delete(
        db.collection(CONTRACT_REFS_COLLECTION).doc(contractRefDocId(fromOwnerEmail, entryId))
      );
      ops += 1;

      const contractRefPayload = buildContractRefPayload({
        ownerEmail: toOwnerEmail,
        entryId,
        contractNumber: entryData.contractNumber,
        productKey: entryData.productKey,
        now,
      });
      const newContractRef = db
        .collection(CONTRACT_REFS_COLLECTION)
        .doc(contractRefDocId(toOwnerEmail, entryId));
      if (contractRefPayload) {
        batch.set(newContractRef, contractRefPayload, { merge: true });
      } else {
        batch.delete(newContractRef);
      }
      ops += 1;

      transferredContracts += 1;

      if (ops >= TRANSFER_BATCH_LIMIT) {
        await commit();
      }
    }

    cursorId = page.docs[page.docs.length - 1]?.id ?? null;
    if (page.size < PAGE_SIZE) break;
  }

  await commit();
  return transferredContracts;
}

async function countOwnerEntriesExact(ownerEmail: string): Promise<number> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const entriesRef = adminDb.collection("users").doc(ownerEmail).collection("entries");
  const PAGE_SIZE = 400;
  let cursorId: string | null = null;
  let total = 0;

  while (true) {
    let query = entriesRef.orderBy("__name__").limit(PAGE_SIZE);
    if (cursorId) {
      query = query.startAfter(cursorId);
    }
    const snap = await query.get();
    if (snap.empty) break;

    total += snap.size;
    cursorId = snap.docs[snap.docs.length - 1]?.id ?? null;
    if (snap.size < PAGE_SIZE) break;
  }

  return total;
}

async function buildEndCollaborationPreview(target: TeamMember): Promise<{
  successorEmail: string;
  transferableContracts: number;
  directSubordinates: number;
  generatedAtMs: number;
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const targetEmail = normalizeEmail(target.email);
  const successorEmail = normalizeEmail(target.managerEmail);

  if (!targetEmail) {
    throw Object.assign(new Error("Neplatný cílový uživatel."), { status: 400 });
  }
  if (!successorEmail) {
    throw Object.assign(
      new Error("Vybraný podřízený nemá přímého nadřízeného pro převod."),
      { status: 400 }
    );
  }
  if (successorEmail === targetEmail) {
    throw Object.assign(new Error("Nelze převádět uživatele na sebe samotného."), {
      status: 400,
    });
  }

  const successorSnap = await db.collection("users").doc(successorEmail).get();
  if (!successorSnap.exists) {
    throw Object.assign(
      new Error("Přímý nadřízený nebyl v systému nalezen."),
      { status: 404 }
    );
  }

  const [transferableContracts, directSubsSnap] = await Promise.all([
    countOwnerEntriesExact(targetEmail),
    db.collection("users").where("managerEmail", "==", targetEmail).get(),
  ]);

  const directSubordinates = directSubsSnap.docs.reduce((count, docSnap) => {
    const subordinateEmail = normalizeEmail(docSnap.id);
    if (!subordinateEmail || subordinateEmail === targetEmail) return count;
    return count + 1;
  }, 0);

  return {
    successorEmail,
    transferableContracts,
    directSubordinates,
    generatedAtMs: Date.now(),
  };
}

async function endCollaborationAndTransfer({
  target,
  actorEmail,
}: {
  target: TeamMember;
  actorEmail: string;
}): Promise<{
  successorEmail: string;
  transferredContracts: number;
  reassignedSubordinates: number;
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = adminDb;
  const targetEmail = normalizeEmail(target.email);
  const successorEmail = normalizeEmail(target.managerEmail);

  if (!targetEmail) {
    throw Object.assign(new Error("Neplatný cílový uživatel."), { status: 400 });
  }
  if (!successorEmail) {
    throw Object.assign(
      new Error("Vybraný uživatel nemá přímého nadřízeného pro převod."),
      { status: 400 }
    );
  }
  if (successorEmail === targetEmail) {
    throw Object.assign(new Error("Nelze převádět uživatele na sebe samotného."), {
      status: 400,
    });
  }

  const successorSnap = await db.collection("users").doc(successorEmail).get();
  if (!successorSnap.exists) {
    throw Object.assign(
      new Error("Přímý nadřízený nebyl v systému nalezen."),
      { status: 404 }
    );
  }

  const successorUserId = await loadSuccessorUserId(successorEmail);
  const transferredContracts = await transferOwnerEntriesToSuccessor({
    fromOwnerEmail: targetEmail,
    toOwnerEmail: successorEmail,
    successorUserId,
    actorEmail,
  });

  const directSubsSnap = await db
    .collection("users")
    .where("managerEmail", "==", targetEmail)
    .get();

  let reassignedSubordinates = 0;
  let batch = db.batch();
  let ops = 0;
  const now = new Date();

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const subDoc of directSubsSnap.docs) {
    const subordinateEmail = normalizeEmail(subDoc.id);
    if (!subordinateEmail || subordinateEmail === targetEmail) continue;
    batch.set(
      subDoc.ref,
      {
        managerEmail: successorEmail,
        collaborationReassignedAt: now,
        collaborationReassignedFromEmail: targetEmail,
      },
      { merge: true }
    );
    ops += 1;
    reassignedSubordinates += 1;
    if (ops >= TRANSFER_BATCH_LIMIT) {
      await commit();
    }
  }

  const targetRef = db.collection("users").doc(target.docId || targetEmail);
  batch.set(
    targetRef,
    {
      managerEmail: null,
      careerStatus: "ended",
      careerEndedAt: now,
      careerEndedByEmail: actorEmail,
      bookTransferredToEmail: successorEmail,
      activeCollaboration: false,
    },
    { merge: true }
  );
  ops += 1;

  await commit();
  await invalidateTeamOverviewOwners([targetEmail, successorEmail]);

  return {
    successorEmail,
    transferredContracts,
    reassignedSubordinates,
  };
}

type ParsedUpdatePatchPayload = {
  action: "update";
  targetEmail: string;
  position?: Position;
  positionTimeline?: Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }>;
};

type ParsedEndCollaborationPayload = {
  action: "endCollaboration";
  targetEmail: string;
  confirmEmail: string;
  confirmCascade: boolean;
  expectedManagerEmail: string | null;
};

type ParsedEndCollaborationPreviewPayload = {
  action: "endCollaborationPreview";
  targetEmail: string;
  expectedManagerEmail: string | null;
};

function parsePatchPayload(
  body: unknown
):
  | ParsedUpdatePatchPayload
  | ParsedEndCollaborationPayload
  | ParsedEndCollaborationPreviewPayload
  | { error: string } {
  if (!isPlainObject(body)) return { error: "Neplatný payload." };

  const targetEmail = normalizeEmail(body.targetEmail as string | undefined);
  if (!targetEmail) return { error: "Chybí targetEmail." };

  const actionRaw =
    typeof body.action === "string" ? body.action.trim() : "";
  if (actionRaw === "endCollaboration") {
    return {
      action: "endCollaboration",
      targetEmail,
      confirmEmail: normalizeEmail(body.confirmEmail as string | undefined),
      confirmCascade: body.confirmCascade === true,
      expectedManagerEmail:
        normalizeEmail(body.expectedManagerEmail as string | undefined) || null,
    };
  }
  if (actionRaw === "endCollaborationPreview") {
    return {
      action: "endCollaborationPreview",
      targetEmail,
      expectedManagerEmail:
        normalizeEmail(body.expectedManagerEmail as string | undefined) || null,
    };
  }
  if (actionRaw && actionRaw !== "update") {
    return { error: "Nepodporovaná akce." };
  }

  const output: ParsedUpdatePatchPayload = {
    action: "update",
    targetEmail,
  };

  if (body.position != null) {
    const positionRaw = typeof body.position === "string" ? body.position.trim() : "";
    if (!POSITION_SET.has(positionRaw as Position)) {
      return { error: "Pole position má neplatnou hodnotu." };
    }
    output.position = positionRaw as Position;
  }

  if (body.positionTimeline != null) {
    const timeline = sanitizePositionTimeline(body.positionTimeline);
    if (!timeline) {
      return { error: "Pole positionTimeline má neplatný formát." };
    }
    output.positionTimeline = timeline;
  }

  if (output.position == null && output.positionTimeline == null) {
    return { error: "Není co uložit." };
  }

  return output;
}

async function loadPositionTimelineForMember(
  member: TeamMember
): Promise<
  Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }>
> {
  if (!adminDb) return [];
  const usersCol = adminDb.collection("users");
  const candidateDocIds = Array.from(
    new Set(
      [member.docId, member.email]
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
    )
  );

  for (const docId of candidateDocIds) {
    const snap = await usersCol.doc(docId).get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    const timeline = sanitizePositionTimeline(data.positionTimeline);
    return timeline ?? [];
  }

  try {
    const byEmailSnap = await usersCol.where("email", "==", member.email).limit(1).get();
    const first = byEmailSnap.docs[0];
    if (!first) return [];
    const data = first.data() as Record<string, unknown>;
    const timeline = sanitizePositionTimeline(data.positionTimeline);
    return timeline ?? [];
  } catch {
    return [];
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." } satisfies TeamOverviewError,
        { status: 500 }
      );
    }

    const email = await getAuthEmail(req);
    const rateLimitResult = consumeRateLimit({
      namespace: "api:team-overview:patch",
      key: email,
      limit: TEAM_OVERVIEW_PATCH_RATE_LIMIT,
      windowMs: TEAM_OVERVIEW_PATCH_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        } satisfies TeamOverviewError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const body = await req.json().catch(() => null);
    const parsed = parsePatchPayload(body);
    if ("error" in parsed) {
      return NextResponse.json(
        { ok: false, error: parsed.error } satisfies TeamOverviewError,
        { status: 400 }
      );
    }

    const context = await loadTeamContext(email);
    if (!context.canManagePositions) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nemáš oprávnění upravovat tým nebo ukončovat spolupráci.",
        } satisfies TeamOverviewError,
        { status: 403 }
      );
    }

    if (parsed.targetEmail === email) {
      return NextResponse.json(
        {
          ok: false,
          error: "Vlastní profil měň přes nastavení účtu.",
        } satisfies TeamOverviewError,
        { status: 400 }
      );
    }

    const target = context.members.find((member) => member.email === parsed.targetEmail);
    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: "Uživatel není ve tvé týmové struktuře.",
        } satisfies TeamOverviewError,
        { status: 404 }
      );
    }

    if (parsed.action === "endCollaborationPreview") {
      const currentManagerEmail = normalizeEmail(target.managerEmail);
      if (
        parsed.expectedManagerEmail &&
        parsed.expectedManagerEmail !== currentManagerEmail
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Struktura týmu se mezitím změnila. Obnov stránku a akci zopakuj.",
          } satisfies TeamOverviewError,
          { status: 409 }
        );
      }

      const preview = await buildEndCollaborationPreview(target);
      const response = NextResponse.json({
        ok: true,
        targetEmail: target.email,
        updated: ["collaborationPreview"],
        preview,
      } satisfies TeamOverviewPatchSuccess);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    if (parsed.action === "endCollaboration") {
      if (!parsed.confirmCascade) {
        return NextResponse.json(
          {
            ok: false,
            error: "Potvrď převod podřízených i smluv.",
          } satisfies TeamOverviewError,
          { status: 400 }
        );
      }
      if (parsed.confirmEmail !== target.email) {
        return NextResponse.json(
          {
            ok: false,
            error: "Potvrzovací e-mail nesouhlasí s vybraným podřízeným.",
          } satisfies TeamOverviewError,
          { status: 400 }
        );
      }
      const currentManagerEmail = normalizeEmail(target.managerEmail);
      if (!currentManagerEmail) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Vybraný podřízený nemá přímého nadřízeného, nelze automaticky převést kmen.",
          } satisfies TeamOverviewError,
          { status: 400 }
        );
      }
      if (
        parsed.expectedManagerEmail &&
        parsed.expectedManagerEmail !== currentManagerEmail
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Struktura týmu se mezitím změnila. Obnov stránku a akci zopakuj.",
          } satisfies TeamOverviewError,
          { status: 409 }
        );
      }

      const summary = await endCollaborationAndTransfer({
        target,
        actorEmail: email,
      });
      const response = NextResponse.json({
        ok: true,
        targetEmail: target.email,
        updated: ["collaborationEnded"],
        summary,
      } satisfies TeamOverviewPatchSuccess);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const patch: Record<string, unknown> = {};
    const updated: Array<"position" | "positionTimeline"> = [];
    if (parsed.position != null) {
      patch.position = parsed.position;
      updated.push("position");
    }
    if (parsed.positionTimeline != null) {
      patch.positionTimeline = parsed.positionTimeline;
      updated.push("positionTimeline");
    }

    await adminDb.collection("users").doc(target.docId || target.email).set(patch, {
      merge: true,
    });

    const response = NextResponse.json({
      ok: true,
      targetEmail: target.email,
      updated,
    } satisfies TeamOverviewPatchSuccess);
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Nepodařilo se uložit změny člena týmu.";
    return NextResponse.json(
      { ok: false, error: message } satisfies TeamOverviewError,
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthEmail(req);

    const rateLimitResult = consumeRateLimit({
      namespace: "api:team-overview:get",
      key: email,
      limit: TEAM_OVERVIEW_RATE_LIMIT,
      windowMs: TEAM_OVERVIEW_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        {
          ok: false,
          error: "Příliš mnoho požadavků. Zkus to prosím za chvíli.",
        } satisfies TeamOverviewError,
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const context = await loadTeamContext(email);
    const action = (req.nextUrl.searchParams.get("action") ?? "").trim();
    if (action === "positionTimelineRead") {
      const targetEmail = normalizeEmail(req.nextUrl.searchParams.get("targetEmail"));
      if (!targetEmail) {
        return NextResponse.json(
          { ok: false, error: "Chybí targetEmail." } satisfies TeamOverviewError,
          { status: 400 }
        );
      }

      const target = context.members.find((member) => member.email === targetEmail);
      if (!target) {
        return NextResponse.json(
          {
            ok: false,
            error: "Uživatel není ve tvé týmové struktuře.",
          } satisfies TeamOverviewError,
          { status: 404 }
        );
      }

      if (target.email !== email && !context.canManagePositions) {
        return NextResponse.json(
          {
            ok: false,
            error: "Nemáš oprávnění zobrazit kariéru tohoto uživatele.",
          } satisfies TeamOverviewError,
          { status: 403 }
        );
      }

      const timeline = await loadPositionTimelineForMember(target);
      const response = NextResponse.json({
        ok: true,
        targetEmail: target.email,
        updated: ["positionTimelineRead"],
        positionTimeline: timeline,
      } satisfies TeamOverviewPatchSuccess);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const owners = Array.from(
      new Set(context.members.map((member) => member.email).filter(Boolean))
    );

    const now = new Date();
    const nowMs = now.getTime();
    const yearMonth = currentYearMonth(now);

    const readModel = await loadContractStatsFromReadModel(owners, yearMonth, nowMs);
    const contractCounts: Record<string, ContractStats> = {};
    Object.entries(readModel.stats).forEach(([owner, stat]) => {
      contractCounts[owner] = cloneContractStats(stat);
    });

    if (readModel.ownersToRefresh.length > 0) {
      const rebuilt = await buildContractStatsByOwnerFromEntries(readModel.ownersToRefresh);
      const rebuiltWithDefaults: Record<string, ContractStats> = {};

      readModel.ownersToRefresh.forEach((owner) => {
        rebuiltWithDefaults[owner] = rebuilt[owner]
          ? cloneContractStats(rebuilt[owner]!)
          : emptyContractStats();
      });

      await persistContractStatsToReadModel(rebuiltWithDefaults, yearMonth, nowMs);
      Object.entries(rebuiltWithDefaults).forEach(([owner, stat]) => {
        contractCounts[owner] = stat;
      });
    }

    owners.forEach((owner) => {
      if (!contractCounts[owner]) {
        contractCounts[owner] = emptyContractStats();
      }
    });

    const responseBody: TeamOverviewSuccess = {
      ok: true,
      position: context.ownPosition,
      canManagePositions: context.canManagePositions,
      members: context.members.map((member) => ({
        email: member.email,
        name: member.name,
        position: member.position,
        managerEmail: member.managerEmail,
        docId: member.docId,
      })),
      lastActive: Object.fromEntries(
        context.members.map((member) => [member.email, member.lastActiveTs ?? null])
      ),
      contractCounts,
    };

    const response = NextResponse.json(responseBody);
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Nepodařilo se načíst tým.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      } satisfies TeamOverviewError,
      { status }
    );
  }
}
