// src/app/kalendar/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd (lokální CZ)
  time?: string;
  note?: string;
  notify?: boolean;
  clientName?: string;
};

type ContractEntry = {
  id: string;
  productKey?: string | null;
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: any;
  contractSignedDate?: any;
  createdAt?: any;
};

const TZ = "Europe/Prague";

const formatDateKey = (d: Date) =>
  d.toLocaleDateString("sv-SE", { timeZone: TZ }); // yyyy-MM-dd v lokálním čase

// Bezpečné parsování yyyy-MM-dd do "lokálního" Date (bez UTC shiftu)
const parseDateKey = (iso: string): Date | null => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0); // lokální půlnoc
};

function formatDateLabel(d: Date) {
  return d.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.seconds) {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addYears(date: Date, years: number) {
  const copy = new Date(date.getTime());
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function productLabel(p?: string | null): string {
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Produkt neuveden";
  }
}

export default function CalendarPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(formatDateKey(today));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [clientName, setClientName] = useState("");

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [contracts, setContracts] = useState<ContractEntry[]>([]);
  const [showAnniversaries, setShowAnniversaries] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ iso: string; date: Date } | null>(null);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // load events from Firestore
  useEffect(() => {
    const load = async () => {
      if (!user?.email) {
        setEvents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const col = collection(db, "users", user.email, "calendarEvents");
        const q = query(col, orderBy("date", "asc"));
        const snap = await getDocs(q);
        const list: CalendarEvent[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "",
            date: data.date ?? "",
            time: typeof data.time === "string" ? data.time : undefined,
            note: data.note ?? undefined,
            notify: data.notify ?? true,
            clientName: data.clientName ?? undefined,
          };
        });
        setEvents(list);
      } catch (e) {
        console.error("Cannot load calendar events", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  // load contracts for anniversaries
  useEffect(() => {
    const loadContracts = async () => {
      if (!user?.email) {
        setContracts([]);
        return;
      }
      try {
        const col = collection(db, "users", user.email, "entries");
        const snap = await getDocs(col);
        const list: ContractEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setContracts(list);
      } catch (e) {
        console.error("Cannot load contracts for anniversaries", e);
      }
    };
    loadContracts();
  }, [user]);

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Po=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const res: { date: Date; isCurrentMonth: boolean }[] = [];

    // předchozí měsíc pro zarovnání
    for (let i = 0; i < startWeekday; i++) {
      res.push({
        date: new Date(year, month, i - startWeekday + 1),
        isCurrentMonth: false,
      });
    }
    // aktuální měsíc
    for (let d = 1; d <= daysInMonth; d++) {
      res.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // doplnit na celé týdny
    while (res.length % 7 !== 0) {
      res.push({
        date: new Date(year, month + 1, res.length % 7),
        isCurrentMonth: false,
      });
    }
    return res;
  }, [month, year]);

  const anniversaryEvents = useMemo(() => {
    if (!showAnniversaries) return [];
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const daysInCurrentMonth = lastOfMonth.getDate();

    const out: CalendarEvent[] = [];
    for (const c of contracts) {
      // Výročí se řídí podle počátku smlouvy (policyStartDate)
      const startRaw = toDate((c as any).policyStartDate);
      if (!startRaw) continue;

      // Odřízneme čas, ať nedělá posun mezi roky/měsíci
      const start = new Date(
        startRaw.getFullYear(),
        startRaw.getMonth(),
        startRaw.getDate(),
        0,
        0,
        0,
        0
      );

      // Render jen ve stejném měsíci jako počátek smlouvy
      if (month !== start.getMonth()) continue;

      const day = Math.min(start.getDate(), daysInCurrentMonth);
      const candidate = new Date(year, month, day);

      const firstAnniversary = addYears(start, 1);
      if (
        candidate >= firstAnniversary &&
        candidate >= firstOfMonth &&
        candidate <= lastOfMonth
      ) {
        const iso = formatDateKey(candidate);
        out.push({
          id: `anniv-${c.id}-${iso}`,
          title: `Výročí smlouvy (${c.contractNumber ?? "bez č."})`,
          date: iso,
          time: "09:00",
          note: `${c.clientName ?? "Klient"} • ${productLabel(c.productKey)}`,
          notify: true,
        });
      }
    }
    return out;
  }, [contracts, month, year, showAnniversaries]);
  const allEvents = useMemo(
    () => (showAnniversaries ? [...events, ...anniversaryEvents] : events),
    [events, anniversaryEvents, showAnniversaries]
  );

  const clientSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      const name = (c.clientName ?? "").trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "cs"));
  }, [contracts]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of allEvents) {
      const arr = map.get(ev.date) ?? [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    return map;
  }, [allEvents]);

  const visibleEvents = events
    .slice()
    // bez času (u starších dat) až na konec dne
    .sort((a, b) =>
      (a.date + (a.time ?? "99:99")).localeCompare(b.date + (b.time ?? "99:99"))
    )
    .slice(0, 6);

  const addEvent = async () => {
    if (!user?.email) return;
    if (!title.trim() || !date) return;

    setSaving(true);
    try {
      const col = collection(db, "users", user.email, "calendarEvents");

      // default čas, pokud není zadán
      const effectiveTime = time || "09:00";

      const newEvent = {
        title: title.trim(),
        date,
        time: effectiveTime,
        note: note.trim() || null,
        notify,
        clientName: clientName.trim() || null,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(col, newEvent);

      setEvents((prev) => [
        ...prev,
        {
          id: docRef.id,
          title: newEvent.title,
          date,
          time: newEvent.time ?? undefined,
          note: (newEvent.note as string | null) ?? undefined,
          notify,
          clientName: newEvent.clientName ?? undefined,
        },
      ]);

      setTitle("");
      setNote("");
      setTime("");
      setNotify(true);
      setClientName("");
    } catch (e) {
      console.error("Cannot add event", e);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!user?.email) return;
    try {
      const ref = doc(db, "users", user.email, "calendarEvents", id);
      await deleteDoc(ref);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error("Cannot delete event", e);
    }
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });

  const goMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  if (!user) {
    return (
      <AppLayout active="calendar">
        <div className="w-full max-w-3xl">
          <div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-2xl">
            <p className="text-sm text-slate-200">Pro práci s kalendářem se prosím přihlas.</p>
            <Link
              href="/login"
              className="mt-2 inline-flex items-center rounded-lg bg-white text-slate-900 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100"
            >
              Přejít na přihlášení
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="calendar">
      <div className="w-full max-w-6xl space-y-6">
        <header className="mb-2 space-y-2">
          <SplitTitle text="Kalendář" />
          <p className="text-sm text-slate-300 max-w-2xl">
            Rychlé přidání vlastních událostí a přehled nadcházejících termínů.
          </p>
        </header>

        <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-lg font-semibold text-white">{monthLabel}</div>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => goMonth(-1)}
                className="rounded-full border border-white/20 px-3 py-1 text-white hover:bg-white/10"
              >
                ←
              </button>
              <button
                onClick={() => {
                  const t = new Date();
                  setYear(t.getFullYear());
                  setMonth(t.getMonth());
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-white hover:bg-white/10"
              >
                Dnes
              </button>
              <button
                onClick={() => goMonth(1)}
                className="rounded-full border border-white/20 px-3 py-1 text-white hover:bg-white/10"
              >
                →
              </button>
              <label className="inline-flex items-center gap-1 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={showAnniversaries}
                  onChange={(e) => setShowAnniversaries(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/30 bg-slate-900/70 text-sky-500 focus:ring-2 focus:ring-sky-500"
                />
                Výročí smluv
              </label>
            </div>
          </div>

          <div className="grid grid-cols-7 text-xs text-slate-300">
            {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
              <div key={d} className="px-2 py-2 text-center uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-sm">
            {days.map((day, idx) => {
              const iso = formatDateKey(day.date);
              const evs = eventsByDay.get(iso) ?? [];
              const isToday = day.date.toDateString() === today.toDateString();

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay({ iso, date: day.date })}
                  className={`rounded-xl border px-2 py-2 h-24 flex flex-col gap-1 cursor-pointer transition ${
                    day.isCurrentMonth
                      ? "border-white/10 bg-white/5"
                      : "border-white/5 bg-white/[0.03] text-slate-400"
                  } ${isToday ? "ring-1 ring-sky-400/70" : ""} hover:border-sky-300/60 hover:bg-white/10`}
                >
                  <div className="text-xs font-semibold text-white">{day.date.getDate()}</div>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {evs.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className="truncate rounded-lg bg-sky-500/15 border border-sky-400/30 px-1 py-0.5 text-[11px] text-slate-100"
                        title={ev.title}
                      >
                        {ev.time ? `${ev.time} • ` : ""}
                        {ev.title}
                      </div>
                    ))}
                    {evs.length > 2 && (
                      <div className="text-[10px] text-slate-400">+{evs.length - 2} dalších</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-3">
            <h2 className="text-lg font-semibold text-white">Přidat událost</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-200 sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-slate-400">Název</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="Např. schůzka s klientem"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-200">
                <span className="text-xs uppercase tracking-wide text-slate-400">Datum</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-200">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  Čas (volitelné)
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Pokud čas nevyplníš, uloží se automaticky <span className="text-slate-200">09:00</span>.
                </div>
              </label>

              <label className="space-y-1 text-sm text-slate-200 sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-slate-400">Klient</span>
                <input
                  list="client-suggestions"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="Jméno klienta (našeptává dle existujících smluv)"
                />
                <datalist id="client-suggestions">
                  {clientSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>

              <label className="space-y-1 text-sm text-slate-200 sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-slate-400">Poznámka</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
                  placeholder="Detaily, místo, příprava…"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/30 bg-slate-900/70 text-sky-500 focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  Poslat notifikaci
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={addEvent}
              disabled={saving || !title.trim()}
              className="inline-flex items-center justify-center rounded-full bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Ukládám…" : "Přidat událost"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Nadcházející události</h2>
              <span className="text-xs text-slate-300">{events.length} celkem</span>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                Načítám události…
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                Zatím žádné události. Přidej první schůzku nebo úkol.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEvents.map((ev) => {
                  const d = parseDateKey(ev.date) ?? new Date(`${ev.date}T00:00:00`);

                  return (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-white/10 bg-gradient-to-br from-white/8 via-slate-900/40 to-slate-950/50 px-3 py-2 text-sm text-white"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{ev.title}</div>
                        <button
                          type="button"
                          onClick={() => deleteEvent(ev.id)}
                          className="text-[11px] text-slate-300 hover:text-rose-200"
                        >
                          Smazat
                        </button>
                      </div>

                      <div className="text-xs text-slate-300">
                        {formatDateLabel(d)}
                        {ev.time ? ` • ${ev.time}` : ""}
                      </div>

                      {ev.clientName && (
                        <div className="text-[11px] text-slate-300 mt-1">
                          Klient: {ev.clientName}
                        </div>
                      )}

                      {ev.note && (
                        <div className="text-[11px] text-slate-400 mt-1">{ev.note}</div>
                      )}

                      {ev.notify === false && (
                        <div className="text-[10px] text-amber-300 mt-1">
                          Notifikace vypnuta pro tuto událost
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {selectedDay && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setSelectedDay(null)}
          >
            <div
              className="relative w-full max-w-3xl rounded-3xl border border-white/15 bg-slate-900/80 px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
              >
                Zavřít
              </button>

              <div className="text-lg font-semibold text-white">
                {formatDateLabel(selectedDay.date)}
              </div>

              <div className="mt-3 space-y-2">
                {(() => {
                  const items =
                    eventsByDay.get(selectedDay.iso) ?? [];
                  const sorted = items
                    .slice()
                    .sort((a, b) =>
                      (a.time ?? "99:99").localeCompare(b.time ?? "99:99")
                    );

                  if (sorted.length === 0) {
                    return (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                        Žádné události pro tento den.
                      </div>
                    );
                  }

                  return sorted.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl border border-white/12 bg-gradient-to-br from-white/10 via-slate-900/40 to-slate-950/50 px-4 py-3 text-sm text-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-wide text-sky-200/80">
                          {ev.id.startsWith("anniv-") ? "Výročí smlouvy" : "Událost"}
                        </div>
                        {!ev.id.startsWith("anniv-") && (
                          <button
                            type="button"
                            onClick={() => deleteEvent(ev.id)}
                            className="text-[11px] text-slate-300 hover:text-rose-200"
                          >
                            Smazat
                          </button>
                        )}
                      </div>

                      <div className="mt-1 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">
                          {ev.time ? `${ev.time} • ` : ""}
                          {ev.title}
                        </div>
                        {ev.note && (
                          <div className="text-[12px] text-slate-300 mt-1">
                            {ev.note}
                          </div>
                        )}
                        {ev.clientName && (
                          <div className="text-[11px] text-slate-300 mt-1">
                            Klient: {ev.clientName}
                          </div>
                        )}
                        {ev.notify === false && (
                          <div className="text-[11px] text-amber-300 mt-1">
                            Notifikace vypnuta pro tuto událost
                          </div>
                        )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatDateLabel(selectedDay.date)}
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
