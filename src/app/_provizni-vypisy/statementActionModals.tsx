"use client";

import { Loader2, RotateCcw, X } from "lucide-react";

import {
  ContractDetailLink,
  firstSjednatelExtranetUrl,
  SjednatelExtranetLink,
} from "./statementLinksAndCalculator";
import {
  formatLocalDate,
  formatMoney,
  formatWholeMoney,
  productLabelFromKey,
} from "./statementParsing";
import type {
  PostProcessingNeonRefreshPromptTarget,
  StornoStatementActionTarget,
} from "./statementTypes";

export function StornoStatementActionModal({
  target,
  dateInput,
  saving,
  error,
  onDateChange,
  onClose,
  onConfirm,
}: {
  target: StornoStatementActionTarget;
  dateInput: string;
  saving: boolean;
  error: string | null;
  onDateChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const extranetUrl = firstSjednatelExtranetUrl([], target.contract);
  const inference = target.inference ?? null;
  const inferenceAmountSourceTitle =
    inference?.matchedSource === "contract_item" ? "Provize v detailu" : "Původní výplata";
  const inferenceDateSourceTitle =
    inference?.referenceDateSource === "statement_period"
      ? "Konec období výpisu"
      : inference?.referenceDateSource === "statement_period_overlap"
        ? "Překryv období a lhůty"
        : inference?.referenceDateSource === "row_date"
          ? "Datum řádku storna"
          : "Navržené datum";
  const inferenceDatePrefillLabel =
    inference?.referenceDateSource === "statement_period"
      ? "konce období výpisu"
      : inference?.referenceDateSource === "statement_period_overlap"
        ? "překryvu období výpisu a dvouměsíční lhůty"
        : inference?.referenceDateSource === "row_date"
          ? "data řádku storna"
          : "navrženého data";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít označení storna"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Označit smlouvu jako stornovanou"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">
              Označit jako stornovanou
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Smlouva {target.contractNumber || "—"} · {target.client}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">{target.product}</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              {inference
                ? `Pravděpodobně jde o storno smlouvy do 2 měsíců od počátku. Datum je předvyplněné podle ${inferenceDatePrefillLabel}.`
                : "Datum storna ověř v MAXXu nebo Extranetu a pak ho ulož do systému."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
            aria-label="Zavřít"
          >
            ×
          </button>
        </div>

        {(target.contract.maxxContractDetailUrl || extranetUrl) && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <ContractDetailLink href={target.contract.maxxContractDetailUrl} compact />
            <SjednatelExtranetLink href={extranetUrl} compact />
          </div>
        )}

        {inference && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <div className="font-semibold">Doporučení z výpisu</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Vrácená provize
                </div>
                <div className="font-semibold">{formatMoney(inference.stornoAmount)} Kč</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  {inferenceAmountSourceTitle}
                </div>
                <div className="font-semibold">{formatMoney(inference.matchedPaidAmount)} Kč</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Počátek smlouvy
                </div>
                <div className="font-semibold">
                  {formatLocalDate(inference.policyStartDate)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  {inferenceDateSourceTitle}
                </div>
                <div className="font-semibold">
                  {formatLocalDate(inference.suggestedDate)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs font-medium text-amber-800">
              Hranice pro plné storno je {formatLocalDate(inference.fullStornoBoundaryDate)}.
              Uložením se smlouva označí jako storno k navrženému datu, provize z výpisu se tím
              nepřepíše.
            </div>
          </div>
        )}

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Datum storna
          <input
            type="date"
            value={dateInput}
            onChange={(event) => onDateChange(event.target.value)}
            disabled={saving}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(180,83,9,0.25)] transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            )}
            Uložit storno
          </button>
        </div>
      </div>
    </div>
  );
}

export function NeonRefreshConversionPromptModal({
  target,
  totalCount,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  target: PostProcessingNeonRefreshPromptTarget;
  totalCount: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít převod smlouvy na REFRESH"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Označit smlouvu jako REFRESH"
        className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800">
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              REFRESH z výpisu
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              Označit smlouvu jako REFRESH?
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Smlouva {target.contractNumber} · {target.client}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div className="font-bold">Výpis uvádí produkt {target.productCode}</div>
          <p className="mt-1 font-medium text-sky-900">
            V systému smlouva zatím není vedená jako REFRESH. Převod nastaví REFRESH režim a
            převezme základnu z výpisu, aby očekávané provize odpovídaly výpisu.
          </p>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Výpis
            </div>
            <div className="mt-1 font-semibold text-slate-900">{target.statementLabel}</div>
            <div className="mt-1 text-slate-600">
              Základna {formatWholeMoney(target.statementAnnualPremium)} Kč ročně
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Systém teď
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {productLabelFromKey(target.contract.productKey)}
            </div>
            <div className="mt-1 text-slate-600">
              {target.systemAnnualPremium == null
                ? "Základna není jistá"
                : `${formatWholeMoney(target.systemAnnualPremium)} Kč ročně (${formatWholeMoney(
                    target.systemMonthlyPremium ?? target.systemAnnualPremium / 12
                  )} Kč měsíčně)`}
            </div>
          </div>
        </div>

        {totalCount > 1 && (
          <p className="mt-3 text-sm font-medium text-slate-500">
            Po potvrzení se zobrazí další nalezená REFRESH smlouva.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Teď ne
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-950 bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
            Označit jako REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}
