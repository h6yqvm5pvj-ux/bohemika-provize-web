"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, RefreshCw, ShieldCheck } from "lucide-react";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { filterLoginActivity, loginCountryLabel, loginOutcomeLabel, type LoginActivity, type LoginActivityGeoFilter,
  type LoginActivityResponse, type LoginActivityResultFilter } from "@/lib/loginActivity";
import styles from "../adminConsole.module.css";

const date = (time: number) => new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(time);
const inputClass = "min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const stageLabels = { session: "Vstup do webu", password: "Heslo", mfa: "Dvoufázové ověření", passkey: "Přístupový klíč", provider: "Přihlašovací služba" };
const sourceLabels = { web: "Web · ověřeno serverem", client_report: "Hlášení prohlížeče", session_history: "Starší uložená relace", firebase: "Firebase" };

export function LoginActivityTable({ events }: { events: LoginActivity[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200">
    <table className="w-full min-w-[880px] text-left text-sm">
      <caption className="sr-only">Přihlášení a pokusy, časy v časovém pásmu Praha</caption>
      <thead className="bg-slate-50 text-xs text-slate-600"><tr>{["Čas v ČR", "Účet", "Výsledek", "Země a místo", "Zařízení a IP", "Zdroj"].map(label => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 bg-white">{events.map(event => {
        const foreign = !!event.country && event.country !== "CZ";
        return <tr key={`${event.source}:${event.id}`} className={foreign ? "bg-amber-50/60" : ""}>
          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-700">{date(event.occurredAtMs)}</td>
          <td className="max-w-[250px] break-words px-4 py-4 align-top"><div className="font-medium text-slate-900">{event.email || "Účet nezjištěn"}</div>
            {event.email && !event.identityVerified ? <div className="mt-1 text-xs text-slate-500">Zadaný e-mail · vlastnictví neověřeno</div> : null}</td>
          <td className="px-4 py-4 align-top"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${event.outcome === "success" ? "bg-emerald-50 text-emerald-800" : event.outcome === "denied" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{loginOutcomeLabel(event.outcome)}</span>
            <div className="mt-1.5 text-xs text-slate-500">{stageLabels[event.stage]}</div></td>
          <td className="px-4 py-4 align-top"><div className={foreign ? "font-semibold text-amber-900" : "text-slate-800"}>{loginCountryLabel(event.country)}{foreign ? " · zahraničí" : ""}</div>
            {event.city ? <div className="mt-1 text-xs text-slate-600">{event.city}</div> : null}
            {event.locationObservedAtMs !== event.occurredAtMs ? <div className="mt-1 text-xs text-slate-500">Poslední poloha: {date(event.locationObservedAtMs)}</div> : null}</td>
          <td className="px-4 py-4 align-top text-slate-700"><div>{event.device || "Neznámé zařízení"}</div><div className="mt-1 font-mono text-xs text-slate-500">{event.ipLabel || "IP není k dispozici"}</div></td>
          <td className="px-4 py-4 align-top text-xs text-slate-600"><div>{sourceLabels[event.source]}</div>
            {["development", "preview"].includes(event.environment) ? <div className="mt-1">{event.environment === "development" ? "Místní prostředí" : "Testovací nasazení"}</div> : null}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export function AdminLoginActivitySection() {
  const [source, setSource] = useState<"web" | "firebase">("web"), [days, setDays] = useState(90);
  const [geo, setGeo] = useState<LoginActivityGeoFilter>("all"), [result, setResult] = useState<LoginActivityResultFilter>("all"), [search, setSearch] = useState("");
  const [data, setData] = useState<LoginActivityResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor: string | null = null) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null);
    if (!cursor) setData(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Pro zobrazení přehledu se přihlas jako administrátor.");
      const query = new URLSearchParams({ source, days: String(days), ...(cursor ? { cursor } : {}) });
      const payload = await fetchAuthedJsonOrThrow<LoginActivityResponse>(user, `/api/admin/login-activity?${query}`, { method: "GET", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...payload, events: cursor && previous ? [...new Map([...previous.events, ...payload.events].map(e => [`${e.source}:${e.id}`, e])).values()] : payload.events }));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Přehled není dostupný.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [days, source]);
  useEffect(() => { void load(); return () => pending.current?.abort(); }, [load]);
  const events = data?.events ?? [];
  const filtered = useMemo(() => filterLoginActivity(data?.events ?? [], geo, result, search), [data, geo, result, search]);
  const [visible, setVisible] = useState(50);
  useEffect(() => { setVisible(50); }, [geo, result, search, days, source]);
  const metrics = [
    [source === "web" ? "Přihlášení přijato" : "Ověření přijato", events.filter(e => e.outcome === (source === "web" ? "success" : "provider_accepted")).length],
    ["Ze zahraničí", events.filter(e => e.country && e.country !== "CZ").length],
    ["Odmítnuté / nahlášené", events.filter(e => ["denied", "reported_failure"].includes(e.outcome)).length],
    ["Neznámá země", events.filter(e => !e.country).length],
  ];
  return <section className={styles.section} aria-label="Historie přihlášení">
    <div className={styles.topBar} />
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Globe2 size={22} aria-hidden="true" /> Přihlášení a pokusy</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Sleduj, odkud se účty přihlašují a které požadavky byly odmítnuty. Zahraniční adresa může souviset s cestováním nebo VPN.</p></div>
      <button type="button" className={buttonClass} disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Obnovit</button>
    </div>
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Zdroj historie">
      {([{ id: "web", label: "Přihlášení na web" }, { id: "firebase", label: "Ověřování u Firebase" }] as const).map(option => <button key={option.id} type="button" aria-pressed={source === option.id}
        className={`${buttonClass} ${source === option.id ? "!border-violet-300 !bg-violet-50 !text-violet-900" : ""}`}
        onClick={() => { setSource(option.id); setResult("all"); if (option.id === "firebase") { setDays(d => Math.min(d, 30)); setGeo("all"); } }}>{option.label}</button>)}
    </div>
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
      {source === "web" ? <>Úspěšná přihlášení potvrzuje server. „Nahlášený neúspěch“ pochází z prohlížeče a nepotvrzuje vlastnictví zadaného e-mailu. Historické neuložené pokusy nelze zpětně doplnit.</>
        : <>Události přihlašovací služby zahrnují i přímé pokusy mimo web. Přijaté ověření hesla samo nepotvrzuje dokončení 2FA ani vstup do aplikace. Země zde nemusí být dostupná; záznamy se mohou objevit se zpožděním.</>}
      {data ? <div className="mt-1 text-xs">Uchovávání: {data.retentionDays} dní.{data.trackingStartedAtMs ? ` Nové události se sledují od ${date(data.trackingStartedAtMs)}.` : " Začátek sledování zatím nebyl potvrzen."}</div> : null}
    </div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-slate-900">{data ? value : "—"}</div><div className="mt-1 text-[11px] text-slate-500">V načtených záznamech</div></div>)}</div>
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-medium text-slate-600">Období<select aria-label="Období historie" value={days} onChange={e => setDays(Number(e.target.value))} className={`mt-1 ${inputClass}`}>{[1, 7, 30, ...(source === "web" ? [90] : [])].map(n => <option key={n} value={n}>Posledních {n === 1 ? "24 hodin" : `${n} dní`}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Původ<select aria-label="Původ přihlášení" value={geo} onChange={e => setGeo(e.target.value as LoginActivityGeoFilter)} className={`mt-1 ${inputClass}`}><option value="all">Všechny země</option><option value="foreign">Pouze zahraničí</option><option value="cz">Česko</option><option value="unknown">Neznámá země</option></select></label>
      <label className="text-xs font-medium text-slate-600">Výsledek<select aria-label="Výsledek přihlášení" value={result} onChange={e => setResult(e.target.value as LoginActivityResultFilter)} className={`mt-1 ${inputClass}`}><option value="all">Všechny výsledky</option><option value="denied">Odmítnuto serverem</option>{source === "web" ? <><option value="success">Přihlášení přijato</option><option value="reported_failure">Nahlášený neúspěch</option></> : <><option value="provider_accepted">Ověření přijato</option><option value="provider_unknown">Výsledek neuveden</option></>}</select></label>
      <label className="text-xs font-medium text-slate-600">Hledání<input aria-label="Hledat účet nebo místo" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="E-mail, země, město…" className={`mt-1 ${inputClass}`} /></label>
    </div>
    {error ? <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}{data ? " Zobrazená data pocházejí z předchozího načtení." : ""}</div> : null}
    <div aria-live="polite" className="mb-3 text-xs text-slate-500">{loading ? "Načítám historii…" : data ? `Načteno ${events.length} událostí · filtru odpovídá ${filtered.length} · aktualizováno ${date(data.checkedAtMs)}` : "Historie není načtená."}</div>
    {filtered.length ? <LoginActivityTable events={filtered.slice(0, visible)} /> : !loading && !error ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600"><ShieldCheck className="mx-auto mb-2 text-slate-400" aria-hidden="true" /> V načtené historii žádný záznam neodpovídá filtru.{data?.nextCursor ? " Další záznamy mohou být na starších stránkách." : ""}</div> : null}
    <div className="mt-4 flex flex-wrap gap-3">{filtered.length > visible ? <button className={buttonClass} type="button" onClick={() => setVisible(n => n + 50)}>Zobrazit další záznamy</button> : null}
      {data?.nextCursor ? <button className={buttonClass} type="button" disabled={loading} onClick={() => void load(data.nextCursor)}>Načíst starší historii</button> : null}</div>
    <p className="mt-4 text-xs leading-5 text-slate-500">Časy jsou uvedené pro Prahu. IP adresy jsou částečně skryté. Stejná opakovaná odmítnutí na webu se během jedné minuty slučují. Počty označují události, nikoli počet osob. Přehled je určen pouze administrátorům.</p>
  </section>;
}
