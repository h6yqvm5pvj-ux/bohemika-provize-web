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
import type { CashflowItem, ProductFilter, ScopeFilter } from "./types";
import { useCashflowData } from "./useCashflowData";
import { CashflowAccordion } from "./components/CashflowAccordion";
import { CashflowFilters } from "./components/CashflowFilters";
import { CashflowHeader } from "./components/CashflowHeader";
import { CashflowItemModal } from "./components/CashflowItemModal";

export default function CashflowPage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [showPastYears, setShowPastYears] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CashflowItem | null>(null);

  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

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

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((previous) => ({
      ...previous,
      [monthKey]: !previous[monthKey],
    }));
  };

  return (
    <AppLayout active="cashflow">
      <div className="relative w-full max-w-5xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -left-16 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-12 right-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl"
        />
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
            <p className="rounded-2xl border border-white/15 bg-white/6 px-4 py-3 text-sm text-slate-200 backdrop-blur-xl">
              Načítám data…
            </p>
          ) : yearGroups.length === 0 ? (
            <p className="rounded-2xl border border-white/15 bg-white/6 px-4 py-3 text-sm text-slate-200 backdrop-blur-xl">
              Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow spočítat.
            </p>
          ) : (
            <CashflowAccordion
              yearGroups={yearGroups}
              expandedYears={expandedYears}
              expandedMonths={expandedMonths}
              onToggleYear={toggleYear}
              onToggleMonth={toggleMonth}
              onSelectItem={setSelectedItem}
            />
          )}
        </div>
      </div>

      <CashflowItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </AppLayout>
  );
}
