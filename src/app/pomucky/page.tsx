// src/app/pomucky/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BanknoteArrowDown,
  BarChart3,
  Bike,
  Bot,
  Building2,
  CalendarClock,
  CarFront,
  ChartNoAxesColumn,
  Clock3,
  ContactRound,
  Files,
  FileSignature,
  Gauge,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  PenTool,
  PiggyBank,
  RefreshCcw,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { InstitutionPortalLinksModal } from "./InstitutionPortalLinksModal";
import { ContactsModal } from "./ContactsModal";
import { ToolFilterNavigation } from "./ToolFilterNavigation";
import { ToolCard } from "./ToolCard";
import { systemSansFont } from "@/lib/fonts";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/app/lib/adminImpersonation";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import {
  compareToolHubUsage,
  normalizeToolHubUsageMetric,
  type ToolHubSortMode,
  type ToolHubToolKey,
  type ToolHubUsageMetric,
} from "./toolHub";
import {
  TOOL_CATALOG,
  toolMatchesSearchQuery,
  type ToolCatalogCategory,
  type ToolCatalogNews,
} from "./toolCatalog";

const toolsFont = systemSansFont;

const FILTERS = [
  "Všechny",
  "Životní pojištění",
  "Pojištění majetku",
  "Pojištění vozidel",
  "Cestovní pojištění",
  "Finance",
  "Investice",
  "Obecné",
] as const;

type FilterKey = (typeof FILTERS)[number];
type ToolCategory = ToolCatalogCategory;

const FILTER_TAB_LABEL: Record<FilterKey, string> = {
  Všechny: "Všechny",
  "Pojištění majetku": "Majetek",
  "Pojištění vozidel": "Auto",
  "Cestovní pojištění": "Cestovní",
  "Životní pojištění": "Život",
  Finance: "Finance",
  Investice: "Investice",
  Obecné: "Obecné",
};

const CATEGORY_RANK: Record<ToolCategory, number> = {
  "Životní pojištění": 0,
  "Pojištění majetku": 1,
  "Pojištění vozidel": 2,
  "Cestovní pojištění": 3,
  Finance: 4,
  Investice: 5,
  Obecné: 6,
};

type FilterVisual = {
  icon: LucideIcon;
  active: string;
  glow: string;
  inactive: string;
  helper: string;
};

const FILTER_VISUALS: Record<FilterKey, FilterVisual> = {
  Všechny: {
    icon: Sparkles,
    active:
      "border-slate-700 bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] !text-white",
    glow: "shadow-[0_16px_36px_rgba(15,23,42,0.34)]",
    inactive:
      "border-slate-300/90 bg-white/85 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white",
    helper: "Všechny interní pomůcky na jednom místě.",
  },
  "Pojištění majetku": {
    icon: Home,
    active:
      "border-cyan-500 bg-[linear-gradient(135deg,#22d3ee_0%,#0e7490_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(14,116,144,0.32)]",
    inactive:
      "border-cyan-200/90 bg-white/88 text-cyan-800 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/75",
    helper: "Nástroje pro katastr, majetek a kalkulace hodnoty nemovitostí.",
  },
  "Pojištění vozidel": {
    icon: CarFront,
    active:
      "border-blue-500 bg-[linear-gradient(135deg,#60a5fa_0%,#1d4ed8_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(29,78,216,0.34)]",
    inactive:
      "border-blue-200/90 bg-white/88 text-blue-800 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/75",
    helper: "VIN, tachometry i další auto utility.",
  },
  "Životní pojištění": {
    icon: HeartPulse,
    active:
      "border-rose-500 bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(190,24,93,0.34)]",
    inactive:
      "border-rose-200/90 bg-white/88 text-rose-800 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50/75",
    helper: "Invalidita, pracovní neschopnost a srovnání životních produktů.",
  },
  "Cestovní pojištění": {
    icon: Plane,
    active:
      "border-sky-500 bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(3,105,161,0.32)]",
    inactive:
      "border-sky-200/90 bg-white/88 text-sky-800 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/75",
    helper: "Srovnání limitů, připojištění a situací na cestách.",
  },
  Finance: {
    icon: BarChart3,
    active:
      "border-emerald-500 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(4,120,87,0.34)]",
    inactive:
      "border-emerald-200/90 bg-white/88 text-emerald-800 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/75",
    helper: "Statistika, export a plánování výkonu v jednom flow.",
  },
  Investice: {
    icon: TrendingUp,
    active:
      "border-amber-500 bg-[linear-gradient(135deg,#f59e0b_0%,#b45309_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(180,83,9,0.34)]",
    inactive:
      "border-amber-200/90 bg-white/88 text-amber-800 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/75",
    helper: "Kalkulačky a podklady pro investiční schůzky.",
  },
  Obecné: {
    icon: ShieldCheck,
    active:
      "border-indigo-500 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-white",
    glow: "shadow-[0_16px_36px_rgba(67,56,202,0.34)]",
    inactive:
      "border-indigo-200/90 bg-white/88 text-indigo-800 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/75",
    helper: "Školení, argumenty, dokumenty a týmové workflow pomůcky.",
  },
};

const TACHOMETER_UPLOAD_TARGETS = [
  {
    key: "allianz",
    label: "Allianz",
    href: "https://www.allianz.cz/cs_CZ/apps/kilometry-nahrani.html",
    logoPath: "/icons/allianz.png",
    tintClass:
      "bg-[radial-gradient(circle_at_20%_18%,rgba(59,130,246,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(67,56,202,0.2)_0%,transparent_66%)]",
  },
  {
    key: "pillow",
    label: "Pillow",
    href: "https://portal.pillow.cz/nahrat_kilometry/step1",
    logoPath: "/icons/pillow.png",
    tintClass:
      "bg-[radial-gradient(circle_at_22%_20%,rgba(34,197,94,0.22)_0%,transparent_62%),radial-gradient(circle_at_82%_78%,rgba(20,184,166,0.18)_0%,transparent_66%)]",
  },
] as const;

type Tool = {
  key: ToolHubToolKey;
  category: ToolCategory;
  title: string;
  description: string;
  news?: ToolCatalogNews;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
  render?: () => ReactElement;
  onClick?: () => void;
};

const TOOL_ICON_BY_KEY: Record<ToolHubToolKey, LucideIcon> = {
  argumenty: Scale,
  kontakty: ContactRound,
  dokumenty: Files,
  zaznam: FileSignature,
  "vypoved-smlouvy": ScrollText,
  "jak-stiham-vypoved-smlouvy": Clock3,
  "nahrada-smlouvy": RefreshCcw,
  "radar-vyroci": CalendarClock,
  tvorba: PenTool,
  "ai-asistent": Bot,
  "online-vizitka": WalletCards,
  "hypoteka-vlastni-zdroje": PiggyBank,
  statistika: BarChart3,
  "export-produkce": BanknoteArrowDown,
  "plan-produkce": Trophy,
  tipar: HandCoins,
  zlato: Landmark,
  katastr: Home,
  "proklepka-vozidla": ShieldCheck,
  "nahrat-tachometr": Gauge,
  "odkazy-instituce": Landmark,
  ares: Building2,
  "projekce-vykonu": TrendingUp,
  "cestovni-pojisteni-cpp-vs-kooperativa": Plane,
  "nastaveni-zivotniho-pojisteni": HeartPulse,
  "srovnavac-trvalych-nasledku": Bike,
  "srovnavac-pracovni-neschopnosti": HeartPulse,
  "srovnavac-zivotniho-pojisteni": ShieldCheck,
  "neon-life-vs-metlife-oneguard": ChartNoAxesColumn,
};

type ToolHubUsageResponse = {
  ok?: boolean;
  usage?: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>;
  error?: string;
};

const SORT_OPTIONS: Array<{ key: ToolHubSortMode; label: string }> = [
  { key: "personal", label: "Pro mě" },
  { key: "popular", label: "Nejpoužívanější" },
  { key: "alphabetical", label: "A–Z" },
];

export default function ToolsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");
  const [tachometerModalOpen, setTachometerModalOpen] = useState(false);
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [newsToolKey, setNewsToolKey] = useState<ToolHubToolKey | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [usageByKey, setUsageByKey] = useState<
    Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>
  >({});
  const [sortMode, setSortMode] = useState<ToolHubSortMode>("popular");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [favoritePendingKeys, setFavoritePendingKeys] = useState<
    Set<ToolHubToolKey>
  >(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const requestedTool = url.searchParams.get("open");
    if (requestedTool === "nahrat-tachometr") {
      setTachometerModalOpen(true);
    } else if (requestedTool === "odkazy-instituce") {
      setLinksModalOpen(true);
    } else {
      return;
    }

    url.searchParams.delete("open");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useEffect(() => {
    if (!user || !effectiveEmail) {
      setUsageByKey({});
      setUsageLoading(false);
      setUsageError(null);
      return;
    }

    let cancelled = false;
    const scopeEmail = effectiveEmail;
    setUsageByKey({});
    setUsageLoading(true);
    setUsageError(null);

    void fetchAuthedJsonOrThrow<ToolHubUsageResponse>(user, "/api/tool-usage", {
      headers: { [ADMIN_IMPERSONATION_HEADER]: scopeEmail },
    })
      .then((payload) => {
        if (
          cancelled ||
          effectiveUserEmail(auth.currentUser?.email) !== scopeEmail
        ) {
          return;
        }
        const next: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>> = {};
        Object.entries(payload.usage ?? {}).forEach(([key, value]) => {
          next[key as ToolHubToolKey] = normalizeToolHubUsageMetric(value);
        });
        setUsageByKey(next);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Načtení používání pomůcek selhalo:", error);
        setUsageError("Oblíbené a historie se teď nepodařily načíst.");
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveEmail, user]);

  const tools: Tool[] = useMemo(
    () =>
      TOOL_CATALOG.map((entry) => {
        const baseTool: Tool = {
          ...entry,
          icon: TOOL_ICON_BY_KEY[entry.key],
        };

        if (entry.key === "kontakty") {
          return {
            ...baseTool,
            href: undefined,
            onClick: () => setContactsModalOpen(true),
          };
        }
        if (entry.key === "nahrat-tachometr") {
          return {
            ...baseTool,
            href: undefined,
            onClick: () => setTachometerModalOpen(true),
          };
        }
        if (entry.key === "odkazy-instituce") {
          return {
            ...baseTool,
            href: undefined,
            onClick: () => setLinksModalOpen(true),
          };
        }
        return baseTool;
      }),
    [],
  );

  const newsTool = useMemo(
    () => tools.find((tool) => tool.key === newsToolKey) ?? null,
    [newsToolKey, tools],
  );

  useEffect(() => {
    if (!newsToolKey) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNewsToolKey(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [newsToolKey]);

  const recordToolOpen = useCallback(
    (toolKey: ToolHubToolKey) => {
      if (
        !user ||
        !effectiveEmail ||
        effectiveUserEmail(user.email) !== effectiveEmail
      ) {
        return;
      }

      const nowMs = Date.now();
      setUsageByKey((current) => {
        const metric = normalizeToolHubUsageMetric(current[toolKey]);
        return {
          ...current,
          [toolKey]: {
            ...metric,
            personalOpens: metric.personalOpens + 1,
            globalOpens: metric.globalOpens + 1,
            lastOpenedAtMs: nowMs,
          },
        };
      });

      void fetchAuthedJsonOrThrow(user, "/api/tool-usage", {
        method: "POST",
        headers: { [ADMIN_IMPERSONATION_HEADER]: effectiveEmail },
        body: JSON.stringify({ action: "open", toolKey }),
      }).catch((error) => {
        console.warn(`Zápis otevření pomůcky ${toolKey} selhal:`, error);
      });
    },
    [effectiveEmail, user]
  );

  const toggleFavorite = useCallback(
    async (toolKey: ToolHubToolKey) => {
      if (
        !user ||
        !effectiveEmail ||
        favoritePendingKeys.has(toolKey) ||
        effectiveUserEmail(user.email) !== effectiveEmail
      ) {
        return;
      }

      const previous = normalizeToolHubUsageMetric(usageByKey[toolKey]);
      const favorite = !previous.favorite;
      setFavoritePendingKeys((current) => new Set(current).add(toolKey));
      setUsageByKey((current) => ({
        ...current,
        [toolKey]: {
          ...normalizeToolHubUsageMetric(current[toolKey]),
          favorite,
        },
      }));
      setUsageError(null);

      try {
        await fetchAuthedJsonOrThrow(user, "/api/tool-usage", {
          method: "POST",
          headers: { [ADMIN_IMPERSONATION_HEADER]: effectiveEmail },
          body: JSON.stringify({ action: "favorite", toolKey, favorite }),
        });
      } catch (error) {
        console.warn(`Uložení oblíbené pomůcky ${toolKey} selhalo:`, error);
        if (effectiveUserEmail(auth.currentUser?.email) === effectiveEmail) {
          setUsageByKey((current) => ({
            ...current,
            [toolKey]: {
              ...normalizeToolHubUsageMetric(current[toolKey]),
              favorite: previous.favorite,
            },
          }));
          setUsageError("Změnu oblíbených se nepodařilo uložit.");
        }
      } finally {
        setFavoritePendingKeys((current) => {
          const next = new Set(current);
          next.delete(toolKey);
          return next;
        });
      }
    },
    [effectiveEmail, favoritePendingKeys, usageByKey, user]
  );

  const filterCounts = useMemo(() => {
    const counts = Object.fromEntries(FILTERS.map((filter) => [filter, 0])) as Record<FilterKey, number>;

    tools.forEach((tool) => {
      if (!toolMatchesSearchQuery(tool, searchQuery)) return;
      counts.Všechny += 1;
      counts[tool.category] += 1;
    });

    return counts;
  }, [searchQuery, tools]);

  const filteredTools = useMemo(
    () => {
      const filtered = tools.filter((tool) => {
        const categoryMatch = activeFilter === "Všechny" || tool.category === activeFilter;
        if (!categoryMatch) return false;
        return toolMatchesSearchQuery(tool, searchQuery);
      });

      return filtered.sort((a, b) => {
        if (sortMode === "alphabetical") {
          return a.title.localeCompare(b.title, "cs");
        }

        const usageDiff = compareToolHubUsage(
          usageByKey[a.key],
          usageByKey[b.key],
          sortMode,
          sortMode === "personal" && activeFilter === "Všechny"
        );
        if (usageDiff !== 0) return usageDiff;

        if (activeFilter === "Všechny") {
          const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
          if (rankDiff !== 0) return rankDiff;
        }
        return a.title.localeCompare(b.title, "cs");
      });
    },
    [activeFilter, searchQuery, sortMode, tools, usageByKey]
  );

  return (
    <AppLayout active="tools">
      <div className={`${toolsFont.className} pomucky-tools-root relative w-full overflow-visible px-0 pb-8 pt-1 sm:px-3 sm:pb-10 sm:pt-2`}>
        <div className="relative z-10 mx-auto max-w-7xl space-y-4 px-0 sm:space-y-5 sm:px-2 lg:px-3">
          <section className="py-0 sm:py-2">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <h1 className="text-3xl font-bold tracking-[-0.015em] text-slate-900 sm:text-5xl">
                Pomůcky
              </h1>

              <div className="w-full max-w-xl xl:w-[32rem]">
                <label htmlFor="tools-search" className="sr-only">
                  Hledat pomůcky
                </label>
                <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:rounded-2xl sm:shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 sm:left-4 sm:h-5 sm:w-5" />
                  <input
                    id="tools-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Název, kategorie nebo klíčové slovo..."
                    className="h-11 w-full bg-transparent py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-500 sm:h-14 sm:py-3 sm:pl-12 sm:pr-4"
                  />
                </div>
              </div>
            </div>
          </section>

          <ToolFilterNavigation
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            options={FILTERS.map((filter) => ({
              id: filter,
              label: FILTER_TAB_LABEL[filter],
              icon: FILTER_VISUALS[filter].icon,
              count: filterCounts[filter],
            }))}
          />

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200/85 bg-white/90 px-3.5 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)] sm:px-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Řazení katalogu
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {sortMode === "personal"
                  ? activeFilter === "Všechny"
                    ? "Oblíbené pomůcky jsou vždy první, ostatní řadíme podle tvého používání."
                    : "Pořadí vychází z tvého používání pomůcek v této kategorii."
                  : sortMode === "popular"
                    ? "Pomůcky se automaticky řadí od nejpoužívanějších podle celkového počtu otevření."
                    : "Pomůcky jsou seřazené podle názvu."}
              </p>
            </div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              {SORT_OPTIONS.map((option) => {
                const active = option.key === sortMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSortMode(option.key)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:text-sm ${
                      active
                        ? "bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.24)]"
                        : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {usageLoading ? (
              <p className="w-full text-xs font-medium text-slate-500">
                Načítám používání pomůcek…
              </p>
            ) : usageError ? (
              <p className="w-full text-xs font-semibold text-rose-700">
                {usageError}
              </p>
            ) : null}
          </section>

          {filteredTools.length === 0 ? (
            <div className="rounded-[30px] border border-slate-200/80 bg-white/82 px-6 py-10 text-center shadow-[0_20px_58px_rgba(15,23,42,0.1)] backdrop-blur-xl">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.14)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">
                Nic neodpovídá aktuálnímu filtru
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                Pro filtr <strong>{activeFilter}</strong> a zadané hledání se nenašla žádná pomůcka.
              </p>
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Katalog pomůcek">
              {filteredTools.map((tool) => tool.render ? (
                <div key={tool.key}>{tool.render()}</div>
              ) : (
                <ToolCard
                  key={tool.key}
                  tool={tool}
                  favorite={usageByKey[tool.key]?.favorite === true}
                  favoriteDisabled={!user || !effectiveEmail || favoritePendingKeys.has(tool.key)}
                  onToggleFavorite={() => void toggleFavorite(tool.key)}
                  onOpenNews={() => setNewsToolKey(tool.key)}
                  onOpen={() => recordToolOpen(tool.key)}
                />
              ))}
            </section>
          )}
        </div>
      </div>

      {newsTool?.news ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tool-news-title"
          aria-describedby="tool-news-description"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
            onClick={() => setNewsToolKey(null)}
            aria-label="Zavřít dialog"
          />

          <div className="pomucky-modal-panel relative z-10 w-full max-w-lg overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(245,243,255,0.98)_100%)] p-6 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:p-8">
            <span
              className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-300/35 blur-3xl"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setNewsToolKey(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Zavřít"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="relative pr-10">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.1em] ${
                  newsTool.news.kind === "new"
                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                    : "border-cyan-200 bg-cyan-100 text-cyan-800"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {newsTool.news.kind === "new" ? "Nové" : "Aktualizováno"}
              </span>
              <h2
                id="tool-news-title"
                className="mt-4 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl"
              >
                {newsTool.title}
              </h2>
              <p
                id="tool-news-description"
                className="mt-3 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7"
              >
                {newsTool.news.summary}
              </p>
            </div>

            {newsTool.href ? (
              <Link
                href={newsTool.href}
                onClick={() => {
                  recordToolOpen(newsTool.key);
                  setNewsToolKey(null);
                }}
                className="relative mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_100%)] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(124,58,237,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(124,58,237,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
              >
                Otevřít pomůcku
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {tachometerModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Výběr pojišťovny pro nahrání tachometru">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
            onClick={() => setTachometerModalOpen(false)}
            aria-label="Zavřít dialog"
          />

          <div className="pomucky-modal-panel relative z-10 w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.97)_100%)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.38)] sm:p-7">
            <button
              type="button"
              onClick={() => setTachometerModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Zavřít"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="pr-12">
              <p className="pomucky-modal-category text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Pojištění vozidel</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">Nahrát tachometr</h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Vyber pojišťovnu a otevři odkaz pro nahrání aktuálního stavu tachometru.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TACHOMETER_UPLOAD_TARGETS.map((target) => (
                <a
                  key={target.key}
                  href={target.href}
                  target="_blank"
                  rel="noreferrer"
                  className="pomucky-portal-card group relative isolate min-h-[154px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80"
                  onClick={() => setTachometerModalOpen(false)}
                >
                  <Image
                    src={target.logoPath}
                    alt={`Logo ${target.label}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="pointer-events-none object-contain p-4 opacity-[0.18] saturate-0 contrast-125"
                  />
                  <div className={`pomucky-portal-tint pointer-events-none absolute inset-0 ${target.tintClass}`} />

                  <div className="relative flex h-full flex-col justify-between">
                    <h3 className="max-w-[calc(100%-3rem)] text-2xl font-bold tracking-[-0.015em] text-slate-900">
                      {target.label}
                    </h3>

                    <div className="flex justify-end">
                      <span className="pomucky-portal-arrow inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/90 bg-white/90 text-slate-700 transition group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white">
                        <ArrowUpRight className="h-4.5 w-4.5" />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {linksModalOpen && (
        <InstitutionPortalLinksModal onClose={() => setLinksModalOpen(false)} />
      )}
      {contactsModalOpen && (
        <ContactsModal
          user={user}
          onClose={() => setContactsModalOpen(false)}
        />
      )}
    </AppLayout>
  );
}
