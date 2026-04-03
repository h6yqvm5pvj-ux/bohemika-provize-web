"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "../firebase";
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

export default function CashflowPage() {
  const router = useRouter();
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
        router.push("/login");
        return;
      }
      setUser(firebaseUser);
    });

    return () => unsubscribe();
  }, [router]);

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
      <div className="-mx-3 -my-6 bg-white px-3 py-6 sm:-mx-4 sm:-my-8 sm:px-4 sm:py-8 lg:-mx-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
          <div className="relative w-full">
            <div className="relative space-y-6">
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
                <p className="rounded-2xl border border-slate-900 bg-slate-100 px-4 py-3 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                  Načítám data…
                </p>
              ) : yearGroups.length === 0 ? (
                <p className="rounded-2xl border border-slate-900 bg-slate-100 px-4 py-3 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
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
      </div>
    </AppLayout>
  );
}
