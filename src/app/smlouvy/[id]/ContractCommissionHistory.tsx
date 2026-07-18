import { Eye, FileText } from "lucide-react";

import { formatMoney, nameFromEmail } from "./contractDetailHelpers";
import { type ContractCommissionPayout } from "./contractDetailTypes";

type ContractCommissionHistoryProps = {
  payouts?: ContractCommissionPayout[] | null;
  viewerEmail?: string | null;
  contractOwnerEmail?: string | null;
  onOpenStatement?: (statementId: string) => void;
  statementPreviewLoadingId?: string | null;
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
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "storno":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
};

const payoutSortValue = (payout: ContractCommissionPayout): number =>
  typeof payout.writtenAtMs === "number" && Number.isFinite(payout.writtenAtMs)
    ? payout.writtenAtMs
    : 0;

const payoutStatementLabel = (payout: ContractCommissionPayout): string =>
  payout.statementPeriod ?? payout.payoutMonthKey ?? payout.statementDate ?? "Provizní výpis";

const payoutCodeLabel = (payout: ContractCommissionPayout): string =>
  [payout.code, payout.title].filter(Boolean).join(" · ") || "Položka provize";

const normalizeEmail = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

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
      rows: [...group.rows].sort((a, b) => payoutSortValue(b) - payoutSortValue(a)),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.label.localeCompare(b.label, "cs");
    });
};

export function ContractCommissionHistory({
  payouts,
  viewerEmail = null,
  contractOwnerEmail = null,
  onOpenStatement,
  statementPreviewLoadingId,
}: ContractCommissionHistoryProps) {
  const rows = [...(payouts ?? [])].sort((a, b) => payoutSortValue(b) - payoutSortValue(a));
  const groups = groupPayoutsByWriter({
    rows,
    viewerEmail: normalizeEmail(viewerEmail),
    contractOwnerEmail: normalizeEmail(contractOwnerEmail),
  });

  return (
    <section className="rounded-[24px] border border-slate-300/90 bg-white px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight text-slate-900">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white">
            <FileText size={14} strokeWidth={2} aria-hidden="true" />
            Historie
          </span>
          Provizní výpisy u smlouvy
        </h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {rows.length} záznamů
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Zatím bez zapsaných provizních výpisů. Záznamy se zde objeví až po budoucím výsledném zápisu provizí.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((group) => {
            const groupTotal = group.rows.reduce(
              (sum, payout) => sum + (payout.amount ?? 0),
              0
            );

            return (
              <div
                key={group.key}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {group.label}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      {group.detail}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-bold text-slate-950">
                    {group.rows.length} záznamů · {formatMoney(groupTotal)}
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto_auto_auto] gap-3 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <span>Období</span>
                  <span>Položka</span>
                  <span className="text-right">Částka</span>
                  <span className="text-right">Stav</span>
                  <span className="text-right">Náhled</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.rows.map((payout, index) => {
                    const statementId = String(payout.statementId ?? "").trim();
                    const canOpenStatement = Boolean(statementId && onOpenStatement);
                    const isPreviewLoading = statementPreviewLoadingId === statementId;

                    return (
                      <div
                        key={
                          payout.key ??
                          `${payout.statementId ?? "statement"}-${
                            payout.code ?? payout.title ?? index
                          }`
                        }
                        className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">
                            {payoutStatementLabel(payout)}
                          </div>
                          {payout.statementDate && (
                            <div className="mt-0.5 text-xs font-medium text-slate-500">
                              Vystaveno {payout.statementDate}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-700">
                            {payoutCodeLabel(payout)}
                          </div>
                          {payout.detail && (
                            <div className="mt-1 line-clamp-3 text-xs font-medium leading-relaxed text-slate-500">
                              {payout.detail}
                            </div>
                          )}
                        </div>
                        <div className="whitespace-nowrap text-right font-bold text-slate-950">
                          {formatMoney(payout.amount ?? 0)}
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(payout.status)}`}
                          >
                            {statusLabel(payout.status)}
                          </span>
                        </div>
                        <div className="text-right">
                          {canOpenStatement ? (
                            <button
                              type="button"
                              onClick={() => onOpenStatement?.(statementId)}
                              disabled={isPreviewLoading}
                              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                              title="Zobrazit provizní výpis"
                            >
                              <Eye size={13} strokeWidth={2.2} aria-hidden="true" />
                              <span>{isPreviewLoading ? "Načítám" : "Náhled"}</span>
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
