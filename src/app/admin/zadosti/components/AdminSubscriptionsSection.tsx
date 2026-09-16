"use client";

import adminStyles from "../adminConsole.module.css";

import {
  Check,
  Clock3,
  Copy,
  Inbox,
  Landmark,
  Loader2,
  Pencil,
  RefreshCcw,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserCheck2,
  X,
} from "lucide-react";

import {
  formatDateTime,
  formatIsoDay,
  nameFromEmail,
} from "../adminFormatters";
import {
  PAID_SUBSCRIPTION_PLAN_KEYS,
  SUBSCRIPTION_DIRECTORY_FILTERS,
  SUBSCRIPTION_PLAN_LABELS,
  formatDaysUntilDue,
  formatMoneyCzk,
  getSubscriptionPlanPillClass,
  getSubscriptionStateLabel,
  getSubscriptionStatePillClass,
  isPaidSubscriptionPlanValue,
  type PaidSubscriptionPlanValue,
  type SubscriptionPlanValue,
} from "../adminSubscriptions";
import type { AdminSubscriptionsController } from "../useAdminSubscriptions";

export type AdminSubscriptionsSectionClasses = {
  section: string;
  topBar: string;
  badge: string;
  panel: string;
  softPanel: string;
  field: string;
  label: string;
  primaryButton: string;
  historyField: string;
  historyIconButton: string;
  historyDangerButton: string;
};

export function AdminSubscriptionsSection({
  controller,
  classes,
}: {
  controller: AdminSubscriptionsController;
  classes: AdminSubscriptionsSectionClasses;
}) {
  return (
    <section className={classes.section}>
      <div className={classes.topBar} />
      <div className="mb-4">
        <span className={classes.badge}>Fakturace</span>
        <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] text-slate-900 sm:text-2xl">
          <Landmark
            size={20}
            strokeWidth={2}
            className="text-slate-600"
            aria-hidden="true"
          />
          <span>Správa předplatného</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Přidej platbu nebo nastav neomezený tarif, zkontroluj historii a případně účet
          označ jako nezaplacený.
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className={classes.panel}>
          <span className={classes.topBar} />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Inbox
                size={14}
                strokeWidth={2.1}
                className="text-slate-600"
                aria-hidden="true"
              />
              Adresář předplatného
            </h3>
            <button
              type="button"
              onClick={() => void controller.loadDirectory()}
              disabled={controller.directoryLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
              Obnovit
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Celkem
                </div>
                <Inbox
                  size={14}
                  strokeWidth={2.1}
                  className="text-slate-600"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1.5 text-xl font-bold text-slate-900">
                {controller.directoryStats.total}
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                  Po splatnosti
                </div>
                <Clock3
                  size={14}
                  strokeWidth={2.1}
                  className="text-rose-700"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1.5 text-xl font-bold text-slate-900">
                {controller.directoryStats.overdue}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Brzy končí
                </div>
                <RefreshCcw
                  size={14}
                  strokeWidth={2.1}
                  className="text-amber-800"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1.5 text-xl font-bold text-slate-900">
                {controller.directoryStats.dueSoon}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Aktivní
                </div>
                <Check
                  size={14}
                  strokeWidth={2.4}
                  className="text-slate-600"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1.5 text-xl font-bold text-slate-900">
                {controller.directoryStats.active}
              </div>
            </div>
          </div>

          <div
            className="mb-3 inline-flex w-full rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm"
            role="group"
            aria-label="Filtr předplatného"
          >
            {SUBSCRIPTION_DIRECTORY_FILTERS.map((filterOption) => {
              const active = controller.directoryFilter === filterOption.id;
              return (
                <button
                  key={filterOption.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => controller.setDirectoryFilter(filterOption.id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? adminStyles.segmentActive
                      : "border border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {filterOption.id === "all" ? (
                    <Inbox size={12} strokeWidth={2.2} aria-hidden="true" />
                  ) : filterOption.id === "overdue" ? (
                    <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <RefreshCcw size={12} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {filterOption.label}
                </button>
              );
            })}
          </div>

          <label className="relative mb-3 block">
            <Search
              size={14}
              strokeWidth={2.1}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              aria-label="Hledat uživatele v předplatném"
              className={`${classes.field} ${adminStyles.fieldWithIcon}`}
              value={controller.directorySearch}
              onChange={(event) => controller.setDirectorySearch(event.target.value)}
              placeholder="Hledat uživatele..."
            />
          </label>

          {controller.directoryError ? (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {controller.directoryError}
            </div>
          ) : null}

          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {controller.directoryLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-600">
                Načítám seznam uživatelů…
              </div>
            ) : controller.filteredDirectoryRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-600">
                Žádní uživatelé pro zvolený filtr.
              </div>
            ) : (
              controller.filteredDirectoryRows.map((row) => {
                const selected = controller.normalizedLookupEmail === row.email;
                const stateLabel = getSubscriptionStateLabel(row);
                const stateClass = getSubscriptionStatePillClass(row);
                const planLabel =
                  row.subscription.plan && row.subscription.plan in SUBSCRIPTION_PLAN_LABELS
                    ? SUBSCRIPTION_PLAN_LABELS[
                        row.subscription.plan as SubscriptionPlanValue
                      ]
                    : "Bez tarifu";
                const planClass = getSubscriptionPlanPillClass(row.subscription.plan);
                const dueSoonLabel = row.flags?.isDueSoon
                  ? formatDaysUntilDue(row.flags?.daysUntilDue)
                  : "";
                const title = row.fullName || nameFromEmail(row.email);
                const avatarInitial = (
                  title.trim().charAt(0) || row.email.charAt(0)
                ).toUpperCase();

                return (
                  <button
                    key={row.email}
                    type="button"
                    onClick={() => controller.selectUser(row.email)}
                    className={`relative w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-violet-300/45 bg-violet-400/14 text-slate-900 shadow-[0_14px_30px_rgba(124,58,237,0.18)]"
                        : "border-slate-200 bg-slate-50 text-slate-900 hover:border-violet-300/30 hover:bg-slate-50"
                    }`}
                  >
                    {selected ? (
                      <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-violet-400" />
                    ) : null}
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                          selected
                            ? "border-violet-300/45 bg-violet-400/16 text-slate-600"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {avatarInitial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{title}</div>
                        <div
                          className={`truncate text-xs ${
                            selected ? "text-slate-600" : "text-slate-600"
                          }`}
                        >
                          {row.email}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateClass}`}
                          >
                            {stateLabel}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${planClass}`}
                          >
                            {planLabel}
                          </span>
                          {dueSoonLabel ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                              <Clock3 size={10} strokeWidth={2.4} aria-hidden="true" />
                              {dueSoonLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          <div className={classes.panel}>
            <span className={classes.topBar} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  <UserCheck2 size={12} strokeWidth={2.2} aria-hidden="true" />
                  Detail
                </div>
                <div className="mt-1 break-words text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                  {controller.data?.user?.fullName ||
                    controller.data?.user?.email ||
                    (controller.lookupEmail
                      ? nameFromEmail(controller.lookupEmail)
                      : "Vyber uživatele")}
                </div>
                <p className="mt-1 break-all text-sm text-slate-600">
                  {controller.data?.user?.email ||
                    controller.lookupEmail ||
                    "Klikni vlevo na uživatele."}
                </p>
              </div>
              {controller.data?.subscription ? (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${getSubscriptionStatePillClass(
                    {
                      subscription: {
                        effectiveState: controller.data.subscription.effectiveState,
                        status: controller.data.subscription.status,
                      },
                    }
                  )}`}
                >
                  {getSubscriptionStateLabel({
                    subscription: {
                      effectiveState: controller.data.subscription.effectiveState,
                      status: controller.data.subscription.status,
                    },
                  })}
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  Bez výběru
                </span>
              )}
            </div>
          </div>

          <div
            className={`${classes.softPanel} grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}
          >
            <div className="space-y-1.5">
              <label className={`inline-flex items-center gap-1.5 ${classes.label}`}>
                <Landmark size={12} strokeWidth={2.2} aria-hidden="true" />
                Tarif
              </label>
              <select
                className={classes.field}
                value={controller.planDraft}
                onChange={(event) =>
                  controller.setPlanDraft(event.target.value as SubscriptionPlanValue)
                }
              >
                {(Object.keys(SUBSCRIPTION_PLAN_LABELS) as SubscriptionPlanValue[]).map(
                  (planKey) => (
                    <option key={planKey} value={planKey}>
                      {SUBSCRIPTION_PLAN_LABELS[planKey]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={`inline-flex items-center gap-1.5 ${classes.label}`}>
                <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
                Začátek období (volitelné)
              </label>
              <input
                type="date"
                className={classes.field}
                value={controller.fromDraft}
                onChange={(event) => controller.setFromDraft(event.target.value)}
              />
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <label className={`inline-flex items-center gap-1.5 ${classes.label}`}>
                <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
                Poznámka
              </label>
              <input
                type="text"
                className={classes.field}
                value={controller.noteDraft}
                onChange={(event) => controller.setNoteDraft(event.target.value)}
                placeholder="např. uhrazeno převodem"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
              <button
                type="button"
                onClick={() => void controller.addPayment()}
                disabled={controller.lookupLoading}
                className={classes.primaryButton}
              >
                <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                {controller.planDraft === "unlimited"
                  ? "Nastavit neomezený"
                  : "Zapsat platbu"}
              </button>
              <button
                type="button"
                onClick={() => void controller.setUnpaid()}
                disabled={controller.lookupLoading}
                className={`${adminStyles.button} ${adminStyles.destructiveButton}`}
              >
                <X size={14} strokeWidth={2.4} aria-hidden="true" />
                Označit nezaplaceno
              </button>
            </div>

            {controller.lookupStatus ? (
              <p
                className={`text-xs font-medium lg:col-span-2 ${
                  controller.lookupStatus.type === "success"
                    ? "text-slate-600"
                    : controller.lookupStatus.type === "info"
                      ? "text-slate-600"
                      : "text-rose-700"
                }`}
              >
                {controller.lookupStatus.message}
              </p>
            ) : null}

            {controller.lookupError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 lg:col-span-2">
                {controller.lookupError}
              </div>
            ) : null}
          </div>

          {controller.data?.subscription ? (
            <div className="min-w-0 space-y-3">
              <div className={classes.softPanel}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {controller.data.user?.fullName ||
                        controller.data.user?.email ||
                        "Uživatel"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {controller.data.user?.email || "—"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      controller.data.subscription.effectiveState === "active"
                        ? "border-violet-300/30 bg-violet-400/12 text-slate-600"
                        : controller.data.subscription.effectiveState === "grace"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : controller.data.subscription.status === "unpaid"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {controller.data.subscription.effectiveState === "active"
                      ? "Aktivní"
                      : controller.data.subscription.effectiveState === "grace"
                        ? "Ochranná lhůta"
                        : controller.data.subscription.status === "unpaid"
                          ? "Nezaplaceno"
                          : "Blokováno"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <Landmark size={11} strokeWidth={2.2} aria-hidden="true" />
                      Tarif
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {controller.data.subscription.plan &&
                      controller.data.subscription.plan in SUBSCRIPTION_PLAN_LABELS
                        ? SUBSCRIPTION_PLAN_LABELS[
                            controller.data.subscription.plan as SubscriptionPlanValue
                          ]
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                      Od
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {formatIsoDay(controller.data.subscription.paidFrom)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                      Do
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {controller.data.subscription.plan === "unlimited"
                        ? "Neomezeně"
                        : formatIsoDay(controller.data.subscription.paidUntil)}
                    </div>
                  </div>
                </div>
              </div>

              <div className={classes.softPanel}>
                <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <RefreshCcw
                    size={14}
                    strokeWidth={2.1}
                    className="text-slate-600"
                    aria-hidden="true"
                  />
                  Historie plateb
                </h3>
                {(controller.data.payments ?? []).length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Zatím bez plateb.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs text-slate-600">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          <th className="px-2 py-2">Tarif</th>
                          <th className="px-2 py-2">Částka</th>
                          <th className="px-2 py-2">Období</th>
                          <th className="px-2 py-2">Zapsal</th>
                          <th className="px-2 py-2">Poznámka</th>
                          <th className="px-2 py-2 text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(controller.data.payments ?? []).map((payment) => {
                          const isEditing = controller.editingPaymentId === payment.id;
                          const isSaving = controller.savingPaymentId === payment.id;
                          const isDeleting = controller.deletingPaymentId === payment.id;
                          const isPaymentBusy = isSaving || isDeleting;
                          const paymentPlanLabel = isPaidSubscriptionPlanValue(payment.plan)
                            ? SUBSCRIPTION_PLAN_LABELS[payment.plan]
                            : payment.plan || "—";

                          return (
                            <tr
                              key={payment.id}
                              className="border-b border-slate-200 align-top"
                            >
                              <td className="px-2 py-2 font-semibold text-slate-900">
                                {isEditing ? (
                                  <select
                                    className={classes.historyField}
                                    value={controller.editPlan}
                                    onChange={(event) =>
                                      controller.setEditPlan(
                                        event.target.value as PaidSubscriptionPlanValue
                                      )
                                    }
                                    disabled={isPaymentBusy}
                                    aria-label="Tarif platby"
                                  >
                                    {PAID_SUBSCRIPTION_PLAN_KEYS.map((planKey) => (
                                      <option key={planKey} value={planKey}>
                                        {SUBSCRIPTION_PLAN_LABELS[planKey]}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  paymentPlanLabel
                                )}
                              </td>
                              <td className="px-2 py-2">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    inputMode="numeric"
                                    className={classes.historyField}
                                    value={controller.editAmount}
                                    onChange={(event) =>
                                      controller.setEditAmount(event.target.value)
                                    }
                                    disabled={isPaymentBusy}
                                    aria-label="Částka platby"
                                  />
                                ) : (
                                  formatMoneyCzk(payment.amountCzk || 0)
                                )}
                              </td>
                              <td className="px-2 py-2">
                                {isEditing ? (
                                  <div className="grid min-w-[250px] gap-1 sm:grid-cols-2">
                                    <input
                                      type="date"
                                      className={classes.historyField}
                                      value={controller.editPeriodFrom}
                                      onChange={(event) =>
                                        controller.setEditPeriodFrom(event.target.value)
                                      }
                                      disabled={isPaymentBusy}
                                      aria-label="Začátek období platby"
                                    />
                                    <input
                                      type="date"
                                      className={classes.historyField}
                                      value={controller.editPeriodUntil}
                                      onChange={(event) =>
                                        controller.setEditPeriodUntil(event.target.value)
                                      }
                                      disabled={isPaymentBusy}
                                      aria-label="Konec období platby"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    {formatIsoDay(payment.periodFrom)} –{" "}
                                    {formatIsoDay(payment.periodUntil)}
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div>{payment.createdByEmail || "—"}</div>
                                <div className="text-[10px] text-slate-500">
                                  {formatDateTime(payment.createdAtMs)}
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    className={`${classes.historyField} min-w-[180px]`}
                                    value={controller.editNote}
                                    onChange={(event) =>
                                      controller.setEditNote(event.target.value)
                                    }
                                    disabled={isPaymentBusy}
                                    aria-label="Poznámka k platbě"
                                  />
                                ) : (
                                  payment.note || "—"
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex justify-end gap-1.5">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className={classes.historyIconButton}
                                        onClick={() => void controller.updatePayment(payment.id)}
                                        disabled={isPaymentBusy || controller.lookupLoading}
                                        aria-label="Uložit platbu"
                                        title="Uložit platbu"
                                      >
                                        {isSaving ? (
                                          <Loader2
                                            size={14}
                                            strokeWidth={2.2}
                                            className="animate-spin"
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <Save
                                            size={14}
                                            strokeWidth={2.2}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        className={classes.historyIconButton}
                                        onClick={controller.cancelPaymentEdit}
                                        disabled={isPaymentBusy}
                                        aria-label="Zrušit editaci"
                                        title="Zrušit editaci"
                                      >
                                        <X size={14} strokeWidth={2.2} aria-hidden="true" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className={classes.historyIconButton}
                                        onClick={() => controller.startPaymentEdit(payment)}
                                        disabled={
                                          controller.lookupLoading ||
                                          Boolean(controller.savingPaymentId) ||
                                          Boolean(controller.deletingPaymentId)
                                        }
                                        aria-label="Upravit platbu"
                                        title="Upravit platbu"
                                      >
                                        <Pencil
                                          size={14}
                                          strokeWidth={2.2}
                                          aria-hidden="true"
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        className={classes.historyDangerButton}
                                        onClick={() => void controller.deletePayment(payment)}
                                        disabled={
                                          controller.lookupLoading ||
                                          Boolean(controller.savingPaymentId) ||
                                          Boolean(controller.deletingPaymentId)
                                        }
                                        aria-label="Smazat platbu"
                                        title="Smazat platbu"
                                      >
                                        {isDeleting ? (
                                          <Loader2
                                            size={14}
                                            strokeWidth={2.2}
                                            className="animate-spin"
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <Trash2
                                            size={14}
                                            strokeWidth={2.2}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
