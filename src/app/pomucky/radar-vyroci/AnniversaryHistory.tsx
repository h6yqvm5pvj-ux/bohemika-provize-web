"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { CalendarCheck, CheckCheck, CircleOff, History, Loader2, MessageSquareText, PhoneCall, PhoneMissed, RotateCcw } from "lucide-react";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { AnniversaryHistoryEvent, AnniversaryHistoryResponse } from "@/app/lib/anniversaryReviews";

function eventPresentation(event: AnniversaryHistoryEvent) {
  if (event.kind === "legacy") return { label: "Dosavadní stav", Icon: History };
  if (event.kind === "reopened") return { label: "Vráceno k řešení", Icon: RotateCcw };
  if (event.kind === "completed") return { label: "Označeno jako dokončené", Icon: CheckCheck };
  if (event.kind === "note") return { label: event.note ? "Poznámka" : "Poznámka vymazána", Icon: MessageSquareText };
  if (event.kind === "reviewed") return { label: "Zkontrolováno", Icon: CheckCheck };
  return {
    no_answer: { label: "Nezvedá", Icon: PhoneMissed },
    reached: { label: "Dovoláno", Icon: PhoneCall },
    meeting: { label: "Domluvena schůzka", Icon: CalendarCheck },
    ignore: { label: "Neřešit", Icon: CircleOff },
  }[event.contactOutcome ?? "reached"];
}

const contactLabel = (event: AnniversaryHistoryEvent) => ({ no_answer: "Nezvedá", reached: "Dovoláno", meeting: "Domluvena schůzka", ignore: "Neřešit" }[event.contactOutcome ?? "reached"]);

export function AnniversaryHistory({ user, ownerEmail, entryId, occurrenceKey, version = 0 }: {
  user: User;
  ownerEmail: string;
  entryId: string;
  occurrenceKey: string;
  version?: number;
}) {
  const [events, setEvents] = useState<AnniversaryHistoryEvent[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (before: number | null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ history: "1", ownerEmail, entryId });
      if (before !== null) params.set("before", String(before));
      const data = await fetchAuthedJsonOrThrow<AnniversaryHistoryResponse>(user, `/api/contracts/anniversary-review?${params}`, { signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!data?.ok || !Array.isArray(data.history) || (data.hasMore && (!data.nextCursor || (before !== null && data.nextCursor >= before)))) throw new Error(data?.error || "Historii se nepodařilo načíst.");
      setEvents(previous => {
        const unique = new Map((before === null ? [] : previous).map(event => [event.id, event]));
        for (const event of data.history) unique.set(event.id, event);
        return [...unique.values()].sort((a, b) => b.sequence - a.sequence);
      });
      setCursor(data.hasMore ? data.nextCursor : null); setLoaded(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Historii se nepodařilo načíst.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [user, ownerEmail, entryId]);

  useEffect(() => {
    setEvents([]); setCursor(null); setLoaded(false);
    void load(null);
    return () => request.current?.abort();
  }, [load, version]);

  return (
    <section aria-label="Historie jednání" className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <History className="h-4 w-4 text-violet-600" /> Historie jednání
        <span className="ml-auto text-[11px] font-normal text-slate-400">Nejnovější nahoře</span>
      </div>
      {events.length > 0 && <ol className="space-y-0">
        {events.map((event, index) => {
          const { label, Icon } = eventPresentation(event);
          return <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3.5 top-7 w-px bg-violet-100" />}
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600"><Icon className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-slate-900">{label}</p>
                {event.createdAtMs !== null ? <time className="text-[11px] text-slate-500" dateTime={new Date(event.createdAtMs).toISOString()}>
                  {new Date(event.createdAtMs).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" })}
                </time> : <span className="text-[11px] text-slate-400">Datum původního zápisu není známo</span>}
              </div>
              {event.kind === "legacy" && event.contactOutcome && <p className="mt-1 text-xs text-slate-600">{contactLabel(event)}</p>}
              {event.meetingAt && <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-violet-700"><CalendarCheck className="h-3.5 w-3.5" /> Schůzka: {new Date(event.meetingAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
              {event.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{event.note}</p>}
              <p className="mt-1.5 break-all text-[10px] text-slate-400">
                {event.actorEmail === user.email ? "Zapsali jste vy" : event.actorEmail ? `Zapsal/a ${event.actorEmail}` : "Původní záznam"}
                {event.occurrenceKey && event.occurrenceKey !== occurrenceKey ? ` · Výročí ${event.occurrenceKey.slice(0, 4)}` : ""}
              </p>
            </div>
          </li>;
        })}
      </ol>}
      {loaded && events.length === 0 && !error && <p className="text-xs leading-relaxed text-slate-500">Zatím bez záznamů. První kontakt nebo poznámka zahájí historii jednání.</p>}
      {error && <div role="alert" className="mt-3 text-xs text-red-700">{error} <button type="button" onClick={() => void load(loaded ? cursor : null)} className="font-semibold underline">Zkusit znovu</button></div>}
      {loading && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Načítám historii…</p>}
      {!loading && !error && cursor !== null && <button type="button" onClick={() => void load(cursor)} className="mt-4 text-xs font-semibold text-violet-700 hover:underline">Načíst starší záznamy</button>}
    </section>
  );
}
