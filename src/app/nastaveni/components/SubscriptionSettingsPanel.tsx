"use client";

import { ArrowRight, Clock3, Landmark, ShieldCheck } from "lucide-react";

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

export function SubscriptionSettingsPanel({
  className,
  loading,
  error,
  snapshot,
  payments,
}: SubscriptionSettingsPanelProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
        <Landmark size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
        <span>Předplatné</span>
      </h2>

      <div className="space-y-4">
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Načítám údaje o předplatném…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : snapshot ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <article className="relative isolate min-h-[102px] overflow-hidden rounded-[28px] border border-[#6b34a0] bg-[#140b23] px-4 py-2.5 shadow-[0_22px_40px_rgba(25,8,42,0.48)] ring-1 ring-[#8a4bc6]/35 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_46px_rgba(25,8,42,0.56)]">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_14%,rgba(183,96,255,0.28)_0%,rgba(183,96,255,0)_38%),radial-gradient(circle_at_92%_88%,rgba(128,88,245,0.2)_0%,rgba(128,88,245,0)_42%)]" />
                  <div className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-[2px] rounded-full bg-[linear-gradient(90deg,#4bd39a_0%,#9ef2cc_100%)] opacity-90" />
                  <ShieldCheck
                    className="pointer-events-none absolute -right-1 bottom-[-5px] h-10 w-10 text-[#d4b6f3]/35"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="relative z-[1]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfb2ea]">
                      Stav
                    </div>
                    <div
                      className={`mt-1.5 inline-flex rounded-full border px-3 py-1 text-[15px] font-semibold leading-none shadow-[0_8px_18px_rgba(18,8,36,0.35)] ${
                        snapshot.effectiveState === "active"
                          ? "border-[#58e1af]/65 bg-[linear-gradient(135deg,rgba(26,76,59,0.9)_0%,rgba(19,56,45,0.88)_100%)] text-[#c8ffe8]"
                          : snapshot.effectiveState === "grace"
                            ? "border-[#f2ad63]/65 bg-[linear-gradient(135deg,rgba(73,47,25,0.9)_0%,rgba(58,36,18,0.88)_100%)] text-[#ffe0b7]"
                            : "border-[#f58ca6]/65 bg-[linear-gradient(135deg,rgba(72,30,46,0.9)_0%,rgba(54,22,35,0.88)_100%)] text-[#ffd0dc]"
                      }`}
                    >
                      {snapshot.effectiveState === "active"
                        ? "Aktivní"
                        : snapshot.effectiveState === "grace"
                          ? "Ochranná lhůta"
                          : snapshot.status === "unpaid"
                            ? "Nezaplaceno"
                            : "Blokováno"}
                    </div>
                  </div>
                </article>

                <article className="relative isolate min-h-[102px] overflow-hidden rounded-[28px] border border-[#6b34a0] bg-[#140b23] px-4 py-2.5 shadow-[0_22px_40px_rgba(25,8,42,0.48)] ring-1 ring-[#8a4bc6]/35 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_46px_rgba(25,8,42,0.56)]">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_14%,rgba(183,96,255,0.28)_0%,rgba(183,96,255,0)_38%),radial-gradient(circle_at_92%_88%,rgba(128,88,245,0.2)_0%,rgba(128,88,245,0)_42%)]" />
                  <div className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-[2px] rounded-full bg-[linear-gradient(90deg,#c085ff_0%,#8f53dc_100%)] opacity-85" />
                  <Clock3
                    className="pointer-events-none absolute -right-1 bottom-[-5px] h-10 w-10 text-[#d4b6f3]/35"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="relative z-[1]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfb2ea]">
                      Tarif
                    </div>
                    <div className="mt-1.5 text-[27px] font-black leading-[0.95] tracking-[-0.02em] text-[#fbf7ff] [text-shadow:0_3px_18px_rgba(191,127,255,0.24)] xl:text-[24px]">
                      {snapshot.plan ? SUBSCRIPTION_PLAN_LABELS[snapshot.plan] : "—"}
                    </div>
                  </div>
                </article>

                <article className="relative isolate min-h-[102px] overflow-hidden rounded-[28px] border border-[#6b34a0] bg-[#140b23] px-4 py-2.5 shadow-[0_22px_40px_rgba(25,8,42,0.48)] ring-1 ring-[#8a4bc6]/35 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_46px_rgba(25,8,42,0.56)]">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_14%,rgba(183,96,255,0.28)_0%,rgba(183,96,255,0)_38%),radial-gradient(circle_at_92%_88%,rgba(128,88,245,0.2)_0%,rgba(128,88,245,0)_42%)]" />
                  <div className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-[2px] rounded-full bg-[linear-gradient(90deg,#b27cff_0%,#67d4ff_100%)] opacity-85" />
                  <Landmark
                    className="pointer-events-none absolute -right-1 bottom-[-5px] h-10 w-10 text-[#d4b6f3]/35"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="relative z-[1]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfb2ea]">
                      Období
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c8aee4]">
                          Od
                        </div>
                        <div className="mt-0.5 text-[15px] font-black leading-tight text-[#fbf7ff] [text-shadow:0_3px_18px_rgba(191,127,255,0.24)]">
                          {formatIsoDay(snapshot.paidFrom)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c8aee4]">
                          Do
                        </div>
                        <div className="mt-0.5 text-[15px] font-black leading-tight text-[#fbf7ff] [text-shadow:0_3px_18px_rgba(191,127,255,0.24)]">
                          {snapshot.plan === "unlimited"
                            ? "Neomezeně"
                            : formatIsoDay(snapshot.paidUntil)}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>

              {snapshot.effectiveState === "grace" ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Předplatné je po splatnosti. Přístup běží v ochranné lhůtě do{" "}
                  <span className="font-semibold">{formatIsoDay(snapshot.graceUntil)}</span>.
                  Pro zachování přístupu uhraď platbu.
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/90 bg-white/90 p-3 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Historie plateb
                </h3>

                {payments.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Zatím není evidovaná žádná platba.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-700">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          <th className="px-2 py-2">Tarif</th>
                          <th className="px-2 py-2">Částka</th>
                          <th className="px-2 py-2">Období</th>
                          <th className="px-2 py-2">Zapsal</th>
                          <th className="px-2 py-2">Poznámka</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-b border-slate-100 align-top">
                            <td className="px-2 py-2 font-semibold text-slate-900">
                              {payment.plan in SUBSCRIPTION_PLAN_LABELS
                                ? SUBSCRIPTION_PLAN_LABELS[
                                    payment.plan as SubscriptionPlanValue
                                  ]
                                : payment.plan || "—"}
                            </td>
                            <td className="px-2 py-2">
                              {formatMoneyCzk(payment.amountCzk || 0)}
                            </td>
                            <td className="px-2 py-2">
                              {formatIsoDay(payment.periodFrom)} –{" "}
                              {formatIsoDay(payment.periodUntil)}
                            </td>
                            <td className="px-2 py-2">
                              <div>{payment.createdByEmail || "—"}</div>
                              <div className="text-[10px] text-slate-500">
                                {formatDateTime(payment.createdAtMs)}
                              </div>
                            </td>
                            <td className="px-2 py-2">{payment.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Předplatné zatím není nastavené.
            </div>
          )}
        </div>

        <aside className="rounded-[28px] border border-[#3a1d56] bg-[#100b17] p-4 text-[#f6edff] shadow-[0_22px_48px_rgba(16,7,28,0.42)]">
          <div className="inline-flex w-fit items-center rounded-full border border-[#6f3d95]/70 bg-[#1e122c] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#caa7eb]">
            Ceník
          </div>
          <h3 className="mt-2 text-xl font-bold text-[#fbf7ff]">
            Tarify předplatného
          </h3>
          <p className="mt-1 text-sm text-[#c8aee4]">
            Přehled aktuálních tarifů včetně délky období.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SUBSCRIPTION_PRICE_CARDS.map((priceCard) => (
              <article
                key={priceCard.id}
                className="relative isolate min-h-[244px] overflow-hidden rounded-[28px] border border-[#5a2878] bg-[#150e1f] px-5 py-5 shadow-[0_26px_48px_rgba(25,8,42,0.55)] ring-1 ring-[#7a35a7]/35"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
                <div className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />

                <div className="relative z-[1] flex min-h-[198px] flex-col">
                  <div className="inline-flex w-fit items-center rounded-[7px] bg-[linear-gradient(135deg,#b85cff_0%,#9d47ed_100%)] px-3 py-1.5 text-[16px] font-black uppercase leading-none tracking-[0.08em] text-white shadow-[0_10px_20px_rgba(159,72,237,0.4)]">
                    PRO
                  </div>

                  <h4 className="mt-4 text-[24px] font-black leading-tight text-[#fbf7ff]">
                    {priceCard.title}
                  </h4>
                  <p className="mt-3 text-[15px] font-medium leading-[1.42] text-[#c9a7e7]">
                    {priceCard.description}
                  </p>

                  <div className="mt-5 flex min-h-[56px] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-[16px] bg-[linear-gradient(135deg,#ad55f3_0%,#a84ff0_100%)] px-4 text-center text-2xl font-black text-white shadow-[0_18px_34px_rgba(168,79,240,0.34)]">
                    <span>{priceCard.priceLabel}</span>
                    <span className="text-base font-bold text-white/85">
                      {priceCard.cadenceLabel}
                    </span>
                    <ArrowRight size={24} strokeWidth={2.4} aria-hidden="true" />
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="flex min-h-[56px] flex-wrap items-center justify-center gap-2 rounded-[15px] border-2 border-[#a96bdf] bg-[#27183a]/92 px-3.5 py-2.5 text-center text-[14px] font-medium text-[#bfa3da] shadow-[0_0_18px_rgba(169,107,223,0.18)]">
                      <span>{priceCard.footerLabel}</span>
                      <span className="rounded-[7px] bg-[#624174] px-2.5 py-1 text-base font-black leading-none text-[#fbf7ff]">
                        {priceCard.footerEmphasis}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
