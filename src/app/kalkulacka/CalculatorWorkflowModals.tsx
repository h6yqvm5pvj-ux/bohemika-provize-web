"use client";

import { Search, Users, X } from "lucide-react";

import { formatMoney } from "@/app/lib/formatters";
import type { EndorsementDraft } from "./calculatorHelpers";

type DuplicateContractModalState = {
  mode: "overwrite" | "saveAnyway";
  description: string;
};

type SubordinatePickerOption = {
  email: string;
  name: string;
};

type ValidationErrorModalProps = {
  message: string | null;
  onClose: () => void;
};

export function ValidationErrorModal({ message, onClose }: ValidationErrorModalProps) {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
        <div className="text-sm text-slate-900">{message}</div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

type DuplicateContractModalProps = {
  modal: DuplicateContractModalState | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DuplicateContractModal({
  modal,
  onCancel,
  onConfirm,
}: DuplicateContractModalProps) {
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
        <div className="text-sm text-slate-900 space-y-2">
          <p>{modal.description}</p>
          <p>
            {modal.mode === "overwrite"
              ? "Můžeš ji přepsat, nebo akci zrušit."
              : "Může jít o duplicitu. Můžeš pokračovat uložením, nebo akci zrušit."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            {modal.mode === "overwrite" ? "Přepsat" : "Uložit i tak"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EndorsementDraftModalProps = {
  draft: EndorsementDraft | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

export function EndorsementDraftModal({
  draft,
  saving,
  onCancel,
  onSave,
}: EndorsementDraftModalProps) {
  if (!draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
        <div className="space-y-2 text-sm text-slate-900">
          <p>
            Připravena změna ke smlouvě <strong>{draft.contractNumber}</strong>.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5 text-sm">
            <p className="flex items-center justify-between gap-3">
              <span className="text-slate-600">Původní pojistné</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(draft.previousPremiumAmount)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-slate-600">Nové pojistné</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(draft.newPremiumAmount)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-slate-600">
                {draft.changeType === "increase"
                  ? "Navýšení"
                  : draft.changeType === "decrease"
                    ? "Ponížení"
                    : "Rozdíl"}
              </span>
              <span
                className={`font-semibold ${
                  draft.deltaAmount >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {draft.deltaAmount >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(draft.deltaAmount))}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
              <span className="text-slate-600">Provize k dodatku</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(draft.total)}
              </span>
            </p>
          </div>
          {draft.changeType === "decrease" && (
            <p className="text-xs text-amber-700">
              Ponížení zatím neřešíme výpočtem. Dodatek se uloží s provizí 0 Kč.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Dodatek bude uložen zvlášť a navázán na původní smlouvu.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Ukládám…" : "Uložit změnu"}
          </button>
        </div>
      </div>
    </div>
  );
}

type SubordinatePickerModalProps = {
  isOpen: boolean;
  searchText: string;
  loading: boolean;
  error: string | null;
  selectedEmail: string | null;
  currentUserEmail: string;
  options: SubordinatePickerOption[];
  hasSearchQuery: boolean;
  onClose: () => void;
  onSearchTextChange: (value: string) => void;
  onSelectOwnAccount: () => void;
  onSelectEmail: (email: string) => void;
};

export function SubordinatePickerModal({
  isOpen,
  searchText,
  loading,
  error,
  selectedEmail,
  currentUserEmail,
  options,
  hasSearchQuery,
  onClose,
  onSearchTextChange,
  onSelectOwnAccount,
  onSelectEmail,
}: SubordinatePickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Uložit smlouvu za poradce
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Vyber vlastníka smlouvy. Výpočet i uložení proběhne podle jeho profilu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Zavřít výběr poradce"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Hledat podřízeného (jméno nebo e-mail)"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Načítám podřízené…</p>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : (
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={onSelectOwnAccount}
              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                !selectedEmail
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={14} aria-hidden="true" />
                <span className="font-semibold">Můj účet</span>
              </div>
              <div className="mt-0.5 text-xs opacity-80">{currentUserEmail}</div>
            </button>

            {options.map((option) => {
              const active = selectedEmail === option.email;
              return (
                <button
                  key={option.email}
                  type="button"
                  onClick={() => onSelectEmail(option.email)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold">{option.name}</div>
                  <div className="mt-0.5 text-xs opacity-80">{option.email}</div>
                </button>
              );
            })}

            {options.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                {hasSearchQuery
                  ? "Žádný podřízený neodpovídá hledání."
                  : "Zatím nejsou načtení žádní podřízení."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
