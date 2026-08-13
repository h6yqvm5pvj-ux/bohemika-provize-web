"use client";

import { useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import type { PaymentFrequency, Product } from "@/app/types/domain";

import type { StatementCalculatorPrefill } from "./statementPresentation";

export type CppAutoBatchQueueStatus =
  | "ready"
  | "saving"
  | "saved"
  | "error"
  | "attachment_error";

export type CppAutoBatchQueueItem = {
  id: string;
  product: Extract<Product, "cppAuto" | "domex">;
  sourceProductCode: string;
  statementId: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  statementChronologyMs: number | null;
  queuedAtMs: number;
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
  amountText: string;
  frequency: PaymentFrequency;
  stornoDate: string;
  pdfFile: File | null;
  status: CppAutoBatchQueueStatus;
  message: string | null;
};

export type CppAutoBatchQueuePatch = Partial<
  Pick<
    CppAutoBatchQueueItem,
    | "contractNumber"
    | "clientName"
    | "contractSignedDate"
    | "policyStartDate"
    | "amountText"
    | "frequency"
    | "stornoDate"
    | "pdfFile"
  >
>;

const normalizedContractNumber = (value: string): string =>
  value.trim().replace(/\s+/g, "").toLocaleUpperCase("cs-CZ");

export const cppAutoBatchQueueAmount = (value: string): number =>
  Number(value.trim().replace(/\s+/g, "").replace(",", "."));

export const cppAutoBatchQueueItemKey = (
  prefill: Pick<StatementCalculatorPrefill, "product" | "contractNumber">
): string => {
  const contractNumber = normalizedContractNumber(prefill.contractNumber);
  return contractNumber ? `${prefill.product}:${contractNumber}` : "";
};

export const cppAutoBatchQueueItemFromPrefill = (
  prefill: StatementCalculatorPrefill
): CppAutoBatchQueueItem => {
  const queuedAtMs = Date.now();
  const contractKey = cppAutoBatchQueueItemKey(prefill) || `without-number-${queuedAtMs}`;

  return {
    id: `cpp-a101:${contractKey}:${queuedAtMs}`,
    product: prefill.product === "domex" ? "domex" : "cppAuto",
    sourceProductCode: prefill.sourceProductCode,
    statementId: prefill.statementId,
    statementNumber: prefill.statementNumber,
    statementPeriod: prefill.statementPeriod,
    statementDate: prefill.statementDate,
    statementChronologyMs: prefill.statementChronologyMs,
    queuedAtMs,
    contractNumber: prefill.contractNumber,
    clientName: prefill.clientName,
    contractSignedDate: prefill.contractSignedDate,
    policyStartDate: prefill.policyStartDate,
    amountText: prefill.amountText,
    frequency: prefill.frequency,
    stornoDate: "",
    pdfFile: null,
    status: "ready",
    message: null,
  };
};

const parseIsoDay = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const parsed = new Date(year, month - 1, day);
  if (
    !year || !month || !day ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const validateCppAutoBatchQueueItem = (item: CppAutoBatchQueueItem): string | null => {
  if (!item.contractNumber.trim()) return "Doplň číslo smlouvy.";
  if (!item.clientName.trim()) return "Doplň jméno klienta.";

  const signedAt = parseIsoDay(item.contractSignedDate);
  if (!signedAt) return "Doplň platné datum sjednání.";
  const policyStart = parseIsoDay(item.policyStartDate);
  if (!policyStart) return "Doplň platné datum počátku.";
  if (policyStart.getTime() < signedAt.getTime()) {
    return "Počátek smlouvy nesmí být před datem sjednání.";
  }

  const amount = cppAutoBatchQueueAmount(item.amountText);
  if (!Number.isFinite(amount) || amount <= 0) return "Pojistné musí být větší než nula.";

  if (item.stornoDate.trim()) {
    const stornoDate = parseIsoDay(item.stornoDate);
    if (!stornoDate) return "Datum storna není platné.";
    if (stornoDate.getTime() < policyStart.getTime()) {
      return "Datum storna nesmí být před počátkem smlouvy.";
    }
  }

  if (
    item.pdfFile &&
    item.pdfFile.type !== "application/pdf" &&
    !item.pdfFile.name.toLocaleLowerCase("cs-CZ").endsWith(".pdf")
  ) {
    return "Příloha musí být PDF soubor.";
  }

  return null;
};

const statusPresentation = (
  item: CppAutoBatchQueueItem
): { label: string; className: string } => {
  switch (item.status) {
    case "saving":
      return { label: "Ukládám", className: "border-sky-200 bg-sky-50 text-sky-800" };
    case "saved":
      return { label: "Uloženo", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    case "attachment_error":
      return { label: "PDF vyžaduje opravu", className: "border-amber-200 bg-amber-50 text-amber-900" };
    case "error":
      return { label: "Vyžaduje opravu", className: "border-rose-200 bg-rose-50 text-rose-800" };
    default:
      return { label: "Připraveno", className: "border-slate-200 bg-slate-50 text-slate-700" };
  }
};

const queueItemDisabled = (item: CppAutoBatchQueueItem, running: boolean): boolean =>
  running || item.status === "saving" || item.status === "saved";

export function CppAutoBatchQueue({
  items,
  isRunning,
  onUpdate,
  onRemove,
  onRun,
  onClearSaved,
  notice,
}: {
  items: CppAutoBatchQueueItem[];
  isRunning: boolean;
  onUpdate: (id: string, patch: CppAutoBatchQueuePatch) => void;
  onRemove: (id: string) => void;
  onRun: () => void;
  onClearSaved: () => void;
  notice?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const pendingCount = items.filter((item) => item.status !== "saved").length;
  const savedCount = items.filter((item) => item.status === "saved").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/55 shadow-[0_14px_32px_rgba(5,150,105,0.08)]">
      <div className="flex flex-col gap-3 bg-white/75 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-controls="cpp-auto-batch-queue-content"
        >
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-base font-black text-slate-950">Fronta ČPP Auto a DOMEX · A101</h2>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {pendingCount} {pendingCount === 1 ? "smlouva" : "smluv"}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {expanded
              ? "Uprav údaje a nahraj připravené smlouvy."
              : "Rozbalit a zkontrolovat připravené smlouvy."}
          </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-emerald-800 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {savedCount > 0 && (
            <button
              type="button"
              disabled={isRunning}
              onClick={onClearSaved}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Skrýt uložené ({savedCount})
            </button>
          )}
          <button
            type="button"
            disabled={isRunning || pendingCount === 0}
            onClick={() => {
              setExpanded(true);
              onRun();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-[0_10px_22px_rgba(4,120,87,0.2)] hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
            {isRunning ? "Nahrávám frontu…" : `Nahrát frontu (${pendingCount})`}
          </button>
        </div>
      </div>

      <div
        id="cpp-auto-batch-queue-content"
        className={expanded ? "border-t border-emerald-200" : "hidden"}
      >
        {notice && (
          <div className="mx-3 mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 sm:mx-4">
            {notice}
          </div>
        )}

        <div className="space-y-3 p-3 sm:p-4">
        {items.map((item) => {
          const status = statusPresentation(item);
          const disabled = queueItemDisabled(item, isRunning);
          const sourceLabel = [item.statementNumber, item.statementPeriod]
            .filter(Boolean)
            .join(" · ");

          return (
            <article key={item.id} className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-950">
                      {item.product === "domex" ? "ČPP DOMEX" : "ČPP Auto"} · {item.sourceProductCode || "A101"}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${status.className}`}>
                      {item.status === "saving" && (
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {item.status === "saved" && (
                        <CheckCircle2 className="mr-1 inline h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {(item.status === "error" || item.status === "attachment_error") && (
                        <TriangleAlert className="mr-1 inline h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      {status.label}
                    </span>
                  </div>
                  {sourceLabel && <div className="mt-1 text-xs font-medium text-slate-500">Výpis: {sourceLabel}</div>}
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(item.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Odebrat smlouvu ${item.contractNumber || "z fronty"}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-bold text-slate-600">
                  Číslo smlouvy
                  <input
                    value={item.contractNumber}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { contractNumber: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Klient
                  <input
                    value={item.clientName}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { clientName: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Sjednáno
                  <input
                    type="date"
                    value={item.contractSignedDate}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { contractSignedDate: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Počátek
                  <input
                    type="date"
                    value={item.policyStartDate}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { policyStartDate: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Pojistné
                  <input
                    inputMode="decimal"
                    value={item.amountText}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { amountText: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Frekvence
                  <select
                    value={item.frequency}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { frequency: event.target.value as PaymentFrequency })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="monthly">měsíční</option>
                    <option value="quarterly">čtvrtletní</option>
                    <option value="semiannual">pololetní</option>
                    <option value="annual">roční</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Datum storna
                  <input
                    type="date"
                    value={item.stornoDate}
                    disabled={disabled}
                    onChange={(event) => onUpdate(item.id, { stornoDate: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Smlouva v PDF
                  <span className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={2.2} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.pdfFile?.name || "Bez PDF"}</span>
                    {!disabled && (
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="w-[94px] text-[10px] font-medium text-slate-600 file:mr-1 file:rounded file:border-0 file:bg-emerald-50 file:px-1.5 file:py-1 file:text-[10px] file:font-bold file:text-emerald-800"
                        onChange={(event) => onUpdate(item.id, { pdfFile: event.target.files?.[0] ?? null })}
                      />
                    )}
                  </span>
                </label>
              </div>

              {item.message && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                    item.status === "saved"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : item.status === "attachment_error"
                        ? "border border-amber-200 bg-amber-50 text-amber-900"
                        : "border border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {item.message}
                </div>
              )}
              {!item.statementId && item.status !== "saved" && (
                <div className="mt-3 text-xs font-semibold text-amber-800">
                  Zdrojový výpis zatím není uložený; po dokončení dávky se obnoví párování na obrazovce,
                  samotný výpis se ale nebude moci zpracovat znovu automaticky.
                </div>
              )}
            </article>
          );
        })}
        </div>
      </div>
    </section>
  );
}
