"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { formatWholeMoney } from "./statementParsing";
import type { LifeSplitContractPreview } from "./statementTypes";

export type StatementRefreshConversionStatus = "idle" | "saving" | "success" | "error";

export const statementRefreshConversionMessage = ({
  message,
  statementId,
}: {
  message: string | null;
  statementId: string | null | undefined;
}): string =>
  message ??
  (statementId
    ? "V systému zatím není vedená jako REFRESH. Ruční převod nastaví REFRESH režim a převezme výpisovou základnu z řádku NRF, aby očekávané provize odpovídaly výpisu."
    : "V systému zatím není vedená jako REFRESH. Nejdřív zpracuj výpis, aby měl uložené ID, potom půjde smlouvu ručně převést podle řádku NRF.");

export function LifeSplitCardMetadata({
  contract,
  monthlyPremium,
}: {
  contract: LifeSplitContractPreview;
  monthlyPremium: number | null;
}) {
  return (
    <div className="mt-3 grid divide-y divide-violet-100 border-y border-violet-100 text-xs font-semibold text-slate-600 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Uzavřeno</div>
        <div className="mt-0.5 text-slate-900">{contract.signedAt || "—"}</div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Počátek</div>
        <div className="mt-0.5 text-slate-900">{contract.validFrom || "—"}</div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          Roční základna
        </div>
        <div className="mt-0.5 text-slate-900">
          {contract.annualPremium > 0 ? `${formatWholeMoney(contract.annualPremium)} Kč` : "—"}
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Měsíčně</div>
        <div className="mt-0.5 text-slate-900">
          {monthlyPremium === null ? "—" : `${formatWholeMoney(monthlyPremium)} Kč`}
        </div>
      </div>
    </div>
  );
}

export function StatementRefreshConversionPanel({
  showConversion,
  state,
  statementId,
  canConvert,
  onConvert,
}: {
  showConversion: boolean;
  state: { status: StatementRefreshConversionStatus; message: string | null };
  statementId: string | null | undefined;
  canConvert: boolean;
  onConvert: () => void;
}) {
  if (!showConversion && !state.message) return null;

  const className =
    state.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : state.status === "error"
        ? "border-rose-200 bg-rose-50 text-rose-950"
        : "border-sky-200 bg-sky-50 text-sky-950";
  const messageClassName =
    state.status === "error"
      ? "text-rose-900"
      : state.status === "success"
        ? "text-emerald-900"
        : "text-sky-900";

  return (
    <div
      className={`mt-3 flex flex-col gap-3 rounded-xl border px-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {state.status === "error" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        )}
        <div>
          <div className="font-bold">Výpis označuje smlouvu jako REFRESH</div>
          <div className={`mt-0.5 font-medium ${messageClassName}`}>
            {statementRefreshConversionMessage({ message: state.message, statementId })}
          </div>
        </div>
      </div>
      {showConversion && state.status !== "success" && (
        <button
          type="button"
          onClick={onConvert}
          disabled={!canConvert || state.status === "saving"}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          )}
          {statementId ? "Převést na REFRESH" : "Nejdřív zpracovat výpis"}
        </button>
      )}
    </div>
  );
}
