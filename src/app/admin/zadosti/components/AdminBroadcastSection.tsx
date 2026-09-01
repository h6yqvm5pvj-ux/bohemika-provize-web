"use client";

import {
  BellRing,
  Clock3,
  Link2,
  Loader2,
  Megaphone,
  Send,
  UserRound,
} from "lucide-react";

import {
  ADMIN_BROADCAST_EMOJI_OPTIONS,
  ADMIN_BROADCAST_GROUPS,
  ADMIN_BROADCAST_TARGETS,
  ADMIN_BROADCAST_TOOL_TARGETS,
  type AdminBroadcastRecipientGroup,
} from "../adminBroadcast";
import type { AdminBroadcastController } from "../useAdminBroadcast";

export type AdminBroadcastSectionClasses = {
  section: string;
  topBar: string;
  badge: string;
  panel: string;
  field: string;
  label: string;
  primaryButton: string;
};

export function AdminBroadcastSection({
  controller,
  classes,
}: {
  controller: AdminBroadcastController;
  classes: AdminBroadcastSectionClasses;
}) {
  return (
    <section className={classes.section}>
      <div className={classes.topBar} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={classes.badge}>Hromadné upozornění</span>
          <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
            <Megaphone
              size={20}
              strokeWidth={2.1}
              className="!text-violet-100"
              aria-hidden="true"
            />
            <span>Notifikace</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
            Push zpráva se odešle na aktivní zařízení a kliknutí otevře vybranou stránku.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/12 px-3 py-2 text-xs font-semibold !text-violet-100">
          <BellRing size={15} strokeWidth={2.2} aria-hidden="true" />
          Web push
        </div>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-3">
        {[
          { label: "Příjemce", value: controller.recipientLabel, icon: UserRound },
          { label: "Odeslání", value: controller.deliveryLabel, icon: Clock3 },
          { label: "Cíl", value: controller.targetLabel, icon: Link2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="min-w-0 rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5 shadow-[0_12px_28px_rgba(7,6,25,0.16)]"
            >
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] !text-violet-200/62">
                <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                {item.label}
              </div>
              <div className="truncate text-sm font-semibold !text-white">{item.value}</div>
            </div>
          );
        })}
      </div>

      <form
        className={`${classes.panel} grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start`}
        onSubmit={(event) => {
          event.preventDefault();
          void controller.send();
        }}
      >
        <div className="space-y-3">
          <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-4 shadow-[0_14px_34px_rgba(7,6,25,0.2)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                  1
                </span>
                <span className={classes.label}>Obsah zprávy</span>
              </div>
              <span className="text-[11px] font-semibold !text-violet-100/56">
                {controller.title.length}/80 · {controller.message.length}/220
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
              <div className="space-y-2">
                <label className={classes.label}>Emoji</label>
                <input
                  type="text"
                  value={controller.emoji}
                  onChange={(event) => controller.updateEmoji(event.target.value)}
                  className={`${classes.field} h-12 text-center text-2xl`}
                  maxLength={12}
                  aria-label="Emoji notifikace"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  {ADMIN_BROADCAST_EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => controller.updateEmoji(emoji)}
                      className={`inline-flex h-9 items-center justify-center rounded-xl border text-lg transition ${
                        controller.emoji === emoji
                          ? "border-violet-200 bg-violet-400/24 shadow-[0_8px_18px_rgba(124,58,237,0.18)]"
                          : "border-white/12 bg-white/[0.055] hover:bg-white/[0.1]"
                      }`}
                      aria-label={`Vybrat emoji ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <label className="space-y-2">
                  <span className={classes.label}>Nadpis notifikace</span>
                  <input
                    type="text"
                    value={controller.title}
                    onChange={(event) => controller.updateTitle(event.target.value)}
                    maxLength={80}
                    className={classes.field}
                    placeholder="Nová pomůcka"
                  />
                </label>

                <label className="space-y-2">
                  <span className={classes.label}>Text notifikace</span>
                  <textarea
                    value={controller.message}
                    onChange={(event) => controller.updateMessage(event.target.value)}
                    rows={4}
                    maxLength={220}
                    className={`${classes.field} min-h-[112px] resize-none leading-relaxed`}
                    placeholder="Krátká zpráva pro uživatele"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-3 2xl:grid-cols-3">
            <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                    2
                  </span>
                  <span className={classes.label}>Příjemci</span>
                </div>
                {controller.recipientMode === "single" ? (
                  <span className="text-[11px] font-semibold !text-violet-100/58">
                    {controller.usersLoading
                      ? "Načítám..."
                      : `${controller.recipientOptions.length} účtů`}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-3 rounded-2xl border border-white/12 bg-white/[0.06] p-1">
                {[
                  { id: "all" as const, label: "Všem" },
                  { id: "group" as const, label: "Skupina" },
                  { id: "single" as const, label: "Osoba" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => controller.updateRecipientMode(mode.id)}
                    className={`min-h-10 rounded-xl px-2 text-[13px] font-semibold transition ${
                      controller.recipientMode === mode.id
                        ? "admin-on-violet bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.26)]"
                        : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {controller.recipientMode === "group" ? (
                  <select
                    value={controller.recipientGroup}
                    onChange={(event) =>
                      controller.updateRecipientGroup(
                        event.target.value as AdminBroadcastRecipientGroup
                      )
                    }
                    className={classes.field}
                  >
                    {ADMIN_BROADCAST_GROUPS.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.label} ({controller.groupCounts[group.id]})
                      </option>
                    ))}
                  </select>
                ) : controller.recipientMode === "single" ? (
                  <select
                    value={controller.recipientEmail}
                    onChange={(event) => controller.updateRecipientEmail(event.target.value)}
                    disabled={
                      controller.usersLoading || controller.recipientOptions.length === 0
                    }
                    className={`${classes.field} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {controller.recipientOptions.length === 0 ? (
                      <option value="">
                        {controller.usersLoading
                          ? "Načítám uživatele..."
                          : "Žádný uživatel"}
                      </option>
                    ) : (
                      controller.recipientOptions.map((row) => (
                        <option key={row.email} value={row.email}>
                          {row.label} ({row.email})
                          {row.disabled ? " - deaktivovaný" : ""}
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <div className="min-h-[46px] rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2 text-sm font-semibold leading-relaxed !text-violet-100/72">
                    Všichni uživatelé s aktivním push tokenem.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
              <div className="mb-3 inline-flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                  3
                </span>
                <span className={classes.label}>Po kliknutí</span>
              </div>

              <div className="grid gap-3">
                <select
                  value={controller.targetPath}
                  onChange={(event) => controller.updateTargetPath(event.target.value)}
                  className={classes.field}
                  aria-label="Cílová stránka po kliknutí"
                >
                  {ADMIN_BROADCAST_TARGETS.map((target) => (
                    <option key={target.path} value={target.path}>
                      {target.label}
                    </option>
                  ))}
                  <option value="__custom__">Vlastní cesta</option>
                </select>

                {controller.targetPath === "/pomucky" ? (
                  <select
                    value={controller.toolTargetPath}
                    onChange={(event) => controller.updateToolTargetPath(event.target.value)}
                    className={classes.field}
                    aria-label="Konkrétní pomůcka"
                  >
                    {ADMIN_BROADCAST_TOOL_TARGETS.map((target) => (
                      <option key={target.path} value={target.path}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={controller.customTargetPath}
                    onChange={(event) => controller.updateCustomTargetPath(event.target.value)}
                    disabled={controller.targetPath !== "__custom__"}
                    className={`${classes.field} disabled:cursor-not-allowed disabled:opacity-50`}
                    placeholder="/pomucky/zlato"
                    aria-label="Vlastní cesta"
                  />
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                    4
                  </span>
                  <span className={classes.label}>Odeslání</span>
                </div>
                <span className="text-[11px] font-semibold !text-violet-100/58">
                  {controller.deliveryMode === "scheduled" ? "Fronta" : "Ihned"}
                </span>
              </div>

              <div className="grid grid-cols-2 rounded-2xl border border-white/12 bg-white/[0.06] p-1">
                {[
                  { id: "now" as const, label: "Hned" },
                  { id: "scheduled" as const, label: "Naplánovat" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => controller.updateDeliveryMode(mode.id)}
                    className={`min-h-10 rounded-xl px-2 text-sm font-semibold transition ${
                      controller.deliveryMode === mode.id
                        ? "admin-on-violet bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.26)]"
                        : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <input
                type="datetime-local"
                value={controller.scheduledAt}
                min={controller.scheduleMinValue}
                onChange={(event) => controller.updateScheduledAt(event.target.value)}
                disabled={controller.deliveryMode !== "scheduled"}
                className={`${classes.field} mt-3 disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-amber-300/30 bg-amber-300/10 px-3.5 py-3 shadow-[0_12px_28px_rgba(7,6,25,0.16)]">
            <input
              type="checkbox"
              checked={controller.confirmed}
              onChange={(event) => controller.updateConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-amber-200 text-amber-500 accent-amber-500"
            />
            <span>
              <span className="block text-sm font-semibold text-amber-900">
                {controller.deliveryMode === "scheduled"
                  ? `Potvrzuji naplánování notifikace pro ${controller.recipientLabel}.`
                  : controller.recipientMode === "single"
                    ? "Potvrzuji odeslání pouze vybranému uživateli."
                    : controller.recipientMode === "group"
                      ? "Potvrzuji odeslání vybrané skupině."
                      : "Potvrzuji odeslání všem uživatelům s aktivním push tokenem."}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-amber-700">
                Respektuje se vypnutý push kanál v nastavení uživatele.
              </span>
            </span>
          </label>

          {controller.status ? (
            <div
              className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                controller.status.type === "success"
                  ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                  : controller.status.type === "info"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {controller.status.message}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-slate-950/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] !text-violet-200/58">
                Připravený cíl
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold !text-violet-50">
                {controller.effectiveTargetPath}
              </span>
            </div>
            <button
              type="submit"
              disabled={!controller.canSubmit}
              className={classes.primaryButton}
            >
              {controller.sending ? (
                <Loader2
                  size={15}
                  strokeWidth={2.2}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send size={15} strokeWidth={2.2} aria-hidden="true" />
              )}
              {controller.sending
                ? "Odesílám..."
                : controller.deliveryMode === "scheduled"
                  ? "Naplánovat"
                  : controller.recipientMode === "single"
                    ? "Odeslat osobě"
                    : controller.recipientMode === "group"
                      ? "Odeslat skupině"
                      : "Odeslat všem"}
            </button>
          </div>
        </div>

        <aside className="self-start rounded-[24px] border border-white/14 bg-white/[0.07] p-4 shadow-[0_16px_38px_rgba(7,6,25,0.22)] xl:sticky xl:top-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78">
              Náhled
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold !text-violet-100/70">
              Web push
            </span>
          </div>
          <div className="rounded-[22px] border border-white/16 bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl text-slate-950">
                {controller.emoji || "📣"}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold !text-white">
                  {controller.emoji ? `${controller.emoji} ` : ""}
                  {controller.titleTrimmed || "Nadpis notifikace"}
                </div>
                <p className="mt-1 break-words text-sm leading-relaxed !text-violet-100/78">
                  {controller.messageTrimmed || "Text notifikace se zobrazí tady."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs">
            {[
              {
                label: "Příjemce",
                value: controller.recipientLabel,
                valueClassName: "break-words",
              },
              {
                label: "Odeslání",
                value: controller.deliveryLabel,
                valueClassName: "break-words",
              },
              { label: "Stránka", value: controller.targetLabel, valueClassName: "" },
              {
                label: "Cesta",
                value: controller.effectiveTargetPath,
                valueClassName: "break-all",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2"
              >
                <span className="block font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                  {item.label}
                </span>
                <span
                  className={`mt-0.5 block font-semibold !text-white ${item.valueClassName}`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </form>
    </section>
  );
}
