import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_REPORT_RATE_LIMIT = 80;
const WEEKLY_REPORT_RATE_LIMIT_WINDOW_MS = 60_000;
const WEEKLY_REPORT_TYPE = "weekly_team_report";
const WEEKLY_REPORT_CATEGORY_KEYS = [
  "life",
  "auto",
  "property",
  "business",
  "foreigners",
  "travel",
] as const;

type WeeklyReportCategory = (typeof WEEKLY_REPORT_CATEGORY_KEYS)[number];

type WeeklyReportMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
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

const parseReportFromDoc = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
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
      auto: emptyMetrics(),
      property: emptyMetrics(),
      business: emptyMetrics(),
      foreigners: emptyMetrics(),
      travel: emptyMetrics(),
    } as Record<WeeklyReportCategory, WeeklyReportMetrics>
  );

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
    body: normalizeText(data.body),
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

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        report: reports[0] ?? null,
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
