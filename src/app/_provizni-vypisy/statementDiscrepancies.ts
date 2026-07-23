import {
  normalizeContractNumberForMatch,
  normalizeText,
} from "./statementParsing";
import type {
  ContractMatchScope,
  DiscrepancyReviewState,
  ManualDiscrepancyItem,
  MarkedDiscrepancyItem,
  ParsedStatement,
  PrintableDiscrepancyItem,
  StatementDiscrepancyIssue,
  StatementDiscrepancySeverity,
} from "./statementTypes";

export const statementDiscrepancyKey = (statement: ParsedStatement): string => {
  const parts = [
    statement.header.statementNumber ? `vypis-${statement.header.statementNumber}` : null,
    statement.header.statementDate,
    statement.header.period,
    statement.fileName,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean);

  return parts.join("::") || statement.fileName || "provizni-vypis";
};

export const discrepancyIssueKey = (
  ...parts: Array<string | number | null | undefined>
): string =>
  parts
    .map((part) => normalizeText(String(part ?? "")))
    .filter(Boolean)
    .join("::");

export const hasFiniteNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const discrepancySeverityLabel = (
  severity: StatementDiscrepancySeverity
): string => {
  switch (severity) {
    case "error":
      return "K opravě";
    case "warning":
      return "Ke kontrole";
    default:
      return "Poznámka";
  }
};

export const discrepancySeverityClass = (
  severity: StatementDiscrepancySeverity
): string => {
  switch (severity) {
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
};

export const discrepancyScopeLabel = (scope: ContractMatchScope | null): string => {
  if (scope === "team") return "Týmová smlouva";
  if (scope === "tip") return "TIP provize";
  if (scope === "my") return "Vlastní smlouva";
  return "Výpis";
};

export const manualDiscrepancyToIssue = (
  item: ManualDiscrepancyItem
): StatementDiscrepancyIssue => {
  const amountText = normalizeText(item.amountText);

  return {
    key: item.key,
    statementKey: item.statementKey,
    source: "manual",
    severity: "warning",
    category: "Ručně označeno",
    scope: null,
    contractNumber: normalizeText(item.contractNumber) || null,
    client: normalizeText(item.client) || "—",
    product: normalizeText(item.product) || "—",
    title: normalizeText(item.title) || "Ručně označená nesrovnalost",
    details: amountText ? [`Částka / rozdíl: ${amountText}`] : [],
    manualAmountText: amountText || undefined,
  };
};

export const buildPrintableDiscrepancyItems = (
  autoIssues: StatementDiscrepancyIssue[],
  reviewState: DiscrepancyReviewState,
  manualItems: ManualDiscrepancyItem[]
): PrintableDiscrepancyItem[] => [
  ...autoIssues
    .map((issue) => ({
      ...issue,
      selected: reviewState[issue.key]?.selected ?? true,
      note: normalizeText(reviewState[issue.key]?.note),
    }))
    .filter((issue) => issue.selected),
  ...manualItems
    .filter((item) => item.selected)
    .map((item) => ({
      ...manualDiscrepancyToIssue(item),
      selected: true,
      note: normalizeText(item.note),
    })),
];

export const markedDiscrepancyKey = ({
  statementKey,
  scope,
  category,
  contractNumber,
  fallback,
}: {
  statementKey: string;
  scope: ContractMatchScope | null;
  category: string;
  contractNumber: string | null | undefined;
  fallback: string;
}): string =>
  discrepancyIssueKey(
    statementKey,
    "marked",
    scope ?? "statement",
    category,
    normalizeContractNumberForMatch(contractNumber) || fallback
  );

export const statementDiscrepancyLabel = (statement: ParsedStatement): string =>
  [
    statement.header.statementNumber ? `Výpis ${statement.header.statementNumber}` : "Provizní výpis",
    statement.header.period,
  ]
    .filter(Boolean)
    .join(" · ");

export const matchingAutoIssuesForMarkedItem = (
  item: MarkedDiscrepancyItem,
  autoIssues: StatementDiscrepancyIssue[]
): StatementDiscrepancyIssue[] => {
  const itemContract = normalizeContractNumberForMatch(item.contractNumber);
  if (!itemContract) return [];

  return autoIssues.filter((issue) => {
    if (issue.statementKey !== item.statementKey) return false;
    if (normalizeContractNumberForMatch(issue.contractNumber) !== itemContract) return false;
    if (item.scope && issue.scope && item.scope !== issue.scope) return false;
    return true;
  });
};
