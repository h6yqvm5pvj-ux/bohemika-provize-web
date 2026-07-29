"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  Mail,
  Percent,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Zavřít nastavení smlouvy z TIPU"
        className="absolute inset-0 cursor-default bg-slate-950/58 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-contract-dialog-title"
        className="relative w-full max-w-xl overflow-visible rounded-[28px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.38)]"
      >
        <div className="relative overflow-hidden rounded-t-[28px] bg-violet-700 px-5 py-5 !text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] !text-white">
                <Tag className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
                TIP
              </div>
              <h3 id="tip-contract-dialog-title" className="text-2xl font-black tracking-tight !text-white">
                Smlouva z TIPU
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 !text-white/90">
                Nastav tipaře a jeho podíl. Část pro tipaře se odečte pouze ze{" "}
                {tipBaseLabel}.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 !text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
              aria-label="Zavřít"
            >
              <X size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <section className="rounded-2xl border border-violet-200/75 bg-violet-50/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-800 shadow-sm">
                  <Percent size={16} strokeWidth={2.4} aria-hidden="true" />
                </span>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                    Podíl pro tipaře
                  </label>
                  <p className="text-xs text-slate-600">Vyber procenta z {tipBaseLabel}.</p>
                </div>
              </div>
              <span className="rounded-full bg-violet-700 px-3 py-1.5 text-sm font-black !text-white shadow-[0_10px_22px_rgba(109,40,217,0.2)]">
                {draftPercent} %
              </span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {TIP_CONTRACT_PERCENT_OPTIONS.map((value) => {
                const active = value === draftPercent;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPercentChange(value)}
                    aria-pressed={active}
                    className={`h-8 min-w-0 whitespace-nowrap rounded-full border px-1.5 text-[11px] font-bold transition sm:h-9 sm:text-xs ${
                      active
                        ? "border-violet-700 bg-violet-700 !text-white shadow-[0_10px_20px_rgba(109,40,217,0.18)]"
                        : "border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                    }`}
                  >
                    {value}%
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-200/75 bg-white/90 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
              <UserRound size={15} strokeWidth={2.4} aria-hidden="true" />
              Tipař / uživatel
            </label>
            <div className="relative mt-2">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={draftEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="Začni psát jméno nebo e-mail"
                className={`w-full rounded-xl border py-3 pl-10 pr-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:ring-2 ${
                  lookupState.status === "found"
                    ? "border-emerald-300 bg-emerald-50 focus:border-emerald-500 focus:ring-emerald-500"
                    : "border-violet-200 bg-white focus:border-violet-700 focus:ring-violet-700"
                }`}
              />
              {(suggestionsLoading || userSuggestions.length > 0) && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                  {suggestionsLoading && (
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500">
                      Načítám návrhy…
                    </div>
                  )}
                  {userSuggestions.map((option) => (
                    <button
                      key={option.email}
                      type="button"
                      onClick={() => onSelectUser(option)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-violet-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-800">
                        {option.accountType === "tipster" ? (
                          <Lightbulb size={17} aria-hidden="true" />
                        ) : (
                          <UserRound size={17} aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-950">
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
              <p className="mt-2 text-xs font-semibold text-slate-500">Ověřuji uživatele…</p>
            )}
            {lookupState.status === "found" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
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
                    className="inline-flex items-center gap-2 rounded-full bg-violet-700 px-3 py-1.5 text-xs font-bold !text-white shadow-[0_10px_22px_rgba(124,58,237,0.25)] transition hover:-translate-y-0.5 hover:bg-violet-800"
                  >
                    <Lightbulb size={14} aria-hidden="true" />
                    {selectedTip ? "Změnit TIP" : "Zobrazit TIPY"}
                  </button>
                )}
              </div>
            )}
            {lookupState.status === "notFound" && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Uživatel s tímto e-mailem nebyl nalezen. Tipaře můžeš označit i mimo
                systém Bohemka.App.
              </p>
            )}
            {lookupState.status === "error" && (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {lookupState.message}
              </p>
            )}
            {selectedTip && (
              <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2.5 text-xs text-fuchsia-950">
                <div className="flex items-start gap-2">
                  <Tag size={15} className="mt-0.5 text-fuchsia-700" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      Vybraný TIP: {selectedTip.productLabel} • {selectedTip.clientName}
                    </p>
                    <p className="mt-0.5 text-fuchsia-900/75">
                      Vytvořeno {formatTipCreatedAt(selectedTip.createdAtMs)}.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
              Dopad na provizi
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-xl border border-emerald-200 bg-white/75 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                  Základ
                </p>
                <p className="mt-1 font-black text-slate-950">{exampleGrossFirstYearLabel}</p>
              </div>
              <ArrowRight className="hidden h-5 w-5 text-emerald-700 sm:block" aria-hidden="true" />
              <div className="rounded-xl border border-emerald-200 bg-white/75 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                  Tobě zůstane
                </p>
                <p className="mt-1 font-black text-slate-950">{exampleAdvisorRemainderLabel}</p>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-emerald-800">
              Tipař dostane {draftPercent} % z {tipBaseLabel}.
            </p>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 rounded-b-[28px] border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          {hasExistingConfig && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
            >
              Vypnout TIP
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applyDisabled}
            className="rounded-full border border-violet-700 bg-violet-700 px-5 py-2.5 text-sm font-black !text-white shadow-[0_12px_24px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Použít
          </button>
        </div>
      </section>
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
                          ? "bg-violet-700 !text-white"
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
