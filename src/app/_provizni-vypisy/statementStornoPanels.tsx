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
  resolveStatementProduct,
} from "./statementParsing";
import {
  fullAutoStornoInferenceForGroup,
  groupStornoItemsByContract,
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
  type StornoGroupEntry = (typeof stornoGroupEntries)[number];
  const stornoSectionTotal = (entries: StornoGroupEntry[]): number =>
    entries.reduce((sum, entry) => sum + entry.group.totalAmount, 0);
  const pairedNeedsSystemStornoCount = pairedStornoGroupEntries.filter(
    (entry) => entry.systemContract && !systemContractIsStorno(entry.systemContract)
  ).length;
  const stornoSections = [
    {
      key: "paired",
      title: "Spárované",
      description: "Smlouvy nalezené v systému.",
      entries: pairedStornoGroupEntries,
      expanded: pairedExpanded,
      onToggle: () => setPairedExpanded((value) => !value),
      icon: CheckCircle2,
      warningCount: pairedNeedsSystemStornoCount,
      warningLabel: "čeká na označení storna",
      warningClass: "bg-amber-100 text-amber-900",
    },
    {
      key: "unpaired",
      title: "Nespárované",
      description: "Vyžadují ruční spárování.",
      entries: unpairedStornoGroupEntries,
      expanded: unpairedExpanded,
      onToggle: () => setUnpairedExpanded((value) => !value),
      icon: AlertTriangle,
      warningCount: unpairedStornoGroupEntries.length,
      warningLabel: "k ručnímu spárování",
      warningClass: "bg-amber-100 text-amber-900",
    },
  ].filter((section) => section.entries.length > 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-950">Storna</h3>
            <p className="text-sm text-slate-600">
              {pairedStornoGroupEntries.length} spárovaných · {unpairedStornoGroupEntries.length} nespárovaných
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-3 text-right">
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Celkem</span>
            <span className="block text-lg font-black text-rose-700">{formatMoney(totalStorno)} Kč</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-slate-200 px-4 py-4">
          {stornoSections.map((section) => {
            const SectionIcon = section.icon;
            const sectionTotal = stornoSectionTotal(section.entries);

            return (
              <section key={`storno-section-${section.key}`}>
                <button
                  type="button"
                  onClick={section.onToggle}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-slate-50"
                  aria-expanded={section.expanded}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        section.key === "paired" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <SectionIcon className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-950">{section.title}</h4>
                      <p className="text-xs text-slate-600">{section.description}</p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-right">
                    <span>
                      <span className="block text-sm font-black text-slate-950">{formatMoney(sectionTotal)} Kč</span>
                      <span className="block text-xs font-medium text-slate-500">{section.entries.length} smluv</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-500 transition-transform ${section.expanded ? "rotate-180" : ""}`}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {section.warningCount > 0 && (
                  <p className={`mt-1 rounded-md px-3 py-2 text-xs font-semibold ${section.warningClass}`}>
                    {section.warningCount} {section.warningLabel}
                  </p>
                )}
                {section.expanded && (
                  <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
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
              </section>
            );
          })}
        </div>
      )}
    </section>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    <article className="bg-white text-sm">
      <button
        type="button"
        onClick={() => setDetailsOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
        aria-expanded={detailsOpen}
      >
        <div className="min-w-0">
          <div className="truncate font-bold text-slate-950">
            Smlouva {group.contractNumber || "bez čísla"}
          </div>
          <div className="mt-0.5 truncate font-semibold text-slate-800">{displayClient}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <span>{productLabel}</span>
            {group.rows.length > 0 && <span>· {rowItemsLabel}</span>}
            {group.payments.length > 0 && <span>· {paymentItemsLabel}</span>}
          </div>
          <div className="mt-2">
            {systemContract ? (
              <StornoSystemStatusBadge contract={systemContract} />
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                Nenalezeno v systému
              </span>
            )}
          </div>
        </div>
        <span className="whitespace-nowrap text-right text-base font-black text-rose-700">
          {formatMoney(group.totalAmount)} Kč
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
          strokeWidth={2.2}
          aria-hidden="true"
        />
      </button>

      {detailsOpen && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <BohemkaContractDetailLink contract={systemContract} compact />
            <ContractDetailLink href={row?.detailUrl} compact />
            <SjednatelExtranetLink href={extranetUrl} compact />
            <SystemMatchBadge match={match} presentation={presentation} />
            {hasB36Payment && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">B36</span>
            )}
          </div>

          {markedItem && <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />}

          {statusCodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-500">Stav z výpisu:</span>
              {statusCodes.map((statusCode) => (
                <span key={statusCode} className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-800">
                  {statusCode}
                </span>
              ))}
              {statusRules.map((rule) => (
                <span key={rule.code} className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                  {rule.label}
                </span>
              ))}
            </div>
          )}

          {group.rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                <span>Položky storna</span>
                <span>Provize</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.rows.map((item) => {
                  const itemProduct = resolveStatementProduct(item.product);
                  const itemClassification = classifyGeneralCommissionCode(item.product, item.type);
                  const showProduct = uniqueProducts.length > 1;

                  return (
                    <div
                      key={`${item.id}-${item.type}-${item.statusCode}-${item.commission}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${generalCommissionKindClass(itemClassification.kind)}`}>
                          {item.type || "—"}
                        </span>
                        {showProduct && <span className="ml-2 text-slate-500">{itemProduct.rawCode}</span>}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-bold text-slate-950">
                        {formatMoney(item.commission)} Kč
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {group.payments.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                <span>Ostatní platby</span>
                <span>Částka</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.payments.map((payment) => (
                  <div
                    key={`payment-${payment.index}-${payment.contractNumber ?? "bez-cisla"}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 font-medium text-slate-700">{payment.description}</span>
                    <span className="shrink-0 whitespace-nowrap font-bold text-slate-950">
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
        </div>
      )}
    </article>
  );
}
