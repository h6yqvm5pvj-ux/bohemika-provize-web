"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  BarChart3,
  CalendarCheck,
  Download,
  Eye,
  Mail,
  MousePointerClick,
  PhoneCall,
  RefreshCw,
} from "lucide-react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import {
  EMPTY_ONLINE_CARD_ANALYTICS_EVENTS,
  type OnlineCardAnalyticsDay,
  type OnlineCardAnalyticsEventCounts,
} from "@/lib/onlineCardAnalytics";

type AnalyticsResponse = {
  ok: boolean;
  rangeDays: number;
  days: OnlineCardAnalyticsDay[];
  totals: OnlineCardAnalyticsEventCounts;
};

const formatDay = (value: string): string => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(date);
};

const emptyAnalyticsResponse = (rangeDays: number): AnalyticsResponse => ({
  ok: true,
  rangeDays,
  days: [],
  totals: EMPTY_ONLINE_CARD_ANALYTICS_EVENTS(),
});

export function OnlineCardAnalyticsPanel({
  user,
  enabled,
  impersonatedEmail = "",
}: {
  user: FirebaseUser | null;
  enabled: boolean;
  impersonatedEmail?: string;
}) {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<AnalyticsResponse>(() => emptyAnalyticsResponse(30));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const loadAnalytics = useCallback(async () => {
    activeRequest.current?.abort();
    if (!user || !enabled) {
      setData(emptyAnalyticsResponse(rangeDays));
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAuthedJsonOrThrow<AnalyticsResponse>(
        user,
        `/api/online-card/analytics?days=${rangeDays}`,
        {
          signal: controller.signal,
          headers: { [ADMIN_IMPERSONATION_HEADER]: impersonatedEmail },
        }
      );
      if (controller.signal.aborted) return;
      if (!response?.ok) throw new Error("Přehled návštěvnosti se nepodařilo načíst.");
      setData({
        ok: true,
        rangeDays,
        days: Array.isArray(response.days) ? response.days : [],
        totals: response.totals ?? EMPTY_ONLINE_CARD_ANALYTICS_EVENTS(),
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setData(emptyAnalyticsResponse(rangeDays));
      setError(
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "Přehled návštěvnosti se nepodařilo načíst."
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [enabled, rangeDays, user, impersonatedEmail]);

  useEffect(() => {
    void loadAnalytics();
    return () => activeRequest.current?.abort();
  }, [loadAnalytics]);

  const totals = data.totals;
  const contactClicks = totals.phone_click + totals.email_click;
  const maxVisits = useMemo(
    () => Math.max(1, ...data.days.map((day) => day.events.visit)),
    [data.days]
  );
  const displayedDays = data.days;
  const firstDay = displayedDays[0]?.day;
  const middleDay = displayedDays[Math.floor(displayedDays.length / 2)]?.day;
  const lastDay = displayedDays.at(-1)?.day;

  const metrics = [
    { label: "Návštěvy", value: totals.visit, icon: Eye, className: "text-violet-700 bg-violet-50 border-violet-100" },
    { label: "Telefon a e-mail", value: contactClicks, icon: MousePointerClick, className: "text-sky-700 bg-sky-50 border-sky-100" },
    { label: "Stažení kontaktu", value: totals.vcard_download, icon: Download, className: "text-emerald-700 bg-emerald-50 border-emerald-100" },
    { label: "Žádosti o schůzku", value: totals.meeting_submitted, icon: CalendarCheck, className: "text-rose-700 bg-rose-50 border-rose-100" },
  ];

  return (
    <section className="rounded-[20px] border border-violet-100 bg-[radial-gradient(circle_at_92%_0%,rgba(196,181,253,0.28),transparent_28%),linear-gradient(135deg,#ffffff_0%,#faf7ff_100%)] px-4 py-4 text-slate-900 shadow-[0_14px_34px_rgba(88,28,135,0.07)] sm:rounded-[26px] sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            Výkon vizitky
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-950">Návštěvy a konverze</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Návštěvy vizitky a provedené akce za vybrané období. Opakované otevření ve stejné relaci prohlížeče se počítá jednou.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days as 7 | 30 | 90)}
              aria-pressed={rangeDays === days}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                rangeDays === days
                  ? "bg-violet-700 !text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)]"
                  : "border border-violet-100 bg-white text-slate-600 hover:border-violet-300"
              }`}
            >
              {days} dní
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={loading || !enabled || !user}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Obnovit přehled"
            aria-label="Obnovit přehled výkonu vizitky"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-white/75 px-4 py-4 text-sm text-slate-600">
          Statistiky se začnou zapisovat po zveřejnění online vizitky.
        </div>
      ) : !user || loading ? (
        <div role="status" className="mt-4 rounded-2xl border border-violet-100 bg-white/75 px-4 py-6 text-sm text-slate-600">
          Načítám statistiky vizitky…
        </div>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-2xl border border-slate-100 bg-white/90 p-3 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${metric.className}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-2xl font-black leading-none tracking-[-0.04em] text-slate-950">{metric.value}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-violet-100 bg-slate-950 px-3 pb-3 pt-3 shadow-[0_10px_24px_rgba(15,23,42,0.12)] sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100/75">Vývoj návštěv</p>
              <p className="text-[11px] font-semibold text-violet-100/55">{data.rangeDays} dní</p>
            </div>
            <div className="relative mt-3 flex h-24 items-end gap-px" role="img" aria-label={`Graf návštěv vizitky za ${data.rangeDays} dní, celkem ${totals.visit} návštěv`}>
              {totals.visit === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-violet-100/70">Ve vybraném období zatím nejsou návštěvy.</p>
              )}
              {displayedDays.map((day) => {
                const height = day.events.visit > 0 ? Math.max(2, Math.round((day.events.visit / maxVisits) * 100)) : 0;
                return (
                  <div
                    key={day.day}
                    className="group relative min-w-0 flex-1 rounded-t-sm bg-[linear-gradient(180deg,#c084fc_0%,#7c3aed_60%,#4c1d95_100%)] transition hover:brightness-125"
                    style={{ height: `${height}%` }}
                    title={`${formatDay(day.day)}: ${day.events.visit} návštěv`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-medium text-violet-100/50">
              <span>{firstDay ? formatDay(firstDay) : "—"}</span>
              <span>{middleDay ? formatDay(middleDay) : "—"}</span>
              <span>{lastDay ? formatDay(lastDay) : "—"}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" /> Telefon: {totals.phone_click}</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" /> E-mail: {totals.email_click}</span>
            <span>Web: {totals.website_click}</span>
            <span>Mapa: {totals.map_click}</span>
            <span>Otevřený formulář: {totals.meeting_open}</span>
          </div>
          <div className="mt-4 rounded-2xl border border-violet-100 bg-white/80 p-3">
            <p className="text-xs font-bold text-violet-800">Cestovní pojištění</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <span><strong className="block text-lg text-slate-900">{totals.travel_visit ?? 0}</strong>Návštěvy stránky</span>
              <span><strong className="block text-lg text-slate-900">{totals.travel_plan ?? 0}</strong>Zobrazené plány</span>
              <span><strong className="block text-lg text-slate-900">{totals.travel_submitted ?? 0}</strong>Odeslané poptávky</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
