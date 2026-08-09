"use client";

import { useState } from "react";
import { AlertTriangle, CalendarX, CheckCircle2, ChevronDown } from "lucide-react";

import { toDate } from "@/app/lib/formatters";
import {
  BohemkaContractDetailLink,
  ContractDetailLink,
  firstSjednatelExtranetUrl,
  SjednatelExtranetLink,
} from "./statementLinksAndCalculator";
import { MarkedDiscrepancyToggle } from "./statementDiscrepancyUi";
import { markedDiscrepancyKey } from "./statementDiscrepancies";
import {
  classifyGeneralCommissionCode,
  formatLocalDate,
  formatMoney,
  normalizeContractNumberForMatch,
  resolveStatementProduct,
} from "./statementParsing";
import {
  fullAutoStornoInferenceForGroup,
  groupStornoItemsByContract,
  groupStornoRowsByContract,
  stornoSystemUncertainty,
  suggestedStornoDateForStatement,
} from "./statementStorno";
import {
  contractMatchForNumber,
  matchedSystemContract,
  systemContractIsStorno,
  systemContractStatusLabel,
} from "./statementSystemContracts";
import {
  SystemMatchBadge,
  SystemMatchPanel,
  type SystemMatchPresentation,
} from "./statementSystemMatchUi";
import type {
  ContractMatchState,
  ContractMatchesByNumber,
  ContractStatusRule,
  GeneralCommissionKind,
  MarkedDiscrepancyItem,
  MarkingControls,
  MatchedSystemContract,
  ParsedStatement,
  StatementProductMeta,
  StornoStatementActionTarget,
} from "./statementTypes";

const czechCountLabel = (
  count: number,
  singular: string,
  few: string,
  many: string
): string => `${count} ${count === 1 ? singular : count >= 2 && count <= 4 ? few : many}`;

const uncertaintyCountLabel = (count: number): string => {
  if (count === 1) return "1 nejasnost";
  if (count >= 2 && count <= 4) return `${count} nejasnosti`;
  return `${count} nejasností`;
};

const generalCommissionKindClass = (kind: GeneralCommissionKind): string => {
  switch (kind) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "tip":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "subsequent":
    case "installment":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "increase":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
    case "troyOunce":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "penalty":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "office":
    case "compensation":
    case "gradual":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const uniqueProductMetasForRows = (rows: Array<{ product: string }>): StatementProductMeta[] => {
  const seen = new Set<string>();
  const products: StatementProductMeta[] = [];

  for (const row of rows) {
    const product = resolveStatementProduct(row.product);
    if (seen.has(product.rawCode)) continue;
    seen.add(product.rawCode);
    products.push(product);
  }

  return products;
};

export function StornoSystemStatusBadge({
  contract,
}: {
  contract: MatchedSystemContract | null;
}) {
  if (!contract) return null;

  if (systemContractIsStorno(contract)) {
    const stornoDate = toDate(contract.stornoDate);
    return (
      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-violet-100">
        Storno v systému
        {stornoDate ? ` · ${formatLocalDate(stornoDate)}` : ""}
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
      V systému není storno
    </span>
  );
}

export function StornoSystemActionPanel({
  target,
  onRequestStorno,
}: {
  target: StornoStatementActionTarget | null;
  onRequestStorno?: (target: StornoStatementActionTarget) => void;
}) {
  if (!target || systemContractIsStorno(target.contract)) return null;

  const inference = target.inference ?? null;
  const inferenceAmountSourceLabel =
    inference?.matchedSource === "contract_item"
      ? "v detailu smlouvy je stejná provize"
      : "v historii výpisů je stejná výplata";
  const inferenceDateSourceLabel =
    inference?.referenceDateSource === "statement_period"
      ? "konec období výpisu"
      : inference?.referenceDateSource === "statement_period_overlap"
        ? "překryv období výpisu s dvouměsíční lhůtou"
        : inference?.referenceDateSource === "row_date"
          ? "datum řádku storna"
          : "navržené datum";

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm text-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" strokeWidth={2.2} aria-hidden="true" />
        <div>
          {inference ? (
            <>
              <div className="font-bold">
                Pravděpodobně storno smlouvy do 2 měsíců od počátku
              </div>
              <div className="mt-0.5 font-medium text-slate-700">
                Výpis vrací {formatMoney(inference.stornoAmount)} Kč z{" "}
                {inference.commissionCode ?? "provize"} a {inferenceAmountSourceLabel}{" "}
                {formatMoney(inference.matchedPaidAmount)} Kč.
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                Čas: počátek {formatLocalDate(inference.policyStartDate)}, {inferenceDateSourceLabel}{" "}
                {formatLocalDate(inference.suggestedDate)}, hranice 2 měsíců{" "}
                {formatLocalDate(inference.fullStornoBoundaryDate)}. Výpis drží zápornou položku v
                cashflow, tlačítko jen doplní storno smlouvy a zastaví další projekce.
              </div>
            </>
          ) : (
            <>
              <div className="font-bold">Výpis hlásí storno, systém ne</div>
              <div className="mt-0.5 font-medium text-slate-700">
                Smlouva je v systému vedená jako {systemContractStatusLabel(target.contract)}.
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                Datum storna před uložením ověř proklikem do MAXXu nebo Extranetu.
              </div>
            </>
          )}
        </div>
      </div>
      {onRequestStorno && (
        <button
          type="button"
          onClick={() => onRequestStorno(target)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-sm font-bold text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition hover:bg-black"
        >
          <CalendarX className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          {inference ? "Označit podle výpisu" : "Označit jako stornovanou"}
        </button>
      )}
    </div>
  );
}

export function StornoContractsSectionPanel({
  statement,
  statementId,
  matchesByContractNumber,
  currentUserEmail,
  markingControls,
  onRequestSystemStorno,
  presentation,
}: {
  statement: ParsedStatement;
  statementId?: string | null;
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
  presentation: SystemMatchPresentation;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pairedExpanded, setPairedExpanded] = useState(true);
  const [unpairedExpanded, setUnpairedExpanded] = useState(true);
  const otherPaymentStornos = statement.otherPayments.filter((payment) => payment.isStorno);
  const stornoStatementGroups = groupStornoRowsByContract(statement.stornoRows);
  const combinedStornoGroups = groupStornoItemsByContract(
    statement.stornoRows,
    otherPaymentStornos
  );
  const itemCount = statement.stornoRows.length + otherPaymentStornos.length;
  if (itemCount === 0) return null;

  const statusRuleByCode = new Map(
    statement.contractStatusRules.map((rule) => [rule.code.trim().toUpperCase(), rule])
  );
  const totalStorno =
    statement.stornoRows.reduce((sum, row) => sum + row.commission, 0) +
    otherPaymentStornos.reduce((sum, payment) => sum + payment.amount, 0);
  const statementStornoTotal = statement.stornoRows.reduce(
    (sum, row) => sum + row.commission,
    0
  );
  const otherPaymentStornoTotal = otherPaymentStornos.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );
  const stornoGroupEntries = combinedStornoGroups.map((group, groupIndex) => {
    const match = contractMatchForNumber(matchesByContractNumber, group.contractNumber);
    const systemContract = matchedSystemContract(match);
    return { group, groupIndex, match, systemContract };
  });
  const pairedStornoGroupEntries = stornoGroupEntries.filter((entry) =>
    Boolean(entry.systemContract)
  );
  const unpairedStornoGroupEntries = stornoGroupEntries.filter(
    (entry) => !entry.systemContract
  );
  const stornoUncertaintyCount = stornoGroupEntries.filter(
    (entry) =>
      !normalizeContractNumberForMatch(entry.group.contractNumber) ||
      stornoSystemUncertainty(entry.match)
  ).length;
  type StornoGroupEntry = (typeof stornoGroupEntries)[number];
  const stornoSectionTotal = (entries: StornoGroupEntry[]): number =>
    entries.reduce((sum, entry) => sum + entry.group.totalAmount, 0);
  const stornoSectionItemCount = (entries: StornoGroupEntry[]): number =>
    entries.reduce(
      (sum, entry) => sum + entry.group.rows.length + entry.group.payments.length,
      0
    );
  const pairedNeedsSystemStornoCount = pairedStornoGroupEntries.filter(
    (entry) => entry.systemContract && !systemContractIsStorno(entry.systemContract)
  ).length;
  const stornoSections = [
    {
      key: "paired",
      title: "Spárované smlouvy",
      description: "Storna s nalezenou smlouvou v systému.",
      entries: pairedStornoGroupEntries,
      expanded: pairedExpanded,
      onToggle: () => setPairedExpanded((value) => !value),
      icon: CheckCircle2,
      warningCount: pairedNeedsSystemStornoCount,
      warningLabel: "není storno v systému",
      warningClass: "bg-slate-950 text-white",
    },
    {
      key: "unpaired",
      title: "Nespárované smlouvy",
      description: "Storna bez jednoznačné shody v systému.",
      entries: unpairedStornoGroupEntries,
      expanded: unpairedExpanded,
      onToggle: () => setUnpairedExpanded((value) => !value),
      icon: AlertTriangle,
      warningCount: unpairedStornoGroupEntries.length,
      warningLabel: "k ruční kontrole",
      warningClass: "bg-violet-50 text-violet-800 ring-1 ring-violet-100",
    },
  ].filter((section) => section.entries.length > 0);

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/70 bg-white/75 shadow-[0_18px_42px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/70 backdrop-blur-xl">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/70" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-950">Stornované smlouvy</h3>
            <p className="text-sm font-semibold text-slate-600">
              Storna z výpisu a vratky provizí z ostatních plateb.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-950">
          <span>{combinedStornoGroups.length} smluv · {formatMoney(totalStorno)} Kč</span>
          {stornoUncertaintyCount > 0 && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-violet-100">
              {uncertaintyCountLabel(stornoUncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-violet-100 px-4 py-4">
          <div className="overflow-hidden rounded-lg border border-violet-100 bg-white/45">
            <div className="grid divide-y divide-violet-100 md:grid-cols-3 md:divide-x md:divide-y-0">
              <StornoTotal label="Storna z výpisu" value={`${stornoStatementGroups.length} smluv · ${statement.stornoRows.length} položek`} amount={statementStornoTotal} />
              <StornoTotal label="Ostatní platby" value={`${otherPaymentStornos.length} položek`} amount={otherPaymentStornoTotal} />
              <StornoTotal label="Celkem" value={`${combinedStornoGroups.length} smluv`} amount={totalStorno} />
            </div>
          </div>

          <div className="space-y-3">
            {stornoSections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <div
                  key={`storno-section-${section.key}`}
                  className="overflow-hidden rounded-lg border border-white/70 bg-white/65 shadow-[0_14px_32px_rgba(15,23,42,0.05)] ring-1 ring-violet-100/70"
                >
                  <button
                    type="button"
                    onClick={section.onToggle}
                    className="flex w-full flex-col gap-3 bg-white/35 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                    aria-expanded={section.expanded}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                        <SectionIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      <div>
                        <h4 className="text-base font-bold text-slate-950">{section.title}</h4>
                        <p className="text-sm text-slate-600">{section.description}</p>
                      </div>
                    </div>
                    <span className="inline-flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-slate-950">
                      <span>
                        {section.entries.length} smluv · {stornoSectionItemCount(section.entries)} položek ·{" "}
                        {formatMoney(stornoSectionTotal(section.entries))} Kč
                      </span>
                      {section.warningCount > 0 && (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${section.warningClass}`}>
                          {section.warningCount} {section.warningLabel}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${section.expanded ? "rotate-180" : ""}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                  {section.expanded && (
                    <div className="space-y-3 border-t border-violet-100 px-4 py-4">
                      {section.entries.map(({ group, groupIndex, match, systemContract }) => (
                        <StornoContractGroupCard
                          key={`storno-contract-group-${group.key}-${groupIndex}`}
                          statement={statement}
                          statementId={statementId}
                          group={group}
                          groupIndex={groupIndex}
                          match={match}
                          systemContract={systemContract}
                          currentUserEmail={currentUserEmail}
                          statusRuleByCode={statusRuleByCode}
                          markingControls={markingControls}
                          onRequestSystemStorno={onRequestSystemStorno}
                          presentation={presentation}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StornoTotal({ label, value, amount }: { label: string; value: string; amount: number }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-wide text-violet-700">{label}</div>
      <div className="mt-2 text-base font-black text-slate-950">{value}</div>
      <div className="mt-1 text-sm font-semibold text-slate-600">{formatMoney(amount)} Kč</div>
    </div>
  );
}

function StornoContractGroupCard({
  statement,
  statementId,
  group,
  groupIndex,
  match,
  systemContract,
  currentUserEmail,
  statusRuleByCode,
  markingControls,
  onRequestSystemStorno,
  presentation,
}: {
  statement: ParsedStatement;
  statementId?: string | null;
  group: ReturnType<typeof groupStornoItemsByContract>[number];
  groupIndex: number;
  match: ContractMatchState | null;
  systemContract: MatchedSystemContract | null;
  currentUserEmail?: string | null;
  statusRuleByCode: Map<string, ContractStatusRule>;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
  presentation: SystemMatchPresentation;
}) {
  const row = group.rows[0] ?? null;
  const stornoInference = fullAutoStornoInferenceForGroup({
    statement,
    statementId,
    group,
    systemContract,
    currentUserEmail,
  });
  const extranetUrl = firstSjednatelExtranetUrl(group.rows, systemContract);
  const uniqueProducts = uniqueProductMetasForRows(group.rows);
  const statementProductLabel =
    group.rows.length > 0
      ? uniqueProducts.length === 1
        ? `${uniqueProducts[0].label} · ${uniqueProducts[0].rawCode}`
        : `${uniqueProducts.length} produktů`
      : null;
  const productLabel =
    statementProductLabel && group.payments.length > 0
      ? `${statementProductLabel} + ostatní platby`
      : statementProductLabel ?? "Ostatní platby";
  const displayClient =
    group.client || row?.client || systemContract?.clientName || "Klient nezjištěn";
  const statusRules = [
    ...new Map(
      group.rows
        .map((item) => statusRuleByCode.get(item.statusCode))
        .filter((rule): rule is ContractStatusRule => Boolean(rule))
        .map((rule) => [rule.code, rule])
    ).values(),
  ];
  const statusCodes = [
    ...new Set(group.rows.map((item) => item.statusCode).filter(Boolean)),
  ];
  const hasB36Payment = group.payments.some((payment) => payment.isB36Half);
  const rowItemsLabel = czechCountLabel(
    group.rows.length,
    "položka storna",
    "položky storna",
    "položek storna"
  );
  const paymentItemsLabel = czechCountLabel(
    group.payments.length,
    "ostatní platba",
    "ostatní platby",
    "ostatních plateb"
  );
  const actionTarget: StornoStatementActionTarget | null = systemContract
    ? {
        contract: systemContract,
        contractNumber: group.contractNumber || systemContract.contractNumber || "",
        client: displayClient,
        product: productLabel,
        suggestedDate:
          stornoInference?.suggestedDate ?? suggestedStornoDateForStatement(statement.header),
        inference: stornoInference,
      }
    : null;
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: "my",
          category: "Storna",
          contractNumber: group.contractNumber,
          fallback: `${group.key}-${groupIndex}`,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: "Storna",
        scope: "my",
        contractNumber: group.contractNumber,
        client: displayClient,
        product: productLabel,
        title: "Ručně označené storno k opravě",
        amount: group.totalAmount,
        details: [
          group.rows.length > 0 ? rowItemsLabel : null,
          group.payments.length > 0 ? paymentItemsLabel : null,
          row ? `Uzavřeno: ${row.signedAt || "—"}` : null,
          group.rows.length > 0
            ? group.rows
                .map(
                  (item) =>
                    `${item.type || "—"} ${item.statusCode || ""}: ${formatMoney(item.commission)} Kč`
                )
                .join(" · ")
            : null,
          ...group.payments.map((payment) => payment.description),
        ].filter((detail): detail is string => Boolean(detail)),
      }
    : null;

  return (
    <article className="rounded-lg border border-white/80 bg-white/80 px-3 py-3 text-sm shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-violet-100/60">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-950">Smlouva {group.contractNumber || "—"}</span>
            <BohemkaContractDetailLink contract={systemContract} compact />
            <ContractDetailLink href={row?.detailUrl} compact />
            <SjednatelExtranetLink href={extranetUrl} compact />
            <SystemMatchBadge match={match} presentation={presentation} />
            {group.rows.length > 0 && (
              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                Storno z výpisu
              </span>
            )}
            {group.payments.length > 0 && (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-violet-100">
                Ostatní platby
              </span>
            )}
            <StornoSystemStatusBadge contract={systemContract} />
            {hasB36Payment && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                B36
              </span>
            )}
          </div>
          {markedItem && (
            <div className="mt-2">
              <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
            </div>
          )}
          <div className="mt-1 text-[15px] font-semibold text-slate-800">{displayClient}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
            <span>{productLabel}</span>
            {row && <span>Uzavřeno: {row.signedAt || "—"}</span>}
            {group.rows.length > 0 && (
              <span>Rez. fond celkem: {formatMoney(group.totalReserveFund)} Kč</span>
            )}
            {group.rows.length > 0 && <span>{rowItemsLabel}</span>}
            {group.payments.length > 0 && <span>{paymentItemsLabel}</span>}
          </div>
          {statusCodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {statusCodes.map((statusCode) => (
                <span
                  key={statusCode}
                  className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-800 ring-1 ring-violet-100"
                >
                  {statusCode}
                </span>
              ))}
              {statusRules.map((rule) => (
                <span
                  key={rule.code}
                  className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
                >
                  {rule.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-slate-950 px-3 py-2 text-right text-white shadow-[0_12px_26px_rgba(15,23,42,0.15)] lg:min-w-[178px]">
          <div className="text-[11px] font-black uppercase tracking-wide text-violet-200">Celkem</div>
          <div className="mt-1 whitespace-nowrap text-lg font-black text-white">
            {formatMoney(group.totalAmount)} Kč
          </div>
          {group.rows.length > 0 && group.payments.length > 0 && (
            <div className="mt-1 text-[11px] font-semibold text-white/70">
              Výpis {formatMoney(group.totalCommission)} Kč · platby {formatMoney(group.totalOtherPayments)} Kč
            </div>
          )}
        </div>
      </div>

      {group.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100">
          <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-violet-50/70 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-violet-800">
            <span>Storna z výpisu</span>
            <span className="text-right">Základna</span>
            <span className="text-right">Provize</span>
            <span className="text-right">Rez. fond</span>
          </div>
          <div className="min-w-[560px] divide-y divide-violet-50 bg-white">
            {group.rows.map((item) => {
              const itemProduct = resolveStatementProduct(item.product);
              const itemClassification = classifyGeneralCommissionCode(item.product, item.type);
              const showProduct = uniqueProducts.length > 1;

              return (
                <div
                  key={`${item.id}-${item.type}-${item.statusCode}-${item.commission}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${generalCommissionKindClass(itemClassification.kind)}`}>
                      {item.type || "—"}
                    </span>
                    {showProduct && <span className="ml-2 font-medium text-slate-500">{itemProduct.rawCode}</span>}
                  </div>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {formatMoney(item.base)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-bold text-slate-950">
                    {formatMoney(item.commission)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {formatMoney(item.reserveFund)} Kč
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {group.payments.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100">
          <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto] gap-3 bg-violet-50/70 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-violet-800">
            <span>Storna z ostatních plateb</span>
            <span className="text-right">Částka</span>
          </div>
          <div className="min-w-[560px] divide-y divide-violet-50 bg-white">
            {group.payments.map((payment) => (
              <div
                key={`payment-${payment.index}-${payment.contractNumber ?? "bez-cisla"}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0 font-medium text-slate-600">
                  {payment.description}
                  {payment.isB36Half && (
                    <span className="ml-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      B36
                    </span>
                  )}
                </div>
                <span className="whitespace-nowrap text-right font-bold text-slate-950">
                  {formatMoney(payment.amount)} Kč
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SystemMatchPanel
        match={match}
        expectedProductKey={row ? resolveStatementProduct(row.product).productKey : null}
        presentation={presentation}
      />
      <StornoSystemActionPanel target={actionTarget} onRequestStorno={onRequestSystemStorno} />
    </article>
  );
}
