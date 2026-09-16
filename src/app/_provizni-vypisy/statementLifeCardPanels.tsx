"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { formatWholeMoney } from "./statementParsing";
import { lifeSplitBaseComparisonSources } from "./statementLifeComparison";
import styles from "./statementContractDetail.module.css";
import type { LifeSplitContractPreview } from "./statementTypes";

export type StatementRefreshConversionStatus = "idle" | "saving" | "success" | "error";

export const statementRefreshConversionMessage = ({
  message,
  statementId,
  riskAnnualBase,
}: {
  message: string | null;
  statementId: string | null | undefined;
  riskAnnualBase: number | null;
}): string =>
  message ??
  (riskAnnualBase == null
    ? "Výpis neobsahuje jednoznačnou rizikovou základnu A101/B0301. Přepočet není dostupný."
    : `Označí smlouvu jako REFRESH a přepočítá provize z rizikové základny ${formatWholeMoney(riskAnnualBase)} Kč ročně. Investiční složka se do základny nezahrnuje.${statementId ? "" : " Provize z výpisu se zapíšou až při jeho zpracování."}`);

export function LifeSplitCardMetadata({
  contract,
  monthlyPremium,
}: {
  contract: LifeSplitContractPreview;
  monthlyPremium: number | null;
}) {
  const baseSources = lifeSplitBaseComparisonSources(contract);
  const hasDifferentBases = baseSources.length > 1;
  const baseLabel = baseSources.length === 1 && baseSources[0].label !== "Základna pojistného"
    ? `${baseSources[0].label} ročně` : "Roční základna ve výpisu";
  return (
    <div className={styles.metadata}>
      <div>
        <div>Uzavřeno</div>
        <div>{contract.signedAt || "—"}</div>
      </div>
      <div>
        <div>Počátek</div>
        <div>{contract.validFrom || "—"}</div>
      </div>
      <div>
        <div>
          {baseLabel}
        </div>
        <div>
          {contract.annualPremium > 0 ? `${formatWholeMoney(contract.annualPremium)} Kč` : hasDifferentBases ? "Různé podle položek" : "—"}
        </div>
      </div>
      <div>
        <div>Přepočet na měsíc</div>
        <div>
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
  riskAnnualBase,
  canConvert,
  onConvert,
}: {
  showConversion: boolean;
  state: { status: StatementRefreshConversionStatus; message: string | null };
  statementId: string | null | undefined;
  riskAnnualBase: number | null;
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
      role="status"
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
            {statementRefreshConversionMessage({ message: state.message, statementId, riskAnnualBase })}
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
          {state.status === "saving" ? "Přepočítávám…" : "Označit REFRESH a přepočítat"}
        </button>
      )}
    </div>
  );
}
