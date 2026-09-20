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
import dynamic from "next/dynamic";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BanknoteArrowDown,
  BarChart3,
  Bike,
  Building2,
  Calculator,
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
  Star,
  LayoutGrid,
  History,
  TrendingUp,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import hubStyles from "./toolHub.module.css";
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
  compareToolHubTools,
  normalizeToolHubUsageMetric,
  type ToolHubToolKey,
  type ToolHubUsageMetric,
} from "./toolHub";
import {
  TOOL_CATALOG,
  toolMatchesSearchQuery,
  type ToolCatalogCategory,
  type ToolCatalogNews,
} from "./toolCatalog";

const InstitutionPortalLinksModal = dynamic(() => import("./InstitutionPortalLinksModal").then(module => module.InstitutionPortalLinksModal));
const ContactsModal = dynamic(() => import("./ContactsModal").then(module => module.ContactsModal));

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

const FILTER_ICONS: Record<FilterKey, LucideIcon> = {
  Všechny: LayoutGrid,
  "Životní pojištění": HeartPulse,
  "Pojištění majetku": Home,
  "Pojištění vozidel": CarFront,
  "Cestovní pojištění": Plane,
  Finance: BarChart3,
  Investice: PiggyBank,
  Obecné: Files,
};

type ToolCollection = "all" | "favorites" | "recent";

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
  "invalidni-duchod": Calculator,
  "srovnavac-trvalych-nasledku": Bike,
  "srovnavac-odpovednosti-obcana": ShieldCheck,
  "srovnavac-pracovni-neschopnosti": HeartPulse,
  "neon-life-vs-metlife-oneguard": ChartNoAxesColumn,
};

type ToolHubUsageResponse = {
  ok?: boolean;
  usage?: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>;
  error?: string;
};

export default function ToolsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Všechny");
  const [searchQuery, setSearchQuery] = useState("");
  const [collection, setCollection] = useState<ToolCollection>("all");
  const [tachometerModalOpen, setTachometerModalOpen] = useState(false);
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [newsToolKey, setNewsToolKey] = useState<ToolHubToolKey | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [usageByKey, setUsageByKey] = useState<
    Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>
  >({});
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
        setUsageError("Oblíbené pomůcky se teď nepodařilo načíst.");
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
      TOOL_CATALOG.filter((entry) => !entry.hiddenFromHub).map((entry) => {
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

  const collectionTools = useMemo(() => tools.filter(tool =>
    collection === "favorites" ? usageByKey[tool.key]?.favorite
      : collection === "recent" ? (usageByKey[tool.key]?.lastOpenedAtMs ?? 0) > 0 : true,
  ), [collection, tools, usageByKey]);
  const favoriteCount = tools.filter(tool => usageByKey[tool.key]?.favorite).length;

  const filterCounts = useMemo(() => {
    const counts = Object.fromEntries(FILTERS.map((filter) => [filter, 0])) as Record<FilterKey, number>;

    collectionTools.forEach((tool) => {
      if (!toolMatchesSearchQuery(tool, searchQuery)) return;
      counts.Všechny += 1;
      counts[tool.category] += 1;
    });

    return counts;
  }, [searchQuery, collectionTools]);

  const filteredTools = useMemo(
    () => {
      const filtered = collectionTools.filter((tool) => {
        const categoryMatch = activeFilter === "Všechny" || tool.category === activeFilter;
        if (!categoryMatch) return false;
        return toolMatchesSearchQuery(tool, searchQuery);
      });

      return filtered.sort((a, b) => collection === "recent"
        ? (usageByKey[b.key]?.lastOpenedAtMs ?? 0) - (usageByKey[a.key]?.lastOpenedAtMs ?? 0)
        : compareToolHubTools(a, b, usageByKey));
    },
    [activeFilter, searchQuery, collectionTools, collection, usageByKey]
  );

  return (
    <AppLayout active="tools">
      <div className={`${toolsFont.className} ${hubStyles.hub} pomucky-tools-root`}>
        <div className={hubStyles.content}>
          <header className={hubStyles.hero}>
            <div className={hubStyles.intro}>
              <span className={hubStyles.eyebrow}><LayoutGrid size={14} aria-hidden="true" /> Tvůj pracovní prostor</span>
              <h1>Pomůcky<span>{tools.length}</span></h1>
              <p>Vše pro klienty, srovnání i každodenní agendu.</p>
            </div>
            <div className={hubStyles.search}>
              <label htmlFor="tools-search">Co dnes potřebuješ vyřešit?</label>
              <div className={hubStyles.searchBox}>
                <Search size={19} aria-hidden="true" />
                <input id="tools-search" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Hledat pomůcku, téma nebo klíčové slovo…" autoComplete="off" />
                {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); document.getElementById("tools-search")?.focus(); }} aria-label="Vymazat hledání"><X size={17} aria-hidden="true" /></button>}
              </div>
            </div>
          </header>

          <div className={hubStyles.navigation}>
            <div className={hubStyles.collections} role="group" aria-label="Výběr pomůcek">
              <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")}><LayoutGrid size={16} aria-hidden="true" /> Všechny pomůcky</button>
              <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")}><Star size={16} aria-hidden="true" /> Oblíbené <small>{favoriteCount}</small></button>
              <button type="button" aria-pressed={collection === "recent"} onClick={() => setCollection("recent")}><History size={16} aria-hidden="true" /> Nedávné</button>
            </div>
            <ToolFilterNavigation
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              options={FILTERS.map((filter) => ({ id: filter, label: FILTER_TAB_LABEL[filter], icon: FILTER_ICONS[filter], count: filterCounts[filter] }))}
            />
          </div>
          <div className={hubStyles.listHeading}>
            <h2 className="tool-card-title">{collection === "favorites" ? "Tvoje oblíbené" : collection === "recent" ? "Nedávno otevřené" : activeFilter === "Všechny" ? "Všechny pomůcky" : activeFilter}</h2>
            <span role="status" aria-live="polite">Zobrazeno {filteredTools.length} z {tools.length}</span>
          </div>

          {usageLoading || usageError ? (
            <p role="status" className={`text-xs font-medium ${usageLoading ? "text-slate-500" : "text-rose-700"}`}>
              {usageLoading ? "Načítám oblíbené pomůcky…" : usageError}
            </p>
          ) : null}

          {filteredTools.length === 0 ? (
            <div className={hubStyles.empty}>
              {collection === "favorites" ? <Star size={28} aria-hidden="true" /> : collection === "recent" ? <History size={28} aria-hidden="true" /> : <Search size={28} aria-hidden="true" />}
              <h2 className="tool-card-title">{collection === "favorites" && !favoriteCount ? "Oblíbené pomůcky na dosah" : collection === "recent" && !collectionTools.length ? "Tady najdeš naposledy otevřené pomůcky" : "Tady jsme žádnou pomůcku nenašli"}</h2>
              <p>{collection === "favorites" && !favoriteCount ? "Označ pomůcku hvězdičkou a příště ji najdeš rovnou tady." : collection === "recent" && !collectionTools.length ? "Otevři některou z pomůcek. Při příští návštěvě na ni snadno navážeš." : "Zkus jiné slovo nebo zruš filtry."}</p>
              <button type="button" onClick={() => { setSearchQuery(""); setActiveFilter("Všechny"); setCollection("all"); }}>Zobrazit všechny pomůcky</button>
            </div>
          ) : (
            <section className={hubStyles.grid} aria-label="Katalog pomůcek">
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
