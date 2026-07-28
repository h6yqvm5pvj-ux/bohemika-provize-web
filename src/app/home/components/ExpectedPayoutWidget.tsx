"use client";

import { useEffect, useMemo, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

import {
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  calculateNetCashflow,
  calculateStornoFund,
  groupItemsByMonth,
  statementMonthKey,
} from "@/app/cashflow/helpers";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { useCashflowData } from "@/app/cashflow/useCashflowData";
import type { AppLanguage } from "@/lib/appLanguage";
import { ExpectedPayoutSection } from "./ExpectedPayoutSection";

type Props = {
  language: AppLanguage;
  user: FirebaseUser;
  advisorDataEmail: string | null;
  homeReloadKey: number;
  periodLabel: string;
  isLiteUI: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

export function ExpectedPayoutWidget({
  language,
  user,
  advisorDataEmail,
  homeReloadKey,
  periodLabel,
  isLiteUI,
  onLoadingChange,
}: Props) {
  const { loading: cashflowLoading, cashflowItems } = useCashflowData({
    userEmail: advisorDataEmail,
    scopeFilter: "combined",
    productFilter: "all",
    enabled: Boolean(advisorDataEmail),
    reloadKey: homeReloadKey,
  });
  const [commissionStatements, setCommissionStatements] = useState<
    CashflowCommissionStatementSummary[]
  >([]);
  const [commissionStatementsLoading, setCommissionStatementsLoading] =
    useState(false);
  const [commissionStatementsReady, setCommissionStatementsReady] =
    useState(false);

  useEffect(() => {
    if (!advisorDataEmail) {
      setCommissionStatements([]);
      setCommissionStatementsLoading(false);
      setCommissionStatementsReady(false);
      return;
    }

    let cancelled = false;

    const loadStatements = async () => {
      setCommissionStatementsLoading(true);
      setCommissionStatementsReady(false);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/commission-statements?limit=240", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              items?: CashflowCommissionStatementSummary[];
              error?: string;
            }
          | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }
        if (!cancelled) setCommissionStatements(payload.items);
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "Domovská stránka: provizní výpisy pro očekávanou výplatu se nepodařilo načíst.",
          error
        );
        setCommissionStatements([]);
      } finally {
        if (!cancelled) {
          setCommissionStatementsLoading(false);
          setCommissionStatementsReady(true);
        }
      }
    };

    void loadStatements();

    return () => {
      cancelled = true;
    };
  }, [advisorDataEmail, homeReloadKey, user]);

  const expectedPayoutStatementsByMonthKey = useMemo(() => {
    const map: Record<string, CashflowCommissionStatementSummary[]> = {};
    commissionStatements.forEach((statement) => {
      const key = statementMonthKey(statement);
      if (!key) return;
      map[key] = [...(map[key] ?? []), statement];
    });
    return map;
  }, [commissionStatements]);

  const expectedPayout = useMemo(() => {
    const dateNow = new Date();
    const currentYear = dateNow.getFullYear();
    const currentMonth = dateNow.getMonth();
    const currentMonthKey = `${currentYear}-${currentMonth + 1}`;
    const reconciledItems = applyStatementMissingPayoutShifts({
      cashflowItems,
      statementsByMonthKey: expectedPayoutStatementsByMonthKey,
      enabled: true,
    });
    const monthGroups = applyStatementPayoutTotalsToMonths({
      monthGroups: groupItemsByMonth(reconciledItems),
      statementsByMonthKey: expectedPayoutStatementsByMonthKey,
      enabled: true,
    });
    const currentMonthGroup = monthGroups.find(
      (month) => month.key === currentMonthKey
    );

    if (!currentMonthGroup) {
      return {
        grossAmount: 0,
        stornoFundAmount: 0,
        netAmount: 0,
      };
    }

    const grossAmount = currentMonthGroup.total;
    if (currentMonthGroup.totalSource === "paid") {
      return {
        grossAmount,
        stornoFundAmount: 0,
        netAmount: grossAmount,
      };
    }

    const currentMonthItems = currentMonthGroup.items;
    const stornoFundAmount = calculateStornoFund(currentMonthItems);
    const netAmount = calculateNetCashflow(grossAmount, stornoFundAmount);
    return {
      grossAmount,
      stornoFundAmount,
      netAmount,
    };
  }, [cashflowItems, expectedPayoutStatementsByMonthKey]);

  const loading =
    cashflowLoading ||
    commissionStatementsLoading ||
    (Boolean(advisorDataEmail) && !commissionStatementsReady);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    return () => {
      onLoadingChange?.(false);
    };
  }, [onLoadingChange]);

  return (
    <ExpectedPayoutSection
      language={language}
      loading={loading}
      grossAmount={expectedPayout.grossAmount}
      stornoFundAmount={expectedPayout.stornoFundAmount}
      netAmount={expectedPayout.netAmount}
      periodLabel={periodLabel}
      isLiteUI={isLiteUI}
    />
  );
}
