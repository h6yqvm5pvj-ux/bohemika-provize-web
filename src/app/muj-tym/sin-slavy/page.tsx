"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Home,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";
import { type Position } from "@/app/types/domain";
import SplitTitle from "@/app/pomucky/plan-produkce/SplitTitle";
import intranetStyles from "@/app/intranet/intranetWallArt.module.css";

type TeamMember = {
  email: string;
  name: string;
};

type SourceCategory =
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

type TeamOverviewContractStats = {
  categoryMetrics?: Partial<Record<SourceCategory, AggregateMetrics>>;
};

type TeamOverviewResponse = {
  ok: true;
  position?: Position | null;
  members?: Array<{
    email?: string | null;
    name?: string | null;
  }>;
  contractCounts?: Record<string, TeamOverviewContractStats | undefined>;
};

type HallCategory = "life" | "auto" | "property" | "gold";

type HallTab = {
  key: HallCategory;
  label: string;
  icon: LucideIcon;
  categories: SourceCategory[];
};

type HallRow = {
  rank: number;
  email: string;
  name: string;
  contracts: number;
  annualPremium: number;
  leaderRatioPct: number;
};

const HALL_TABS: HallTab[] = [
  {
    key: "life",
    label: "Životní pojištění",
    icon: ShieldCheck,
    categories: ["life"],
  },
  {
    key: "auto",
    label: "Auto",
    icon: CarFront,
    categories: ["auto"],
  },
  {
    key: "property",
    label: "Majetek",
    icon: Home,
    categories: ["property", "travel", "foreigners", "other"],
  },
  {
    key: "gold",
    label: "Zlato",
    icon: Sparkles,
    categories: ["comfort"],
  },
];

const ACCENTS = [
  {
    badge: "border-amber-200/80 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-400 text-slate-950",
    chip: "border-amber-200/60 bg-amber-300/12 text-amber-100",
    amount: "text-amber-200",
    glow: "from-amber-400/30 via-amber-200/8 to-transparent",
    progress: "from-amber-300 to-yellow-300",
  },
  {
    badge: "border-sky-100/80 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-slate-900",
    chip: "border-sky-200/60 bg-sky-300/10 text-sky-100",
    amount: "text-sky-200",
    glow: "from-sky-300/24 via-cyan-200/8 to-transparent",
    progress: "from-sky-300 to-cyan-200",
  },
  {
    badge: "border-orange-200/80 bg-gradient-to-br from-orange-200 via-orange-300 to-amber-400 text-slate-950",
    chip: "border-orange-200/60 bg-orange-300/10 text-orange-100",
    amount: "text-orange-200",
    glow: "from-orange-300/24 via-amber-200/8 to-transparent",
    progress: "from-orange-300 to-amber-200",
  },
  {
    badge: "border-white/35 bg-slate-800 text-slate-100",
    chip: "border-white/35 bg-white/14 text-white",
    amount: "text-emerald-200",
    glow: "from-emerald-300/20 via-emerald-200/6 to-transparent",
    progress: "from-emerald-300 to-teal-200",
  },
];

const HALL_TAB_VISUALS: Record<
  HallCategory,
  { chipActive: string; chipGlow: string }
> = {
  life: {
    chipActive:
      "border-rose-500 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(225,29,72,0.35)]",
  },
  auto: {
    chipActive:
      "border-blue-500 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(29,78,216,0.35)]",
  },
  property: {
    chipActive:
      "border-cyan-500 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-white",
    chipGlow: "shadow-[0_16px_36px_rgba(8,145,178,0.3)]",
  },
  gold: {
    chipActive:
      "border-yellow-500 bg-[linear-gradient(135deg,#facc15_0%,#ca8a04_100%)] text-slate-900",
    chipGlow: "shadow-[0_16px_36px_rgba(202,138,4,0.35)]",
  },
};

function isManagerPosition(position?: Position | null): boolean {
  return Boolean(position && position.startsWith("manazer"));
}

function formatMoney(value: number): string {
  return formatMoneyValue(value, { nonPositiveAsEmpty: false });
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function accentForRank(rank: number) {
  if (rank === 1) return ACCENTS[0];
  if (rank === 2) return ACCENTS[1];
  if (rank === 3) return ACCENTS[2];
  return ACCENTS[3];
}

export default function HallOfFamePage() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [contractCounts, setContractCounts] = useState<
    Record<string, TeamOverviewContractStats | undefined>
  >({});
  const [activeCategory, setActiveCategory] = useState<HallCategory>("life");
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);

  const activeTab = useMemo(
    () => HALL_TABS.find((tab) => tab.key === activeCategory) ?? HALL_TABS[0],
    [activeCategory]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const loadHall = async () => {
      if (!authUser) return;
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewResponse>(
          authUser,
          "/api/team-overview"
        );

        const manager = isManagerPosition(payload.position ?? null);
        setIsManager(manager);
        setMembers(
          (payload.members ?? [])
            .map((member) => {
              const email = (member.email ?? "").trim().toLowerCase();
              if (!email) return null;
              const name = (member.name ?? "").trim() || email;
              return { email, name };
            })
            .filter((member): member is TeamMember => Boolean(member))
        );
        setContractCounts(payload.contractCounts ?? {});
      } catch (err) {
        console.error("Načtení síně slávy selhalo:", err);
        setError("Síň slávy se nepodařilo načíst.");
      } finally {
        setLoading(false);
      }
    };

    void loadHall();
  }, [authUser]);

  const rankedRows = useMemo(() => {
    const sourceCategories = activeTab.categories;
    const rows = members
      .map((member) => {
        const stats = contractCounts[member.email];
        const categoryMetrics = stats?.categoryMetrics ?? {};
        let contracts = 0;
        let annualPremium = 0;

        sourceCategories.forEach((category) => {
          const row = categoryMetrics[category];
          contracts += Number.isFinite(row?.contracts) ? Number(row?.contracts ?? 0) : 0;
          annualPremium += Number.isFinite(row?.annualPremium)
            ? Number(row?.annualPremium ?? 0)
            : 0;
        });

        return {
          email: member.email,
          name: member.name,
          contracts,
          annualPremium,
        };
      })
      .filter((row) => row.annualPremium > 0 || row.contracts > 0)
      .sort((a, b) => {
        if (b.annualPremium !== a.annualPremium) return b.annualPremium - a.annualPremium;
        if (b.contracts !== a.contracts) return b.contracts - a.contracts;
        return a.name.localeCompare(b.name, "cs");
      });

    const leaderPremium = rows[0]?.annualPremium ?? 0;
    const base = leaderPremium > 0 ? leaderPremium : 1;

    return rows.map(
      (row, index): HallRow => ({
        rank: index + 1,
        email: row.email,
        name: row.name,
        contracts: row.contracts,
        annualPremium: row.annualPremium,
        leaderRatioPct: Math.max(0, Math.min(100, Math.round((row.annualPremium / base) * 100))),
      })
    );
  }, [activeTab.categories, members, contractCounts]);

  const deckRows = useMemo(() => rankedRows.slice(0, 10), [rankedRows]);
  const safeActiveIndex =
    deckRows.length > 0 ? ((activeDeckIndex % deckRows.length) + deckRows.length) % deckRows.length : 0;
  const activeDeckRow = deckRows[safeActiveIndex] ?? null;

  const overallContracts = useMemo(
    () => rankedRows.reduce((acc, row) => acc + row.contracts, 0),
    [rankedRows]
  );
  const overallPremium = useMemo(
    () => rankedRows.reduce((acc, row) => acc + row.annualPremium, 0),
    [rankedRows]
  );

  const moveDeck = (direction: -1 | 1) => {
    if (deckRows.length <= 1) return;
    setActiveDeckIndex((prev) => (prev + direction + deckRows.length) % deckRows.length);
  };

  return (
    <AppLayout active="team">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <SplitTitle text="Síň slávy" className="!text-slate-900" />
          <Link
            href="/muj-tym"
            className="ui-btn-secondary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          >
            <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
            Zpět na můj tým
          </Link>
        </header>

        {loading ? (
          <div className="ui-card rounded-3xl px-4 py-8 text-center text-sm text-slate-600">
            Načítám síň slávy…
          </div>
        ) : error ? (
          <div className="ui-card rounded-3xl border-rose-300 bg-rose-50 px-4 py-6 text-sm text-rose-700">
            {error}
          </div>
        ) : !isManager ? (
          <div className="ui-card rounded-3xl px-4 py-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full border border-slate-300 bg-slate-100 p-2 text-slate-700">
                <Trophy size={16} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900">Síň slávy je dostupná jen pro manažery.</div>
                <p className="mt-1 text-sm text-slate-600">
                  Nemáš manažerskou pozici, proto tuhle část nevidíš.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="px-1 pb-1">
              <div className="flex items-center gap-2 text-slate-700">
                <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Kategorie síně slávy</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {HALL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeCategory === tab.key;
                  const visual = HALL_TAB_VISUALS[tab.key];
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setActiveCategory(tab.key);
                        setActiveDeckIndex(0);
                      }}
                      className={[
                        intranetStyles.sectionChip,
                        "ui-focus inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition",
                        active
                          ? `${visual.chipActive} ${visual.chipGlow}`
                          : "border-slate-300/90 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className="ui-card relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc_0%,#eef2f7_52%,#eef9f7_100%)] p-4 sm:p-5"
              data-fixed-box-theme="slate"
            >
              <div className="hof-glow pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-amber-300/25 blur-3xl" />
              <div className="hof-glow pointer-events-none absolute -left-16 -bottom-20 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl" />

              <div className="relative z-10 mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Lídr kategorie</div>
                  <div className="mt-1 truncate text-lg font-semibold text-slate-900">
                    {rankedRows[0]?.name ?? "—"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Celkem roční pojistné</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(overallPremium)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Celkem smluv</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{overallContracts}</div>
                </div>
              </div>

              {deckRows.length === 0 ? (
                <div className="relative z-10 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-600">
                  V této kategorii zatím není žádná produkce.
                </div>
              ) : (
                <>
                  {activeDeckRow && (
                    <div className="relative z-10 sm:hidden">
                      <div className="rounded-2xl border border-slate-200/80 bg-white/30 p-2">
                        <article className="relative mx-auto flex min-h-[378px] w-full max-w-[340px] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-4 shadow-[0_24px_52px_rgba(2,6,23,0.38)]">
                          <div
                            className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${
                              accentForRank(activeDeckRow.rank).glow
                            }`}
                          />

                          <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-4">
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={`hof-rank-badge flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold ${
                                  accentForRank(activeDeckRow.rank).badge
                                }`}
                              >
                                {activeDeckRow.rank}
                              </div>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                  accentForRank(activeDeckRow.rank).chip
                                }`}
                              >
                                Top {activeDeckRow.rank}
                              </span>
                            </div>

                            <div>
                              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/7 text-[10px] font-semibold text-slate-200">
                                {getInitials(activeDeckRow.name)}
                              </div>
                              <div className="text-[1.65rem] font-semibold leading-tight tracking-tight text-white">
                                {activeDeckRow.name}
                              </div>
                              <div className="mt-1 text-[11px] text-white/65">{activeTab.label}</div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
                                Roční pojistné
                              </div>
                              <div
                                className={`mt-1 text-2xl font-semibold leading-none ${
                                  accentForRank(activeDeckRow.rank).amount
                                }`}
                              >
                                {formatMoney(activeDeckRow.annualPremium)}
                              </div>
                              <div className="mt-3 flex items-center justify-between text-[11px] text-white/65">
                                <span>Smluv</span>
                                <span>{activeDeckRow.contracts}</span>
                              </div>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${
                                    accentForRank(activeDeckRow.rank).progress
                                  }`}
                                  style={{ width: `${activeDeckRow.leaderRatioPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </article>
                      </div>

                      <div className="mt-3 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => moveDeck(-1)}
                          disabled={deckRows.length <= 1}
                          className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.14)] disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label="Předchozí karta"
                        >
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <span className="text-xs font-semibold tracking-[0.12em] text-slate-500">
                          {safeActiveIndex + 1}/{deckRows.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveDeck(1)}
                          disabled={deckRows.length <= 1}
                          className="ui-focus inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.14)] disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label="Další karta"
                        >
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="relative z-10 hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white/30 px-4 py-6 sm:block">
                    <button
                      type="button"
                      onClick={() => moveDeck(-1)}
                      disabled={deckRows.length <= 1}
                      className="ui-focus absolute left-2 top-1/2 z-40 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-900 shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition hover:-translate-x-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Předchozí karta"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>

                    <div className="relative mx-auto h-[520px] max-w-4xl" style={{ perspective: "1200px" }}>
                      {deckRows.map((row, index) => {
                        const total = deckRows.length;
                        let offset = index - safeActiveIndex;
                        if (offset > total / 2) offset -= total;
                        if (offset < -total / 2) offset += total;
                        const distance = Math.abs(offset);
                        if (distance > 1) return null;

                        const isActive = offset === 0;
                        const accent = accentForRank(row.rank);
                        const translateX = offset * 224;
                        const scale = isActive ? 1 : 0.92;
                        const opacity = isActive ? 1 : 0.92;
                        const zIndex = 30 - distance;

                        return (
                          <article
                            key={row.email}
                            className={[
                              "hof-deck-card group absolute left-1/2 top-1/2 flex h-[410px] w-[286px] cursor-pointer overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-4",
                              isActive
                                ? "hof-deck-card-active shadow-[0_24px_52px_rgba(2,6,23,0.38)]"
                                : "shadow-[0_14px_30px_rgba(2,6,23,0.26)]",
                            ].join(" ")}
                            style={{
                              transform: `translateX(calc(-50% + ${translateX}px)) translateY(-50%) scale(${scale}) rotateY(${offset * -10}deg)`,
                              opacity,
                              zIndex,
                              filter: isActive ? "none" : "saturate(0.92) brightness(0.88)",
                            }}
                            onClick={() => setActiveDeckIndex(index)}
                          >
                            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${accent.glow}`} />

                            <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className={`hof-rank-badge flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold ${accent.badge}`}>
                                  {row.rank}
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accent.chip}`}>
                                  Top {row.rank}
                                </span>
                              </div>

                              <div>
                                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/7 text-[10px] font-semibold text-slate-200">
                                  {getInitials(row.name)}
                                </div>
                                <div className="truncate text-2xl font-semibold tracking-tight text-white">{row.name}</div>
                                <div className="mt-1 text-[11px] text-white/65">{activeTab.label}</div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3">
                                <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">Roční pojistné</div>
                                <div className={`mt-1 text-2xl font-semibold leading-none ${accent.amount}`}>
                                  {formatMoney(row.annualPremium)}
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px] text-white/65">
                                  <span>Smluv</span>
                                  <span>{row.contracts}</span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${accent.progress}`}
                                    style={{ width: `${row.leaderRatioPct}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => moveDeck(1)}
                      disabled={deckRows.length <= 1}
                      className="ui-focus absolute right-2 top-1/2 z-40 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-900 shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition hover:translate-x-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Další karta"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <ol className="relative z-10 mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {deckRows.map((row, index) => {
                      const active = index === safeActiveIndex;
                      const accent = accentForRank(row.rank);
                      return (
                        <li key={`hall-pill-${row.email}`} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveDeckIndex(index)}
                            className={[
                              "ui-focus flex w-[160px] items-center gap-2 rounded-xl border px-3 py-2 text-left transition sm:w-[182px]",
                              active
                                ? "border-slate-900 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                                : "border-slate-200 bg-white/80 text-slate-900 hover:border-slate-300 hover:bg-white",
                            ].join(" ")}
                          >
                            <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${active ? accent.badge : "border-slate-200 bg-slate-100 text-slate-700"}`}>
                              {row.rank}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold">{row.name}</span>
                              <span className={active ? `block text-sm font-semibold ${accent.amount}` : "block text-sm font-semibold text-slate-700"}>
                                {formatMoney(row.annualPremium)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes hallGlow {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.68;
          }
          50% {
            transform: scale(1.09);
            opacity: 0.9;
          }
        }

        @keyframes hallFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        .hof-glow {
          animation: hallGlow 8s ease-in-out infinite;
        }

        .hof-deck-card {
          transition: transform 460ms cubic-bezier(0.2, 0.65, 0.2, 1),
            opacity 320ms ease, filter 320ms ease;
        }

        .hof-deck-card-active .hof-rank-badge {
          animation: hallFloat 3.2s ease-in-out infinite;
        }

        :global([data-motion="off"]) .hof-glow,
        :global([data-motion="off"]) .hof-rank-badge {
          animation: none !important;
        }

        :global([data-motion="off"]) .hof-deck-card {
          transition: none !important;
        }
      `}</style>
    </AppLayout>
  );
}
