"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Space_Grotesk } from "next/font/google";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "../firebase";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import styles from "../pomucky/pomuckyWallArt.module.css";
import {
  filterPastItems,
  groupItemsByMonth,
  groupMonthsByYear,
} from "./helpers";
import type { CashflowItem, MonthGroup, ProductFilter, ScopeFilter } from "./types";
import { useCashflowData } from "./useCashflowData";
import { CashflowAccordion } from "./components/CashflowAccordion";
import { CashflowFilters } from "./components/CashflowFilters";
import { CashflowHeader } from "./components/CashflowHeader";
import { CashflowItemModal } from "./components/CashflowItemModal";
import { CashflowMonthModal } from "./components/CashflowMonthModal";
import introStyles from "./cashflowIntro.module.css";

const cashflowFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type AccountType = "advisor" | "tipster";

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

export default function CashflowPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [showPastYears, setShowPastYears] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CashflowItem | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthGroup | null>(null);

  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("combined");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfileReady(true);
        setAccountType("advisor");
        return;
      }
      setProfileReady(false);
      setUser(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    getUserProfileCached(user)
      .then((payload) => {
        if (cancelled) return;
        setAccountType(resolveAccountType(payload.profile));
      })
      .catch(() => {
        if (cancelled) return;
        setAccountType("advisor");
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isTipsterMode = accountType === "tipster";

  const { loading, cashflowItems, hasTeam } = useCashflowData({
    userEmail: user?.email,
    scopeFilter,
    productFilter,
    tipsterMode: isTipsterMode,
    enabled: profileReady && Boolean(user?.email),
  });

  const filteredCashflowItems = useMemo(
    () => filterPastItems(cashflowItems, showPastYears),
    [cashflowItems, showPastYears]
  );

  const monthGroups = useMemo(
    () => groupItemsByMonth(filteredCashflowItems),
    [filteredCashflowItems]
  );

  const yearGroups = useMemo(() => groupMonthsByYear(monthGroups), [monthGroups]);

  const totalCashflow = useMemo(
    () => filteredCashflowItems.reduce((sum, item) => sum + item.amount, 0),
    [filteredCashflowItems]
  );

  const toggleYear = (year: number) => {
    setExpandedYears((previous) => ({
      ...previous,
      [year]: !previous[year],
    }));
  };

  return (
    <AppLayout active="cashflow">
      <div className={`${cashflowFont.className} ${introStyles.pageEnter} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div
          className="pointer-events-none absolute -inset-y-14 left-0 -right-20 overflow-hidden sm:-right-24 lg:-right-28"
          aria-hidden="true"
        >
          <div className={styles.canvas}>
            <span className={`${styles.orb} ${styles.orbA}`} />
            <span className={`${styles.orb} ${styles.orbB}`} />
            <span className={`${styles.orb} ${styles.orbC}`} />
            <span className={styles.mesh} />
          </div>
          <div className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl space-y-5 px-3 sm:px-4 lg:px-6">
          <div className={introStyles.heroReveal} style={introDelay(40)}>
            <CashflowHeader
              totalCashflow={totalCashflow}
              showPastYears={showPastYears}
              onTogglePastYears={() => setShowPastYears((value) => !value)}
              tipsterMode={isTipsterMode}
            />
          </div>

          {!isTipsterMode && (
            <div className={introStyles.filtersReveal} style={introDelay(170)}>
              <CashflowFilters
                hasTeam={hasTeam}
                scopeFilter={scopeFilter}
                productFilter={productFilter}
                onScopeChange={setScopeFilter}
                onProductChange={setProductFilter}
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
            ) : yearGroups.length === 0 ? (
              <p className="rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
                {isTipsterMode
                  ? "Zatím nemáš žádné sjednané tipy, ze kterých by šlo cashflow zobrazit."
                  : "Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow spočítat."}
              </p>
            ) : (
              <CashflowAccordion
                yearGroups={yearGroups}
                expandedYears={expandedYears}
                onToggleYear={toggleYear}
                onSelectMonth={setSelectedMonth}
                tipsterMode={isTipsterMode}
              />
            )}
          </div>
        </div>

        <CashflowMonthModal
          month={selectedMonth}
          onClose={() => setSelectedMonth(null)}
          onSelectItem={(item) => {
            setSelectedMonth(null);
            setSelectedItem(item);
          }}
          tipsterMode={isTipsterMode}
        />

        <CashflowItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      </div>
    </AppLayout>
  );
}
