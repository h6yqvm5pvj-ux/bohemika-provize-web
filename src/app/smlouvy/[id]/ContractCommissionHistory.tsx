"use client";

import { Fragment, useState } from "react";
import { ChevronDown, Eye, FileText, RefreshCw } from "lucide-react";

import { isNeonInvestmentLifeA201Payout } from "@/app/lib/commissionPayoutRules";
import type { Product } from "@/app/types/domain";
import { formatMoney, nameFromEmail } from "./contractDetailHelpers";
import { type ContractCommissionPayout } from "./contractDetailTypes";

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

const statusClass = (status: ContractCommissionPayout["status"]): string => {
  switch (normalizeStatus(status)) {
    case "difference":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "storno":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
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

const payoutDifferenceLabel = (
  payout: ContractCommissionPayout,
  detail: string
): string | null => {
  const difference = finitePayoutNumber(payout.difference);
  if (difference != null) return formatMoney(difference);

  const amount = finitePayoutNumber(payout.amount);
  const expectedAmount = finitePayoutNumber(payout.expectedAmount);
  if (amount != null && expectedAmount != null) {
    return formatMoney(amount - expectedAmount);
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
  meta: string[];
};

const payoutAlertMessage = (
  payout: ContractCommissionPayout
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
  const meta = [
    paidText ? `Vyplaceno: ${paidText}` : null,
    expectedText ? `Systém: ${expectedText}` : null,
  ].filter(Boolean) as string[];
  const differenceSentence = differenceText
    ? ` Rozdíl: ${differenceText}.`
    : "";
  const reason = String(payout.differenceReason ?? "").toLowerCase();

  if (status === "storno") {
    const stornoAmount = finitePayoutNumber(payout.amount);
    return {
      title: "Storno ve výpisu",
      body:
        `Výpis obsahuje storno této položky.` +
        (stornoAmount != null
          ? ` Ke stažení: ${formatMoney(Math.abs(stornoAmount))}.`
          : ""),
      meta: [],
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
        careerSentence +
        differenceSentence,
      meta,
    };
  }

  if (reason === "premium_base_mismatch" || /jinou základnu pojistného/i.test(detail)) {
    return {
      title: "Nesedí základna pro výpočet",
      body:
        "Výpis počítal provizi z jiné základny, než je uložená ve smlouvě." +
        differenceSentence,
      meta,
    };
  }

  return {
    title: "Nesedí částka provize",
    body:
      "Vyplacená částka neodpovídá výpočtu v systému." +
      differenceSentence,
    meta,
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
  const [isExpanded, setIsExpanded] = useState(true);
  const rows = [...(payouts ?? [])].sort(
    (a, b) =>
      payoutSortValue(a) - payoutSortValue(b) ||
      String(a.statementNumber ?? "").localeCompare(String(b.statementNumber ?? ""), "cs") ||
      String(a.code ?? a.title ?? "").localeCompare(String(b.code ?? b.title ?? ""), "cs")
  );
  const groups = groupPayoutsByWriter({
    rows,
    viewerEmail: normalizeEmail(viewerEmail),
    contractOwnerEmail: normalizeEmail(contractOwnerEmail),
  });
  const contentId = "contract-commission-history-content";

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight text-slate-900">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-mono tracking-tight text-white">
            <FileText size={13} strokeWidth={2} aria-hidden="true" />
            Historie
          </span>
          Provizní výpisy u smlouvy
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {canRebuildFromStatements && onRebuildFromStatements && (
            <button
              type="button"
              onClick={onRebuildFromStatements}
              disabled={rebuildingFromStatements}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
              title="Znovu složit provize a historii pojistného této smlouvy z uložených výpisů"
            >
              <RefreshCw
                size={13}
                strokeWidth={2.2}
                aria-hidden="true"
                className={rebuildingFromStatements ? "animate-spin" : ""}
              />
              <span>{rebuildingFromStatements ? "Přepočítávám" : "Přepočítat z výpisů"}</span>
            </button>
          )}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {payoutCountLabel(rows.length)}
          </span>
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? "Sbalit provizní výpisy u smlouvy"
                : "Rozbalit provizní výpisy u smlouvy"
            }
            title={isExpanded ? "Sbalit" : "Rozbalit"}
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ChevronDown
              size={15}
              strokeWidth={2.2}
              aria-hidden="true"
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id={contentId}>
          {rows.length === 0 ? (
            <div className="mt-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-600">
              Zatím bez zapsaných provizních výpisů. Záznamy se zde objeví až po budoucím výsledném zápisu provizí.
            </div>
          ) : (
            <div className="mt-2.5 space-y-2.5">
              {groups.map((group) => {
                const groupTotal = group.rows.reduce(
                  (sum, payout) => sum + (payout.amount ?? 0),
                  0
                );

                return (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold leading-snug text-slate-900">
                      {group.label}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {group.detail}
                    </div>
                  </div>
                  <div className="shrink-0 text-[13px] font-bold text-slate-950">
                    {payoutCountLabel(group.rows.length)} · {formatMoney(groupTotal)}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] table-fixed border-collapse text-[13px]">
                    <colgroup>
                      <col className="w-[31%]" />
                      <col className="w-[16%]" />
                      <col className="w-[17%]" />
                      <col className="w-[16%]" />
                      <col className="w-[20%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-100 bg-white text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-1.5 text-left">Období</th>
                        <th className="px-2 py-1.5 text-left">Položka</th>
                        <th className="px-2 py-1.5 text-right">Částka</th>
                        <th className="px-2 py-1.5 text-right">Stav</th>
                        <th className="px-3 py-1.5 text-right">Náhled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.rows.map((payout, index) => {
                        const isExpectedInvestmentLifeA201 = isNeonInvestmentLifeA201Payout({
                          product,
                          commissionCode: payout.code,
                        });
                        const displayStatus = isExpectedInvestmentLifeA201
                          ? "paid"
                          : payout.status;
                        const statementId = String(payout.statementId ?? "").trim();
                        const canOpenStatement = Boolean(statementId && onOpenStatement);
                        const isPreviewLoading = statementPreviewLoadingId === statementId;
                        const itemLabel = payoutItemLabel(payout);
                        const alertMessage = isExpectedInvestmentLifeA201
                          ? null
                          : payoutAlertMessage(payout);
                        const rowKey =
                          payout.key ??
                          `${payout.statementId ?? "statement"}-${
                            payout.code ?? payout.title ?? index
                          }`;

                        return (
                          <Fragment key={rowKey}>
                            <tr className="align-top">
                              <td className="px-3 py-2">
                                <div className="font-semibold leading-snug text-slate-900">
                                  {payoutStatementLabel(payout)}
                                </div>
                                {payout.statementDate && (
                                  <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                                    Vystaveno {payout.statementDate}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div className="break-words font-semibold leading-snug text-slate-800">
                                  {itemLabel}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-slate-950">
                                {formatMoney(payout.amount ?? 0)}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(displayStatus)}`}
                                >
                                  {statusLabel(displayStatus)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {canOpenStatement ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenStatement?.(statementId)}
                                    disabled={isPreviewLoading}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                                    title="Zobrazit provizní výpis"
                                  >
                                    <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
                                    <span>{isPreviewLoading ? "Načítám" : "Náhled"}</span>
                                  </button>
                                ) : (
                                  <span className="text-xs font-medium text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                            {alertMessage && (
                              <tr>
                                <td colSpan={5} className="px-3 pb-2 pt-0">
                                  <div className="rounded-xl bg-rose-700 px-3 py-2 text-white shadow-[0_8px_18px_rgba(190,18,60,0.18)]">
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0">
                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                                          {alertMessage.title}
                                        </div>
                                        <p className="mt-0.5 text-xs font-semibold leading-normal text-white">
                                          {alertMessage.body}
                                        </p>
                                      </div>
                                    </div>
                                    {alertMessage.meta.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {alertMessage.meta.map((item) => (
                                          <span
                                            key={item}
                                            className="rounded-full border border-white/20 bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white/90"
                                          >
                                            {item}
                                          </span>
                                        ))}
                                      </div>
                                    )}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
