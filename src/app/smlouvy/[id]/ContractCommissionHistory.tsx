"use client";

import { Fragment, useId, useState } from "react";
import { ChevronDown, Eye, FileCheck2, FileStack, FileText, Info, LoaderCircle, RefreshCw, UserRound } from "lucide-react";

import {
  isFirstYearAutoACommissionPayout,
  isNeonInvestmentLifeA201Payout,
} from "@/app/lib/commissionPayoutRules";
import type { Product } from "@/app/types/domain";
import { HelpDialog } from "@/components/HelpDialog";
import { formatMoney, nameFromEmail } from "./contractDetailHelpers";
import { type ContractCommissionPayout } from "./contractDetailTypes";
import { partitionSettledCommissionPayouts } from "./contractCommissionHistoryRules";
import { ContractSectionToggle } from "./ContractSectionToggle";
import styles from "./commissionHistory.module.css";

type ContractCommissionHistoryProps = {
  product?: Product | null;
  payouts?: ContractCommissionPayout[] | null;
  viewerEmail?: string | null;
  contractOwnerEmail?: string | null;
  onOpenStatement?: (statementId: string) => void;
  statementPreviewLoadingId?: string | null;
  onRebuildFromStatements?: () => void;
  rebuildingFromStatements?: boolean;
  canRebuildFromStatements?: boolean;
};

const normalizeStatus = (
  status: ContractCommissionPayout["status"]
): "paid" | "difference" | "storno" => {
  if (status === "difference" || status === "storno") return status;
  return "paid";
};

const statusLabel = (status: ContractCommissionPayout["status"]): string => {
  switch (normalizeStatus(status)) {
    case "difference":
      return "Rozdíl";
    case "storno":
      return "Storno";
    default:
      return "Vyplaceno";
  }
};

const parseCzechDateMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = Date.UTC(year, month - 1, day);
  return Number.isFinite(date) ? date : null;
};

const parseStatementPeriodStartMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/);
  return parseCzechDateMs(match?.[1]);
};

const payoutSortValue = (payout: ContractCommissionPayout): number =>
  parseStatementPeriodStartMs(payout.statementPeriod) ??
  parseCzechDateMs(payout.statementDate) ??
  (typeof payout.statementChronologyMs === "number" &&
  Number.isFinite(payout.statementChronologyMs)
    ? payout.statementChronologyMs
    : typeof payout.writtenAtMs === "number" && Number.isFinite(payout.writtenAtMs)
      ? payout.writtenAtMs
      : 0);

const payoutStatementLabel = (payout: ContractCommissionPayout): string =>
  payout.statementPeriod ?? payout.payoutMonthKey ?? payout.statementDate ?? "Provizní výpis";

const payoutItemLabel = (payout: ContractCommissionPayout): string =>
  payout.code?.trim() || payout.title?.trim() || "Položka provize";

const payoutCountLabel = (count: number): string => {
  if (count === 1) return "1 záznam";
  if (count >= 2 && count <= 4) return `${count} záznamy`;
  return `${count} záznamů`;
};

const activePayoutCountLabel = (count: number): string => {
  if (count === 1) return "1 platná položka";
  if (count >= 2 && count <= 4) return `${count} platné položky`;
  return `${count} platných položek`;
};

const correctionCountLabel = (count: number): string => {
  if (count === 1) return "1 uzavřená oprava";
  if (count >= 2 && count <= 4) return `${count} uzavřené opravy`;
  return `${count} uzavřených oprav`;
};

const normalizeEmail = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const cleanPayoutDetail = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const finitePayoutNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const moneyFromDetail = (detail: string, pattern: RegExp): string | null => {
  const match = detail.match(pattern);
  return match?.[1]?.trim() ?? null;
};

const localizedMoneyNumber = (value: string | null): number | null => {
  if (!value) return null;
  const compact = value.replace(/[^\d,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  return finitePayoutNumber(normalized);
};

const payoutDifferenceLabel = (
  payout: ContractCommissionPayout,
  detail: string
): string | null => {
  const difference = finitePayoutNumber(payout.difference);
  if (difference != null) {
    return `${difference > 0 ? "+" : ""}${formatMoney(difference)}`;
  }

  const amount = finitePayoutNumber(payout.amount);
  const expectedAmount = finitePayoutNumber(payout.expectedAmount);
  if (amount != null && expectedAmount != null) {
    const calculatedDifference = amount - expectedAmount;
    return `${calculatedDifference > 0 ? "+" : ""}${formatMoney(
      calculatedDifference
    )}`;
  }

  return moneyFromDetail(detail, /rozdíl\s+([+-]?\d[\d\s.,]*\s*Kč)/i);
};

const careerLabelFromDetail = (value: string): string => {
  const parenthesized = value.match(/\(([^)]+)\)/);
  return (parenthesized?.[1] ?? value.replace(/^Kar\.\s*/i, "").replace(/^\d+\s*/, ""))
    .trim()
    .replace(/\.$/, "");
};

const careerMismatchFromDetail = (
  detail: string
): { statementCareer: string; contractCareer: string; referenceLabel: string } | null => {
  const match = detail.match(
    /Kariérní nesoulad[^:]*:\s*výpis\s+(?:Kar\.\s*)?([^,]+),\s*(smlouva|meziprovize)\s+([^.]+)\./i
  );
  if (!match) return null;

  return {
    statementCareer: careerLabelFromDetail(match[1] ?? ""),
    referenceLabel: match[2]?.toLowerCase() === "meziprovize" ? "Meziprovize" : "Smlouva",
    contractCareer: careerLabelFromDetail(match[3] ?? ""),
  };
};

type PayoutAlertMessage = {
  title: string;
  body: string;
  tone: "warning" | "danger";
  comparison: {
    systemAmount: string | null;
    statementAmount: string | null;
    differenceAmount: string | null;
    systemDetail: string | null;
    statementDetail: string | null;
  } | null;
};

type SelectedDifference = {
  message: PayoutAlertMessage;
  itemLabel: string;
  statementLabel: string;
};

const isPremiumBaseMismatchPayout = (
  payout: ContractCommissionPayout,
  detail = cleanPayoutDetail(payout.detail)
): boolean =>
  String(payout.differenceReason ?? "").toLowerCase() ===
    "premium_base_mismatch" || /jinou základnu pojistného/i.test(detail);

const payoutAlertMessage = (
  payout: ContractCommissionPayout,
  product: Product | null | undefined
): PayoutAlertMessage | null => {
  const status = normalizeStatus(payout.status);
  if (status === "paid") return null;

  const detail = cleanPayoutDetail(payout.detail);
  const differenceText = payoutDifferenceLabel(payout, detail);
  const paidText =
    finitePayoutNumber(payout.amount) != null
      ? formatMoney(payout.amount)
      : moneyFromDetail(detail, /vyplaceno\s+([^,]+Kč)/i);
  const expectedText =
    finitePayoutNumber(payout.expectedAmount) != null
      ? formatMoney(payout.expectedAmount)
      : moneyFromDetail(detail, /systém\s+([^,]+Kč)/i);
  const reason = String(payout.differenceReason ?? "").toLowerCase();
  const comparison = {
    systemAmount: expectedText,
    statementAmount: paidText,
    differenceAmount: differenceText,
    systemDetail: null,
    statementDetail: null,
  };

  if (status === "storno") {
    const stornoAmount = finitePayoutNumber(payout.amount);
    return {
      title: "Storno ve výpisu",
      body:
        `Výpis obsahuje storno této položky.` +
        (stornoAmount != null
          ? ` Ke stažení: ${formatMoney(Math.abs(stornoAmount))}.`
          : ""),
      tone: "danger",
      comparison: null,
    };
  }

  if (reason === "career_mismatch" || /kariérní\s+nesoulad/i.test(detail)) {
    const careerMismatch = careerMismatchFromDetail(detail);
    const careerSentence = careerMismatch
      ? ` ${careerMismatch.referenceLabel}: ${careerMismatch.contractCareer}, výpis: ${careerMismatch.statementCareer}.`
      : "";

    return {
      title: "Nesedí kariérní stupeň",
      body:
        "Provize byla vyplacena z jiné pozice, než je uložená u smlouvy." +
        careerSentence,
      tone: "danger",
      comparison: {
        ...comparison,
        systemDetail: careerMismatch
          ? `Kariérní stupeň: ${careerMismatch.contractCareer}`
          : null,
        statementDetail: careerMismatch
          ? `Kariérní stupeň: ${careerMismatch.statementCareer}`
          : null,
      },
    };
  }

  const canCompareBase = isFirstYearAutoACommissionPayout({
    product,
    commissionCode: payout.code,
  });
  if (canCompareBase && isPremiumBaseMismatchPayout(payout, detail)) {
    const statementBaseFromDetail = moneyFromDetail(
      detail,
      /Základna výpisu\s+(\d[\d\s.,]*\s*Kč)/i
    );
    const statementBaseAmount =
      finitePayoutNumber(payout.statementBaseAmount) ??
      localizedMoneyNumber(statementBaseFromDetail);
    const storedSystemBaseAmount = finitePayoutNumber(payout.systemBaseAmount);
    const paidAmount = finitePayoutNumber(payout.amount);
    const expectedAmount = finitePayoutNumber(payout.expectedAmount);
    const inferredSystemBaseAmount =
      statementBaseAmount != null &&
      paidAmount != null &&
      Math.abs(paidAmount) > 0.001 &&
      expectedAmount != null
        ? Math.round(
            (statementBaseAmount * expectedAmount * 100) / Math.abs(paidAmount)
          ) / 100
        : null;
    const systemBaseAmount =
      storedSystemBaseAmount ?? inferredSystemBaseAmount;
    return {
      title: "Jiná základna ve výpisu",
      body:
        "Výpis použil jinou základnu pojistného než původní výpočet smlouvy.",
      tone: "warning",
      comparison: {
        ...comparison,
        systemDetail: systemBaseAmount != null
          ? `Základna: ${formatMoney(systemBaseAmount)}`
          : null,
        statementDetail: statementBaseAmount != null
          ? `Základna: ${formatMoney(statementBaseAmount)}`
          : null,
      },
    };
  }

  return {
    title: "Nesedí částka provize",
    body: "Vyplacená částka neodpovídá výpočtu v systému.",
    tone: "danger",
    comparison,
  };
};

type PayoutWriterGroup = {
  key: string;
  label: string;
  detail: string;
  rank: number;
  rows: ContractCommissionPayout[];
};

const writerGroupMeta = ({
  writerEmail,
  viewerEmail,
  contractOwnerEmail,
}: {
  writerEmail: string;
  viewerEmail: string;
  contractOwnerEmail: string;
}): Pick<PayoutWriterGroup, "label" | "detail" | "rank"> => {
  if (!writerEmail) {
    return {
      label: "Neurčený výpis",
      detail: "Starší záznam bez uloženého autora nahrání.",
      rank: 90,
    };
  }

  const writerName = nameFromEmail(writerEmail);
  if (contractOwnerEmail && writerEmail === contractOwnerEmail) {
    return {
      label: `Provize sjednatele: ${writerName}`,
      detail: `Výpis nahrál ${writerName}.`,
      rank: 0,
    };
  }

  if (viewerEmail && writerEmail === viewerEmail) {
    return {
      label: `Moje meziprovize: ${writerName}`,
      detail: `Výpis nahrál ${writerName}.`,
      rank: 1,
    };
  }

  return {
    label: `Výpis manažera: ${writerName}`,
    detail: `Výpis nahrál ${writerName}.`,
    rank: 2,
  };
};

const groupPayoutsByWriter = ({
  rows,
  viewerEmail,
  contractOwnerEmail,
}: {
  rows: ContractCommissionPayout[];
  viewerEmail: string;
  contractOwnerEmail: string;
}): PayoutWriterGroup[] => {
  const map = new Map<string, PayoutWriterGroup>();

  for (const payout of rows) {
    const writerEmail = normalizeEmail(payout.writtenBy);
    const key = writerEmail || "__unknown";
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(payout);
      continue;
    }

    const meta = writerGroupMeta({
      writerEmail,
      viewerEmail,
      contractOwnerEmail,
    });
    map.set(key, {
      key,
      ...meta,
      rows: [payout],
    });
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(
        (a, b) =>
          payoutSortValue(a) - payoutSortValue(b) ||
          String(a.statementNumber ?? "").localeCompare(String(b.statementNumber ?? ""), "cs") ||
          String(a.code ?? a.title ?? "").localeCompare(String(b.code ?? b.title ?? ""), "cs")
      ),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.label.localeCompare(b.label, "cs");
    });
};

export function ContractCommissionHistory({
  product = null,
  payouts,
  viewerEmail = null,
  contractOwnerEmail = null,
  onOpenStatement,
  statementPreviewLoadingId,
  onRebuildFromStatements,
  rebuildingFromStatements = false,
  canRebuildFromStatements = false,
}: ContractCommissionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettledCorrections, setShowSettledCorrections] = useState(false);
  const [selectedDifference, setSelectedDifference] =
    useState<SelectedDifference | null>(null);
  const allRows = [...(payouts ?? [])].sort(
    (a, b) =>
      payoutSortValue(a) - payoutSortValue(b) ||
      String(a.statementNumber ?? "").localeCompare(String(b.statementNumber ?? ""), "cs") ||
      String(a.code ?? a.title ?? "").localeCompare(String(b.code ?? b.title ?? ""), "cs")
  );
  const { activePayouts, settledCorrections } =
    partitionSettledCommissionPayouts(allRows);
  const rows = [...activePayouts].sort(
    (a, b) =>
      payoutSortValue(a) - payoutSortValue(b) ||
      String(a.statementNumber ?? "").localeCompare(String(b.statementNumber ?? ""), "cs") ||
      String(a.code ?? a.title ?? "").localeCompare(String(b.code ?? b.title ?? ""), "cs")
  );
  const netTotal = allRows.reduce(
    (sum, payout) => sum + (finitePayoutNumber(payout.amount) ?? 0),
    0
  );
  const groups = groupPayoutsByWriter({
    rows,
    viewerEmail: normalizeEmail(viewerEmail),
    contractOwnerEmail: normalizeEmail(contractOwnerEmail),
  });
  const contentId = useId();
  const settledContentId = useId();

  return (
    <section className={styles.panel} aria-label="Provizní výpisy u smlouvy">
      <div className={styles.heading}>
        <ContractSectionToggle
          title="Provizní výpisy u smlouvy"
          icon={<FileText size={17} strokeWidth={2} />}
          count={payoutCountLabel(allRows.length)}
          expanded={isExpanded}
          contentId={contentId}
          onToggle={() => setIsExpanded(value => !value)}
        />
        <div className={styles.headingActions}>
          {canRebuildFromStatements && onRebuildFromStatements && (
            <button
              type="button"
              onClick={onRebuildFromStatements}
              disabled={rebuildingFromStatements}
              className={styles.rebuildButton}
              title="Znovu složit provize a historii pojistného této smlouvy z uložených výpisů"
            >
              <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" className={rebuildingFromStatements ? styles.spinner : undefined} />
              <span>{rebuildingFromStatements ? "Přepočítávám" : "Přepočítat z výpisů"}</span>
            </button>
          )}
        </div>
      </div>

        <div id={contentId} hidden={!isExpanded}>
          {allRows.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><FileStack size={25} strokeWidth={1.4} aria-hidden="true" /></span>
              <div>
                <p>Zatím bez provizních výpisů</p>
                <span>Záznamy se zde objeví po zápisu provizí z výpisu.</span>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.summary}>
                <span className={styles.summaryIcon}><FileCheck2 size={26} strokeWidth={1.4} aria-hidden="true" /></span>
                <div className={styles.summaryText}>
                  <span className={styles.label}>Čistý výsledek výpisů</span>
                  <p>
                    Po započtení všech výplat a storen
                    {settledCorrections.length > 0 ? ` · ${correctionCountLabel(settledCorrections.length)}` : ""}
                  </p>
                </div>
                <strong className={styles.netTotal} data-tone={netTotal < 0 ? "negative" : netTotal > 0 ? "positive" : "neutral"}>
                  {formatMoney(netTotal)}
                </strong>
              </div>

              {rows.length === 0 && (
                <p className={styles.settledMessage}>
                  Všechny pohyby byly vzájemně vyrovnány. Žádná provize nyní nezůstává aktivní.
                </p>
              )}

              <div className={styles.groups}>
                {groups.map((group) => {
                  const groupTotal = group.rows.reduce((sum, payout) => sum + (payout.amount ?? 0), 0);
                  return (
                    <div key={group.key} className={styles.group}>
                      <div className={styles.groupHeading}>
                        <span className={styles.authorIcon}><UserRound size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                        <div className={styles.author}>
                          <h4>{group.label}</h4>
                          <p>{group.detail}</p>
                        </div>
                        <div className={styles.groupSummary}>
                          <strong>{formatMoney(groupTotal)}</strong>
                          <span>{activePayoutCountLabel(group.rows.length)}</span>
                        </div>
                      </div>

                      <table className={styles.table} aria-label={group.label}>
                        <colgroup><col style={{ width: "38%" }} /><col style={{ width: "12%" }} /><col style={{ width: "19%" }} /><col style={{ width: "17%" }} /><col style={{ width: "14%" }} /></colgroup>
                        <thead>
                          <tr>
                            <th scope="col">Období výpisu</th>
                            <th scope="col">Položka</th>
                            <th scope="col" className={styles.alignRight}>Částka</th>
                            <th scope="col" className={styles.alignRight}>Stav</th>
                            <th scope="col" className={styles.alignRight}>Náhled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((payout, index) => {
                            const isExpectedInvestmentLifeA201 = isNeonInvestmentLifeA201Payout({ product, commissionCode: payout.code });
                            const displayStatus = isExpectedInvestmentLifeA201 && normalizeStatus(payout.status) !== "storno" ? "paid" : payout.status;
                            const isDifference = normalizeStatus(displayStatus) === "difference";
                            const statementId = String(payout.statementId ?? "").trim();
                            const canOpenStatement = Boolean(statementId && onOpenStatement);
                            const isPreviewLoading = statementPreviewLoadingId === statementId;
                            const itemLabel = payoutItemLabel(payout);
                            const alertMessage = isExpectedInvestmentLifeA201 ? null : payoutAlertMessage(payout, product);
                            const rowKey = payout.key ?? `${payout.statementId ?? "statement"}-${payout.code ?? payout.title ?? index}`;
                            return (
                              <Fragment key={rowKey}>
                                <tr className={styles.payoutRow}>
                                  <td className={styles.periodCell}>
                                    <div className={styles.period}>
                                      <span className={styles.documentIcon}><FileText size={19} strokeWidth={1.5} aria-hidden="true" /></span>
                                      <div>
                                        <span className={styles.periodLabel}>{payoutStatementLabel(payout)}</span>
                                        {payout.statementDate && <span className={styles.issueDate}>Vystaveno {payout.statementDate}</span>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className={styles.itemCell}><span className={styles.itemCode}>{itemLabel}</span></td>
                                  <td className={styles.amountCell} data-negative={(payout.amount ?? 0) < 0}>{formatMoney(payout.amount ?? 0)}</td>
                                  <td className={styles.statusCell}>
                                    <span className={styles.statusGroup}>
                                      <span className={styles.status} data-status={normalizeStatus(displayStatus)}>{statusLabel(displayStatus)}</span>
                                      {isDifference && alertMessage && (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedDifference({ message: alertMessage, itemLabel, statementLabel: payoutStatementLabel(payout) })}
                                          aria-label={`Zobrazit důvod rozdílu u položky ${itemLabel}`}
                                          aria-haspopup="dialog"
                                          title="Zobrazit důvod rozdílu"
                                          className={styles.differenceButton}
                                        >
                                          <Info size={14} strokeWidth={1.8} aria-hidden="true" />
                                        </button>
                                      )}
                                    </span>
                                  </td>
                                  <td className={styles.previewCell}>
                                    {canOpenStatement ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenStatement?.(statementId)}
                                        disabled={isPreviewLoading}
                                        className={styles.previewButton}
                                        title="Zobrazit provizní výpis"
                                        aria-label={`Náhled výpisu ${payoutStatementLabel(payout)}, položka ${itemLabel}`}
                                        aria-busy={isPreviewLoading}
                                      >
                                        {isPreviewLoading ? <LoaderCircle size={14} className={styles.spinner} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.8} aria-hidden="true" />}
                                        <span>{isPreviewLoading ? "Načítám" : "Náhled"}</span>
                                      </button>
                                    ) : <span className={styles.unavailable} title="Výpis není připojen">—</span>}
                                  </td>
                                </tr>
                                {alertMessage && !isDifference && (
                                  <tr className={styles.alertRow}>
                                    <td colSpan={5}>
                                      <div className={styles.payoutAlert} data-tone={alertMessage.tone}>
                                        <Info size={16} strokeWidth={1.8} aria-hidden="true" />
                                        <div><strong>{alertMessage.title}</strong><p>{alertMessage.body}</p></div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {settledCorrections.length > 0 && (
                <div className={styles.corrections}>
                  <button
                    type="button"
                    aria-controls={settledContentId}
                    aria-expanded={showSettledCorrections}
                    onClick={() => setShowSettledCorrections((value) => !value)}
                    className={styles.correctionsToggle}
                  >
                    <span className={styles.correctionsIcon}><RefreshCw size={17} strokeWidth={1.7} aria-hidden="true" /></span>
                    <span className={styles.correctionsTitle}>
                      <strong>Uzavřené opravy</strong>
                      <span>{correctionCountLabel(settledCorrections.length)} · {settledCorrections.length * 2} pohyby · čistý dopad 0 Kč</span>
                    </span>
                    <ChevronDown size={16} aria-hidden="true" className={showSettledCorrections ? styles.chevronExpanded : undefined} />
                  </button>
                  {showSettledCorrections && (
                    <div id={settledContentId} className={styles.correctionsContent}>
                      {settledCorrections.map(({ payment, reversal }, index) => {
                        const paymentStatementId = String(payment.statementId ?? "").trim();
                        const reversalStatementId = String(reversal.statementId ?? "").trim();
                        const correctionKey = `${payment.key ?? paymentStatementId ?? "payment"}-${reversal.key ?? reversalStatementId ?? index}`;
                        return (
                          <div key={correctionKey} className={styles.correction}>
                            <div className={styles.correctionHeading}>
                              <span className={styles.itemCode}>{payoutItemLabel(payment)}</span>
                              <span className={styles.status} data-status="paid">Vyrovnáno</span>
                              <span className={styles.correctionMath}>{formatMoney(payment.amount ?? 0)} + {formatMoney(reversal.amount ?? 0)} = 0 Kč</span>
                            </div>
                            <div className={styles.correctionEntries}>
                              {[
                                { label: "Původní výplata", payout: payment, statementId: paymentStatementId },
                                { label: "Následné storno", payout: reversal, statementId: reversalStatementId },
                              ].map((item) => {
                                const canOpenStatement = Boolean(item.statementId && onOpenStatement);
                                const isPreviewLoading = statementPreviewLoadingId === item.statementId;
                                return (
                                  <div key={`${correctionKey}-${item.label}`} className={styles.correctionEntry}>
                                    <div>
                                      <span className={styles.label}>{item.label}</span>
                                      <p>{payoutStatementLabel(item.payout)}</p>
                                      <strong>{formatMoney(item.payout.amount ?? 0)}</strong>
                                    </div>
                                    {canOpenStatement && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenStatement?.(item.statementId)}
                                        disabled={isPreviewLoading}
                                        className={styles.previewButton}
                                        title={`Zobrazit výpis: ${item.label.toLowerCase()}`}
                                        aria-label={`Náhled výpisu: ${item.label.toLowerCase()}, ${payoutStatementLabel(item.payout)}`}
                                        aria-busy={isPreviewLoading}
                                      >
                                        {isPreviewLoading ? <LoaderCircle size={14} className={styles.spinner} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.8} aria-hidden="true" />}
                                        <span>{isPreviewLoading ? "Načítám" : "Náhled"}</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      <HelpDialog
        isOpen={selectedDifference != null}
        title="Důvod rozdílu"
        description={
          selectedDifference
            ? `${selectedDifference.statementLabel} · ${selectedDifference.itemLabel}`
            : undefined
        }
        eyebrow="Rozdíl"
        eyebrowIcon={<Info className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />}
        onClose={() => setSelectedDifference(null)}
      >
        {selectedDifference && (
          <div className="space-y-4">
            {selectedDifference.message.comparison && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="bg-slate-50/70 px-4 py-4 sm:px-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Systém bohemka.app
                    </div>
                    <div className="mt-2 text-2xl font-black tabular-nums tracking-tight text-slate-950">
                      {selectedDifference.message.comparison.systemAmount ?? "—"}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      Vypočtená provize
                    </div>
                    {selectedDifference.message.comparison.systemDetail && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700">
                        {selectedDifference.message.comparison.systemDetail}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-4 sm:px-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Provizní výpis
                    </div>
                    <div className="mt-2 text-2xl font-black tabular-nums tracking-tight text-slate-950">
                      {selectedDifference.message.comparison.statementAmount ?? "—"}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      Vyplacená provize
                    </div>
                    {selectedDifference.message.comparison.statementDetail && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700">
                        {selectedDifference.message.comparison.statementDetail}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between gap-4 border-t px-4 py-3 sm:px-5 ${
                    selectedDifference.message.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-rose-200 bg-rose-50 text-rose-950"
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] opacity-65">
                      Rozdíl
                    </div>
                    <div className="mt-0.5 text-xs font-semibold opacity-75">
                      Provizní výpis − systém
                    </div>
                  </div>
                  <div className="shrink-0 text-xl font-black tabular-nums">
                    {selectedDifference.message.comparison.differenceAmount ?? "—"}
                  </div>
                </div>
              </div>
            )}

            <div
              className={`rounded-2xl border px-4 py-4 ${
                selectedDifference.message.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-rose-200 bg-rose-50 text-rose-950"
              }`}
            >
              <div className="text-[11px] font-black uppercase tracking-[0.12em] opacity-65">
                Důvod
              </div>
              <div className="mt-1 text-sm font-bold">
                {selectedDifference.message.title}
              </div>
              <p className="mt-1.5 text-sm font-medium leading-6">
                {selectedDifference.message.body}
              </p>
            </div>
          </div>
        )}
      </HelpDialog>
    </section>
  );
}
