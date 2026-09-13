"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { HelpDialog } from "@/components/HelpDialog";
import { auth } from "../firebase";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import {
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  applyIntelligentCashflowPrediction,
  CASHFLOW_FORECAST_YEARS,
  dedupeCashflowCommissionStatements,
  filterItemsByContractNumber,
  filterPastItems,
  filterPastStatementMonths,
  groupItemsByMonth,
  groupMonthsByYear,
  normalizeContractNumberSearch,
  statementMonthKey,
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
import { useCashflowView } from "./useCashflowView";
import type { CashflowViewOptions } from "./buildCashflowView";
import type { CashflowDataset, CashflowOverview } from "./cashflowWorker.types";
import { CashflowAccordion } from "./components/CashflowAccordion";
import { CashflowFilters } from "./components/CashflowFilters";
import { CashflowHeader } from "./components/CashflowHeader";
import { CashflowInitialLoader } from "./components/CashflowInitialLoader";
import { CashflowMonthModal } from "./components/CashflowMonthModal";
import { IntelligentPredictionModal } from "./components/IntelligentPredictionModal";
import { isSubscriptionCashflowOwner } from "./subscriptionCashflow";
import { includeCurrentYear } from "./yearChart";
import introStyles from "./cashflowIntro.module.css";
import { systemSansFont } from "@/lib/fonts";

const cashflowFont = systemSansFont;
const EMPTY_STATEMENTS: CashflowCommissionStatementSummary[] = [];
const EMPTY_SEARCH_STATS = { itemCount: 0, contractCount: 0, summary: null };

type AccountType = "advisor" | "tipster";
type StatementPreviewScope = { identity: string | null };
type StatementPreviewRequest = { controller: AbortController };
type StatementPreviewState = {
  scope: StatementPreviewScope;
  request: StatementPreviewRequest | null;
  statement: CashflowCommissionStatementDetail | null;
  loadingId: string | null;
  error: string | null;
};
const emptyStatementPreview = (identity: string | null): StatementPreviewState => ({
  scope: { identity }, request: null, statement: null, loadingId: null, error: null,
});

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
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [profileReady, setProfileReady] = useState(false);
  const [hasInternalProfile, setHasInternalProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [dataEmail, setDataEmail] = useState<string | null>(null);
  const [showPastYears, setShowPastYears] = useState(false);
  const [intelligentPredictionEnabled, setIntelligentPredictionEnabled] = useState(false);
  const [predictionInfoOpen, setPredictionInfoOpen] = useState(false);
  const [cashflowHelpOpen, setCashflowHelpOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthGroup | null>(null);
  const [loadedCommissionStatements, setCommissionStatements] = useState<CashflowCommissionStatementSummary[]>([]);
  const [statementsDataEmail, setStatementsDataEmail] = useState<string | null>(null);
  const statementScopeEmail = normalizeEmail(effectiveEmail || user?.email);
  const commissionStatements = user && statementsDataEmail === statementScopeEmail
    ? loadedCommissionStatements : EMPTY_STATEMENTS;
  const [selectedMonthIdentity, setSelectedMonthIdentity] = useState<string | null>(null);
  const [monthRequest, setMonthRequest] = useState<{
    view: CashflowOverview; key: string; label: string; month: MonthGroup | null; error: string | null;
  } | null>(null);
  const [statementVerificationEmail, setStatementVerificationEmail] = useState<string | null>(null);
  const statementScopeIdentity = user ? `${user.uid ?? user.email}|${statementScopeEmail}` : null;
  const [statementPreviewState, setStatementPreviewState] = useState(() => emptyStatementPreview(statementScopeIdentity));
  const previewScopeMatches = statementPreviewState.scope.identity === statementScopeIdentity;
  if (!previewScopeMatches) setStatementPreviewState(emptyStatementPreview(statementScopeIdentity));
  const previewScope = statementPreviewState.scope;
  const previewWork = useRef<{ scope: StatementPreviewScope; request: StatementPreviewRequest | null } | null>(null);
  const statementPreview = previewScopeMatches ? statementPreviewState.statement : null;
  const statementPreviewLoadingId = previewScopeMatches ? statementPreviewState.loadingId : null;
  const statementPreviewError = previewScopeMatches ? statementPreviewState.error : null;

  useLayoutEffect(() => {
    const work = { scope: previewScope, request: null as StatementPreviewRequest | null };
    previewWork.current = work;
    return () => {
      work.request?.controller.abort();
      if (previewWork.current === work) previewWork.current = null;
    };
  }, [previewScope]);

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
    const requestScopeEmail = effectiveEmail || effectiveUserEmail(user.email);

    const loadProfile = (force = false) => {
      setProfileReady(false);
      setProfileLoadError(null);

      void getUserProfileCached(user, { force })
        .then((payload) => {
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail
          ) return;
          const nextHasProfile = payload.hasProfile === true;
          setHasInternalProfile(nextHasProfile);
          setAccountType(nextHasProfile ? resolveAccountType(payload.profile) : "advisor");
          setDataEmail(requestScopeEmail || resolveEffectiveDataEmail(user, payload.profile ?? null));
        })
        .catch((error) => {
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail
          ) return;
          console.warn("Cashflow: profil uživatele se nepodařilo načíst.", error);
          setHasInternalProfile(false);
          setAccountType("advisor");
          setDataEmail(requestScopeEmail || resolveEffectiveDataEmail(user));
          setProfileLoadError("Nepodařilo se načíst profil uživatele.");
        })
        .finally(() => {
          if (
            !cancelled &&
            effectiveUserEmail(auth.currentUser?.email) === requestScopeEmail
          ) setProfileReady(true);
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
  }, [effectiveEmail, user]);

  useEffect(() => {
    setStatementVerificationEmail(null);
    setCommissionStatements([]);
    setStatementsDataEmail(null);
    if (!user) {
      return;
    }

    let cancelled = false;
    const requestScopeEmail = effectiveEmail || effectiveUserEmail(user.email);

    const loadStatements = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/commission-statements?shape=cashflow&limit=240", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; items?: CashflowCommissionStatementSummary[]; error?: string; hasMore?: boolean; processingComplete?: boolean }
          | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }
        if (!cancelled) {
          setCommissionStatements(dedupeCashflowCommissionStatements(payload.items));
          setStatementsDataEmail(normalizeEmail(requestScopeEmail));
          setStatementVerificationEmail(
            payload.hasMore === false && payload.processingComplete === true ? requestScopeEmail : null
          );
          setStatementPreviewState(previous => previous.scope === previewScope && !previous.request
            ? { ...previous, error: null } : previous);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Cashflow: uložené provizní výpisy se nepodařilo načíst.", error);
        setCommissionStatements([]);
        setStatementPreviewState(previous => previous.scope === previewScope && !previous.request
          ? { ...previous, error: error instanceof Error ? error.message : "Provizní výpisy se nepodařilo načíst." } : previous);
      }
    };

    void loadStatements();

    return () => {
      cancelled = true;
    };
  }, [user, effectiveEmail, previewScope]);

  const isTipsterMode = accountType === "tipster";
  const canViewSubscriptionCashflow =
    !isTipsterMode && isSubscriptionCashflowOwner(dataEmail);

  useEffect(() => {
    if (!canViewSubscriptionCashflow && productFilter === "subscription") {
      setProductFilter("all");
    }
  }, [canViewSubscriptionCashflow, productFilter]);

  const cashflowDataEnabled =
    profileReady && Boolean(dataEmail) && hasInternalProfile === true;
  const {
    loading,
    ready: cashflowReady,
    rawSnapshot,
    calculationDeferred,
    cashflowItems,
    hasTeam,
    loadingProgress,
    verificationInput,
  } = useCashflowData({
    userEmail: dataEmail,
    scopeFilter,
    productFilter,
    tipsterMode: isTipsterMode,
    enabled: cashflowDataEnabled,
    deferCalculation: process.env.NEXT_PUBLIC_CASHFLOW_WORKER_ENABLED === "1",
  });

  const initialLoadingActive =
    !profileReady || (cashflowDataEnabled && (!cashflowReady || loading));

  const calculationIdentity = user && dataEmail && effectiveEmail
    ? `${user.uid ?? user.email}|${normalizeEmail(effectiveEmail)}|${normalizeEmail(dataEmail)}|${accountType}` : null;
  const calculationDay = new Date().toDateString();
  const workerDataset = useMemo<CashflowDataset | null>(() =>
    calculationDeferred && rawSnapshot && cashflowDataEnabled
      ? { snapshot: rawSnapshot, statements: commissionStatements, asOf: new Date() } : null,
    // A later calendar day must not reuse yesterday's prediction horizon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calculationDeferred, rawSnapshot, cashflowDataEnabled, commissionStatements, calculationDay, calculationIdentity]);
  const workerOptions = useMemo<CashflowViewOptions>(() => ({
    scopeFilter, productFilter, tipsterMode: isTipsterMode, showPastYears,
    intelligentPredictionEnabled, contractNumberQuery,
  }), [scopeFilter, productFilter, isTipsterMode, showPastYears, intelligentPredictionEnabled, contractNumberQuery]);
  const workerView = useCashflowView({
    dataset: workerDataset, options: workerOptions, identity: calculationIdentity,
    enabled: Boolean(calculationDeferred && cashflowDataEnabled),
  });
  const calculating = Boolean(calculationDeferred && workerView.pending);

  useEffect(() => {
    setSelectedMonth(null);
    setSelectedMonthIdentity(null);
    setMonthRequest(null);
  }, [calculationIdentity, rawSnapshot, workerDataset, workerOptions]);

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

  const inlineContractSearchStats = useMemo(() => {
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

  const predictionCashflowItems = useMemo(
    () =>
      applyIntelligentCashflowPrediction({
        cashflowItems: reconciledCashflowItems,
        enabled: intelligentPredictionEnabled && !isTipsterMode,
      }),
    [intelligentPredictionEnabled, isTipsterMode, reconciledCashflowItems]
  );

  const periodCashflowItems = useMemo(
    () =>
      contractNumberSearchActive
        ? predictionCashflowItems
        : filterPastItems(predictionCashflowItems, showPastYears),
    [contractNumberSearchActive, predictionCashflowItems, showPastYears]
  );

  const predictedMonthGroups = useMemo(
    () => groupItemsByMonth(periodCashflowItems),
    [periodCashflowItems]
  );

  const inlineMonthGroups = useMemo(
    () =>
      applyStatementPayoutTotalsToMonths({
        monthGroups: predictedMonthGroups,
        statementsByMonthKey: periodStatementsByMonthKey,
        enabled: useStatementPayoutTotals,
      }),
    [predictedMonthGroups, periodStatementsByMonthKey, useStatementPayoutTotals]
  );

  const monthGroups = useMemo<MonthGroup[]>(() => calculationDeferred
    ? (workerView.overview?.months ?? []).map(month => ({ ...month, items: [] }))
    : inlineMonthGroups, [calculationDeferred, workerView.overview, inlineMonthGroups]);
  const monthItemLabels = useMemo(() => calculationDeferred
    ? Object.fromEntries((workerView.overview?.months ?? []).map(month => [month.key, month.itemCountLabel]))
    : undefined, [calculationDeferred, workerView.overview]);
  const contractSearchStats = calculationDeferred
    ? workerView.overview?.contractSearchStats ?? EMPTY_SEARCH_STATS : inlineContractSearchStats;

  const yearGroups = useMemo(() => includeCurrentYear(groupMonthsByYear(monthGroups)), [monthGroups]);

  useEffect(() => {
    if (
      process.env.NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED !== "1" || !user ||
      loading || !cashflowReady || !verificationInput ||
      statementVerificationEmail !== verificationInput.snapshot.email ||
      verificationInput.snapshot.email !== normalizeEmail(user.email) ||
      verificationInput.snapshot.email !== effectiveUserEmail(user.email)
    ) return;
    try {
      if (sessionStorage.getItem("cashflow_shadow_opt_in") !== "1") return;
    } catch { return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void import("./reportCashflowShadow").then(({ reportCashflowShadow }) =>
        reportCashflowShadow({
          user, ...verificationInput,
          statements: commissionStatements, items: cashflowItems, months: monthGroups,
          options: {
            scopeFilter, productFilter, tipsterMode: isTipsterMode, showPastYears,
            intelligentPredictionEnabled, contractNumberQuery,
          },
          signal: controller.signal,
        })
      ).catch(() => undefined);
    }, 1500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [
    user, effectiveEmail, loading, cashflowReady, verificationInput, statementVerificationEmail,
    commissionStatements, cashflowItems, monthGroups, scopeFilter, productFilter,
    isTipsterMode, showPastYears, intelligentPredictionEnabled, contractNumberQuery,
  ]);

  const selectedMonthForDisplay = useMemo(() => {
    if (!cashflowDataEnabled || !profileReady || selectedMonthIdentity !== calculationIdentity) return null;
    if (calculationDeferred) {
      return monthRequest?.view === workerView.overview ? monthRequest?.month ?? null : null;
    }
    if (!selectedMonth) return null;
    return monthGroups.find((month) => month.key === selectedMonth.key) ?? null;
  }, [cashflowDataEnabled, profileReady, selectedMonthIdentity, calculationIdentity,
    calculationDeferred, monthRequest, workerView.overview, monthGroups, selectedMonth]);

  const activeMonthRequest = cashflowDataEnabled && profileReady && calculationDeferred &&
    monthRequest?.view === workerView.overview && selectedMonthIdentity === calculationIdentity ? monthRequest : null;
  const closeMonth = () => { setSelectedMonth(null); setSelectedMonthIdentity(null); setMonthRequest(null); };
  const selectMonth = (month: MonthGroup) => {
    setSelectedMonthIdentity(calculationIdentity);
    if (!calculationDeferred) { setSelectedMonth(month); return; }
    const view = workerView.overview;
    if (!view || calculating) return;
    setMonthRequest({ view, key: month.key, label: month.label, month: null, error: null });
    void workerView.loadMonth(month.key).then(detail => {
      setMonthRequest(previous => previous?.view === view && previous.key === month.key
        ? { ...previous, month: detail, error: detail ? null : "Detail měsíce již není v aktuálním výběru." } : previous);
    }).catch(error => {
      if (error?.name === "AbortError") return;
      setMonthRequest(previous => previous?.view === view && previous.key === month.key
        ? { ...previous, error: "Detail měsíce se nepodařilo načíst. Zavřete jej a zkuste to znovu." } : previous);
    });
  };

  const selectedMonthStatements = useMemo(
    () =>
      selectedMonthForDisplay
        ? periodStatementsByMonthKey[selectedMonthForDisplay.key] ?? []
        : [],
    [selectedMonthForDisplay, periodStatementsByMonthKey]
  );

  const displayedExpandedYears = useMemo(() => {
    const next = { ...expandedYears };
    if (contractNumberSearchActive) {
      yearGroups.forEach((yearGroup) => {
        if (next[yearGroup.year] !== false) next[yearGroup.year] = true;
      });
    } else {
      const defaultYear = yearGroups.find((group) => group.year >= new Date().getFullYear())?.year
        ?? yearGroups[0]?.year;
      if (defaultYear !== undefined && next[defaultYear] === undefined) next[defaultYear] = true;
    }
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
        previous[year] ?? displayedExpandedYears[year] ?? false;

      return {
        ...previous,
        [year]: !isCurrentlyOpen,
      };
    });
  };

  const openStatementPreview = async (statement: CashflowCommissionStatementSummary) => {
    if (!user || !previewScope.identity || previewWork.current?.scope !== previewScope) return;
    previewWork.current.request?.controller.abort();
    const request: StatementPreviewRequest = { controller: new AbortController() };
    previewWork.current.request = request;
    const isCurrent = () => previewWork.current?.scope === previewScope && previewWork.current.request === request;
    setStatementPreviewState(previous => previous.scope === previewScope
      ? { ...previous, request, statement: null, loadingId: statement.id, error: null } : previous);

    try {
      const token = await user.getIdToken();
      if (!isCurrent()) return;
      const response = await fetch(
        `/api/commission-statements?id=${encodeURIComponent(statement.id)}&includeHtml=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: request.controller.signal,
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; item?: CashflowCommissionStatementDetail; error?: string }
        | null;
      if (!isCurrent()) return;
      if (!response.ok || payload?.ok !== true || !payload.item?.html) {
        throw new Error(payload?.error || "Provizní výpis se nepodařilo otevřít.");
      }
      const item = payload.item;
      setStatementPreviewState(previous => previous.scope === previewScope && previous.request === request
        ? { ...previous, statement: item, loadingId: null, error: null } : previous);
    } catch (error) {
      if (!isCurrent()) return;
      console.warn("Cashflow: náhled provizního výpisu se nepodařilo otevřít.", error);
      setStatementPreviewState(previous => previous.scope === previewScope && previous.request === request
        ? { ...previous, loadingId: null, error: error instanceof Error ? error.message : "Provizní výpis se nepodařilo otevřít." } : previous);
    }
  };
  const closeStatementPreview = () => {
    if (previewWork.current?.scope !== previewScope) return;
    previewWork.current.request?.controller.abort();
    previewWork.current.request = null;
    setStatementPreviewState(previous => previous.scope === previewScope
      ? { ...previous, request: null, statement: null, loadingId: null, error: null } : previous);
  };

  return (
    <AppLayout active="cashflow">
      <div aria-busy={calculating} className={`${cashflowFont.className} ${introStyles.pageEnter} relative w-full overflow-visible px-1 pb-8 pt-1 sm:px-3 sm:pb-10 sm:pt-2`}>
        <div className="relative z-10 mx-auto w-full max-w-7xl space-y-3 px-2 sm:space-y-4 sm:px-4 lg:px-6">
          {initialLoadingActive ? (
            <CashflowInitialLoader
              completing={false}
              tipsterMode={isTipsterMode}
              progress={profileReady ? loadingProgress.percent : 2}
              stageText={
                profileReady ? loadingProgress.label : "Načítám uživatelský profil"
              }
              detailText={profileReady ? loadingProgress.detail : null}
            />
          ) : (
            <>
              <div className={introStyles.heroReveal} style={introDelay(40)}>
                <CashflowHeader
                  totalCashflow={totalCashflow}
                  calculating={calculating}
                  calculationFailed={Boolean(workerView.error)}
                  hasPaidMonthTotals={hasPaidMonthTotals}
                  forecastYears={CASHFLOW_FORECAST_YEARS}
                  intelligentPredictionEnabled={intelligentPredictionEnabled}
                  showPastYears={showPastYears}
                  onTogglePastYears={() => setShowPastYears((value) => !value)}
                  onOpenPredictionInfo={() => setPredictionInfoOpen(true)}
                  onOpenHelp={() => setCashflowHelpOpen(true)}
                  tipsterMode={isTipsterMode}
                />
              </div>

              {!isTipsterMode && hasInternalProfile === true && (
                <div className={introStyles.filtersReveal} style={introDelay(170)}>
                  <CashflowFilters
                    calculating={calculating}
                    calculationFailed={Boolean(workerView.error)}
                    hasTeam={hasTeam}
                    scopeFilter={scopeFilter}
                    productFilter={productFilter}
                    showSubscriptionFilter={canViewSubscriptionCashflow}
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
                {profileLoadError ? (
                  <p className="rounded-[24px] border border-rose-100 bg-white/90 px-5 py-4 text-sm text-rose-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                    {profileLoadError}
                  </p>
                ) : hasInternalProfile === false ? (
                  <p className="rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                    Nejdřív dokonči nastavení účtu. Cashflow se načte po založení interního profilu.
                  </p>
                ) : (
                  <>
                    {calculating && <p role="status" className="mb-4 rounded-2xl bg-white/90 px-5 py-4 text-sm text-slate-600">Aktualizuji přehled…</p>}
                    {workerView.error && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-700">{workerView.error}</p>}
                    {!calculating && !workerView.error && monthGroups.length === 0 && (
                      <p className="mb-4 rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                        {contractNumberSearchActive
                          ? "Smlouva s tímto číslem není v aktuálním cashflow výběru."
                          : isTipsterMode
                          ? "Zatím nemáš žádné sjednané tipy, ze kterých by šlo cashflow zobrazit."
                          : "Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow spočítat."}
                      </p>
                    )}
                    {!calculating && !workerView.error && <CashflowAccordion
                      yearGroups={yearGroups}
                      expandedYears={displayedExpandedYears}
                      onToggleYear={toggleYear}
                      onSelectMonth={selectMonth}
                      monthItemLabels={monthItemLabels}
                      tipsterMode={isTipsterMode}
                    />}
                  </>
                )}
              </div>

              <aside className="rounded-[20px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-950 shadow-[0_12px_28px_rgba(146,64,14,0.08)] backdrop-blur-lg sm:rounded-[24px] sm:px-5 sm:py-4 sm:text-sm sm:shadow-[0_16px_38px_rgba(146,64,14,0.08)]">
                <p className="font-semibold">Upozornění k predikci cashflow</p>
                <p className="mt-1">
                  Jedná se pouze o predikci na základě data sjednání, počátku a frekvencí
                  plateb smluv. Predikce může mít odchylky například z důvodu pozdního
                  uhrazení klientem. Za správnost dat si zodpovídá každý uživatel sám.
                  Při stornu smlouvy si uživatel musí sám označit smlouvu jako stornovanou.
                </p>
              </aside>
            </>
          )}
        </div>

        <CashflowMonthModal
          month={selectedMonthForDisplay}
          loading={Boolean(activeMonthRequest && !activeMonthRequest.month && !activeMonthRequest.error)}
          loadingLabel={activeMonthRequest?.label}
          loadingError={activeMonthRequest?.error}
          statements={selectedMonthStatements}
          statementLoadingId={statementPreviewLoadingId}
          onClose={closeMonth}
          onOpenStatement={openStatementPreview}
          tipsterMode={isTipsterMode}
        />

        <CommissionStatementPreviewModal
          statement={statementPreview}
          onClose={closeStatementPreview}
        />

        <IntelligentPredictionModal
          open={predictionInfoOpen}
          enabled={intelligentPredictionEnabled}
          onClose={() => setPredictionInfoOpen(false)}
          onToggle={() => {
            setIntelligentPredictionEnabled((value) => !value);
            setPredictionInfoOpen(false);
          }}
        />

        <HelpDialog
          isOpen={cashflowHelpOpen}
          onClose={() => setCashflowHelpOpen(false)}
          title="Nápověda k proviznímu kalendáři"
          description="Jak číst očekávané výplaty, filtry a rozdíly proti provizním výpisům."
        >
          <div className="space-y-5 text-sm leading-6 text-slate-700">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-950">
              <p className="font-semibold">Co kalendář ukazuje</p>
              <p className="mt-1">
                Provizní kalendář je predikce očekávaných výplat po měsících a
                letech. Nejde o garantovanou výplatu, ale o přehled podle smluv,
                které jsou uložené v systému.
              </p>
              <p className="mt-2">
                Standardně zobrazuje období od aktuálního měsíce na následujících
                10 let. Historii zobrazíš tlačítkem Předchozí roky.
              </p>
            </div>

            <section>
              <h3 className="text-base font-bold text-slate-950">Odkud se částky berou</h3>
              <p className="mt-1">
                Částky se počítají ze sepsaných smluv, produktu, frekvence platby,
                režimu provize a případných TIPů, náhrad, refreshů nebo změn.
                Když se smlouva upraví, promítne se to i do kalendáře.
              </p>
            </section>

            <section>
              <h3 className="text-base font-bold text-slate-950">Provizní výpisy</h3>
              <p className="mt-1">
                Doporučujeme každý měsíc nahrávat provizní výpisy. Kalendář se
                díky nim průběžně aktualizuje, u daného měsíce ukáže skutečně
                vyplacené provize a očekávané nevyplacené částky může přesunout
                do dalšího měsíce.
              </p>
            </section>

            {!isTipsterMode && (
              <section>
                <h3 className="text-base font-bold text-slate-950">Inteligentní predikce</h3>
                <p className="mt-1">
                  Inteligentní predikce dopočítává budoucí cashflow podle známých
                  pravidel a očekávaného vývoje. Výsledek se může změnit po
                  nahrání provizního výpisu, stornu nebo ruční úpravě smlouvy.
                </p>
              </section>
            )}

            <section>
              <h3 className="text-base font-bold text-slate-950">Filtry a detail</h3>
              <p className="mt-1">
                Filtrem můžeš přepnout vlastní, týmové nebo kombinované cashflow
                a omezit výběr podle typu produktu. Klikni na rok, potom na měsíc
                a uvidíš konkrétní provize, ze kterých se částka skládá.
              </p>
            </section>

            <section>
              <h3 className="text-base font-bold text-slate-950">Když nesedí částka s výpisem</h3>
              <p className="mt-1">
                Rozdíl může vzniknout kvůli stornu, změně, refreshi, náhradě,
                pozdě uhrazené smlouvě, chybějící původní smlouvě nebo rozdílnému
                zpracování na provizním výpisu pojišťovny.
              </p>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
              <h3 className="text-base font-bold">TIP</h3>
              <p className="mt-1">
                Pokud chceš ověřit konkrétní smlouvu, zadej její číslo do filtru.
                Rychle tak najdeš, ve kterých měsících a částkách se ve cashflow
                objevuje.
              </p>
            </section>
          </div>
        </HelpDialog>

        {statementPreviewError && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-[0_18px_42px_rgba(146,64,14,0.16)]">
            {statementPreviewError}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
