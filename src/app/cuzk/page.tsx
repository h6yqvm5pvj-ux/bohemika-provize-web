"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { ArrowRight, Loader2, MapPin, RefreshCw, Search, SearchX, WifiOff, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { auth } from "../firebase";
import { CuzkIntro } from "./CuzkIntro";
import { CuzkLoader } from "./CuzkLoader";
import { CuzkResults } from "./CuzkResults";
import { CuzkAddressList, type RuianMatch } from "./CuzkAddressList";
import searchStyles from "./cuzkSearch.module.css";
import type { ParcelRow, DateInsight } from "./cuzkResultData";
import resultStyles from "./cuzkResults.module.css";
import introStyles from "@/components/tools/toolIntro.module.css";

type CuzkSearchApiSuccess = {
  ok: true;
  data?: unknown;
  resolvedAddress?: string;
  suggestions?: RuianMatch[];
  matches?: RuianMatch[];
};

type CuzkSearchApiError = {
  ok: false;
  error?: string;
};

const CUZK_CLIENT_TIMEOUT_MS = 30_000;

function normalizeSpaces(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function readCuzkApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as CuzkSearchApiError).error;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  return fallback;
}

async function callCuzkSearchApi(
  user: FirebaseUser,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<CuzkSearchApiSuccess> {
  const searchParams = new URLSearchParams(params);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(
    () => controller.abort(),
    CUZK_CLIENT_TIMEOUT_MS
  );

  let payload: CuzkSearchApiSuccess | CuzkSearchApiError;
  try {
    payload = await fetchAuthedJsonOrThrow<
      CuzkSearchApiSuccess | CuzkSearchApiError
    >(user, `/api/cuzk/search?${searchParams.toString()}`, {
      signal: controller.signal,
    });
  } catch (err: any) {
    if (signal?.aborted) throw err;
    if (err?.name === "AbortError") {
      throw new Error(
        "ČÚZK odpovídá příliš dlouho. Zkus dotaz znovu, případně vyber přesnou adresu z našeptávače."
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }

  if (payload && typeof payload === "object" && (payload as CuzkSearchApiSuccess).ok) {
    return payload as CuzkSearchApiSuccess;
  }

  throw new Error(
    readCuzkApiError(payload, "Nepodařilo se načíst data z ČÚZK.")
  );
}

function safeStr(v: any): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function safeNum(v: any): number | undefined {
  // ✅ kritický fix: Number(null) === 0 → nechceme
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateCandidate(value: any): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const d = new Date(n);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const m = raw.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function wholeDaysBetween(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

function formatParcelaFromDef(p: any): string | undefined {
  const kmen = safeNum(p?.kmenoveCisloParcely);
  if (kmen == null) return undefined;
  const podd = p?.poddeleniCislaParcely ?? null;
  return podd != null && String(podd).trim().length ? `${kmen}/${podd}` : `${kmen}`;
}

function extractParcels(obj: any): ParcelRow[] {
  if (!obj || typeof obj !== "object") return [];

  const stavba = obj?.stavba ?? null;

  const candidates: any[] = []
    .concat(obj?.pozemky ?? [])
    .concat(obj?.parcely ?? [])
    .concat(obj?.parcelyPozemky ?? [])
    .concat(stavba?.pozemky ?? [])
    .concat(stavba?.parcely ?? [])
    .concat(stavba?.parcelyPozemky ?? [])
    .concat(stavba?.vazbyPozemky ?? [])
    .filter(Boolean);

  const rows: ParcelRow[] = candidates.map((p: any) => {
    let parcela =
      p?.parcelaCislo ??
      p?.cisloParcely ??
      p?.parcela ??
      p?.parcelaText ??
      p?.identifikace ??
      p?.oznaceni ??
      p?.cislo ??
      p?.attributes?.parcelaCislo ??
      p?.attributes?.parcela ??
      null;

    // ✅ ParcelaDef z KN API často nese jen kmenové/poddělení
    if (parcela == null) {
      const fromDef = formatParcelaFromDef(p);
      if (fromDef) parcela = fromDef;
    }

    const vymera =
      p?.vymera ??
      p?.vymeraM2 ??
      p?.vymeraPozemku ??
      p?.vyměra ??
      p?.attributes?.vymera ??
      p?.attributes?.vymeraM2 ??
      null;

    const druh =
      p?.druhPozemku?.nazev ??
      p?.druhPozemku ??
      p?.druh ??
      p?.attributes?.druhPozemku ??
      null;

    const katUzemi =
      p?.katastralniUzemi?.nazev ??
      p?.katUzemi?.nazev ??
      p?.kU ??
      p?.ku ??
      p?.katastralniUzemi ??
      null;

    const lv =
      p?.lv ??
      p?.cisloLV ??
      p?.listVlastnictvi ??
      p?.attributes?.lv ??
      // někdy je LV u stavby
      obj?.stavba?.lv?.cislo ??
      null;

    const typParcely = p?.typParcely ?? p?.attributes?.typParcely ?? null;

    return {
      id: p?.id ?? p?.identifikace ?? p?.attributes?.id,
      parcela: parcela != null ? String(parcela) : undefined,
      vymeraM2: safeNum(vymera),
      druh: druh != null ? String(druh) : undefined,
      katUzemi: katUzemi != null ? String(katUzemi) : undefined,
      lv: lv != null ? lv : undefined,
      typParcely: typParcely != null ? String(typParcely) : undefined,
    };
  });

  const cleaned = rows.filter((r) => r.parcela || r.id || r.vymeraM2 != null);
  const seen = new Set<string>();
  const uniq: ParcelRow[] = [];
  for (const r of cleaned) {
    const key = `${r.parcela ?? ""}#${r.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }
  return uniq;
}

function extractAdresniMista(obj: any): { adresa: string; ruian?: number }[] {
  if (!obj || typeof obj !== "object") return [];

  const out: { adresa: string; ruian?: number }[] = [];

  const match = obj?.match;
  if (match?.adresa) out.push({ adresa: String(match.adresa), ruian: safeNum(match.kod) });

  const stavba = obj?.stavba;

  const candidates: any[] = []
    .concat(stavba?.adresniMista ?? [])
    .concat(stavba?.adresniMisto ?? [])
    .concat(obj?.adresniMista ?? [])
    .filter((x: any) => x !== null && x !== undefined);

  for (const a of candidates) {
    // ✅ v tvém JSON je to pole čísel: [18466311]
    if (typeof a === "number") {
      out.push({ adresa: `RÚIAN kód: ${a}`, ruian: a });
      continue;
    }

    const adresa = a?.adresa ?? a?.text ?? a?.label ?? null;
    const ruian = safeNum(a?.kod ?? a?.ruian ?? a?.ruianKod ?? a?.id);
    if (adresa) out.push({ adresa: String(adresa), ruian });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const k = x.adresa.trim().toLowerCase();
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function CuzkPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [addressQuery, setAddressQuery] = useState("");
  const [addressFromQuery, setAddressFromQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<RuianMatch[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [searchActivated, setSearchActivated] = useState(false);

  const [suggestions, setSuggestions] = useState<RuianMatch[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [suggestRetry, setSuggestRetry] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggestWrapRef = useRef<HTMLDivElement | null>(null);
  const suggestReqSeq = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestCacheRef = useRef(new Map<string, { matches: RuianMatch[]; expiresAt: number }>());
  const suggestDismissedRef = useRef(false);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const suppressSuggestRef = useRef(false);
  const autoLookupAddressRef = useRef<string | null>(null);
  const lookupInProgressRef = useRef(false);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);
  const searchPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const normalized = normalizeSpaces(params.get("address") ?? params.get("q") ?? "");
    setAddressFromQuery(normalized);
    setAddressQuery(normalized);
    return () => { suggestAbortRef.current?.abort(); lookupAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!searchActivated || (!loading && !result && !matches.length && !error)) return;
    const frame = window.requestAnimationFrame(() => {
      const target = !loading && (matches.length > 0 || error) ? searchPanelRef.current : resultScrollTargetRef.current;
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off" ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, searchActivated, matches.length, error, result]);

  const canSearch = !!user && normalizeSpaces(addressQuery).length >= 2;

  const dismissSuggestions = () => {
    suggestDismissedRef.current = true;
    setSuggestOpen(false);
    setActiveIdx(-1);
  };

  const changeAddress = (value: string) => {
    ++suggestReqSeq.current;
    suggestAbortRef.current?.abort();
    suppressSuggestRef.current = false;
    suggestDismissedRef.current = false;
    setAddressQuery(value);
    setSuggestions([]);
    setSuggestError(false);
    setActiveIdx(-1);
    setMatches([]);
    setError(null);
  };

  const clearAll = () => {
    changeAddress("");
    setResult(null);
    setSearchActivated(false);
    setSuggestOpen(false);
    setSuggestLoading(false);
    window.requestAnimationFrame(() => addressInputRef.current?.focus());
  };

  useEffect(() => {
    const mySeq = ++suggestReqSeq.current;
    const typed = normalizeSpaces(addressQuery);
    setSuggestions([]);
    setSuggestError(false);
    setActiveIdx(-1);
    if (!user || loading || typed.length < 2 || suppressSuggestRef.current) {
      setSuggestOpen(false);
      setSuggestLoading(false);
      return;
    }
    const cacheKey = `${user.uid}:${typed.toLocaleLowerCase("cs-CZ")}`;
    const cached = suggestCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setSuggestions(cached.matches);
      setSuggestLoading(false);
      setSuggestOpen(!suggestDismissedRef.current);
      return;
    }
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    setSuggestLoading(true);
    setSuggestOpen(!suggestDismissedRef.current);
    const timer = setTimeout(async () => {
      try {
        const payload = await callCuzkSearchApi(user, { action: "suggest", q: typed }, controller.signal);
        if (controller.signal.aborted || mySeq !== suggestReqSeq.current) return;
        const list = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        const cache = suggestCacheRef.current;
        if (cache.size >= 30) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { matches: list, expiresAt: Date.now() + 45_000 });
        setSuggestions(list);
        setSuggestOpen(!suggestDismissedRef.current);
      } catch {
        if (controller.signal.aborted || mySeq !== suggestReqSeq.current) return;
        setSuggestions([]);
        setSuggestError(true);
        setSuggestOpen(!suggestDismissedRef.current);
      } finally {
        if (!controller.signal.aborted && mySeq === suggestReqSeq.current) setSuggestLoading(false);
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [addressQuery, user, loading, suggestRetry]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!suggestWrapRef.current?.contains(event.target as Node)) {
        suggestDismissedRef.current = true;
        setSuggestOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    if (suggestOpen && activeIdx >= 0) document.getElementById(`cuzk-suggestion-${activeIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, suggestOpen]);

  const runLookup = useCallback(async (query: string, kod?: number) => {
    if (!user || lookupInProgressRef.current) return;
    const q = normalizeSpaces(query);
    if (q.length < 2) return;
    lookupInProgressRef.current = true;
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    suggestAbortRef.current?.abort();
    ++suggestReqSeq.current;
    suppressSuggestRef.current = true;
    suggestDismissedRef.current = true;
    setSuggestOpen(false);
    setSuggestLoading(false);
    setAddressQuery(q);
    setSearchActivated(true);
    setLoading(true);
    setError(null);
    setResult(null);
    setMatches([]);
    try {
      const payload = await callCuzkSearchApi(user, kod && Number.isInteger(kod) && kod > 0
        ? { action: "detail", kod: String(kod), includeUnits: "1" }
        : { action: "search", q, includeUnits: "1" }, controller.signal);
      if (controller.signal.aborted) return;
      const data = payload.data as { mode?: string; matches?: RuianMatch[]; match?: { adresa?: string } } | null | undefined;
      const foundMatches = payload.matches ?? (data?.mode === "MULTI_MATCH" ? data.matches : undefined);
      if (Array.isArray(foundMatches) && foundMatches.length) {
        setMatches(foundMatches);
      } else {
        const resolvedAddress = payload.resolvedAddress ?? data?.match?.adresa;
        if (resolvedAddress) setAddressQuery(resolvedAddress);
        setResult(payload.data ?? null);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Nepodařilo se načíst nemovitost.");
    } finally {
      lookupInProgressRef.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [user]);

  const handleSearchAddress = () => runLookup(addressQuery);
  const pickSuggestion = (match: RuianMatch) => { void runLookup(match.adresa, match.kod); };

  useEffect(() => {
    if (!user || addressFromQuery.length < 2) return;
    const marker = `${user.uid}:${addressFromQuery.toLocaleLowerCase("cs-CZ")}`;
    if (autoLookupAddressRef.current === marker) return;
    autoLookupAddressRef.current = marker;
    void runLookup(addressFromQuery);
  }, [user, addressFromQuery, runLookup]);

  const focusAddress = () => {
    suggestDismissedRef.current = false;
    if (normalizeSpaces(addressQuery).length >= 2) {
      suppressSuggestRef.current = false;
      setSuggestRetry(value => value + 1);
    }
  };

  const obj = useMemo(() => (result && typeof result === "object" ? (result as any) : null), [result]);

  const vdpUrl = useMemo(() => {
    const stavebniObjektKod = safeNum(obj?.match?.stavebniobjekt);
    const adresniMistoKod = safeNum(obj?.match?.kod);

    if (stavebniObjektKod) {
      return `https://vdp.cuzk.gov.cz/vdp/ruian/stavebniobjekty/${stavebniObjektKod}`;
    }
    if (adresniMistoKod) {
      return `https://vdp.cuzk.gov.cz/vdp/ruian/adresnimista/${adresniMistoKod}`;
    }
    return null;
  }, [obj]);

  const gmapsUrl = useMemo(() => {
    const q = String(obj?.match?.adresa ?? addressQuery ?? "").trim();
    if (q.length < 2) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [obj, addressQuery]);

  const gmapsEmbedUrl = useMemo(() => {
    const q = String(obj?.match?.adresa ?? addressQuery ?? "").trim();
    if (q.length < 2) return null;
    // ✅ embed bez API klíče (náhled mapy přímo v UI)
    return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  }, [obj, addressQuery]);



  const stavba = obj?.stavba ?? null;
  const ruianStavebniObjekt = obj?.ruianStavebniObjekt ?? null;

  const jednotky = Array.isArray(obj?.jednotky) ? obj.jednotky.filter((unit: unknown) => unit && typeof unit === "object" && !Array.isArray(unit)) : [];
  const parcels = useMemo(() => extractParcels(obj), [obj]);
  const adresniMista = useMemo(() => extractAdresniMista(obj), [obj]);
  const dateInsights = useMemo(() => {
    const out: DateInsight[] = [];
    const now = new Date();

    const aktualnost = parseDateCandidate(obj?.aktualnostDatK);
    if (aktualnost) {
      const ageDays = wholeDaysBetween(aktualnost, now);
      out.push({
        key: "aktualnost",
        label: "Aktuálnost dat",
        date: aktualnost,
        hint:
          ageDays >= 0
            ? ageDays === 0
              ? "Data jsou aktualizována dnes."
              : `Data jsou stará ${ageDays} dní.`
            : `Datum je ${Math.abs(ageDays)} dní v budoucnu.`,
        tone: ageDays <= 2 ? "fresh" : ageDays <= 14 ? "normal" : "warning",
      });
    }

    const platiOd = parseDateCandidate(ruianStavebniObjekt?.platiod);
    if (platiOd) {
      const years = Math.max(0, Math.floor(wholeDaysBetween(platiOd, now) / 365.25));
      out.push({
        key: "platiOd",
        label: "Platí od",
        date: platiOd,
        hint: `Evidence je v tomto režimu ${years} let.`,
        tone: "normal",
      });
    }

    const dokonceni = parseDateCandidate(ruianStavebniObjekt?.dokonceni);
    if (dokonceni) {
      const years = Math.max(0, Math.floor(wholeDaysBetween(dokonceni, now) / 365.25));
      out.push({
        key: "dokonceni",
        label: "Datum dokončení",
        date: dokonceni,
        hint: `Stavba je přibližně ${years} let stará.`,
        tone: years >= 80 ? "warning" : "normal",
      });
    }

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [obj?.aktualnostDatK, ruianStavebniObjekt?.platiod, ruianStavebniObjekt?.dokonceni]);
  const summaryAddress = safeStr(obj?.match?.adresa ?? addressQuery);
  const summaryRuianCode = safeStr(obj?.match?.kod);
  const summaryBuildingCode = safeStr(
    ruianStavebniObjekt?.kod ?? obj?.match?.stavebniobjekt ?? stavba?.id
  );

  const marushkaUrl = useMemo(() => {
    // Maruška deep-link podle stavebního objektu (SO)
    const stavebniObjektKod =
      safeNum(obj?.match?.stavebniobjekt) ??
      safeNum(obj?.ruianStavebniObjekt?.kod) ??
      null;

    if (!stavebniObjektKod) return null;

    const params = new URLSearchParams({
      ThemeID: "1",
      InfoURL: "https://vdp.cuzk.gov.cz/vdp/ruian",
      MarQueryID: "SO",
      MarQParamCount: "1",
      MarQParam0: String(stavebniObjektKod),
      InfoTarget: "ID-3bbc",
    });

    return `https://vdp.cuzk.gov.cz/marushka/?${params.toString()}`;
  }, [obj]);

  const suggestionsVisible = !!user && suggestOpen && !loading && normalizeSpaces(addressQuery).length >= 2;
  const handleAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" || event.key === "Tab") {
      dismissSuggestions();
      return;
    }
    if (suggestions.length && !suggestLoading && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      suggestDismissedRef.current = false;
      setSuggestOpen(true);
      setActiveIdx(index => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionsVisible && !suggestLoading && activeIdx >= 0 && suggestions[activeIdx]) pickSuggestion(suggestions[activeIdx]);
      else if (canSearch && !loading) void handleSearchAddress();
    }
  };
  const suggestionList = suggestionsVisible ? (
    <div className={searchStyles.dropdown}>
      <div className={searchStyles.heading}><span>{suggestions.length && !suggestLoading ? `Nalezené adresy · ${suggestions.length}` : "Hledání adresy"}</span><span>RÚIAN</span></div>
      {suggestLoading ? <div className={searchStyles.message} role="status"><Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /><span>Hledám odpovídající adresy…</span></div>
        : suggestError ? <div className={searchStyles.message} role="status"><WifiOff size={17} aria-hidden="true" /><div><strong>Našeptávač teď neodpovídá</strong>Zkus vyhledat celou adresu nebo nabídku obnovit.<br /><button type="button" className={searchStyles.retry} onClick={() => { focusAddress(); addressInputRef.current?.focus(); }}><RefreshCw size={12} aria-hidden="true" /> Zkusit znovu</button></div></div>
        : suggestions.length === 0 ? <div className={searchStyles.message} role="status"><SearchX size={17} aria-hidden="true" /><div><strong>Pro tento dotaz nemáme návrhy</strong>Doplň obec nebo číslo domu. Celou adresu můžeš zkusit vyhledat tlačítkem Vyhledat.</div></div> : null}
      <CuzkAddressList matches={suggestLoading ? [] : suggestions} query={addressQuery} activeIndex={activeIdx} onActive={setActiveIdx} onPick={pickSuggestion} />
      {!suggestLoading && suggestions.length > 0 && <div className={searchStyles.footer}><span>Výběrem otevřeš nemovitost</span><span><kbd>↑ ↓</kbd> výběr · <kbd>Enter</kbd> otevřít</span></div>}
    </div>
  ) : null;

  const hasAnyResult = result !== null && !loading;

  return (
    <AppLayout active="tools">
      <div className="cuzk-shell mx-auto w-full max-w-6xl space-y-6 pb-10" data-search-active={searchActivated}>
        {searchActivated && (
          <header className={introStyles.resultHeader}>
            <span><MapPin size={22} strokeWidth={1.7} /></span>
            <div><h1>Katastr nemovitostí</h1><p>Údaje o stavbě, parcelách a jednotkách</p></div>
          </header>
        )}

        {!searchActivated ? (
          <CuzkIntro onExample={() => {
            changeAddress("Tyršova 133, Kadaň");
            addressInputRef.current?.focus();
          }}>
            <form className={introStyles.searchForm} role="search" aria-label="Vyhledání nemovitosti" onSubmit={event => { event.preventDefault(); if (canSearch && !loading) void handleSearchAddress(); }}>
              <label htmlFor="cuzk-address" className={introStyles.searchLabel}>Adresa nemovitosti</label>
              <div ref={suggestWrapRef} className={introStyles.searchBox}>
                <Search size={18} className={introStyles.searchIcon} aria-hidden="true" />
                <input
                  ref={addressInputRef}
                  id="cuzk-address"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsVisible}
                  aria-controls={suggestionsVisible ? "cuzk-suggestions" : undefined}
                  aria-activedescendant={suggestionsVisible && !suggestLoading && activeIdx >= 0 ? `cuzk-suggestion-${activeIdx}` : undefined}
                  autoComplete="off"
                  enterKeyHint="search"
                  spellCheck={false}
                  value={addressQuery}
                  onChange={event => changeAddress(event.target.value)}
                  onFocus={focusAddress}
                  onKeyDown={handleAddressKeyDown}
                  className={introStyles.addressInput}
                  placeholder="Ulice, číslo domu a obec"
                />
                <button type="submit" disabled={loading || !canSearch} className={introStyles.submit}>Vyhledat <ArrowRight size={16} aria-hidden="true" /></button>
                {suggestionList}
              </div>
            </form>
          </CuzkIntro>
        ) : !loading ? (
          <div className="cuzk-reveal" style={{ animationDelay: "90ms" }}>
            <section ref={searchPanelRef} className={resultStyles.searchPanel} aria-label="Vyhledat další nemovitost">
              <div className={resultStyles.searchRow}>
                <div className={resultStyles.searchInputWrap} ref={suggestWrapRef}>
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={event => changeAddress(event.target.value)}
                    onFocus={focusAddress}
                    onKeyDown={handleAddressKeyDown}
                    ref={addressInputRef}
                    id="cuzk-address"
                    role="combobox"
                    aria-label="Adresa nemovitosti"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsVisible}
                    aria-controls={suggestionsVisible ? "cuzk-suggestions" : undefined}
                    aria-activedescendant={suggestionsVisible && !suggestLoading && activeIdx >= 0 ? `cuzk-suggestion-${activeIdx}` : undefined}
                    autoComplete="off"
                    enterKeyHint="search"
                    spellCheck={false}
                    className={resultStyles.searchInput}
                    placeholder="Ulice, číslo domu a obec"
                  />
                  {suggestionList}
                </div>
                <button type="button" onClick={() => void handleSearchAddress()} disabled={!canSearch} className={resultStyles.searchButton}><Search size={15} /> Vyhledat</button>
                <button type="button" onClick={clearAll} className={resultStyles.resetButton}><X size={15} /> Vyčistit</button>
              </div>

              {error ? (
                <p className={resultStyles.searchError} role="alert">
                  {error}
                </p>
              ) : null}

              {matches.length > 0 && (
                <section className={searchStyles.matches} aria-label="Výběr nalezené adresy">
                  <div className={searchStyles.matchesHeader}><h2>Vyber nemovitost, kterou hledáš</h2><p>Našli jsme možné adresy. Výběrem načteš podrobnosti konkrétní nemovitosti.</p></div>
                  <CuzkAddressList matches={matches} query={addressQuery} onPick={pickSuggestion} suggestions={false} />
                </section>
              )}
            </section>

          </div>
        ) : null}

        <div ref={resultScrollTargetRef} className="scroll-mt-28" />

        {searchActivated && loading && (
          <div className="cuzk-reveal" style={{ animationDelay: "120ms" }}>
            <CuzkLoader query={addressQuery} />
          </div>
        )}

        {searchActivated && !loading && !error && matches.length === 0 && (
          hasAnyResult ? <CuzkResults
            key={`${summaryBuildingCode}-${summaryAddress}`}
            address={summaryAddress}
            addressCode={summaryRuianCode}
            buildingCode={summaryBuildingCode}
            building={stavba}
            technical={ruianStavebniObjekt}
            parcels={parcels}
            addresses={adresniMista}
            units={jednotky}
            dates={dateInsights}
            links={{ google: gmapsUrl, cadastral: marushkaUrl, registry: vdpUrl, embed: gmapsEmbedUrl }}
            rawData={result}
          /> : <p className={resultStyles.empty} role="status">Pro tuto adresu nejsou k dispozici podrobnosti. Zkus vybrat přesnou adresu z našeptávače.</p>
        )}

        <style jsx>{`
          @keyframes cuzk-reveal-up {
            from { opacity: 0; transform: translate3d(0, 12px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
          }
          .cuzk-shell { position: relative; isolation: isolate; overflow: visible; }
          .cuzk-reveal { animation: cuzk-reveal-up 520ms cubic-bezier(.22, 1, .36, 1) both; }
          :global(:root[data-motion="off"]) .cuzk-reveal { animation: none; }
          @media (prefers-reduced-motion: reduce) { .cuzk-reveal { animation: none; } }
        `}</style>
      </div>
    </AppLayout>
  );
}
