"use client";

import { useId, useState } from "react";
import styles from "./calculatorForm.module.css";
import { CheckCircle2, FileText, LoaderCircle } from "lucide-react";
import { CLIENT_NAME_MATCH_LABELS, type ClientNameMatch } from "./clientNameMatching";
import type { ClientNameLookupStatus } from "./useClientNameLookup";

type ContractNumberLiveCheckStatus =
  | "idle"
  | "checking"
  | "ok"
  | "duplicate"
  | "foundForEndorsement"
  | "notFoundForEndorsement"
  | "error";

type CalculatorContractDetailsSectionProps = {
  pensionProduct?: boolean;
  isVisible: boolean;
  missingFields: string[];
  clientName: string;
  clientNameSource: "pdf" | "statement" | null;
  clientNameMatches: ClientNameMatch[];
  clientLookupStatus: ClientNameLookupStatus;
  clientSuggestionsOpen: boolean;
  onRetryClientLookup: () => void;
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
  stornoDate: string;
  onClientNameChange: (value: string) => void;
  onClientNameFocus: () => void;
  onClientNameBlur: () => void;
  onSelectClientSuggestion: (name: string) => void;
  onContractSignedDateChange: (value: string) => void;
  onContractNumberChange: (value: string) => void;
  onPolicyStartDateChange: (value: string) => void;
  onPolicyEndDateChange: (value: string) => void;
  onStornoDateChange: (value: string) => void;
};

export function CalculatorContractDetailsSection({
  pensionProduct = false,
  isVisible,
  missingFields,
  clientName,
  clientNameSource,
  clientNameMatches,
  clientLookupStatus,
  clientSuggestionsOpen,
  onRetryClientLookup,
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
  stornoDate,
  onClientNameChange,
  onClientNameFocus,
  onClientNameBlur,
  onSelectClientSuggestion,
  onContractSignedDateChange,
  onContractNumberChange,
  onPolicyStartDateChange,
  onPolicyEndDateChange,
  onStornoDateChange,
}: CalculatorContractDetailsSectionProps) {
  const clientInputId = useId();
  const listId = `${clientInputId}-suggestions`;
  const statusId = `${clientInputId}-status`;
  const [activeSuggestion, setActiveSuggestion] = useState<{ name: string; query: string } | null>(null);
  const exactMatch = clientNameMatches.find((match) => match.kind === "exact");
  const showSuggestions = !exactMatch && clientSuggestionsOpen && clientNameMatches.length > 0;
  const activeIndex = activeSuggestion?.query === clientName
    ? clientNameMatches.findIndex((match) => match.name === activeSuggestion.name)
    : -1;
  const sourceLabel = clientNameSource === "pdf" ? "Jméno načteno z PDF. "
    : clientNameSource === "statement" ? "Jméno načteno z výpisu. " : "";
  const hasNameQuery = clientName.trim().length >= 2;
  const statusText = exactMatch ? "Přesná shoda jména v systému."
    : clientLookupStatus === "loading" ? "Hledám shodu v systému…"
    : clientLookupStatus === "error" ? "Vyhledávání se nepodařilo dokončit."
    : clientLookupStatus === "idle" ? "Vyhledávání čeká na přihlášení."
    : clientNameMatches.some((match) => match.kind === "normalized" || match.kind === "reordered")
      ? "Nalezen jiný zápis jména. Vyber klienta ze seznamu."
      : "Přesná shoda jména v systému nenalezena.";
  if (!isVisible) return null;

  return (
    <section className={`${styles.card} ${styles.fields}`}>
      <h2 className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><FileText size={18} strokeWidth={1.7} aria-hidden="true" /></span>
        Detaily smlouvy
      </h2>
      <div className={styles.fieldGrid}>
        <div className="space-y-1">
          <label htmlFor={clientInputId} className="block text-sm font-semibold text-slate-800">Jméno a příjmení klienta</label>
          <div className="relative">
            <input
              type="text"
              id={clientInputId}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={showSuggestions ? listId : undefined}
              aria-describedby={hasNameQuery ? statusId : undefined}
              aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 ${
                missingFields.includes("jméno klienta")
                  ? "border-rose-400/70 focus:border-rose-500 focus:ring-rose-500"
                  : exactMatch
                  ? "border-emerald-400 bg-emerald-50 focus:border-emerald-600 focus:ring-emerald-600"
                  : "border-violet-200 focus:border-violet-700 focus:ring-violet-700"
              }`}
              value={clientName}
              onChange={(event) => {
                setActiveSuggestion(null);
                onClientNameChange(event.target.value);
              }}
              placeholder="Např. Jan Novák"
              autoComplete="off"
              onFocus={onClientNameFocus}
              onBlur={onClientNameBlur}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setActiveSuggestion(null);
                  onClientNameBlur();
                  return;
                }
                if (exactMatch || !clientNameMatches.length) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  onClientNameFocus();
                  const nextIndex = event.key === "ArrowDown"
                    ? (activeIndex + 1) % clientNameMatches.length
                    : (activeIndex < 0 ? clientNameMatches.length - 1 : (activeIndex + clientNameMatches.length - 1) % clientNameMatches.length);
                  setActiveSuggestion({ name: clientNameMatches[nextIndex].name, query: clientName });
                } else if (event.key === "Enter" && showSuggestions && activeIndex >= 0) {
                  event.preventDefault();
                  onSelectClientSuggestion(clientNameMatches[activeIndex].name);
                  setActiveSuggestion(null);
                }
              }}
            />
            {hasNameQuery && !missingFields.includes("jméno klienta") && (
              <div id={statusId} role="status" className={`mt-1 flex items-start gap-1.5 text-[11px] ${exactMatch ? "text-emerald-700" : "text-slate-600"}`}>
                {exactMatch ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  : clientLookupStatus === "loading" ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : null}
                <span>{sourceLabel}{statusText}{clientLookupStatus === "error" && (
                  <button type="button" onClick={onRetryClientLookup} className="ml-1 font-semibold text-violet-700 underline">Zkusit znovu</button>
                )}</span>
              </div>
            )}
            {showSuggestions && (
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-violet-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
                <div className="border-b border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">Vyber jméno ze systému</div>
                <div id={listId} role="listbox" aria-label="Nalezená jména klientů">
                {clientNameMatches.map(({ name, kind }, index) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    aria-label={`Vložit klienta ${name}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => onSelectClientSuggestion(name)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-900 hover:bg-violet-50 focus:bg-violet-50 focus:outline-none ${index === activeIndex ? "bg-violet-50" : ""}`}
                  >
                    <span>{name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{CLIENT_NAME_MATCH_LABELS[kind]}</span>
                  </button>
                ))}
                </div>
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
            aria-label="Datum sjednání smlouvy"
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
            aria-label="Číslo smlouvy"
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
            aria-label="Datum počátku smlouvy"
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
            <label className="block text-sm font-semibold text-slate-800">{pensionProduct ? "Datum konce (volitelné)" : "Pojištění do (volitelné)"}</label>
            <input
              type="date"
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
              aria-label={pensionProduct ? "Datum konce (volitelné)" : "Pojištění do (volitelné)"}
              value={policyEndDate}
              onChange={(event) => onPolicyEndDateChange(event.target.value)}
            />
          </div>
        )}

        {!pensionProduct && contractNumberLiveCheckMode !== "endorsement" && (
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-800">Datum storna (volitelné)</label>
            <input
              type="date"
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
              aria-label="Datum storna (volitelné)"
            value={stornoDate}
              onChange={(event) => onStornoDateChange(event.target.value)}
            />
            <p className="text-[11px] text-slate-500">
              Vyplň jen u historicky stornované smlouvy.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
