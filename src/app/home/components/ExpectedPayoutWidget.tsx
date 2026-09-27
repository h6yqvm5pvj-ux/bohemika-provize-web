"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

import { calculateExpectedPayout } from "../expectedPayout.client";
import type { ExpectedPayout } from "../expectedPayout";
import { useCalendarMonth } from "../useCalendarMonth";
import { startHomeTiming } from "../homePerformance";
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
type Statements = { key: string; items: CashflowCommissionStatementSummary[]; updatedAt: number; error: string | null };

export function ExpectedPayoutWidget({ language, user, advisorDataEmail, homeReloadKey, periodLabel, isLiteUI, onLoadingChange }: Props) {
  const { loading: cashflowLoading, rawSnapshot, ready: cashflowReady, error: cashflowError, snapshotUpdatedAt } = useCashflowData({
    userEmail: advisorDataEmail, scopeFilter: "combined", productFilter: "all",
    enabled: Boolean(advisorDataEmail), reloadKey: homeReloadKey, snapshotOnly: true,
  });
  const calendarMonth = useCalendarMonth();
  const scope = `${user.uid}|${advisorDataEmail}|${calendarMonth}`;
  const requestKey = `${scope}|${homeReloadKey}`;
  const [statements, setStatements] = useState<Statements | null>(null);
  const timings = useRef<{ key: string; inputs: ReturnType<typeof startHomeTiming>; total: ReturnType<typeof startHomeTiming> } | null>(null);

  useEffect(() => {
    if (!advisorDataEmail) return;
    const timer = { key: requestKey, inputs: startHomeTiming("payoutInputs"), total: startHomeTiming("payout") };
    timings.current = timer;
    const controller = new AbortController();
    const loadStatements = async () => {
      try {
        let token = await user.getIdToken();
        const request = () => fetch("/api/commission-statements?shape=cashflow&limit=240", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        let response = await request();
        if (response.status === 401) {
          token = await user.getIdToken(true);
          if (controller.signal.aborted) return;
          response = await request();
        }
        const payload = await response.json().catch(() => null) as {
          ok?: boolean; hasMore?: boolean; processingComplete?: boolean;
          items?: CashflowCommissionStatementSummary[]; error?: string;
        } | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items) || payload.hasMore !== false || payload.processingComplete !== true) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }
        if (!controller.signal.aborted) setStatements({ key: requestKey, items: payload.items, updatedAt: Date.now(), error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Domovská stránka: provizní výpisy pro očekávanou výplatu se nepodařilo načíst.", error);
        setStatements({ key: requestKey, items: [], updatedAt: 0, error: "Výplatu se nepodařilo načíst úplně. Obnovte prosím stránku." });
      }
    };
    void loadStatements();
    return () => { controller.abort(); timer.inputs("cancelled"); timer.total("cancelled"); };
  }, [advisorDataEmail, requestKey, user]);

  const currentStatements = statements?.key === requestKey ? statements : null;
  const sourceError = currentStatements?.error ?? cashflowError ?? (cashflowReady && !cashflowLoading && !rawSnapshot
    ? "Podklady výplaty se nepodařilo načíst. Obnovte prosím stránku." : null);
  const dataset = useMemo(() => rawSnapshot && cashflowReady && !cashflowLoading && currentStatements && !sourceError
    ? { snapshot: rawSnapshot, statements: currentStatements.items, asOf: new Date(),
      updatedAt: Math.min(snapshotUpdatedAt ?? Date.now(), currentStatements.updatedAt) } : null,
  [rawSnapshot, cashflowReady, cashflowLoading, currentStatements, sourceError, snapshotUpdatedAt]);
  const [calculated, setCalculated] = useState<{ dataset: NonNullable<typeof dataset>; error: string | null } | null>(null);
  const [lastGood, setLastGood] = useState<{ scope: string; value: ExpectedPayout; updatedAt: number } | null>(null);
  useEffect(() => {
    if (!dataset) return;
    const controller = new AbortController();
    const finish = startHomeTiming("payoutCalculation");
    if (timings.current?.key === requestKey) timings.current.inputs("success");
    void calculateExpectedPayout(dataset, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      finish("success");
      setLastGood({ scope, value, updatedAt: dataset.updatedAt });
      setCalculated({ dataset, error: null });
    }).catch(error => {
      if (controller.signal.aborted) return;
      finish("error");
      if (error?.name !== "AbortError") setCalculated({ dataset, error: "Výplatu se nepodařilo spočítat. Obnovte prosím stránku." });
    });
    return () => { controller.abort(); finish("cancelled"); };
  }, [dataset, requestKey, scope]);
  const current = calculated?.dataset === dataset ? calculated : null;
  const good = lastGood?.scope === scope ? lastGood : null;
  const expectedPayout = good?.value ?? { grossAmount: 0, stornoFundAmount: 0, netAmount: 0 };
  const error = sourceError ?? current?.error ?? null;
  const loading = !error && !current;
  useEffect(() => {
    const timer = timings.current;
    if (timer?.key !== requestKey) return;
    if (sourceError) timer.inputs("error");
    if (error) timer.total("error");
    else if (current) timer.total("success");
  }, [requestKey, sourceError, error, current]);
  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);
  useEffect(() => () => { onLoadingChange?.(false); }, [onLoadingChange]);

  return <ExpectedPayoutSection language={language} loading={loading} error={error} updatedAt={good?.updatedAt}
    grossAmount={expectedPayout.grossAmount} stornoFundAmount={expectedPayout.stornoFundAmount} netAmount={expectedPayout.netAmount}
    periodLabel={periodLabel} isLiteUI={isLiteUI} />;
}
