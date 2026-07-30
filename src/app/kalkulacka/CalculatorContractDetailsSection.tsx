"use client";

import { FileText } from "lucide-react";

type ContractNumberLiveCheckStatus =
  | "idle"
  | "checking"
  | "ok"
  | "duplicate"
  | "foundForEndorsement"
  | "notFoundForEndorsement"
  | "error";

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
  contractNumberLiveCheckMode: "newContract" | "endorsement";
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
  contractNumberLiveCheckMode,
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
    <section className="relative overflow-visible rounded-[1.1rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-[1.1rem] bg-[linear-gradient(90deg,#020617_0%,#4c1d95_100%)]" aria-hidden="true" />
      <h2 className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-900 shadow-sm">
          <FileText size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <span>Detaily smlouvy</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Jméno a příjmení klienta</label>
          <div className="relative">
            <input
              type="text"
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 ${
                missingFields.includes("jméno klienta")
                  ? "border-rose-400/70 focus:border-rose-500 focus:ring-rose-500"
                  : pdfMatchedClientName
                  ? "border-emerald-400 bg-emerald-50 focus:border-emerald-600 focus:ring-emerald-600"
                  : "border-violet-200 focus:border-violet-700 focus:ring-violet-700"
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
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-violet-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
                {filteredClientSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Vložit klienta ${name}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      onSelectClientSuggestion(name);
                    }}
                    onClick={() => onSelectClientSuggestion(name)}
                    className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm text-slate-900 hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
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
            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
              missingFields.includes("datum sjednání") ? "border-rose-400/70" : "border-violet-200"
            }`}
            value={contractSignedDate}
            onChange={(event) => onContractSignedDateChange(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Číslo smlouvy</label>
          <input
            type="text"
            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
              missingFields.includes("číslo smlouvy") ? "border-rose-400/70" : "border-violet-200"
            }`}
            value={contractNumber}
            onChange={(event) => onContractNumberChange(event.target.value)}
            placeholder=""
          />
          {contractNumberLiveCheckStatus === "checking" && (
            <p className="text-[11px] text-slate-500">
              {contractNumberLiveCheckMode === "endorsement"
                ? "Ověřuji původní smlouvu pro dodatek…"
                : "Kontroluji duplicitu čísla smlouvy…"}
            </p>
          )}
          {contractNumberLiveCheckStatus === "duplicate" && (
            <p className="text-[11px] text-rose-700">
              Smlouva s tímto číslem už existuje ({contractNumberLiveCheckCount ?? 0}×).
            </p>
          )}
          {contractNumberLiveCheckStatus === "foundForEndorsement" && (
            <p className="text-[11px] text-emerald-700">
              Původní smlouva nalezena ({contractNumberLiveCheckCount ?? 0}×). Změna se uloží jako dodatek.
            </p>
          )}
          {contractNumberLiveCheckStatus === "notFoundForEndorsement" && (
            <p className="text-[11px] text-amber-700">
              Původní smlouva s tímto číslem u vybraného poradce a produktu zatím není nalezena.
            </p>
          )}
          {contractNumberLiveCheckStatus === "error" && (
            <p className="text-[11px] text-amber-700">
              {contractNumberLiveCheckMode === "endorsement"
                ? "Nepodařilo se ověřit původní smlouvu pro dodatek."
                : "Nepodařilo se ověřit duplicitu čísla smlouvy."}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-slate-800">Datum počátku smlouvy</label>
          <input
            type="date"
            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
              missingFields.includes("datum počátku") ? "border-rose-400/70" : "border-violet-200"
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
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
              value={policyEndDate}
              onChange={(event) => onPolicyEndDateChange(event.target.value)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
