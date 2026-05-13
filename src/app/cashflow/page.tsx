"use client";

import { useEffect, useMemo, useState } from "react";
import { Space_Grotesk } from "next/font/google";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "../firebase";
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

const cashflowFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function CashflowPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
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
        return;
      }
      setUser(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  const { loading, cashflowItems, hasTeam } = useCashflowData({
    userEmail: user?.email,
    scopeFilter,
    productFilter,
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
      <div className={`${cashflowFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
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
          <CashflowHeader
            totalCashflow={totalCashflow}
            showPastYears={showPastYears}
            onTogglePastYears={() => setShowPastYears((value) => !value)}
          />

          <CashflowFilters
            hasTeam={hasTeam}
            scopeFilter={scopeFilter}
            productFilter={productFilter}
            onScopeChange={setScopeFilter}
            onProductChange={setProductFilter}
          />

          {loading ? (
            <div className="rounded-[26px] border border-white/75 bg-white/88 px-4 py-12 shadow-[0_18px_44px_rgba(15,23,42,0.13)] backdrop-blur-xl">
              <div className="flex flex-col items-center justify-center gap-3 text-slate-900">
                <span className="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-900" />
                <p className="text-lg font-semibold">Načítám cashflow…</p>
              </div>
            </div>
          ) : yearGroups.length === 0 ? (
            <p className="rounded-[24px] border border-white/80 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-[0_16px_38px_rgba(15,23,42,0.11)] backdrop-blur-lg">
              Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow spočítat.
            </p>
          ) : (
            <CashflowAccordion
              yearGroups={yearGroups}
              expandedYears={expandedYears}
              onToggleYear={toggleYear}
              onSelectMonth={setSelectedMonth}
            />
          )}
        </div>

        <CashflowMonthModal
          month={selectedMonth}
          onClose={() => setSelectedMonth(null)}
          onSelectItem={(item) => {
            setSelectedMonth(null);
            setSelectedItem(item);
          }}
        />

        <CashflowItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      </div>
    </AppLayout>
  );
}
