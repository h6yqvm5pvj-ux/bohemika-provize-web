"use client";

import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  Mail,
  Search,
  Tag,
  UserRound,
  X,
} from "lucide-react";

import {
  ACCOUNT_TYPE_LABELS,
  TIP_CONTRACT_PERCENT_OPTIONS,
  TIP_CONTRACT_STATUS_LABELS,
  TIP_CONTRACT_TIPS_FILTER_OPTIONS,
  formatTipCreatedAt,
  type TipContractTipOption,
  type TipContractTipsFilter,
  type TipContractUserOption,
  type TipsterLookupState,
} from "./tipContractSettings";

type TipContractModalProps = {
  isOpen: boolean;
  draftPercent: number;
  draftEmail: string;
  lookupState: TipsterLookupState;
  userSuggestions: TipContractUserOption[];
  suggestionsLoading: boolean;
  selectedTip: TipContractTipOption | null;
  hasExistingConfig: boolean;
  canShowTipsButton: boolean;
  isLifeProduct: boolean;
  exampleGrossFirstYearLabel: string;
  exampleAdvisorRemainderLabel: string;
  onClose: () => void;
  onPercentChange: (value: number) => void;
  onEmailChange: (value: string) => void;
  onSelectUser: (option: TipContractUserOption) => void;
  onLoadTips: () => void | Promise<void>;
  onClear: () => void;
  onApply: () => void;
  applyDisabled: boolean;
};

export function TipContractModal({
  isOpen,
  draftPercent,
  draftEmail,
  lookupState,
  userSuggestions,
  suggestionsLoading,
  selectedTip,
  hasExistingConfig,
  canShowTipsButton,
  isLifeProduct,
  exampleGrossFirstYearLabel,
  exampleAdvisorRemainderLabel,
  onClose,
  onPercentChange,
  onEmailChange,
  onSelectUser,
  onLoadTips,
  onClear,
  onApply,
  applyDisabled,
}: TipContractModalProps) {
  if (!isOpen) return null;
  const tipBaseLabel = isLifeProduct
    ? "provize A101"
    : "okamžité provize v 1. roce";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)] space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-slate-900">Smlouva z TIPU</h3>
          <p className="text-sm text-slate-700">
            Tipař má nárok pouze na % z {tipBaseLabel}.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-slate-600">
            Podíl pro tipaře
          </label>
          <select
            value={draftPercent}
            onChange={(e) => onPercentChange(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          >
            {TIP_CONTRACT_PERCENT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} %
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-slate-600">
            Tipař / uživatel (e-mail nebo jméno)
          </label>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={draftEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="Začni psát jméno nebo e-mail"
              className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:border-slate-900 ${
                lookupState.status === "found"
                  ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-600"
                  : "border-slate-300 bg-white focus:ring-slate-900"
              }`}
            />
            {(suggestionsLoading || userSuggestions.length > 0) && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                {suggestionsLoading && (
                  <div className="px-3 py-2 text-xs text-slate-500">Načítám návrhy…</div>
                )}
                {userSuggestions.map((option) => (
                  <button
                    key={option.email}
                    type="button"
                    onClick={() => onSelectUser(option)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                      {option.accountType === "tipster" ? (
                        <Lightbulb size={16} aria-hidden="true" />
                      ) : (
                        <UserRound size={16} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {option.name || option.email}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {option.email} • {ACCOUNT_TYPE_LABELS[option.accountType]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {lookupState.status === "checking" && (
            <p className="text-xs text-slate-500">Ověřuji uživatele…</p>
          )}
          {lookupState.status === "found" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 size={14} aria-hidden="true" />
                {lookupState.name ?? lookupState.email}
                <span className="text-emerald-700/70">
                  {ACCOUNT_TYPE_LABELS[lookupState.accountType]}
                </span>
              </span>
              {canShowTipsButton && (
                <button
                  type="button"
                  onClick={() => void onLoadTips()}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#d946ef_0%,#9d22c9_100%)] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(217,70,239,0.25)] transition hover:-translate-y-0.5"
                >
                  <Lightbulb size={14} aria-hidden="true" />
                  {selectedTip ? "Změnit TIP" : "Zobrazit TIPY"}
                </button>
              )}
            </div>
          )}
          {lookupState.status === "notFound" && (
            <p className="text-xs text-rose-700">Uživatel s tímto e-mailem nebyl nalezen.</p>
          )}
          {lookupState.status === "error" && (
            <p className="text-xs text-rose-700">{lookupState.message}</p>
          )}
          {selectedTip && (
            <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-950">
              <div className="flex items-start gap-2">
                <Tag size={15} className="mt-0.5 text-fuchsia-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    Vybraný TIP: {selectedTip.productLabel} • {selectedTip.clientName}
                  </p>
                  <p className="mt-0.5 text-fuchsia-900/75">
                    Vytvořeno {formatTipCreatedAt(selectedTip.createdAtMs)}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p>
            Příklad: pokud je {tipBaseLabel} {exampleGrossFirstYearLabel},
            tipař dostane {draftPercent} % a tobě zůstane {exampleAdvisorRemainderLabel}.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {hasExistingConfig && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              Vypnout TIP
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applyDisabled}
            className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            Použít
          </button>
        </div>
      </div>
    </div>
  );
}

type TipContractTipsModalProps = {
  isOpen: boolean;
  currentUser: TipContractUserOption | null;
  loading: boolean;
  error: string | null;
  tips: TipContractTipOption[];
  filteredTips: TipContractTipOption[];
  filter: TipContractTipsFilter;
  counts: Record<TipContractTipsFilter, number>;
  selectedTip: TipContractTipOption | null;
  onClose: () => void;
  onFilterChange: (filter: TipContractTipsFilter) => void;
  onSelectTip: (tip: TipContractTipOption) => void;
};

export function TipContractTipsModal({
  isOpen,
  currentUser,
  loading,
  error,
  tips,
  filteredTips,
  filter,
  counts,
  selectedTip,
  onClose,
  onFilterChange,
  onSelectTip,
}: TipContractTipsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
              Výběr tipu
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">
              Tipy od {currentUser?.name ?? currentUser?.email ?? "uživatele"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Vyber konkrétní tip, který se má propsat do ukládané smlouvy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Zavřít výběr tipů"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {!loading && !error && tips.length > 0 && (
          <div className="mt-4 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {TIP_CONTRACT_TIPS_FILTER_OPTIONS.map((option) => {
              const active = filter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onFilterChange(option.key)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? "bg-slate-950 text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {option.label}{" "}
                  <span className={active ? "text-white/75" : "text-slate-400"}>
                    ({counts[option.key]})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 max-h-[56vh] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Načítám tipy…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : tips.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Od tohoto uživatele zatím nemáš žádný přijatý tip.
            </div>
          ) : filteredTips.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              V tomto filtru není žádný tip.
            </div>
          ) : (
            filteredTips.map((tip) => {
              const isSelected = selectedTip?.id === tip.id;
              return (
                <button
                  key={tip.id}
                  type="button"
                  onClick={() => onSelectTip(tip)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] ${
                    isSelected
                      ? "border-fuchsia-300 bg-fuchsia-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-800">
                          <Lightbulb size={13} aria-hidden="true" />
                          {tip.productLabel}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {TIP_CONTRACT_STATUS_LABELS[tip.status]}
                        </span>
                      </div>
                      <h4 className="mt-2 truncate text-lg font-semibold text-slate-950">
                        {tip.clientName}
                      </h4>
                      <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays size={15} aria-hidden="true" />
                          {formatTipCreatedAt(tip.createdAtMs)}
                        </span>
                        {tip.phone && (
                          <span className="inline-flex items-center gap-2">
                            <UserRound size={15} aria-hidden="true" />
                            {tip.phone}
                          </span>
                        )}
                        {tip.email && (
                          <span className="inline-flex items-center gap-2 truncate">
                            <Mail size={15} aria-hidden="true" />
                            <span className="truncate">{tip.email}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                        isSelected
                          ? "bg-[linear-gradient(135deg,#d946ef_0%,#9d22c9_100%)] text-white"
                          : "border border-slate-300 bg-white text-slate-900"
                      }`}
                    >
                      {isSelected ? (
                        <CheckCircle2 size={16} aria-hidden="true" />
                      ) : (
                        <FileText size={16} aria-hidden="true" />
                      )}
                      {isSelected ? "Vybráno" : "Vybrat TIP"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
