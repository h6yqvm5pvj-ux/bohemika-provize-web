"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { User as FirebaseUser } from "firebase/auth";

import type { ExpectedPayout } from "../expectedPayout";
import { useCalendarMonth } from "../useCalendarMonth";
import { startHomeTiming } from "../homePerformance";
import { auth } from "@/app/firebase";
import { ADMIN_IMPERSONATION_HEADER, readAdminImpersonationState } from "@/app/lib/adminImpersonation";
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
type PayoutResponse = { ok?: unknown; code?: unknown; payout?: ExpectedPayout; updatedAt?: number; monthKey?: string };
const PAYOUT_ERROR = "Výplatu se nepodařilo načíst úplně. Obnovte prosím stránku.";
const ExpectedPayoutFallback = dynamic(
  () => import("./ExpectedPayoutFallback").then(module => module.ExpectedPayoutFallback),
  { ssr: false, loading: () => <ExpectedPayoutSection language="cs" loading grossAmount={0} stornoFundAmount={0}
    netAmount={0} periodLabel="" isLiteUI /> }
);

function hasCompletePayout(payload: PayoutResponse | null, monthKey: string): payload is PayoutResponse & {
  payout: ExpectedPayout; updatedAt: number;
} {
  return payload?.ok === true && payload.monthKey === monthKey &&
    typeof payload.updatedAt === "number" && Number.isFinite(payload.updatedAt) && payload.updatedAt > 0 &&
    !!payload.payout && [payload.payout.grossAmount, payload.payout.stornoFundAmount, payload.payout.netAmount]
      .every(amount => typeof amount === "number" && Number.isFinite(amount));
}

export function ExpectedPayoutWidget({ language, user, advisorDataEmail, homeReloadKey, periodLabel, isLiteUI, onLoadingChange }: Props) {
  const calendarMonth = useCalendarMonth();
  const [year, monthIndex] = calendarMonth.split("-");
  const monthKey = `${year}-${Number(monthIndex) + 1}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const scope = `${user.uid}|${advisorDataEmail}|${calendarMonth}`;
  const requestKey = `${scope}|${homeReloadKey}`;
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null);
  const [lastGood, setLastGood] = useState<{ scope: string; value: ExpectedPayout; updatedAt: number } | null>(null);
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);

  useEffect(() => {
    if (!advisorDataEmail) return;
    const finishInputs = startHomeTiming("payoutInputs");
    const finishTotal = startHomeTiming("payout");
    const controller = new AbortController();
    const impersonatedEmail = readAdminImpersonationState()?.email ?? "";
    const isCurrentRequest = () => !controller.signal.aborted && auth.currentUser?.uid === user.uid &&
      (readAdminImpersonationState()?.email ?? "") === impersonatedEmail;
    const loadPayout = async () => {
      try {
        let token = await user.getIdToken();
        const headers: Record<string, string> = impersonatedEmail ? { [ADMIN_IMPERSONATION_HEADER]: impersonatedEmail } : {};
        const request = () => fetch(`/api/contracts/expected-payout?${new URLSearchParams({ timeZone })}`, {
          headers: { ...headers, Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!isCurrentRequest()) return;
        let response = await request();
        if (response.status === 401) {
          if (!isCurrentRequest()) return;
          token = await user.getIdToken(true);
          if (!isCurrentRequest()) return;
          response = await request();
        }
        const payload = await response.json().catch(() => null) as PayoutResponse | null;
        if (!isCurrentRequest()) return;
        if ((response.status === 409 || response.status === 503) && payload?.ok === false && payload.code === "client_calculation_required") {
          setFallbackKey(requestKey);
          finishInputs("cancelled");
          finishTotal("cancelled");
          return;
        }
        if (!response.ok || !hasCompletePayout(payload, monthKey)) {
          throw new Error(PAYOUT_ERROR);
        }
        setLastGood({ scope, value: payload.payout, updatedAt: payload.updatedAt });
        setResult({ key: requestKey, error: null });
        finishInputs("success");
        finishTotal("success");
      } catch {
        if (!isCurrentRequest()) return;
        setResult({ key: requestKey, error: PAYOUT_ERROR });
        finishInputs("error");
        finishTotal("error");
      }
    };
    void loadPayout();
    return () => { controller.abort(); finishInputs("cancelled"); finishTotal("cancelled"); };
  }, [advisorDataEmail, monthKey, requestKey, scope, timeZone, user]);

  const current = advisorDataEmail && result?.key === requestKey ? result : null;
  const good = advisorDataEmail && lastGood?.scope === scope ? lastGood : null;
  const expectedPayout = good?.value ?? { grossAmount: 0, stornoFundAmount: 0, netAmount: 0 };
  const error = current?.error ?? null;
  const loading = Boolean(advisorDataEmail) && !current;
  const useClientFallback = Boolean(advisorDataEmail) && fallbackKey === requestKey;
  useEffect(() => { if (!useClientFallback) onLoadingChange?.(loading); }, [loading, onLoadingChange, useClientFallback]);
  useEffect(() => () => { onLoadingChange?.(false); }, [onLoadingChange]);

  if (useClientFallback) return <ExpectedPayoutFallback key={requestKey} language={language} user={user}
    advisorDataEmail={advisorDataEmail} homeReloadKey={homeReloadKey} periodLabel={periodLabel} isLiteUI={isLiteUI}
    onLoadingChange={onLoadingChange} />;

  return <ExpectedPayoutSection language={language} loading={loading} error={error} updatedAt={good?.updatedAt}
    grossAmount={expectedPayout.grossAmount} stornoFundAmount={expectedPayout.stornoFundAmount} netAmount={expectedPayout.netAmount}
    periodLabel={periodLabel} isLiteUI={isLiteUI} />;
}
