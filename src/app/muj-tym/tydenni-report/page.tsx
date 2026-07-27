"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CarFront,
  FileCheck2,
  Globe2,
  HeartPulse,
  Home,
  Loader2,
  Plane,
  Sparkles,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";

type WeeklyTeamReportCategoryKey =
  | "life"
  | "auto"
  | "property"
  | "business"
  | "foreigners"
  | "travel";

type WeeklyTeamReportMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};

type WeeklyTeamReport = {
  mailboxId: string;
  reportId: string;
  title: string;
  body: string;
  createdAtMs: number;
  periodStart: string;
  periodEnd: string;
  categories: Record<WeeklyTeamReportCategoryKey, WeeklyTeamReportMetrics>;
  topAdvisor: {
    email: string;
    name: string;
    contracts: number;
    annualPremium: number;
  } | null;
};

type WeeklyTeamReportApiResponse = {
  ok: true;
  report: WeeklyTeamReport | null;
} & Record<string, unknown>;

const CATEGORY_ROWS: Array<{
  key: WeeklyTeamReportCategoryKey;
  title: string;
  premiumLabel: string;
  icon: LucideIcon;
}> = [
  {
    key: "life",
    title: "Životní pojištění",
    premiumLabel: "měsíční pojistné",
    icon: HeartPulse,
  },
  {
    key: "auto",
    title: "Auta",
    premiumLabel: "roční pojistné",
    icon: CarFront,
  },
  {
    key: "property",
    title: "Majetek a odpovědnosti",
    premiumLabel: "roční pojistné",
    icon: Home,
  },
  {
    key: "business",
    title: "Podnikatelé",
    premiumLabel: "roční pojistné",
    icon: BriefcaseBusiness,
  },
  {
    key: "foreigners",
    title: "Cizinci",
    premiumLabel: "roční pojistné",
    icon: Globe2,
  },
  {
    key: "travel",
    title: "Cestovko",
    premiumLabel: "roční pojistné",
    icon: Plane,
  },
];

const emptyMetrics = (): WeeklyTeamReportMetrics => ({
  contracts: 0,
  annualPremium: 0,
  monthlyPremium: 0,
});

const formatMetricMoney = (value: number): string =>
  formatMoneyValue(value, { emptyValueLabel: "0 Kč" });

const formatReportPeriod = (start: string, end: string): string => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Uplynulý týden";
  }

  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
};

const contractLabel = (count: number): string => {
  const normalized = Math.max(0, Math.round(count));
  if (normalized === 1) return "1 smlouva";
  if (normalized >= 2 && normalized <= 4) return `${normalized} smlouvy`;
  return `${normalized} smluv`;
};

const getReportMetric = (
  report: WeeklyTeamReport,
  key: WeeklyTeamReportCategoryKey
): WeeklyTeamReportMetrics => report.categories?.[key] ?? emptyMetrics();

function LoadingState() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#07010a] px-4 text-white">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.42)]">
        <Loader2 className="h-5 w-5 animate-spin text-fuchsia-200" aria-hidden="true" />
        <span className="text-sm font-black uppercase tracking-[0.16em] text-white/76">
          Načítám report
        </span>
      </div>
    </div>
  );
}

export default function WeeklyTeamReportPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [report, setReport] = useState<WeeklyTeamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadReport = async () => {
      setLoading(true);
      setErrorText(null);
      try {
        const params =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams();
        const requestedReportId = params.get("reportId")?.trim() ?? "";
        const query = requestedReportId
          ? `?reportId=${encodeURIComponent(requestedReportId)}`
          : "";
        const payload =
          await fetchAuthedJsonOrThrow<WeeklyTeamReportApiResponse>(
            user,
            `/api/team-overview/weekly-report${query}`
          );
        if (cancelled) return;
        setReport(payload.report ?? null);
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Týdenní report se nepodařilo načíst.";
        setErrorText(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const totals = useMemo(() => {
    if (!report) return { contracts: 0, annualPremium: 0 };
    return CATEGORY_ROWS.reduce(
      (acc, row) => {
        const metrics = getReportMetric(report, row.key);
        acc.contracts += metrics.contracts;
        acc.annualPremium +=
          row.key === "life" ? metrics.monthlyPremium * 12 : metrics.annualPremium;
        return acc;
      },
      { contracts: 0, annualPremium: 0 }
    );
  }, [report]);

  const closeReport = () => {
    router.replace("/posta");
  };

  if (loading || !authReady) {
    return <LoadingState />;
  }

  const periodLabel = report
    ? formatReportPeriod(report.periodStart, report.periodEnd)
    : "Uplynulý týden";

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#07010a] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_5%,rgba(217,70,239,0.34),transparent_30%),radial-gradient(circle_at_78%_0%,rgba(124,58,237,0.22),transparent_28%),linear-gradient(135deg,#040206_0%,#13031b_50%,#020102_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:34px_34px]" />

      <section className="relative z-10 flex min-h-[100dvh] items-center justify-center px-2 py-2 sm:px-6 sm:py-6">
        <div className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-white/14 bg-black shadow-[0_30px_100px_rgba(0,0,0,0.58)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[34px]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-white via-fuchsia-300 to-violet-600 sm:h-1.5" />
          <span className="pointer-events-none absolute -right-28 -top-24 h-60 w-60 rounded-full bg-fuchsia-500/24 blur-3xl" />
          <span className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-violet-700/22 blur-3xl" />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-3 pt-4 sm:px-7 sm:pb-7 sm:pt-8">
            <header className="flex shrink-0 items-start justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200/45 bg-white/[0.06] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.22em]">
                  <Sparkles className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" strokeWidth={2.4} aria-hidden="true" />
                  <span className="truncate">Týdenní report týmu</span>
                </div>
                <h1 className="mt-3 text-[30px] font-black leading-[0.94] tracking-normal text-white sm:mt-4 sm:text-6xl">
                  Shrnutí za týden
                </h1>
                <p className="mt-1.5 text-[13px] font-bold text-white/62 sm:mt-2 sm:text-lg">
                  {periodLabel}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReport}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/16 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:bg-white/[0.14] sm:h-12 sm:w-12"
                aria-label="Zavřít týdenní report"
              >
                <X className="h-[18px] w-[18px] sm:h-6 sm:w-6" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </header>

            {errorText || !report ? (
              <div className="mt-6 rounded-[22px] border border-white/12 bg-white/[0.06] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="text-lg font-black text-white">
                  {errorText ? "Report nejde načíst" : "Report zatím není dostupný"}
                </div>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white/58">
                  {errorText ?? "Pro vybrané období tu není uložený týdenní report."}
                </p>
                <button
                  type="button"
                  onClick={closeReport}
                  className="mt-5 inline-flex items-center justify-center rounded-full border border-white/18 bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-violet-50"
                >
                  Zavřít
                </button>
              </div>
            ) : (
              <>
                <div className="mt-3 grid shrink-0 grid-cols-2 gap-1.5 sm:mt-6 sm:grid-cols-3 sm:gap-3">
                  <div className="rounded-[17px] border border-white/12 bg-white px-3 py-2.5 text-black shadow-[0_16px_44px_rgba(255,255,255,0.12)] sm:rounded-[22px] sm:px-5 sm:py-4">
                    <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 sm:gap-2 sm:text-[10px] sm:tracking-[0.19em]">
                      <FileCheck2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} aria-hidden="true" />
                      Sjednáno
                    </div>
                    <div className="mt-1 text-2xl font-black tracking-normal text-black sm:mt-2 sm:text-4xl">
                      {totals.contracts}
                    </div>
                    <div className="text-xs font-black text-slate-600 sm:text-sm">
                      {contractLabel(totals.contracts).replace(/^\d+\s*/, "")}
                    </div>
                  </div>

                  <div className="rounded-[17px] border border-violet-200/24 bg-violet-500/14 px-3 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_44px_rgba(168,85,247,0.16)] backdrop-blur-md sm:rounded-[22px] sm:px-5 sm:py-4">
                    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-violet-100/72 sm:text-[10px] sm:tracking-[0.19em]">
                      Roční objem
                    </div>
                    <div className="mt-1 text-[24px] font-black leading-none tracking-normal text-white sm:mt-2 sm:text-4xl">
                      {formatMetricMoney(totals.annualPremium)}
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-white/58 sm:text-sm">orientačně</div>
                  </div>

                  <div className="col-span-2 rounded-[17px] border border-white/12 bg-white/[0.06] px-3 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:col-span-1 sm:rounded-[22px] sm:px-5 sm:py-4">
                    <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/50 sm:gap-2 sm:text-[10px] sm:tracking-[0.18em]">
                      <Trophy className="h-3.5 w-3.5 text-fuchsia-200 sm:h-4 sm:w-4" strokeWidth={2.3} aria-hidden="true" />
                      Nejaktivnější
                    </div>
                    <div className="mt-1 truncate text-lg font-black tracking-normal text-white sm:mt-2 sm:text-2xl">
                      {report.topAdvisor?.name ?? "Bez produkce"}
                    </div>
                    <div className="text-xs font-bold text-white/54 sm:text-sm">
                      {report.topAdvisor
                        ? contractLabel(report.topAdvisor.contracts)
                        : "za vybrané období"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 sm:mt-5">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2.5">
                    {CATEGORY_ROWS.map((row) => {
                      const metrics = getReportMetric(report, row.key);
                      const premium =
                        row.key === "life"
                          ? metrics.monthlyPremium
                          : metrics.annualPremium;
                      const Icon = row.icon;

                      return (
                        <article
                          key={row.key}
                          className="group relative overflow-hidden rounded-[17px] border border-white/10 bg-white/[0.055] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:rounded-[22px] sm:px-3 sm:py-3"
                        >
                          <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-fuchsia-300 via-fuchsia-500 to-violet-700 sm:w-1" />
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.10] text-fuchsia-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_30px_rgba(168,85,247,0.18)] sm:h-12 sm:w-12 sm:rounded-2xl">
                              <Icon className="h-[18px] w-[18px] sm:h-6 sm:w-6" strokeWidth={2.15} aria-hidden="true" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <h2 className="text-[15px] font-black leading-tight tracking-normal text-white sm:text-lg">
                                {row.title}
                              </h2>
                              <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/48 sm:mt-1 sm:text-[11px] sm:tracking-[0.16em]">
                                {row.premiumLabel}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-xl font-black leading-none tracking-normal text-white sm:text-2xl">
                                {metrics.contracts}x
                              </div>
                              <div className="mt-0.5 text-xs font-black text-violet-100 sm:mt-1 sm:text-sm">
                                {formatMetricMoney(premium)}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <footer className="mt-3 shrink-0 border-t border-white/10 pt-2.5 sm:mt-5 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:pt-3">
                  <p className="text-[11px] font-semibold leading-relaxed text-white/48 sm:text-xs">
                    Data vychází z produkce podřízených za posledních 7 dní.
                  </p>
                  <button
                    type="button"
                    onClick={closeReport}
                    className="mt-2.5 inline-flex w-full items-center justify-center rounded-full border border-white/18 bg-white px-4 py-2.5 text-xs font-black text-black shadow-[0_16px_38px_rgba(168,85,247,0.22)] transition hover:bg-violet-50 sm:mt-0 sm:w-auto sm:px-5 sm:py-3 sm:text-sm"
                  >
                    Zavřít report
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
