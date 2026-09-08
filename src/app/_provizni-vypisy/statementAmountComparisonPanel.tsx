import { ListChecks, TrendingDown, TrendingUp } from "lucide-react";

import {
  ANNUAL_PREMIUM_TOLERANCE,
  COMMISSION_AMOUNT_TOLERANCE,
  formatMoney,
  formatWholeMoney,
  paymentAmountWithFrequencyLabel,
} from "./statementParsing";
import styles from "./statementContractDetail.module.css";
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

const amountComparisonStatusTone = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "ok";
    case "missing_statement":
    case "missing_expected":
    case "diff":
      return "error";
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
  const badgeTone = panelTone === "rose" ? "error" : panelTone === "amber" ? "warn" : panelTone === "sky" ? "info" : "ok";
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
  const baseStatusTone = (comparison: PremiumBaseComparison): string => {
    if (Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) {
      return "ok";
    }
    if (!comparison.canBeAnniversaryPremiumChange) {
      return "warn";
    }
    return "error";
  };

  return (
    <div className={styles.comparison} data-tone={panelTone}>
      <div className={styles.comparisonHeading}>
        <h5><ListChecks aria-hidden="true" />
          {baseComparisons.length > 0 ? "Kontrola výpisu" : "Kontrola vyplacených částek"}
        </h5>
        <div className={styles.badge} data-tone={badgeTone}>
          {badgeLabel}
        </div>
      </div>

      <p className={styles.tableHint}>Další sloupce zobrazíš posunutím do strany →</p>
      <div className={styles.tableScroll} role="region" aria-label="Porovnání částek" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Položka</th>
              <th scope="col">Bohemka.app</th>
              <th scope="col">Provizní výpis</th>
              <th scope="col">Rozdíl ve výpise</th>
              <th scope="col">Stav</th>
            </tr>
          </thead>
          <tbody>
            {baseComparisons.map((comparison) => {
              const systemLines = baseDisplayLines(comparison, "system");
              const statementLines = baseDisplayLines(comparison, "statement");
              const differenceLines = baseDifferenceLines(comparison);
              return (
                <tr key={comparison.key}>
                  <td>{comparison.label}</td>
                  <td>
                    <div>{systemLines.primary}</div>
                    {systemLines.secondary && (
                      <div className={styles.secondary}>{systemLines.secondary}</div>
                    )}
                  </td>
                  <td>
                    <div>{statementLines.primary}</div>
                    {statementLines.secondary && (
                      <div className={styles.secondary}>{statementLines.secondary}</div>
                    )}
                  </td>
                  <td
                    className={styles.difference} data-tone={
                      Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
                        ? "neutral"
                        : !comparison.canBeAnniversaryPremiumChange
                          ? "warn"
                          : comparison.annualDifference > 0
                            ? "ok"
                            : "info"
                    }
                  >
                    <div>{differenceLines.primary}</div>
                    {differenceLines.secondary && (
                      <div className={styles.secondary}>
                        {differenceLines.secondary}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge} data-tone={baseStatusTone(comparison)}
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
                <td>
                  <div>{comparison.label}</div>
                  {comparison.detailLines && comparison.detailLines.length > 0 && (
                    <div className={styles.secondary}>
                      {comparison.detailLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {formatMoney(comparison.expectedAmount)} Kč
                </td>
                <td>
                  {formatMoney(comparison.statementAmount)} Kč
                </td>
                <td
                  className={styles.difference} data-tone={
                    Math.abs(comparison.difference) <= COMMISSION_AMOUNT_TOLERANCE
                      ? "neutral"
                      : "error"
                  }
                >
                  {comparison.difference > 0 ? "+" : ""}
                  {formatMoney(comparison.difference)} Kč
                </td>
                <td>
                  <span
                    className={styles.badge} data-tone={amountComparisonStatusTone(comparison.status)}
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
