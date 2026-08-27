"use client";

import {
  BadgeCheck,
  CalendarDays,
  Clock3,
  CreditCard,
  Crown,
  Landmark,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import {
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_PRICE_CARDS,
  formatDateTime,
  formatIsoDay,
  formatMoneyCzk,
  type SubscriptionPaymentRow,
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

export function SubscriptionSettingsPanel({
  className,
  loading,
  error,
  snapshot,
  payments,
}: SubscriptionSettingsPanelProps) {
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
              Stav přístupu, historie plateb a přehled dostupných tarifů.
            </p>
          </div>
        </div>
        {snapshot && !loading ? (
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${getStatusClasses(snapshot)}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {getStatusLabel(snapshot)}
          </span>
        ) : null}
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

          <aside className="rounded-[20px] border border-violet-200 bg-[linear-gradient(145deg,#faf5ff_0%,#ffffff_58%,#f5f3ff_100%)] p-4 shadow-[0_12px_30px_rgba(76,29,149,0.08)] sm:rounded-[24px] sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">
                  Ceník
                </span>
                <h3 className="mt-2 text-lg font-black tracking-tight text-slate-950">
                  Tarify předplatného
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Přehled cen a délky jednotlivých období.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <CreditCard size={14} strokeWidth={2.2} aria-hidden="true" />
                Platba a aktivace probíhá přes správce účtu
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {SUBSCRIPTION_PRICE_CARDS.map((priceCard) => {
                const isCurrent = snapshot.plan === priceCard.id;
                const isBestValue = priceCard.id === "yearly";
                const PlanIcon =
                  priceCard.id === "monthly"
                    ? CreditCard
                    : priceCard.id === "semiannual"
                      ? Clock3
                      : Crown;

                return (
                  <article
                    key={priceCard.id}
                    className={`relative isolate flex min-h-[260px] overflow-hidden rounded-[20px] border p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(76,29,149,0.13)] sm:rounded-[24px] sm:p-5 ${
                      isBestValue
                        ? "bg-[linear-gradient(145deg,#ffffff_0%,#faf5ff_58%,#f3e8ff_100%)]"
                        : "bg-white"
                    } ${
                      isCurrent
                        ? "border-emerald-300 ring-2 ring-emerald-100"
                        : isBestValue
                          ? "border-violet-300"
                          : "border-slate-200"
                    }`}
                  >
                    <div
                      className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                        isCurrent
                          ? "bg-[linear-gradient(90deg,#10b981_0%,#6ee7b7_100%)]"
                          : "bg-[linear-gradient(90deg,#7c3aed_0%,#c084fc_100%)]"
                      }`}
                    />
                    <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full border-[24px] border-violet-100/55" />

                    <div className="relative z-10 flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            isBestValue
                              ? "bg-violet-700 !text-white shadow-[0_10px_22px_rgba(109,40,217,0.24)] [&_svg]:!stroke-white"
                              : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          <PlanIcon size={19} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <span className="inline-flex rounded-lg border border-violet-200 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                            PRO
                          </span>
                          {isBestValue ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1 text-[10px] font-bold !text-white [&_svg]:!stroke-white">
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
                        </div>
                      </div>

                      <h4 className="mt-4 text-xl font-black leading-tight tracking-tight text-slate-950">
                        {priceCard.title}
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        {priceCard.description}
                      </p>

                      <div className="mt-4 rounded-2xl bg-[linear-gradient(135deg,#5b21b6_0%,#7c3aed_58%,#9333ea_100%)] px-4 py-3.5 !text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] [&_*]:!text-white [&_svg]:!stroke-white">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-2xl font-black tracking-tight !text-white">
                              {priceCard.priceLabel}
                            </span>
                            <span className="text-xs font-bold !text-white/85">
                              {priceCard.cadenceLabel}
                            </span>
                          </div>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 !text-white">
                            <CreditCard size={17} strokeWidth={2.2} aria-hidden="true" />
                          </span>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-violet-100 pt-4 text-xs text-slate-500">
                        <span>{priceCard.footerLabel}</span>
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 font-black ${
                            isBestValue
                              ? "bg-violet-100 text-violet-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {priceCard.footerEmphasis}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          Předplatné zatím není nastavené.
        </div>
      )}
    </section>
  );
}
