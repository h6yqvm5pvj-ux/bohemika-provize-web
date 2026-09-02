"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Clock3,
  CreditCard,
  Crown,
  Info,
  Landmark,
  QrCode,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_PRICE_CARDS,
  formatDateTime,
  formatIsoDay,
  formatMoneyCzk,
  type SubscriptionPaymentRow,
  type SubscriptionPriceCard,
  type SubscriptionPlanValue,
  type SubscriptionSnapshot,
} from "../subscriptionSettings";

type SubscriptionSettingsPanelProps = {
  className: string;
  loading: boolean;
  error: string | null;
  snapshot: SubscriptionSnapshot | null;
  payments: SubscriptionPaymentRow[];
};

const getStatusLabel = (snapshot: SubscriptionSnapshot): string => {
  if (snapshot.effectiveState === "active") return "Aktivní";
  if (snapshot.effectiveState === "grace") return "Ochranná lhůta";
  if (snapshot.status === "unpaid") return "Nezaplaceno";
  return "Blokováno";
};

const getStatusClasses = (snapshot: SubscriptionSnapshot): string => {
  if (snapshot.effectiveState === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (snapshot.effectiveState === "grace") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const SUBSCRIPTION_ACCOUNT_NUMBER = "212729450/0600";

type SubscriptionPaymentDialogProps = {
  currentPlan: SubscriptionPlanValue | null;
  onClose: () => void;
};

function SubscriptionPaymentDialog({ currentPlan, onClose }: SubscriptionPaymentDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPriceCard | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-3 py-4 sm:px-5">
      <button
        type="button"
        aria-label="Zavřít platbu předplatného"
        className="absolute inset-0 cursor-default bg-slate-950/65 backdrop-blur-sm"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-payment-title"
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-hidden rounded-[24px] border border-violet-100 bg-white text-slate-900 shadow-[0_32px_100px_rgba(2,6,23,0.45)] sm:rounded-[30px]"
      >
        <div className="relative overflow-hidden border-b border-violet-100 bg-[linear-gradient(145deg,#0b0717_0%,#24103f_58%,#4c1d95_100%)] px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border-[34px] border-white/5" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-lg">
                {selectedPlan ? (
                  <QrCode size={20} strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <CreditCard size={20} strokeWidth={2.2} aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">
                  Platba předplatného
                </p>
                <h2
                  id="subscription-payment-title"
                  className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl"
                >
                  {selectedPlan ? selectedPlan.title : "Vyber si tarif"}
                </h2>
                <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-violet-100/80 sm:text-sm">
                  {selectedPlan
                    ? "Naskenuj QR kód v bankovní aplikaci nebo použij platební údaje níže."
                    : "Po výběru tarifu zobrazíme odpovídající QR kód a platební údaje."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <X size={16} strokeWidth={2.3} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {selectedPlan ? (
            <div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <ArrowLeft size={14} strokeWidth={2.3} aria-hidden="true" />
                Zvolit jiný tarif
              </button>

              <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
                  <Image
                    src={selectedPlan.qrImageSrc}
                    alt={`QR kód pro platbu tarifu ${selectedPlan.title}`}
                    width={1235}
                    height={1235}
                    sizes="(max-width: 768px) calc(100vw - 64px), 430px"
                    className="h-auto w-full rounded-[16px]"
                    unoptimized
                  />
                </div>

                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[22px] border border-violet-200 bg-[linear-gradient(145deg,#faf5ff_0%,#ffffff_100%)] shadow-[0_12px_30px_rgba(76,29,149,0.08)]">
                    <div className="border-b border-violet-100 px-4 py-3.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                        Platební údaje
                      </p>
                    </div>
                    <dl className="divide-y divide-violet-100 px-4">
                      <div className="flex items-center justify-between gap-4 py-3.5">
                        <dt className="text-xs font-semibold text-slate-500">Částka</dt>
                        <dd className="text-lg font-black text-slate-950">{selectedPlan.priceLabel}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-3.5">
                        <dt className="text-xs font-semibold text-slate-500">Číslo účtu</dt>
                        <dd className="select-all text-right text-base font-black text-slate-950">
                          {SUBSCRIPTION_ACCOUNT_NUMBER}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 py-3.5">
                        <dt className="text-xs font-semibold text-slate-500">Poznámka</dt>
                        <dd className="max-w-[190px] text-right text-sm font-black text-slate-950">
                          Tvé jméno a příjmení
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-950">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.3} aria-hidden="true" />
                    <p>
                      Do poznámky k platbě uveď své jméno. Zpracování platby a aktivace
                      předplatného obvykle proběhne do <strong>2 hodin od připsání platby</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
                  >
                    Hotovo
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {SUBSCRIPTION_PRICE_CARDS.map((priceCard) => {
                const isCurrent = currentPlan === priceCard.id;
                const isBestValue = priceCard.id === "yearly";
                const PlanIcon =
                  priceCard.id === "monthly"
                    ? CreditCard
                    : priceCard.id === "semiannual"
                      ? Clock3
                      : Crown;

                return (
                  <button
                    key={priceCard.id}
                    type="button"
                    onClick={() => setSelectedPlan(priceCard)}
                    className={`group relative isolate flex min-h-[250px] overflow-hidden rounded-[20px] border p-4 text-left shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:border-violet-400 hover:shadow-[0_18px_38px_rgba(76,29,149,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 sm:rounded-[24px] sm:p-5 ${
                      isBestValue
                        ? "border-violet-300 bg-[linear-gradient(145deg,#ffffff_0%,#faf5ff_58%,#f3e8ff_100%)]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#c084fc_100%)]" />
                    <span className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full border-[24px] border-violet-100/55" />

                    <span className="relative z-10 flex h-full w-full flex-col">
                      <span className="flex items-start justify-between gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            isBestValue
                              ? "bg-violet-700 text-white shadow-[0_10px_22px_rgba(109,40,217,0.24)]"
                              : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          <PlanIcon size={19} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                        <span className="flex flex-wrap justify-end gap-1.5">
                          {isBestValue ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1 text-[10px] font-bold text-white">
                              <Crown size={11} strokeWidth={2.4} aria-hidden="true" />
                              Nejvýhodnější
                            </span>
                          ) : null}
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                              <BadgeCheck size={11} strokeWidth={2.5} aria-hidden="true" />
                              Aktuální
                            </span>
                          ) : null}
                        </span>
                      </span>

                      <span className="mt-4 text-xl font-black leading-tight tracking-tight text-slate-950">
                        {priceCard.title}
                      </span>
                      <span className="mt-2 text-sm leading-relaxed text-slate-500">
                        {priceCard.description}
                      </span>

                      <span className="mt-auto block rounded-2xl bg-[linear-gradient(135deg,#5b21b6_0%,#7c3aed_58%,#9333ea_100%)] px-4 py-3.5 text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] transition group-hover:shadow-[0_16px_32px_rgba(109,40,217,0.3)]">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-2xl font-black tracking-tight text-white">
                            {priceCard.priceLabel}
                          </span>
                          <span className="text-xs font-bold text-white/85">
                            {priceCard.cadenceLabel}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

export function SubscriptionSettingsPanel({
  className,
  loading,
  error,
  snapshot,
  payments,
}: SubscriptionSettingsPanelProps) {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  return (
    <section className={`space-y-5 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_52%,#c4b5fd_100%)]" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-[0_10px_24px_rgba(109,40,217,0.26)]">
            <Landmark size={20} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-slate-950">Předplatné</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Stav přístupu, historie plateb a správa plateb.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot && !loading ? (
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${getStatusClasses(snapshot)}`}
            >
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
              {getStatusLabel(snapshot)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setPaymentDialogOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-violet-700 px-4 py-2 text-xs font-black text-white shadow-[0_9px_22px_rgba(109,40,217,0.25)] transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
          >
            <CreditCard size={15} strokeWidth={2.3} aria-hidden="true" />
            Zaplatit
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
          Načítám údaje o předplatném…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : snapshot ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <article className="rounded-[18px] border border-violet-200 bg-[linear-gradient(145deg,#faf5ff_0%,#ffffff_100%)] p-4 shadow-[0_8px_22px_rgba(76,29,149,0.06)] sm:rounded-[22px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
                    Stav přístupu
                  </p>
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusClasses(snapshot)}`}
                  >
                    <BadgeCheck size={13} strokeWidth={2.4} aria-hidden="true" />
                    {getStatusLabel(snapshot)}
                  </span>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <ShieldCheck size={19} strokeWidth={2.2} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {snapshot.effectiveState === "active"
                  ? "Všechny funkce aplikace jsou dostupné."
                  : snapshot.effectiveState === "grace"
                    ? "Přístup je dočasně zachovaný v ochranné lhůtě."
                    : "Přístup k placeným funkcím je omezený."}
              </p>
            </article>

            <article className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)] sm:rounded-[22px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Aktuální tarif
                  </p>
                  <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
                    {snapshot.plan ? SUBSCRIPTION_PLAN_LABELS[snapshot.plan] : "—"}
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Crown size={19} strokeWidth={2.2} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Tarif určuje délku aktivního přístupu k aplikaci.
              </p>
            </article>

            <article className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)] sm:rounded-[22px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Období
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-slate-950">
                    <span>{formatIsoDay(snapshot.paidFrom)}</span>
                    <span className="text-slate-300">—</span>
                    <span>
                      {snapshot.plan === "unlimited"
                        ? "Neomezeně"
                        : formatIsoDay(snapshot.paidUntil)}
                    </span>
                  </div>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <CalendarDays size={19} strokeWidth={2.2} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Doba, po kterou je předplatné platné.
              </p>
            </article>
          </div>

          {snapshot.effectiveState === "grace" ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <p>
                Předplatné je po splatnosti. Přístup běží v ochranné lhůtě do{" "}
                <span className="font-bold">{formatIsoDay(snapshot.graceUntil)}</span>. Pro
                zachování přístupu uhraď platbu.
              </p>
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)] sm:rounded-[22px]">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <ReceiptText size={17} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-950">Historie plateb</h3>
                <p className="mt-0.5 text-xs text-slate-500">Přehled evidovaných plateb a období.</p>
              </div>
            </div>

            {payments.length === 0 ? (
              <div className="m-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                Zatím není evidovaná žádná platba.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/80">
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-4 py-2.5">Tarif</th>
                      <th className="px-3 py-2.5">Částka</th>
                      <th className="px-3 py-2.5">Období</th>
                      <th className="px-3 py-2.5">Zapsal</th>
                      <th className="px-4 py-2.5">Poznámka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100 align-top last:border-b-0">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {payment.plan in SUBSCRIPTION_PLAN_LABELS
                            ? SUBSCRIPTION_PLAN_LABELS[payment.plan as SubscriptionPlanValue]
                            : payment.plan || "—"}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {formatMoneyCzk(payment.amountCzk || 0)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatIsoDay(payment.periodFrom)} – {formatIsoDay(payment.periodUntil)}
                        </td>
                        <td className="px-3 py-3">
                          <div>{payment.createdByEmail || "—"}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {formatDateTime(payment.createdAtMs)}
                          </div>
                        </td>
                        <td className="px-4 py-3">{payment.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          Předplatné zatím není nastavené.
        </div>
      )}

      {paymentDialogOpen ? (
        <SubscriptionPaymentDialog
          currentPlan={snapshot?.plan ?? null}
          onClose={() => setPaymentDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}
