"use client";

import { FileText } from "lucide-react";

type ContractNumberLiveCheckStatus = "idle" | "checking" | "ok" | "duplicate" | "error";

type CalculatorContractDetailsSectionProps = {
  isVisible: boolean;
  missingFields: string[];
  clientName: string;
  pdfClientNameLoaded: boolean;
  pdfMatchedClientName: boolean;
  filteredClientSuggestions: string[];
  clientSuggestionsOpen: boolean;
  contractSignedDate: string;
  contractNumber: string;
  contractNumberLiveCheckStatus: ContractNumberLiveCheckStatus;
  contractNumberLiveCheckCount: number | null;
  policyStartDate: string;
  contractDateErrorText: string | null;
  contractDateWarningText: string | null;
  showPolicyEndDateField: boolean;
  policyEndDate: string;
  onClientNameChange: (value: string) => void;
  onClientNameFocus: () => void;
  onClientNameBlur: () => void;
  onSelectClientSuggestion: (name: string) => void;
  onContractSignedDateChange: (value: string) => void;
  onContractNumberChange: (value: string) => void;
  onPolicyStartDateChange: (value: string) => void;
  onPolicyEndDateChange: (value: string) => void;
};

export function CalculatorContractDetailsSection({
  isVisible,
  missingFields,
  clientName,
  pdfClientNameLoaded,
  pdfMatchedClientName,
  filteredClientSuggestions,
  clientSuggestionsOpen,
  contractSignedDate,
  contractNumber,
  contractNumberLiveCheckStatus,
  contractNumberLiveCheckCount,
  policyStartDate,
  contractDateErrorText,
  contractDateWarningText,
  showPolicyEndDateField,
  policyEndDate,
  onClientNameChange,
  onClientNameFocus,
  onClientNameBlur,
  onSelectClientSuggestion,
  onContractSignedDateChange,
  onContractNumberChange,
  onPolicyStartDateChange,
  onPolicyEndDateChange,
}: CalculatorContractDetailsSectionProps) {
  if (!isVisible) return null;

  return (
    <section className="relative overflow-hidden rounded-[1.35rem] border border-slate-300 bg-white/90 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#94a3b8_56%,#e2e8f0_100%)]" aria-hidden="true" />
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
          <FileText size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <span>Detaily smlouvy</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Jméno a příjmení klienta</label>
          <div className="relative">
            <input
              type="text"
              className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 ${
                missingFields.includes("jméno klienta")
                  ? "border-rose-400/70 focus:border-rose-500 focus:ring-rose-500"
                  : pdfMatchedClientName
                  ? "border-emerald-400 bg-emerald-50 focus:border-emerald-600 focus:ring-emerald-600"
                  : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
              }`}
              value={clientName}
              onChange={(event) => onClientNameChange(event.target.value)}
              placeholder="Např. Jan Novák"
              autoComplete="off"
              onFocus={onClientNameFocus}
              onBlur={onClientNameBlur}
            />
            {pdfClientNameLoaded && !missingFields.includes("jméno klienta") && (
              <p className={`mt-1 text-[11px] ${pdfMatchedClientName ? "text-emerald-700" : "text-slate-600"}`}>
                {pdfMatchedClientName
                  ? "Jméno klienta načteno z PDF. Nalezena shoda s klientem v systému."
                  : "Jméno klienta načteno z PDF. V systému zatím bez přesné shody."}
              </p>
            )}
            {filteredClientSuggestions.length > 0 && clientSuggestionsOpen && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
                {filteredClientSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onSelectClientSuggestion(name)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100"
                  >
                    <span>{name}</span>
                    <span className="text-xs text-slate-400">vložit</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Datum sjednání smlouvy</label>
          <input
            type="date"
            className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
              missingFields.includes("datum sjednání") ? "border-rose-400/70" : "border-slate-300"
            }`}
            value={contractSignedDate}
            onChange={(event) => onContractSignedDateChange(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Číslo smlouvy</label>
          <input
            type="text"
            className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
              missingFields.includes("číslo smlouvy") ? "border-rose-400/70" : "border-slate-300"
            }`}
            value={contractNumber}
            onChange={(event) => onContractNumberChange(event.target.value)}
            placeholder=""
          />
          {contractNumberLiveCheckStatus === "checking" && (
            <p className="text-[11px] text-slate-500">Kontroluji duplicitu čísla smlouvy…</p>
          )}
          {contractNumberLiveCheckStatus === "duplicate" && (
            <p className="text-[11px] text-rose-700">
              Smlouva s tímto číslem už existuje ({contractNumberLiveCheckCount ?? 0}×).
            </p>
          )}
          {contractNumberLiveCheckStatus === "error" && (
            <p className="text-[11px] text-amber-700">Nepodařilo se ověřit duplicitu čísla smlouvy.</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Datum počátku smlouvy</label>
          <input
            type="date"
            className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900 ${
              missingFields.includes("datum počátku") ? "border-rose-400/70" : "border-slate-300"
            }`}
            value={policyStartDate}
            onChange={(event) => onPolicyStartDateChange(event.target.value)}
          />
          {contractDateErrorText && <p className="text-[11px] text-rose-700">{contractDateErrorText}</p>}
          {!contractDateErrorText && contractDateWarningText && (
            <p className="text-[11px] text-amber-700">{contractDateWarningText}</p>
          )}
        </div>

        {showPolicyEndDateField && (
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-800">Pojištění do (volitelné)</label>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
              value={policyEndDate}
              onChange={(event) => onPolicyEndDateChange(event.target.value)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
