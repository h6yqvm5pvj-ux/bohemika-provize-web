import { TrendingDown, TrendingUp } from "lucide-react";

import {
  ANNUAL_PREMIUM_TOLERANCE,
  COMMISSION_AMOUNT_TOLERANCE,
  formatMoney,
  formatWholeMoney,
  paymentAmountWithFrequencyLabel,
} from "./statementParsing";
import type {
  CommissionAmountComparison,
  CommissionAmountComparisonStatus,
} from "./statementTypes";

type PremiumBaseComparison = {
  key: string;
  label: string;
  statementPremiumBase: number;
  statementPaymentBase: number;
  statementBasePeriod: "annual" | "payment";
  systemPremiumBase: number;
  systemPaymentAmount: number;
  systemPaymentFrequency: string | null;
  paymentsPerYear: number;
  statementAnnualPremiumBase: number;
  systemAnnualPremiumBase: number;
  difference: number;
  annualDifference: number;
  canBeAnniversaryPremiumChange: boolean;
  firstAnniversaryDate: Date | null;
  anniversaryDate: Date | null;
  referenceDate: Date | null;
};

const formatSignedWholeMoney = (value: number): string => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + formatWholeMoney(Math.abs(value)) + " Kč";
};

const amountComparisonStatusLabel = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "Sedí";
    case "missing_statement":
      return "Chybí ve výpisu";
    case "missing_expected":
      return "Chybí v systému";
    default:
      return "Rozdíl";
  }
};

const amountComparisonStatusClass = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "missing_statement":
    case "missing_expected":
    case "diff":
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
};

const amountIssueCountLabel = (count: number): string => {
  if (count === 1) return "1 rozdíl";
  if (count >= 2 && count <= 4) return `${count} rozdíly`;
  return `${count} rozdílů`;
};

export function AmountComparisonPanel({
  comparisons,
  baseComparisons = [],
}: {
  comparisons: CommissionAmountComparison[];
  baseComparisons?: PremiumBaseComparison[];
}) {
  if (comparisons.length === 0 && baseComparisons.length === 0) return null;

  const baseDisplayLines = (
    comparison: PremiumBaseComparison,
    side: "system" | "statement"
  ): { primary: string; secondary: string | null } => {
    if (comparison.statementBasePeriod === "annual") {
      const amount =
        side === "system"
          ? comparison.systemAnnualPremiumBase
          : comparison.statementAnnualPremiumBase;
      return {
        primary: `${formatWholeMoney(amount)} Kč ročně`,
        secondary: null,
      };
    }

    const amount =
      side === "system" ? comparison.systemPremiumBase : comparison.statementPaymentBase;
    return {
      primary:
        side === "system"
          ? paymentAmountWithFrequencyLabel(amount, comparison.systemPaymentFrequency)
          : `${formatWholeMoney(amount)} Kč za platbu`,
      secondary:
        comparison.paymentsPerYear > 1
          ? `${formatWholeMoney(
              side === "system"
                ? comparison.systemAnnualPremiumBase
                : comparison.statementAnnualPremiumBase
            )} Kč ročně`
          : null,
    };
  };
  const baseDifferenceLines = (
    comparison: PremiumBaseComparison
  ): { primary: string; secondary: string | null } => {
    if (comparison.statementBasePeriod === "annual") {
      return {
        primary: formatSignedWholeMoney(comparison.annualDifference),
        secondary: null,
      };
    }

    return {
      primary: formatSignedWholeMoney(comparison.difference),
      secondary:
        comparison.paymentsPerYear > 1
          ? `${formatSignedWholeMoney(comparison.annualDifference)} ročně`
          : null,
    };
  };
  const issueCount = comparisons.filter((comparison) => comparison.status !== "ok").length;
  const baseChangeCount = baseComparisons.filter(
    (comparison) =>
      comparison.canBeAnniversaryPremiumChange &&
      Math.abs(comparison.annualDifference) > ANNUAL_PREMIUM_TOLERANCE
  ).length;
  const baseMismatchCount = baseComparisons.filter(
    (comparison) =>
      !comparison.canBeAnniversaryPremiumChange &&
      Math.abs(comparison.annualDifference) > ANNUAL_PREMIUM_TOLERANCE
  ).length;
  const panelTone =
    issueCount > 0
      ? "rose"
      : baseMismatchCount > 0
        ? "amber"
        : baseChangeCount > 0
          ? "sky"
          : "emerald";
  const panelClass =
    panelTone === "rose"
      ? "border-rose-200 bg-rose-50"
      : panelTone === "amber"
        ? "border-amber-200 bg-amber-50"
        : panelTone === "sky"
          ? "border-sky-200 bg-sky-50"
          : "border-emerald-200 bg-emerald-50";
  const badgeClass =
    panelTone === "rose"
      ? "border-rose-200 bg-white text-rose-800"
      : panelTone === "amber"
        ? "border-amber-200 bg-white text-amber-900"
        : panelTone === "sky"
          ? "border-sky-200 bg-white text-sky-800"
          : "border-emerald-200 bg-white text-emerald-800";
  const badgeLabel =
    issueCount > 0
      ? amountIssueCountLabel(issueCount)
      : baseMismatchCount > 0
        ? "Rozdíl základny"
        : baseChangeCount > 0
          ? "Změna pojistného"
          : "Vše sedí";
  const baseStatusLabel = (comparison: PremiumBaseComparison): string => {
    if (Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) {
      return "Sedí";
    }
    if (!comparison.canBeAnniversaryPremiumChange) return "Nesedí";
    return comparison.annualDifference > 0 ? "Pojistné navýšeno" : "Pojistné poníženo";
  };
  const baseStatusClass = (comparison: PremiumBaseComparison): string => {
    if (Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }
    if (!comparison.canBeAnniversaryPremiumChange) {
      return "border-amber-200 bg-amber-50 text-amber-900";
    }
    return "border-rose-200 bg-rose-50 text-rose-800";
  };

  return (
    <div className={`mt-3 rounded-xl border px-3 py-3 ${panelClass}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-bold text-slate-950">
          {baseComparisons.length > 0 ? "Kontrola výpisu" : "Kontrola vyplacených částek"}
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          {badgeLabel}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/70 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Položka</th>
              <th className="px-3 py-2 text-right">Bohemka.app</th>
              <th className="px-3 py-2 text-right">Provizní výpis</th>
              <th className="px-3 py-2 text-right">Rozdíl ve výpise</th>
              <th className="px-3 py-2 text-right">Stav</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {baseComparisons.map((comparison) => {
              const systemLines = baseDisplayLines(comparison, "system");
              const statementLines = baseDisplayLines(comparison, "statement");
              const differenceLines = baseDifferenceLines(comparison);
              return (
                <tr key={comparison.key}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{comparison.label}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    <div>{systemLines.primary}</div>
                    {systemLines.secondary && (
                      <div className="text-xs text-slate-500">{systemLines.secondary}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    <div>{statementLines.primary}</div>
                    {statementLines.secondary && (
                      <div className="text-xs text-slate-500">{statementLines.secondary}</div>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
                        ? "text-slate-700"
                        : !comparison.canBeAnniversaryPremiumChange
                          ? "text-amber-900"
                          : comparison.annualDifference > 0
                            ? "text-emerald-800"
                            : "text-sky-800"
                    }`}
                  >
                    <div>{differenceLines.primary}</div>
                    {differenceLines.secondary && (
                      <div className="text-xs font-medium text-slate-500">
                        {differenceLines.secondary}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${baseStatusClass(comparison)}`}
                    >
                      {comparison.canBeAnniversaryPremiumChange &&
                        Math.abs(comparison.annualDifference) > ANNUAL_PREMIUM_TOLERANCE &&
                        (comparison.annualDifference > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                        ))}
                      {baseStatusLabel(comparison)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {comparisons.map((comparison) => (
              <tr key={comparison.key}>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  <div>{comparison.label}</div>
                  {comparison.detailLines && comparison.detailLines.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-xs font-medium leading-5 text-slate-500">
                      {comparison.detailLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.expectedAmount)} Kč
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.statementAmount)} Kč
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    Math.abs(comparison.difference) <= COMMISSION_AMOUNT_TOLERANCE
                      ? "text-slate-700"
                      : "text-rose-800"
                  }`}
                >
                  {comparison.difference > 0 ? "+" : ""}
                  {formatMoney(comparison.difference)} Kč
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${amountComparisonStatusClass(comparison.status)}`}
                  >
                    {amountComparisonStatusLabel(comparison.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
