"use client";

import { RefreshCcw, Repeat2, Tag } from "lucide-react";

import { type PaymentFrequency, type Product } from "../types/domain";
import { formatMoney } from "@/app/lib/formatters";
import { placeholderForAmount, type EndorsementDraft } from "./calculatorHelpers";

type RefreshOriginalLookupStatus = "idle" | "checking" | "found" | "notFound" | "wrongProduct" | "error";

type CalculatorAmountAndActionsSectionProps = {
  embedded?: boolean;
  showAmountInput?: boolean;
  product: Product;
  frequency: PaymentFrequency;
  isLifeProduct: boolean;
  tipsterModeEnabled: boolean;
  showContractActions?: boolean;
  showManualEntryOption?: boolean;
  comfortGradual: boolean;
  amountText: string;
  comfortPaymentText: string;
  comfortTargetAmountText: string;
  comfortPayoutCount: number | null;
  missingFields: string[];
  hasTipContractConfig: boolean;
  refreshOriginalOpen: boolean;
  refreshOriginalContractNumber: string;
  refreshOriginalMissingInSystem: boolean;
  refreshOriginalLookupStatus: RefreshOriginalLookupStatus;
  refreshOriginalLookupProgress: number;
  refreshOriginalLookupAdviserName: string | null;
  refreshOriginalInfoText?: string | null;
  inlineEndorsementDraft?: EndorsementDraft | null;
  onComfortGradualChange: (value: boolean) => void;
  onAmountTextChange: (value: string) => void;
  onComfortPaymentTextChange: (value: string) => void;
  onComfortTargetAmountTextChange: (value: string) => void;
  onRefreshOriginalContractNumberChange: (value: string) => void;
  onRefreshOriginalMissingInSystemChange: (value: boolean) => void;
  onOpenTipContractModal: () => void;
  onToggleRefreshOriginal: () => void;
  onPrepareEndorsement: () => void;
  onCancelEndorsement?: () => void;
  onSwitchToManualEntry?: () => void;
};

export function CalculatorAmountAndActionsSection({
  embedded = false,
  showAmountInput = true,
  product,
  frequency,
  isLifeProduct,
  tipsterModeEnabled,
  showContractActions = true,
  showManualEntryOption = false,
  comfortGradual,
  amountText,
  comfortPaymentText,
  comfortTargetAmountText,
  comfortPayoutCount,
  missingFields,
  hasTipContractConfig,
  refreshOriginalOpen,
  refreshOriginalContractNumber,
  refreshOriginalMissingInSystem,
  refreshOriginalLookupStatus,
  refreshOriginalLookupProgress,
  refreshOriginalLookupAdviserName,
  refreshOriginalInfoText,
  inlineEndorsementDraft,
  onComfortGradualChange,
  onAmountTextChange,
  onComfortPaymentTextChange,
  onComfortTargetAmountTextChange,
  onRefreshOriginalContractNumberChange,
  onRefreshOriginalMissingInSystemChange,
  onOpenTipContractModal,
  onToggleRefreshOriginal,
  onPrepareEndorsement,
  onCancelEndorsement,
  onSwitchToManualEntry,
}: CalculatorAmountAndActionsSectionProps) {
  const showComfortControls = product === "comfortcc";
  const showContractActionButtons = !tipsterModeEnabled && showContractActions;
  const showManualEntryButton = !tipsterModeEnabled && showManualEntryOption;
  const showHeading = showAmountInput || showComfortControls;
  const contractActionButtonBaseClass =
    "ui-focus inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold shadow-[0_10px_20px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0";
  const tipContractActionButtonClass = `${contractActionButtonBaseClass} border-violet-700 bg-violet-700 !text-white shadow-[0_12px_24px_rgba(109,40,217,0.18)] hover:bg-violet-800`;
  const activeTipContractActionButtonClass = `${tipContractActionButtonClass} ring-2 ring-violet-200`;
  const refreshContractActionButtonClass = `${contractActionButtonBaseClass} border-violet-700 bg-violet-700 !text-white shadow-[0_12px_24px_rgba(109,40,217,0.18)] hover:bg-violet-800`;
  const activeRefreshContractActionButtonClass = `${refreshContractActionButtonClass} ring-2 ring-violet-200`;
  const changeContractActionButtonClass = `${contractActionButtonBaseClass} border-violet-200 bg-white text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.08)] hover:border-violet-300 hover:bg-violet-50`;
  const activeChangeContractActionButtonClass = `${changeContractActionButtonClass} ring-2 ring-violet-200`;
  const canUseOriginalReplacement = product === "neon" || product === "domex" || product === "cppAuto";
  const canSaveUnlinkedOriginalReplacement = product === "domex" || product === "cppAuto";
  const originalReplacementButtonLabel =
    product === "neon"
      ? refreshOriginalOpen
        ? "Refresh zapnutý"
        : "Refresh smlouvy"
      : refreshOriginalOpen
        ? "Náhrada zapnutá"
        : "Náhrada";
  const originalReplacementProductLabel =
    product === "domex" ? "DOMEX" : product === "cppAuto" ? "ČPP Auto" : "ČPP ŽP NEON";

  if (!showAmountInput && !showComfortControls && !showContractActionButtons && !showManualEntryButton) {
    return null;
  }

  const content = (
    <>
      {showHeading && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">Výpočet provize</h2>
          <span className="h-px flex-1 bg-violet-100" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-3">
        {showComfortControls && (
          <section className="space-y-2">
            <div className="text-sm font-semibold text-slate-800">Comfort Commodity</div>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="mb-1 text-[12px] uppercase text-slate-400">Poplatek</div>
                <div className="ui-chip-group">
                  <button
                    type="button"
                    onClick={() => onComfortGradualChange(false)}
                    className={`ui-chip ui-focus px-3 py-1.5 text-sm ${!comfortGradual ? "ui-chip-active" : ""}`}
                  >
                    Jednorázový poplatek
                  </button>
                  <button
                    type="button"
                    onClick={() => onComfortGradualChange(true)}
                    className={`ui-chip ui-focus px-3 py-1.5 text-sm ${comfortGradual ? "ui-chip-active" : ""}`}
                  >
                    Postupný poplatek
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {showAmountInput && (
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-800">
              {product === "comfortcc"
                ? comfortGradual
                  ? "1% z Poplatku v 1. platbě"
                  : "Poplatek (zde se určuje provize z poplatku klienta)"
                : "Částka"}
            </label>
            <input
              type="number"
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(15,23,42,0.06)] outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
                missingFields.includes("částku") ? "border-rose-400/70" : "border-violet-200"
              }`}
              value={amountText}
              onChange={(event) => onAmountTextChange(event.target.value)}
              placeholder={product === "comfortcc" ? "Zadejte poplatek" : placeholderForAmount(product, frequency)}
            />
          </div>
        )}

        {showComfortControls && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-slate-800">Pravidelná platba</label>
              <input
                type="number"
                className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
                value={comfortPaymentText}
                onChange={(event) => onComfortPaymentTextChange(event.target.value)}
                placeholder="Zadejte pravidelnou platbu"
              />
            </div>

            {comfortGradual && (
              <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-800">Cílová částka (volitelné)</label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
                  value={comfortTargetAmountText}
                  onChange={(event) => onComfortTargetAmountTextChange(event.target.value)}
                  placeholder="Např. 200000"
                />
                {comfortPayoutCount && (
                  <p className="text-xs text-slate-600">
                    Následná provize z platby bude vyplacena celkem {comfortPayoutCount}x.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {showContractActionButtons && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenTipContractModal}
                aria-pressed={hasTipContractConfig}
                className={hasTipContractConfig ? activeTipContractActionButtonClass : tipContractActionButtonClass}
              >
                <Tag size={17} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
                Smlouva z TIPU
              </button>
              {canUseOriginalReplacement && (
                <button
                  type="button"
                  onClick={onToggleRefreshOriginal}
                  aria-pressed={refreshOriginalOpen}
                  className={refreshOriginalOpen ? activeRefreshContractActionButtonClass : refreshContractActionButtonClass}
                >
                  <RefreshCcw size={17} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
                  {originalReplacementButtonLabel}
                </button>
              )}
              {isLifeProduct && !refreshOriginalOpen && (
                <button
                  type="button"
                  onClick={onPrepareEndorsement}
                  className={
                    inlineEndorsementDraft
                      ? activeChangeContractActionButtonClass
                      : changeContractActionButtonClass
                  }
                >
                  <Repeat2 size={17} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
                  Změna
                </button>
              )}
            </div>
            {inlineEndorsementDraft && (
              <section className="rounded-2xl border border-violet-200 bg-violet-50/80 px-3 py-3 text-sm text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                      Připravená změna
                    </p>
                    <p className="mt-1 font-bold text-slate-950">
                      Smlouva {inlineEndorsementDraft.contractNumber}
                    </p>
                  </div>
                  {onCancelEndorsement && (
                    <button
                      type="button"
                      onClick={onCancelEndorsement}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
                    >
                      Zrušit změnu
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Původní pojistné
                    </p>
                    <p className="mt-1 font-black text-slate-950">
                      {formatMoney(inlineEndorsementDraft.previousPremiumAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Nové pojistné
                    </p>
                    <p className="mt-1 font-black text-slate-950">
                      {formatMoney(inlineEndorsementDraft.newPremiumAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      {inlineEndorsementDraft.changeType === "increase"
                        ? "Navýšení"
                        : inlineEndorsementDraft.changeType === "decrease"
                          ? "Ponížení"
                          : "Rozdíl"}
                    </p>
                    <p
                      className={`mt-1 font-black ${
                        inlineEndorsementDraft.deltaAmount >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {inlineEndorsementDraft.deltaAmount >= 0 ? "+" : "-"}
                      {formatMoney(Math.abs(inlineEndorsementDraft.deltaAmount))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Provize k dodatku
                    </p>
                    <p
                      className={`mt-1 font-black ${
                        inlineEndorsementDraft.total < 0 ? "text-rose-700" : "text-slate-950"
                      }`}
                    >
                      {formatMoney(inlineEndorsementDraft.total)}
                    </p>
                  </div>
                </div>
                {inlineEndorsementDraft.changeType === "decrease" &&
                  inlineEndorsementDraft.total < 0 && (
                    <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      Ponížení se uloží jako odúčtování okamžité provize ze zbývajícího storno období.
                    </p>
                  )}
                {inlineEndorsementDraft.changeType === "decrease" &&
                  inlineEndorsementDraft.total === 0 && (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      Ponížení nemá vypočtené odúčtování. Dodatek se uloží s provizí 0 Kč.
                    </p>
                  )}
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  Dodatek se uloží až přes tlačítko Uložit dodatek jako sepsáno a
                  bude navázaný na původní smlouvu.
                </p>
              </section>
            )}
            {canUseOriginalReplacement && refreshOriginalOpen && (
              <div className="mt-3 space-y-1.5">
                {product === "neon" && (
                  <label className="flex items-start gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={refreshOriginalMissingInSystem}
                      onChange={(event) => onRefreshOriginalMissingInSystemChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-violet-200 text-violet-700 focus:ring-violet-500"
                    />
                    <span>
                      Původní smlouva není v systému
                      <span className="mt-0.5 block font-medium text-slate-600">
                        Použij pro REFRESH, kde neumíme dopočítat správnou základnu z původní smlouvy.
                      </span>
                    </span>
                  </label>
                )}
                {!refreshOriginalMissingInSystem && (
                  <>
                    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      Číslo původní smlouvy
                    </label>
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      value={refreshOriginalContractNumber}
                      onChange={(event) => onRefreshOriginalContractNumberChange(event.target.value)}
                      placeholder="Např. 1234567890"
                      className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-violet-700 focus:ring-2 focus:ring-violet-700 ${
                        missingFields.includes("číslo původní smlouvy")
                          ? "border-rose-400/70"
                          : "border-violet-200"
                      }`}
                    />
                    <p className="text-[11px] text-slate-600">
                      {canSaveUnlinkedOriginalReplacement
                        ? "Pokud se původní smlouva najde u stejného vlastníka a produktu, při uložení se stornuje ke dni počátku nové smlouvy."
                        : "Při uložení se původní smlouva stornuje ke dni počátku nové smlouvy."}
                    </p>
                  </>
                )}
                {refreshOriginalMissingInSystem && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-900">
                    Výpočet provize je orientační. Po nahrání provizního výpisu se smlouva bere jako REFRESH bez původní smlouvy v systému a základna se musí sladit podle výpisu.
                  </p>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalLookupStatus === "checking" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Ověřuji smlouvu v Bohemka.App</span>
                      <span>{refreshOriginalLookupProgress}%</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={refreshOriginalLookupProgress}
                    >
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#4c1d95_100%)] transition-[width] duration-200"
                        style={{ width: `${refreshOriginalLookupProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalLookupStatus === "found" && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Smlouva nalezena. Sjednatel: {refreshOriginalLookupAdviserName || "jméno není vyplněné"}.
                  </p>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalInfoText && (
                  <p className="text-[11px] font-semibold text-violet-800">
                    {refreshOriginalInfoText}
                  </p>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalLookupStatus === "wrongProduct" && (
                  <p className="text-[11px] font-semibold text-amber-700">
                    {canSaveUnlinkedOriginalReplacement
                      ? `Smlouva je evidována, ale není vedena jako ${originalReplacementProductLabel}. Náhradu lze uložit bez automatického storna původní smlouvy.`
                      : `Smlouva je evidována, ale není vedena jako ${originalReplacementProductLabel}.`}
                  </p>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalLookupStatus === "notFound" && (
                  <p
                    className={`text-[11px] font-semibold ${
                      canSaveUnlinkedOriginalReplacement ? "text-amber-700" : "text-rose-700"
                    }`}
                  >
                    {canSaveUnlinkedOriginalReplacement
                      ? "Původní smlouva s tímto číslem není evidována v systému Bohemka.App. Náhradu lze uložit bez automatického storna původní smlouvy."
                      : "Smlouva s tímto číslem není evidována v systému Bohemka.App."}
                  </p>
                )}
                {!refreshOriginalMissingInSystem && refreshOriginalLookupStatus === "error" && (
                  <p className="text-[11px] font-semibold text-amber-700">
                    Ověření smlouvy se nepodařilo. Zkus to prosím znovu.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {showManualEntryButton && (
          <div className="rounded-xl border border-violet-100 bg-white/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                Pro uložení smlouvy přepni na režim Přidat smlouvu.
              </p>
              <button
                type="button"
                onClick={onSwitchToManualEntry}
                className="ui-btn-secondary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
              >
                Manuálně zadat smlouvu
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <section>{content}</section>;
  }

  return (
    <section className="rounded-[1.1rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      {content}
    </section>
  );
}
