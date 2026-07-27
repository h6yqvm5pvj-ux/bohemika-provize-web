import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { toDate } from "@/app/lib/formatters";
import { isLifeProduct, productCategory } from "@/app/lib/productCatalog";
import { buildChildrenByManager, collectSubordinateHierarchy } from "@/app/lib/teamHierarchy";
import { type PaymentFrequency, type Product } from "@/app/types/domain";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_PAGE_SIZE = 400;
const WEEKLY_LOOKBACK_DAYS = 7;
const MAX_TOKENS_PER_USER = 30;
const MAX_TOKENS_PER_MULTICAST = 500;
const DEFAULT_PUBLIC_APP_ORIGIN = "https://bohemka.app";
const WEEKLY_REPORT_DEEP_LINK_BASE = "/muj-tym/tydenni-report?source=weekly-report";
const WEEKLY_REPORT_NOTIFICATION_TITLE = "📊 Týdenní report produkce";
const WEEKLY_REPORT_NOTIFICATION_BODY = "Klikni pro zobrazení!";
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
const BUSINESS_PRODUCTS = new Set<Product>(["kooppmop", "cppPPRs", "cppPPRbez"]);
const WEEKLY_REPORT_CATEGORIES = [
  "life",
  "auto",
  "property",
  "business",
  "foreigners",
  "travel",
] as const;

type WeeklyReportCategory = (typeof WEEKLY_REPORT_CATEGORIES)[number];

type WeeklyReportMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};

type WeeklyReportTopAdvisor = {
  email: string;
  name: string;
  contracts: number;
  annualPremium: number;
};

type UserProfile = {
  email: string;
  managerEmail: string | null;
  merged: Record<string, unknown>;
};

type OwnerWeeklyTotals = {
  categories: Record<WeeklyReportCategory, WeeklyReportMetrics>;
  totalContracts: number;
  totalAnnualPremium: number;
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nameFromEmail(email: string | null | undefined): string {
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
}

function displayNameFromProfile(profile: UserProfile | null | undefined): string {
  const data = profile?.merged ?? {};
  const candidates = [data.fullName, data.name, data.displayName];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return nameFromEmail(profile?.email);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeOriginUrl(value: string | null | undefined): string | null {
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
}

function resolvePublicAppOrigin(req: NextRequest): string {
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

function normalizeFrequency(value: unknown): PaymentFrequency {
  if (
    value === "monthly" ||
    value === "quarterly" ||
    value === "semiannual" ||
    value === "annual"
  ) {
    return value;
  }
  return "annual";
}

function annualPremiumFromEntry(
  data: Record<string, unknown>,
  product: Product | null
): number {
  const rawAmount = Number(data.inputAmount ?? 0);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0;

  if (isLifeProduct(product)) {
    return rawAmount * 12;
  }

  if (productCategory(product) === "comfort") {
    return rawAmount;
  }

  return rawAmount * paymentsPerYear(normalizeFrequency(data.frequencyRaw));
}

function emptyWeeklyReportMetrics(): WeeklyReportMetrics {
  return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
}

function emptyWeeklyReportCategories(): Record<WeeklyReportCategory, WeeklyReportMetrics> {
  return {
    life: emptyWeeklyReportMetrics(),
    auto: emptyWeeklyReportMetrics(),
    property: emptyWeeklyReportMetrics(),
    business: emptyWeeklyReportMetrics(),
    foreigners: emptyWeeklyReportMetrics(),
    travel: emptyWeeklyReportMetrics(),
  };
}

function emptyOwnerWeeklyTotals(): OwnerWeeklyTotals {
  return {
    categories: emptyWeeklyReportCategories(),
    totalContracts: 0,
    totalAnnualPremium: 0,
  };
}

function addWeeklyReportMetrics(
  target: WeeklyReportMetrics,
  annualPremium: number
): void {
  target.contracts += 1;
  target.annualPremium += annualPremium;
  target.monthlyPremium += annualPremium / 12;
}

function mergeWeeklyReportMetrics(
  target: WeeklyReportMetrics,
  source: WeeklyReportMetrics
): void {
  target.contracts += source.contracts;
  target.annualPremium += source.annualPremium;
  target.monthlyPremium += source.monthlyPremium;
}

function weeklyReportCategoryFromProduct(
  product: Product | null
): WeeklyReportCategory | null {
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
}

function weeklyReportDeepLink(reportId: string): string {
  return `${WEEKLY_REPORT_DEEP_LINK_BASE}&reportId=${encodeURIComponent(reportId)}`;
}

function buildWeeklyReportMetadata({
  reportId,
  sinceMs,
  untilMs,
  categories,
  topAdvisor,
}: {
  reportId: string;
  sinceMs: number;
  untilMs: number;
  categories: Record<WeeklyReportCategory, WeeklyReportMetrics>;
  topAdvisor: WeeklyReportTopAdvisor | null;
}): Record<string, string | number | null> {
  return {
    reportId,
    periodStart: new Date(sinceMs).toISOString(),
    periodEnd: new Date(untilMs).toISOString(),
    lifeContracts: categories.life.contracts,
    lifeMonthlyPremium: Math.round(categories.life.monthlyPremium),
    lifeAnnualPremium: Math.round(categories.life.annualPremium),
    autoContracts: categories.auto.contracts,
    autoAnnualPremium: Math.round(categories.auto.annualPremium),
    propertyContracts: categories.property.contracts,
    propertyAnnualPremium: Math.round(categories.property.annualPremium),
    businessContracts: categories.business.contracts,
    businessAnnualPremium: Math.round(categories.business.annualPremium),
    foreignersContracts: categories.foreigners.contracts,
    foreignersAnnualPremium: Math.round(categories.foreigners.annualPremium),
    travelContracts: categories.travel.contracts,
    travelAnnualPremium: Math.round(categories.travel.annualPremium),
    topAdvisorEmail: topAdvisor?.email ?? null,
    topAdvisorName: topAdvisor?.name ?? null,
    topAdvisorContracts: topAdvisor?.contracts ?? 0,
    topAdvisorAnnualPremium: Math.round(topAdvisor?.annualPremium ?? 0),
  };
}

function isWeeklyTeamReportPushEnabled(profile: Record<string, unknown>): boolean {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;

  const typesRaw = isPlainObject(settingsRaw.types) ? settingsRaw.types : null;
  const channelsRaw = isPlainObject(settingsRaw.channels)
    ? settingsRaw.channels
    : null;

  const typeFlag = typesRaw?.weeklyTeamReport;
  const pushFlag = channelsRaw?.push;

  const typeEnabled = typeof typeFlag === "boolean" ? typeFlag : true;
  const pushEnabled = typeof pushFlag === "boolean" ? pushFlag : true;

  return typeEnabled && pushEnabled;
}

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthorizedCronRequest(req: NextRequest): boolean {
  // Vercel Cron automatically sends only CRON_SECRET as a Bearer token.
  const expectedSecret = (process.env.CRON_SECRET ?? "").trim();

  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;

  const received = authHeader.slice(7).trim();
  return Boolean(received && timingSafeStringEquals(received, expectedSecret));
}

async function collectAllEntriesFromQuery(
  query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>
): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
  const out: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (true) {
    let working = query.limit(ENTRY_PAGE_SIZE);
    if (cursor) {
      working = working.startAfter(cursor);
    }

    const snap = await working.get();
    if (snap.empty) break;

    out.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1] ?? null;
    if (!cursor || snap.size < ENTRY_PAGE_SIZE) break;
  }

  return out;
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
        addWeeklyReportMetrics(current.categories[category], annualPremium);
        current.totalContracts += 1;
        current.totalAnnualPremium += annualPremium;

        totalsByOwner.set(ownerEmail, current);
      });
    })
  );

  return totalsByOwner;
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

  const users: UserProfile[] = [];
  usersSnap.docs.forEach((docSnap) => {
    const publicData = (docSnap.data() ?? {}) as Record<string, unknown>;
    const email = normalizeEmail(publicData.email ?? docSnap.id);
    if (!email) return;

    const privateData = privateByEmail.get(email) ?? {};
    const managerEmailRaw =
      typeof publicData.managerEmail === "string" ? publicData.managerEmail : null;
    const managerEmail = normalizeEmail(managerEmailRaw) || null;

    users.push({
      email,
      managerEmail,
      merged: { ...publicData, ...privateData },
    });
  });

  return users;
}

async function runWeeklyTeamReport(req: NextRequest) {
  if (!adminDb || !adminMessaging) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server není správně nakonfigurován (Firebase Admin / Messaging).",
      },
      { status: 500 }
    );
  }

  const now = new Date();
  const untilMs = now.getTime();
  const sinceMs = untilMs - WEEKLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const targetEmail = normalizeEmail(req.nextUrl.searchParams.get("targetEmail"));

  const users = await loadUsersWithMergedProfiles();

  if (users.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, managersEvaluated: 0 });
  }

  const ownerTotals = await loadWeeklyOwnerTotals(
    users.map((user) => user.email),
    sinceMs,
    untilMs
  );

  const childrenByManager = buildChildrenByManager(
    users.map((user) => ({ email: user.email, managerEmail: user.managerEmail }))
  );

  const baseUrl = resolvePublicAppOrigin(req);
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const reportId = `weekly-team-report-${new Date(sinceMs).toISOString().slice(0, 10)}`;
  const reportDeepLink = weeklyReportDeepLink(reportId);
  const webPushLink = `${baseUrl}${reportDeepLink}`;
  const reportTag = `bohemika-${reportId}`;

  let managersEvaluated = 0;
  let sentManagers = 0;
  let sentNotifications = 0;
  let failedNotifications = 0;
  let skippedPushDisabled = 0;
  let skippedNoToken = 0;

  for (const manager of users) {
    if (targetEmail && manager.email !== targetEmail) continue;
    if (!childrenByManager.has(manager.email)) continue;
    managersEvaluated += 1;

    if (!isWeeklyTeamReportPushEnabled(manager.merged)) {
      skippedPushDisabled += 1;
      continue;
    }

    const hierarchy = collectSubordinateHierarchy(manager.email, childrenByManager);
    if (hierarchy.subordinateEmails.length === 0) continue;

    const categories = emptyWeeklyReportCategories();
    let topAdvisor: WeeklyReportTopAdvisor | null = null;

    for (const subordinateEmail of hierarchy.subordinateEmails) {
      const totals = ownerTotals.get(subordinateEmail);
      if (!totals) continue;
      WEEKLY_REPORT_CATEGORIES.forEach((category) => {
        mergeWeeklyReportMetrics(categories[category], totals.categories[category]);
      });

      if (totals.totalContracts <= 0) continue;
      if (
        !topAdvisor ||
        totals.totalContracts > topAdvisor.contracts ||
        (totals.totalContracts === topAdvisor.contracts &&
          totals.totalAnnualPremium > topAdvisor.annualPremium)
      ) {
        const profile = usersByEmail.get(subordinateEmail) ?? null;
        topAdvisor = {
          email: subordinateEmail,
          name: displayNameFromProfile(profile),
          contracts: totals.totalContracts,
          annualPremium: totals.totalAnnualPremium,
        };
      }
    }

    const lifeContracts = categories.life.contracts;
    const lifeMonthlyPremium = categories.life.monthlyPremium;
    const nonLifeContracts =
      categories.auto.contracts +
      categories.property.contracts +
      categories.business.contracts +
      categories.foreigners.contracts +
      categories.travel.contracts;
    const nonLifeAnnualPremium =
      categories.auto.annualPremium +
      categories.property.annualPremium +
      categories.business.annualPremium +
      categories.foreigners.annualPremium +
      categories.travel.annualPremium;

    try {
      const mailbox = await writeMailboxEntries({
        recipientEmails: [manager.email],
        type: "weekly_team_report",
        title: WEEKLY_REPORT_NOTIFICATION_TITLE,
        body: WEEKLY_REPORT_NOTIFICATION_BODY,
        deepLink: reportDeepLink,
        metadata: buildWeeklyReportMetadata({
          reportId,
          sinceMs,
          untilMs,
          categories,
          topAdvisor,
        }),
      });
      if (mailbox.written > 0) {
        sentManagers += 1;
      }
    } catch (error) {
      console.error(
        `Writing mailbox notification for weekly report failed (${manager.email}):`,
        error
      );
    }

    if (!adminMessaging) continue;

    const tokens = collectPushTokens(manager.merged).slice(0, MAX_TOKENS_PER_USER);
    if (tokens.length === 0) {
      skippedNoToken += 1;
      continue;
    }

    for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_MULTICAST) {
      const chunk = tokens.slice(i, i + MAX_TOKENS_PER_MULTICAST);
      try {
        const multicast = await adminMessaging.sendEachForMulticast({
          tokens: chunk,
          notification: {
            title: WEEKLY_REPORT_NOTIFICATION_TITLE,
            body: WEEKLY_REPORT_NOTIFICATION_BODY,
          },
          data: {
            type: "weekly_team_report",
            deepLink: reportDeepLink,
            reportId,
            periodStart: new Date(sinceMs).toISOString(),
            periodEnd: new Date(untilMs).toISOString(),
            lifeContracts: String(lifeContracts),
            lifeMonthlyPremium: String(Math.round(lifeMonthlyPremium)),
            nonLifeContracts: String(nonLifeContracts),
            nonLifeAnnualPremium: String(Math.round(nonLifeAnnualPremium)),
            topAdvisorName: topAdvisor?.name ?? "",
          },
          webpush: {
            fcmOptions: {
              link: webPushLink,
            },
            notification: {
              icon: "/pwa/icon-192.png",
              badge: "/pwa/icon-192.png",
              tag: reportTag,
              requireInteraction: false,
            },
          },
        });

        sentNotifications += multicast.successCount;
        failedNotifications += multicast.failureCount;

        multicast.responses.forEach((row) => {
          if (row.success) return;
          const code = row.error?.code ?? "";
          if (!INVALID_TOKEN_CODES.has(code)) return;
          console.warn(
            `Weekly team report push token is invalid (${manager.email}): ${code}`
          );
        });
      } catch (error) {
        failedNotifications += chunk.length;
        console.error(
          `Sending weekly report push failed (${manager.email}):`,
          error
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    managersEvaluated,
    sentManagers,
    sentNotifications,
    failedNotifications,
    skippedPushDisabled,
    skippedNoToken,
    targetEmail: targetEmail || null,
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  try {
    return await runWeeklyTeamReport(req);
  } catch (error) {
    console.error("Weekly team report cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se odeslat týdenní report." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
