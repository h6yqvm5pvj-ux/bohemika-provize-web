"use client";

import { BellRing } from "lucide-react";

import { INTRANET_SECTIONS } from "../../intranet/sections";
import {
  INTRANET_SECTION_ICON_BY_KEY,
  NOTIFICATION_TYPE_OPTIONS,
  type IntranetSectionKey,
  type NotificationSettings,
  type NotificationTypeKey,
} from "../notificationSettings";

type NotificationsSettingsPanelProps = {
  className: string;
  settings: NotificationSettings;
  enabledTypesCount: number;
  fcmActive: boolean | null;
  pushPermission: NotificationPermission | "unsupported";
  pushSupported: boolean;
  pushBusy: boolean;
  toggleOnClass: string;
  toggleOffClass: string;
  testPushStatus: string | null;
  onEnableBrowserPush: () => void | Promise<void>;
  onDisableBrowserPush: () => void | Promise<void>;
  onToggleType: (key: NotificationTypeKey) => void | Promise<void>;
  onTestPush: () => void | Promise<void>;
  onSetIntranetMode: (mode: NotificationSettings["intranet"]["mode"]) => void | Promise<void>;
  onToggleIntranetSection: (key: IntranetSectionKey) => void | Promise<void>;
};

export function NotificationsSettingsPanel({
  className,
  settings,
  enabledTypesCount,
  fcmActive,
  pushPermission,
  pushSupported,
  pushBusy,
  toggleOnClass,
  toggleOffClass,
  testPushStatus,
  onEnableBrowserPush,
  onDisableBrowserPush,
  onToggleType,
  onTestPush,
  onSetIntranetMode,
  onToggleIntranetSection,
}: NotificationsSettingsPanelProps) {
  return (
    <section className={`h-full space-y-5 lg:col-span-2 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#06b6d4_0%,#3b82f6_45%,#6366f1_100%)]" />

      <div className="relative z-10 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              <BellRing size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
              <span>Notifikace</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Push oprávnění, typy upozornění a intranet sekce na jednom místě.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
              Aktivní typy: {enabledTypesCount}/6
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.08)] ${
                fcmActive
                  ? "border-emerald-700 bg-emerald-600 text-[#f8fafc]"
                  : "border-rose-700 bg-rose-600 text-[#f8fafc]"
              }`}
            >
              {fcmActive ? "Push aktivní" : "Push neaktivní"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-2 border-b border-slate-200/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Push
                </div>
                <h3 className="mt-1 text-xl font-bold tracking-[-0.015em] text-slate-900">
                  Zařízení a typy upozornění
                </h3>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                Prohlížeč:{" "}
                {pushPermission === "granted"
                  ? "povoleno"
                  : pushPermission === "denied"
                    ? "zamítnuto"
                    : pushPermission === "default"
                      ? "nepotvrzeno"
                      : "nepodporováno"}
              </span>
            </div>

            <div className="divide-y divide-slate-200/80">
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Push pro toto zařízení
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Zapnutí vytvoří webový token pro aktuální prohlížeč.
                  </p>
                </div>
                {!pushSupported ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                    Prohlížeč web push nepodporuje.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:min-w-[260px] sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void onEnableBrowserPush()}
                      disabled={pushBusy}
                      className="rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_12px_24px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pushBusy ? "Nastavuju…" : "Zapnout"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDisableBrowserPush()}
                      disabled={pushBusy}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Vypnout
                    </button>
                  </div>
                )}
              </div>

              <div className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Typy notifikací
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Vyber, které události mají chodit jako push.
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                    {enabledTypesCount}/6
                  </span>
                </div>

                <div className="mt-3 grid gap-x-5 sm:grid-cols-2">
                  {NOTIFICATION_TYPE_OPTIONS.map((typeOption) => {
                    const active = settings.types[typeOption.id];
                    const Icon = typeOption.icon;
                    return (
                      <button
                        key={typeOption.id}
                        type="button"
                        onClick={() => void onToggleType(typeOption.id)}
                        role="switch"
                        aria-checked={active}
                        className="flex min-h-[54px] w-full items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:text-slate-950"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2.5">
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                              active
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 truncate">{typeOption.label}</span>
                        </span>
                        <span
                          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition ${
                            active ? toggleOnClass : toggleOffClass
                          }`}
                          aria-hidden="true"
                        >
                          <span
                            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] transition-all ${
                              active ? "left-[26px]" : "left-[2px]"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Testovací push</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Ověř, že push chodí přes webový token tohoto účtu.
                  </p>
                  {testPushStatus ? (
                    <p className="mt-2 text-[11px] text-slate-600">{testPushStatus}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void onTestPush()}
                  className="rounded-xl border border-slate-900 bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] px-4 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_12px_24px_rgba(29,78,216,0.2)] transition hover:brightness-95"
                >
                  Odeslat test
                </button>
              </div>
            </div>
          </div>

          <aside className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-200/80 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Intranet
              </div>
              <h3 className="mt-1 text-xl font-bold tracking-[-0.015em] text-slate-900">
                Sekce příspěvků
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Nastavení sekcí, ze kterých mají chodit push notifikace.
              </p>
            </div>

            <div className="divide-y divide-slate-200/80">
              <div className="px-4 py-4">
                <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-100/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <button
                    type="button"
                    onClick={() => void onSetIntranetMode("all")}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      settings.intranet.mode === "all"
                        ? "bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] text-[#f8fafc] shadow-[0_10px_22px_rgba(29,78,216,0.24)]"
                        : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    Všechny sekce
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSetIntranetMode("selected")}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      settings.intranet.mode === "selected"
                        ? "bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] text-[#f8fafc] shadow-[0_10px_22px_rgba(29,78,216,0.24)]"
                        : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    Jen vybrané
                  </button>
                </div>
              </div>

              {settings.intranet.mode === "selected" ? (
                <div className="px-4 py-2">
                  {INTRANET_SECTIONS.map((section) => {
                    const active = settings.intranet.sections.includes(section.key);
                    const Icon = INTRANET_SECTION_ICON_BY_KEY[section.key];
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => void onToggleIntranetSection(section.key)}
                        role="switch"
                        aria-checked={active}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:text-slate-950"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2.5">
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                              active
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 truncate">{section.label}</span>
                        </span>
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition ${
                            active ? toggleOnClass : toggleOffClass
                          }`}
                          aria-hidden="true"
                        >
                          <span
                            className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] transition-all ${
                              active ? "left-[22px]" : "left-[2px]"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                  {settings.intranet.sections.length === 0 ? (
                    <p className="py-3 text-[11px] text-amber-700">
                      Není vybraná žádná sekce, intranet push nebude chodit.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="px-4 py-4 text-sm leading-relaxed text-slate-600">
                  Push notifikace budou chodit ze všech intranetových sekcí.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
