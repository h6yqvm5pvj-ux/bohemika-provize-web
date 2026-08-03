import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { toDate } from "@/app/lib/formatters";
import { isLifeProduct, productCategory } from "@/app/lib/productCatalog";
import { buildChildrenByManager, collectSubordinateHierarchy } from "@/app/lib/teamHierarchy";
import type { PaymentFrequency, Product } from "@/app/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_REPORT_RATE_LIMIT = 80;
const WEEKLY_REPORT_RATE_LIMIT_WINDOW_MS = 60_000;
const ENTRY_PAGE_SIZE = 400;
const WEEKLY_REPORT_TYPE = "weekly_team_report";
const WEEKLY_REPORT_CATEGORY_KEYS = [
  "life",
  "nonLife",
  "auto",
  "property",
  "business",
  "foreigners",
  "travel",
] as const;
const WEEKLY_REPORT_DETAIL_CATEGORY_KEYS = [
  "life",
  "auto",
  "property",
  "business",
  "foreigners",
  "travel",
] as const;
const BUSINESS_PRODUCTS = new Set<Product>([
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
]);

type WeeklyReportCategory = (typeof WEEKLY_REPORT_CATEGORY_KEYS)[number];
type WeeklyReportDetailCategory = (typeof WEEKLY_REPORT_DETAIL_CATEGORY_KEYS)[number];

type WeeklyReportMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};

type UserProfile = {
  email: string;
  managerEmail: string | null;
  merged: Record<string, unknown>;
};

type OwnerWeeklyTotals = {
  categories: Record<WeeklyReportDetailCategory, WeeklyReportMetrics>;
  totalContracts: number;
  totalAnnualPremium: number;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const finiteNonNegativeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const finiteNonNegativeInt = (value: unknown): number =>
  Math.max(0, Math.round(finiteNonNegativeNumber(value)));

const emptyMetrics = (): WeeklyReportMetrics => ({
  contracts: 0,
  annualPremium: 0,
  monthlyPremium: 0,
});

const hasMetrics = (metrics: WeeklyReportMetrics): boolean =>
  metrics.contracts > 0 || metrics.annualPremium > 0 || metrics.monthlyPremium > 0;

const parseCzechAmount = (value: string): number => {
  const normalized = value
    .replace(/\s|\u00a0/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

type ParsedBodySummaryMetric = {
  contracts: number;
  premium: number;
};

const parseSummaryMetricsFromBody = (
  body: string
): { life: ParsedBodySummaryMetric | null; nonLife: ParsedBodySummaryMetric | null } => {
  const normalized = body.replace(/\s+/g, " ").trim();
  const readMetric = (labelPattern: string): ParsedBodySummaryMetric | null => {
    const match = normalized.match(
      new RegExp(
        `(?:^|[•|,;]\\s*)${labelPattern}\\s+(\\d+)\\s+sml\\w*\\s*/\\s*([\\d\\s.,]+)\\s*Kč`,
        "i"
      )
    );
    if (!match) return null;

    const contracts = finiteNonNegativeInt(match[1]);
    const premium = parseCzechAmount(match[2] ?? "");
    if (contracts <= 0 && premium <= 0) return null;

    return {
      contracts,
      premium,
    };
  };

  const life = readMetric("ŽP");
  const nonLife = readMetric("(?:VP|NŽP|Neživotní\\s+pojištění)");

  return { life, nonLife };
};

const parseMetrics = (
  metadata: Record<string, unknown>,
  key: WeeklyReportCategory
): WeeklyReportMetrics => {
  const contracts = finiteNonNegativeInt(metadata[`${key}Contracts`]);
  const annualPremium = finiteNonNegativeNumber(metadata[`${key}AnnualPremium`]);
  const monthlyPremium =
    key === "life"
      ? finiteNonNegativeNumber(metadata.lifeMonthlyPremium)
      : annualPremium / 12;

  return {
    contracts,
    annualPremium,
    monthlyPremium,
  };
};

const emptyDetailCategories = (): Record<WeeklyReportDetailCategory, WeeklyReportMetrics> => ({
  life: emptyMetrics(),
  auto: emptyMetrics(),
  property: emptyMetrics(),
  business: emptyMetrics(),
  foreigners: emptyMetrics(),
  travel: emptyMetrics(),
});

const emptyOwnerWeeklyTotals = (): OwnerWeeklyTotals => ({
  categories: emptyDetailCategories(),
  totalContracts: 0,
  totalAnnualPremium: 0,
});

const mergeMetrics = (target: WeeklyReportMetrics, source: WeeklyReportMetrics): void => {
  target.contracts += source.contracts;
  target.annualPremium += source.annualPremium;
  target.monthlyPremium += source.monthlyPremium;
};

const addContractToMetrics = (
  target: WeeklyReportMetrics,
  annualPremium: number
): void => {
  target.contracts += 1;
  target.annualPremium += annualPremium;
  target.monthlyPremium += annualPremium / 12;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const nameFromEmail = (email: string | null | undefined): string => {
  if (!email) return "Neznámý poradce";
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
};

const displayNameFromProfile = (profile: UserProfile | null | undefined): string => {
  const data = profile?.merged ?? {};
  const candidates = [data.fullName, data.name, data.displayName];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return nameFromEmail(profile?.email);
};

const paymentsPerYear = (freq?: PaymentFrequency | null): number => {
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
};

const normalizeFrequency = (value: unknown): PaymentFrequency => {
  if (
    value === "monthly" ||
    value === "quarterly" ||
    value === "semiannual" ||
    value === "annual"
  ) {
    return value;
  }
  return "annual";
};

const annualPremiumFromEntry = (
  data: Record<string, unknown>,
  product: Product | null
): number => {
  const rawAmount = Number(data.inputAmount ?? 0);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0;

  if (isLifeProduct(product)) return rawAmount * 12;
  if (productCategory(product) === "comfort") return rawAmount;

  return rawAmount * paymentsPerYear(normalizeFrequency(data.frequencyRaw));
};

const weeklyReportCategoryFromProduct = (
  product: Product | null
): WeeklyReportDetailCategory | null => {
  if (product === "maxcizinkomplex") return "foreigners";
  if (product && BUSINESS_PRODUCTS.has(product)) return "business";

  switch (productCategory(product)) {
    case "life":
      return "life";
    case "auto":
      return "auto";
    case "property":
      return "property";
    case "travel":
      return "travel";
    default:
      return null;
  }
};

const totalMetrics = (values: WeeklyReportMetrics[]): WeeklyReportMetrics =>
  values.reduce(
    (acc, metrics) => {
      acc.contracts += metrics.contracts;
      acc.annualPremium += metrics.annualPremium;
      acc.monthlyPremium += metrics.monthlyPremium;
      return acc;
    },
    emptyMetrics()
  );

const detailedNonLifeMetrics = (
  categories: Record<WeeklyReportCategory, WeeklyReportMetrics>
): WeeklyReportMetrics =>
  totalMetrics([
    categories.auto,
    categories.property,
    categories.business,
    categories.foreigners,
    categories.travel,
  ]);

const shouldHydrateDetailedCategories = (
  report: WeeklyReport
): boolean => {
  const aggregateNonLife = report.categories.nonLife;
  const detailedNonLife = detailedNonLifeMetrics(report.categories);
  if (!hasMetrics(aggregateNonLife)) {
    return hasMetrics(detailedNonLife);
  }
  return (
    detailedNonLife.contracts < aggregateNonLife.contracts ||
    (aggregateNonLife.annualPremium > 0 &&
      detailedNonLife.annualPremium < aggregateNonLife.annualPremium)
  );
};

async function collectAllEntriesFromQuery(
  query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>
): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
  const out: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (true) {
    let working = query.limit(ENTRY_PAGE_SIZE);
    if (cursor) working = working.startAfter(cursor);

    const snap = await working.get();
    if (snap.empty) break;

    out.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1] ?? null;
    if (!cursor || snap.size < ENTRY_PAGE_SIZE) break;
  }

  return out;
}

async function loadUsersWithMergedProfiles(): Promise<UserProfile[]> {
  if (!adminDb) return [];

  const [usersSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("usersPrivate").get(),
  ]);

  const privateByEmail = new Map<string, Record<string, unknown>>();
  privateSnap.docs.forEach((docSnap) => {
    const email = normalizeEmail(docSnap.id);
    if (!email) return;
    privateByEmail.set(email, (docSnap.data() ?? {}) as Record<string, unknown>);
  });

  return usersSnap.docs
    .map((docSnap) => {
      const publicData = (docSnap.data() ?? {}) as Record<string, unknown>;
      const email = normalizeEmail(publicData.email ?? docSnap.id);
      if (!email) return null;

      const privateData = privateByEmail.get(email) ?? {};
      const managerEmail =
        normalizeEmail(
          typeof publicData.managerEmail === "string" ? publicData.managerEmail : null
        ) || null;

      return {
        email,
        managerEmail,
        merged: { ...publicData, ...privateData },
      };
    })
    .filter((user): user is UserProfile => Boolean(user));
}

async function loadWeeklyOwnerTotals(
  ownerEmails: string[],
  sinceMs: number,
  untilMs: number
): Promise<Map<string, OwnerWeeklyTotals>> {
  if (!adminDb) return new Map<string, OwnerWeeklyTotals>();
  const db = adminDb;
  const sinceDate = new Date(sinceMs);
  const uniqueOwnerEmails = [...new Set(ownerEmails.map(normalizeEmail).filter(Boolean))];
  const totalsByOwner = new Map<string, OwnerWeeklyTotals>();

  await Promise.all(
    uniqueOwnerEmails.map(async (ownerEmail) => {
      const entriesRef = db.collection("users").doc(ownerEmail).collection("entries");
      const [bySigned, byCreated] = await Promise.all([
        collectAllEntriesFromQuery(
          entriesRef
            .where("contractSignedDate", ">=", sinceDate)
            .orderBy("contractSignedDate", "desc")
        ),
        collectAllEntriesFromQuery(
          entriesRef.where("createdAt", ">=", sinceDate).orderBy("createdAt", "desc")
        ),
      ]);

      const docsByPath = new Map<
        string,
        FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
      >();
      bySigned.forEach((docSnap) => docsByPath.set(docSnap.ref.path, docSnap));
      byCreated.forEach((docSnap) => docsByPath.set(docSnap.ref.path, docSnap));

      docsByPath.forEach((docSnap) => {
        const data = (docSnap.data() ?? {}) as Record<string, unknown>;
        const effectiveDate = toDate(data.contractSignedDate ?? data.createdAt);
        const effectiveMs = effectiveDate?.getTime() ?? null;
        if (effectiveMs == null || effectiveMs < sinceMs || effectiveMs > untilMs) {
          return;
        }

        const product =
          typeof data.productKey === "string" ? (data.productKey as Product) : null;
        const category = weeklyReportCategoryFromProduct(product);
        if (!category) return;

        const annualPremium = annualPremiumFromEntry(data, product);
        const current = totalsByOwner.get(ownerEmail) ?? emptyOwnerWeeklyTotals();
        addContractToMetrics(current.categories[category], annualPremium);
        current.totalContracts += 1;
        current.totalAnnualPremium += annualPremium;
        totalsByOwner.set(ownerEmail, current);
      });
    })
  );

  return totalsByOwner;
}

const parseReportFromDoc = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const body = normalizeText(data.body);
  const metadataRaw = data.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : {};

  const categories = WEEKLY_REPORT_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = parseMetrics(metadata, key);
      return acc;
    },
    {
      life: emptyMetrics(),
      nonLife: emptyMetrics(),
      auto: emptyMetrics(),
      property: emptyMetrics(),
      business: emptyMetrics(),
      foreigners: emptyMetrics(),
      travel: emptyMetrics(),
    } as Record<WeeklyReportCategory, WeeklyReportMetrics>
  );
  const bodySummary = parseSummaryMetricsFromBody(body);

  if (bodySummary.life) {
    if (categories.life.contracts <= 0) {
      categories.life.contracts = bodySummary.life.contracts;
    }
    if (categories.life.monthlyPremium <= 0 && bodySummary.life.premium > 0) {
      categories.life.monthlyPremium = bodySummary.life.premium;
    }
    if (categories.life.annualPremium <= 0 && categories.life.monthlyPremium > 0) {
      categories.life.annualPremium = categories.life.monthlyPremium * 12;
    }
  }

  if (bodySummary.nonLife) {
    if (categories.nonLife.contracts <= 0) {
      categories.nonLife.contracts = bodySummary.nonLife.contracts;
    }
    if (categories.nonLife.annualPremium <= 0 && bodySummary.nonLife.premium > 0) {
      categories.nonLife.annualPremium = bodySummary.nonLife.premium;
      categories.nonLife.monthlyPremium = bodySummary.nonLife.premium / 12;
    }
  }

  const topAdvisorEmail = normalizeText(metadata.topAdvisorEmail).toLowerCase();
  const topAdvisorName = normalizeText(metadata.topAdvisorName);
  const topAdvisorContracts = finiteNonNegativeInt(metadata.topAdvisorContracts);
  const topAdvisorAnnualPremium = finiteNonNegativeNumber(
    metadata.topAdvisorAnnualPremium
  );
  const createdAtMs = finiteNonNegativeNumber(data.createdAtMs);

  return {
    mailboxId: docSnap.id,
    reportId:
      normalizeText(metadata.reportId) || `mailbox-${docSnap.id.slice(0, 48)}`,
    title: normalizeText(data.title) || "Týdenní report produkce",
    body,
    createdAtMs,
    periodStart: normalizeText(metadata.periodStart),
    periodEnd: normalizeText(metadata.periodEnd),
    categories,
    topAdvisor:
      topAdvisorName || topAdvisorEmail
        ? {
            email: topAdvisorEmail,
            name: topAdvisorName || topAdvisorEmail,
            contracts: topAdvisorContracts,
            annualPremium: topAdvisorAnnualPremium,
          }
        : null,
  };
};

type WeeklyReport = ReturnType<typeof parseReportFromDoc>;

const parseReportPeriodMs = (report: WeeklyReport): { sinceMs: number; untilMs: number } | null => {
  const sinceMs = new Date(report.periodStart).getTime();
  const untilMs = new Date(report.periodEnd).getTime();
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs > untilMs) {
    return null;
  }
  return { sinceMs, untilMs };
};

async function hydrateReportFromProduction(
  managerEmail: string,
  report: WeeklyReport
): Promise<WeeklyReport> {
  if (!shouldHydrateDetailedCategories(report)) return report;
  const period = parseReportPeriodMs(report);
  if (!period) return report;

  const users = await loadUsersWithMergedProfiles();
  const childrenByManager = buildChildrenByManager(
    users.map((user) => ({ email: user.email, managerEmail: user.managerEmail }))
  );
  const hierarchy = collectSubordinateHierarchy(managerEmail, childrenByManager);
  if (hierarchy.subordinateEmails.length === 0) return report;

  const ownerTotals = await loadWeeklyOwnerTotals(
    hierarchy.subordinateEmails,
    period.sinceMs,
    period.untilMs
  );
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const categories = emptyDetailCategories();
  let topAdvisor: WeeklyReport["topAdvisor"] = null;

  hierarchy.subordinateEmails.forEach((subordinateEmail) => {
    const totals = ownerTotals.get(subordinateEmail);
    if (!totals) return;

    WEEKLY_REPORT_DETAIL_CATEGORY_KEYS.forEach((category) => {
      mergeMetrics(categories[category], totals.categories[category]);
    });

    if (totals.totalContracts <= 0) return;
    if (
      !topAdvisor ||
      totals.totalContracts > topAdvisor.contracts ||
      (totals.totalContracts === topAdvisor.contracts &&
        totals.totalAnnualPremium > topAdvisor.annualPremium)
    ) {
      topAdvisor = {
        email: subordinateEmail,
        name: displayNameFromProfile(usersByEmail.get(subordinateEmail)),
        contracts: totals.totalContracts,
        annualPremium: totals.totalAnnualPremium,
      };
    }
  });

  const computedNonLife = totalMetrics([
    categories.auto,
    categories.property,
    categories.business,
    categories.foreigners,
    categories.travel,
  ]);
  if (!hasMetrics(computedNonLife)) return report;

  return {
    ...report,
    categories: {
      ...report.categories,
      ...categories,
      nonLife: emptyMetrics(),
    },
    topAdvisor: topAdvisor ?? report.topAdvisor,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:team-overview:weekly-report",
    limit: WEEKLY_REPORT_RATE_LIMIT,
    windowMs: WEEKLY_REPORT_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const requestedReportId = normalizeText(req.nextUrl.searchParams.get("reportId"));
    const snap = await adminDb
      .collection("usersPrivate")
      .doc(ctx.email)
      .collection("mailbox")
      .where("type", "==", WEEKLY_REPORT_TYPE)
      .get();

    const reports = snap.docs
      .map(parseReportFromDoc)
      .filter((report) =>
        requestedReportId ? report.reportId === requestedReportId : true
      )
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    const report = reports[0]
      ? await hydrateReportFromProduction(ctx.email, reports[0])
      : null;

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        report,
      }),
      ctx
    );
  } catch (error) {
    console.error("Weekly team report GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst týdenní report." },
        { status: 500 }
      ),
      ctx
    );
  }
}
