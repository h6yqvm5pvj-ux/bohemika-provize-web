"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Space_Grotesk } from "next/font/google";
import { FileText, X } from "lucide-react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "../firebase";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import {
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  filterItemsByContractNumber,
  filterPastItems,
  filterPastStatementMonths,
  groupItemsByMonth,
  groupMonthsByYear,
  normalizeContractNumberSearch,
} from "./helpers";
import type {
  CashflowCommissionStatementDetail,
  CashflowCommissionStatementSummary,
  CashflowItem,
  MonthGroup,
  ProductFilter,
  ScopeFilter,
} from "./types";
import { useCashflowData } from "./useCashflowData";
import { CashflowAccordion } from "./components/CashflowAccordion";
import { CashflowFilters } from "./components/CashflowFilters";
import { CashflowHeader } from "./components/CashflowHeader";
import { CashflowMonthModal } from "./components/CashflowMonthModal";
import introStyles from "./cashflowIntro.module.css";

const cashflowFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type AccountType = "advisor" | "tipster";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveEffectiveDataEmail = (
  user: FirebaseUser | null,
  profile?: Record<string, unknown> | null
): string | null => {
  const profileEmail = normalizeEmail(profile?.email);
  if (profileEmail) return profileEmail;
  const impersonatedEmail = readAdminImpersonationState()?.email;
  if (impersonatedEmail) return impersonatedEmail;
  const userEmail = normalizeEmail(user?.email);
  return userEmail || null;
};

const resolveAccountType = (profile: Record<string, unknown> | null | undefined): AccountType => {
  const raw =
    typeof profile?.accountType === "string"
      ? profile.accountType
      : typeof profile?.userRole === "string"
        ? profile.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

function introDelay(delayMs: number): CSSProperties {
  return {
    ["--cf-delay" as string]: `${delayMs}ms`,
  };
}

const statementMonthKey = (statement: CashflowCommissionStatementSummary): string | null => {
  if (statement.payoutMonthKey) return statement.payoutMonthKey;

  const sourceMs =
    statement.statementDateMs ??
    (statement.periodEndMs != null
      ? Date.UTC(
          new Date(statement.periodEndMs).getUTCFullYear(),
          new Date(statement.periodEndMs).getUTCMonth() + 1,
          1
        )
      : statement.periodStartMs);
  if (sourceMs == null) return null;

  const date = new Date(sourceMs);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
};

const statementDisplayTitle = (statement: CashflowCommissionStatementSummary): string => {
  if (statement.statementNumber) return `Provizní výpis ${statement.statementNumber}`;
  return statement.fileName || "Provizní výpis";
};

const buildInteractiveStatementHtml = (html: string): string => {
  const previewStyle = `<style>
html {
  background: #ffffff !important;
}
body {
  width: 715px !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  box-sizing: border-box !important;
  background: #ffffff !important;
}
body > table.vypis_table {
  margin: 0 auto !important;
}
a[href^="javascript:toggleLayer"] {
  cursor: pointer;
}
</style>`;
  const toggleScript = `<script>
(function () {
  window.toggleLayer = function (whichLayer) {
    var elem = document.getElementById(whichLayer);
    if (!elem) return false;
    var currentDisplay = elem.style.display || window.getComputedStyle(elem).display;
    elem.style.display = currentDisplay === "none" ? "block" : "none";
    return false;
  };

  document.addEventListener("click", function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest("a[href^='javascript:toggleLayer']") : null;
    if (!link) return;

    var href = link.getAttribute("href") || "";
    var match = href.match(/toggleLayer\\((?:'|")?([^'")]+)(?:'|")?\\)/);
    if (!match || !match[1]) return;

    event.preventDefault();
    window.toggleLayer(match[1]);
  });
})();
</script>`;
  const htmlWithStyle = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${previewStyle}</head>`)
    : `${previewStyle}${html}`;

  if (/<\/body>/i.test(htmlWithStyle)) {
    return htmlWithStyle.replace(/<\/body>/i, `${toggleScript}</body>`);
  }
  return `${htmlWithStyle}${toggleScript}`;
};

function CommissionStatementPreviewModal({
  statement,
  onClose,
}: {
  statement: CashflowCommissionStatementDetail | null;
  onClose: () => void;
}) {
  if (!statement) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#08030f]/78 px-4 py-6 backdrop-blur-[7px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-[min(980px,96vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 text-slate-950 shadow-[0_38px_92px_rgba(2,6,23,0.38)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <FileText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Provizní výpis
            </div>
            <h3 className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">
              {statementDisplayTitle(statement)}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {statement.period ?? "Období nezjištěno"}
              {statement.statementDate ? ` · vystaveno ${statement.statementDate}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
            aria-label="Zavřít náhled provizního výpisu"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 px-3 py-4 sm:px-5">
          <iframe
            title={statementDisplayTitle(statement)}
            srcDoc={buildInteractiveStatementHtml(statement.html)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="mx-auto block h-[min(76vh,940px)] w-[840px] max-w-full rounded-xl border border-slate-300 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.16)]"
          />
        </div>
      </div>
    </div>
  );
}

export default function CashflowPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [hasInternalProfile, setHasInternalProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [dataEmail, setDataEmail] = useState<string | null>(null);
  const [showPastYears, setShowPastYears] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthGroup | null>(null);
  const [commissionStatements, setCommissionStatements] = useState<CashflowCommissionStatementSummary[]>([]);
  const [statementPreview, setStatementPreview] = useState<CashflowCommissionStatementDetail | null>(null);
  const [statementPreviewLoadingId, setStatementPreviewLoadingId] = useState<string | null>(null);
  const [statementPreviewError, setStatementPreviewError] = useState<string | null>(null);

  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("combined");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [contractNumberQuery, setContractNumberQuery] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setDataEmail(null);
        setProfileReady(true);
        setHasInternalProfile(false);
        setProfileLoadError(null);
        setAccountType("advisor");
        return;
      }
      setProfileReady(false);
      setHasInternalProfile(null);
      setProfileLoadError(null);
      setUser(firebaseUser);
      setDataEmail(resolveEffectiveDataEmail(firebaseUser));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadProfile = (force = false) => {
      setProfileReady(false);
      setProfileLoadError(null);

      void getUserProfileCached(user, { force })
        .then((payload) => {
          if (cancelled) return;
          const nextHasProfile = payload.hasProfile === true;
          setHasInternalProfile(nextHasProfile);
          setAccountType(nextHasProfile ? resolveAccountType(payload.profile) : "advisor");
          setDataEmail(resolveEffectiveDataEmail(user, payload.profile ?? null));
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn("Cashflow: profil uživatele se nepodařilo načíst.", error);
          setHasInternalProfile(false);
          setAccountType("advisor");
          setDataEmail(resolveEffectiveDataEmail(user));
          setProfileLoadError("Nepodařilo se načíst profil uživatele.");
        })
        .finally(() => {
          if (!cancelled) setProfileReady(true);
        });
    };

    loadProfile();

    const onRefreshProfile = () => {
      loadProfile(true);
    };
    window.addEventListener("app:refresh-user-profile", onRefreshProfile);

    return () => {
      cancelled = true;
      window.removeEventListener("app:refresh-user-profile", onRefreshProfile);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCommissionStatements([]);
      setStatementPreview(null);
      setStatementPreviewError(null);
      return;
    }

    let cancelled = false;

    const loadStatements = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/commission-statements?limit=240", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; items?: CashflowCommissionStatementSummary[]; error?: string }
          | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }
        if (!cancelled) {
          setCommissionStatements(payload.items);
          setStatementPreviewError(null);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Cashflow: uložené provizní výpisy se nepodařilo načíst.", error);
        setCommissionStatements([]);
        setStatementPreviewError(
          error instanceof Error ? error.message : "Provizní výpisy se nepodařilo načíst."
        );
      }
    };

    void loadStatements();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isTipsterMode = accountType === "tipster";

  const { loading, cashflowItems, hasTeam } = useCashflowData({
    userEmail: dataEmail,
    scopeFilter,
    productFilter,
    tipsterMode: isTipsterMode,
    enabled: profileReady && Boolean(dataEmail) && hasInternalProfile === true,
  });

  const contractNumberSearchActive = useMemo(
    () => normalizeContractNumberSearch(contractNumberQuery).length > 0,
    [contractNumberQuery]
  );

  const useStatementPayoutTotals =
    !isTipsterMode &&
    !contractNumberSearchActive &&
    scopeFilter === "combined" &&
    productFilter === "all";

  // Výpisy musí posouvat nevyplacené položky ještě před filtrem minulosti,
  // jinak by starší nevyplacená provize zmizela místo přesunu dopředu.
  const cashflowItemsForReconciliation = useMemo(
    () =>
      useStatementPayoutTotals || contractNumberSearchActive
        ? cashflowItems
        : filterPastItems(cashflowItems, showPastYears),
    [cashflowItems, contractNumberSearchActive, showPastYears, useStatementPayoutTotals]
  );

  const filteredCashflowItems = useMemo(
    () => filterItemsByContractNumber(cashflowItemsForReconciliation, contractNumberQuery),
    [cashflowItemsForReconciliation, contractNumberQuery]
  );

  const contractSearchStats = useMemo(() => {
    if (!contractNumberSearchActive) {
      return { itemCount: 0, contractCount: 0, summary: null };
    }

    const contracts = new Map<string, CashflowItem>();
    filteredCashflowItems.forEach((item) => {
      const normalized = normalizeContractNumberSearch(item.contractNumber);
      if (normalized && !contracts.has(normalized)) {
        contracts.set(normalized, item);
      }
    });
    const summaryItem = contracts.size === 1 ? Array.from(contracts.values())[0] : null;

    return {
      itemCount: filteredCashflowItems.length,
      contractCount: contracts.size,
      summary: summaryItem
        ? {
            productKey: summaryItem.productKey,
            clientName: summaryItem.clientName ?? null,
            inputAmount: summaryItem.inputAmount ?? null,
            frequency: summaryItem.frequency ?? null,
            contractStatus: summaryItem.contractStatus ?? null,
          }
        : null,
    };
  }, [contractNumberSearchActive, filteredCashflowItems]);

  const statementsByMonthKey = useMemo(() => {
    const map: Record<string, CashflowCommissionStatementSummary[]> = {};
    commissionStatements.forEach((statement) => {
      const key = statementMonthKey(statement);
      if (!key) return;
      map[key] = [...(map[key] ?? []), statement];
    });
    Object.values(map).forEach((items) => {
      items.sort((a, b) => {
        const aDate = a.statementDate ?? a.fileName;
        const bDate = b.statementDate ?? b.fileName;
        return aDate.localeCompare(bDate, "cs");
      });
    });
    return map;
  }, [commissionStatements]);

  const periodStatementsByMonthKey = useMemo(
    () =>
      contractNumberSearchActive
        ? statementsByMonthKey
        : filterPastStatementMonths(statementsByMonthKey, showPastYears),
    [contractNumberSearchActive, showPastYears, statementsByMonthKey]
  );

  const reconciledCashflowItems = useMemo(
    () =>
      applyStatementMissingPayoutShifts({
        cashflowItems: filteredCashflowItems,
        statementsByMonthKey,
        enabled: useStatementPayoutTotals,
      }),
    [filteredCashflowItems, statementsByMonthKey, useStatementPayoutTotals]
  );

  const periodCashflowItems = useMemo(
    () =>
      contractNumberSearchActive
        ? reconciledCashflowItems
        : filterPastItems(reconciledCashflowItems, showPastYears),
    [contractNumberSearchActive, reconciledCashflowItems, showPastYears]
  );

  const predictedMonthGroups = useMemo(
    () => groupItemsByMonth(periodCashflowItems),
    [periodCashflowItems]
  );

  const monthGroups = useMemo(
    () =>
      applyStatementPayoutTotalsToMonths({
        monthGroups: predictedMonthGroups,
        statementsByMonthKey: periodStatementsByMonthKey,
        enabled: useStatementPayoutTotals,
      }),
    [predictedMonthGroups, periodStatementsByMonthKey, useStatementPayoutTotals]
  );

  const yearGroups = useMemo(() => groupMonthsByYear(monthGroups), [monthGroups]);

  const selectedMonthForDisplay = useMemo(() => {
    if (!selectedMonth) return null;
    return monthGroups.find((month) => month.key === selectedMonth.key) ?? selectedMonth;
  }, [monthGroups, selectedMonth]);

  const selectedMonthStatements = useMemo(
    () =>
      selectedMonthForDisplay
        ? periodStatementsByMonthKey[selectedMonthForDisplay.key] ?? []
        : [],
    [selectedMonthForDisplay, periodStatementsByMonthKey]
  );

  const displayedExpandedYears = useMemo(() => {
    if (!contractNumberSearchActive) return expandedYears;

    const next = { ...expandedYears };
    yearGroups.forEach((yearGroup) => {
      if (next[yearGroup.year] !== false) {
        next[yearGroup.year] = true;
      }
    });
    return next;
  }, [contractNumberSearchActive, expandedYears, yearGroups]);

  const totalCashflow = useMemo(
    () => monthGroups.reduce((sum, month) => sum + month.total, 0),
    [monthGroups]
  );
  const hasPaidMonthTotals = useMemo(
    () => monthGroups.some((month) => month.totalSource === "paid"),
    [monthGroups]
  );

  const toggleYear = (year: number) => {
    setExpandedYears((previous) => {
      const isCurrentlyOpen =
        contractNumberSearchActive && previous[year] !== false
          ? true
          : Boolean(previous[year]);

      return {
        ...previous,
        [year]: !isCurrentlyOpen,
      };
    });
  };

  const openStatementPreview = async (statement: CashflowCommissionStatementSummary) => {
    if (!user) return;

    setStatementPreviewError(null);
    setStatementPreviewLoadingId(statement.id);

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/commission-statements?id=${encodeURIComponent(statement.id)}&includeHtml=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; item?: CashflowCommissionStatementDetail; error?: string }
        | null;
      if (!response.ok || payload?.ok !== true || !payload.item?.html) {
        throw new Error(payload?.error || "Provizní výpis se nepodařilo otevřít.");
      }
      setStatementPreview(payload.item);
    } catch (error) {
      console.warn("Cashflow: náhled provizního výpisu se nepodařilo otevřít.", error);
      setStatementPreviewError(
        error instanceof Error ? error.message : "Provizní výpis se nepodařilo otevřít."
      );
    } finally {
      setStatementPreviewLoadingId(null);
    }
  };

  return (
    <AppLayout active="cashflow">
      <div className={`${cashflowFont.className} ${introStyles.pageEnter} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="relative z-10 mx-auto w-full max-w-7xl space-y-5 px-3 sm:px-4 lg:px-6">
          <div className={introStyles.heroReveal} style={introDelay(40)}>
            <CashflowHeader
              totalCashflow={totalCashflow}
              hasPaidMonthTotals={hasPaidMonthTotals}
              showPastYears={showPastYears}
              onTogglePastYears={() => setShowPastYears((value) => !value)}
              tipsterMode={isTipsterMode}
            />
          </div>

          {!isTipsterMode && hasInternalProfile === true && (
            <div className={introStyles.filtersReveal} style={introDelay(170)}>
              <CashflowFilters
                hasTeam={hasTeam}
                scopeFilter={scopeFilter}
                productFilter={productFilter}
                contractNumberQuery={contractNumberQuery}
                contractNumberSearchActive={contractNumberSearchActive}
                contractNumberMatchCount={contractSearchStats.itemCount}
                contractNumberContractCount={contractSearchStats.contractCount}
                contractNumberSummary={contractSearchStats.summary}
                onScopeChange={setScopeFilter}
                onProductChange={setProductFilter}
                onContractNumberChange={setContractNumberQuery}
              />
            </div>
          )}

          <div className={introStyles.bodyReveal} style={introDelay(290)}>
            {loading || !profileReady ? (
              <div className={`${introStyles.loadingShell} rounded-[28px] border border-white/80 px-4 py-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:px-6 sm:py-6`}>
                <span className={introStyles.loadingAuraA} aria-hidden="true" />
                <span className={introStyles.loadingAuraB} aria-hidden="true" />
                <span className={introStyles.loadingSweep} aria-hidden="true" />

                <div className="relative z-10 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center">
                  <div className="space-y-4">
                    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                      Cashflow engine
                    </span>

                    <div className="space-y-1.5">
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">
                        Skládám provize do měsíční mapy…
                      </h3>
                      <p className="text-sm text-slate-600 sm:text-base">
                        Počítám brutto, STORNO fond i čisté cashflow podle tvých filtrů.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <span>Synchronizace</span>
                        <span>probíhá</span>
                      </div>
                      <div className={introStyles.loadingProgress} />
                    </div>
                  </div>

                  <div className="flex justify-center xl:justify-end">
                    <div className={introStyles.loadingEngine} aria-hidden="true">
                      <span className={introStyles.loadingRing} />
                      <span className={`${introStyles.loadingRing} ${introStyles.loadingRingSecondary}`} />
                      <span className={introStyles.loadingCore} />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className={`${introStyles.loadingSkeletonCard} rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.07)]`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Rok
                      </div>
                      <div className="mt-2 h-7 w-24 rounded-lg bg-slate-200/90" />
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-5/6 rounded-full bg-slate-200/85" />
                        <div className="h-3 w-2/3 rounded-full bg-slate-200/85" />
                        <div className="h-3 w-3/4 rounded-full bg-slate-200/85" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : profileLoadError ? (
              <p className="rounded-[24px] border border-rose-100 bg-white/90 px-5 py-4 text-sm text-rose-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                {profileLoadError}
              </p>
            ) : hasInternalProfile === false ? (
              <p className="rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                Nejdřív dokonči nastavení účtu. Cashflow se načte po založení interního profilu.
              </p>
            ) : yearGroups.length === 0 ? (
              <p className="rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                {contractNumberSearchActive
                  ? "Smlouva s tímto číslem není v aktuálním cashflow výběru."
                  : isTipsterMode
                  ? "Zatím nemáš žádné sjednané tipy, ze kterých by šlo cashflow zobrazit."
                  : "Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow spočítat."}
              </p>
            ) : (
              <CashflowAccordion
                yearGroups={yearGroups}
                expandedYears={displayedExpandedYears}
                onToggleYear={toggleYear}
                onSelectMonth={setSelectedMonth}
                tipsterMode={isTipsterMode}
              />
            )}
          </div>

          <aside className="rounded-[24px] border border-amber-200/80 bg-amber-50/90 px-5 py-4 text-sm leading-relaxed text-amber-950 shadow-[0_16px_38px_rgba(146,64,14,0.08)] backdrop-blur-lg">
            <p className="font-semibold">Upozornění k predikci cashflow</p>
            <p className="mt-1">
              Jedná se pouze o predikci na základě data sjednání, počátku a frekvencí
              plateb smluv. Predikce může mít odchylky například z důvodu pozdního
              uhrazení klientem. Za správnost dat si zodpovídá každý uživatel sám.
              Při stornu smlouvy si uživatel musí sám označit smlouvu jako stornovanou.
            </p>
          </aside>
        </div>

        <CashflowMonthModal
          month={selectedMonthForDisplay}
          statements={selectedMonthStatements}
          statementLoadingId={statementPreviewLoadingId}
          onClose={() => setSelectedMonth(null)}
          onOpenStatement={openStatementPreview}
          tipsterMode={isTipsterMode}
        />

        <CommissionStatementPreviewModal
          statement={statementPreview}
          onClose={() => setStatementPreview(null)}
        />

        {statementPreviewError && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-[0_18px_42px_rgba(146,64,14,0.16)]">
            {statementPreviewError}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
