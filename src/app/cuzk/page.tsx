"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Home,
  Landmark,
  Map,
  MapPin,
  Ruler,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { auth } from "../firebase";

type RuianMatch = {
  kod: number;
  adresa: string;
  psc?: number;
  cislodomovni?: number;
  cisloorientacni?: number;
  cisloorientacnipismeno?: string;
  stavebniobjekt?: number | null; // ✅ doplněno
};

type ParcelRow = {
  id?: number | string;
  parcela?: string;
  vymeraM2?: number;
  druh?: string;
  katUzemi?: string;
  lv?: string | number;
  typParcely?: string;
};

type CuzkSearchApiSuccess = {
  ok: true;
  data?: unknown;
  resolvedAddress?: string;
  suggestions?: RuianMatch[];
};

type CuzkSearchApiError = {
  ok: false;
  error?: string;
};

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
  params: Record<string, string>
): Promise<CuzkSearchApiSuccess> {
  const searchParams = new URLSearchParams(params);
  const payload = await fetchAuthedJsonOrThrow<CuzkSearchApiSuccess | CuzkSearchApiError>(
    user,
    `/api/cuzk/search?${searchParams.toString()}`
  );

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

function formatDateTimeCs(v: any): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return safeStr(v);
  return d.toLocaleString("cs-CZ");
}

function formatEpochMsCs(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("cs-CZ");
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

function formatDateCs(value: Date): string {
  return value.toLocaleDateString("cs-CZ");
}

function relativeDateLabel(value: Date): string {
  const diffDays = wholeDaysBetween(value, new Date());
  if (diffDays === 0) return "dnes";
  if (diffDays > 0) return `před ${diffDays} dny`;
  return `za ${Math.abs(diffDays)} dní`;
}

type DateInsightTone = "fresh" | "normal" | "warning";
type DateInsight = {
  key: string;
  label: string;
  date: Date;
  hint: string;
  tone: DateInsightTone;
};

function dateInsightToneClass(tone: DateInsightTone): string {
  switch (tone) {
    case "fresh":
      return "border-emerald-200 bg-emerald-50/70";
    case "warning":
      return "border-amber-200 bg-amber-50/70";
    default:
      return "border-slate-200 bg-slate-50/50";
  }
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

function Field({
  label,
  value,
  right,
}: {
  label: string;
  value: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-1 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className="text-sm font-semibold text-slate-900">{value}</div>
        </div>
        {right ? <div className="text-[11px] font-medium text-slate-500">{right}</div> : null}
      </div>
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.05)]">
      <Icon className="h-3.5 w-3.5 opacity-90" />
      <span className="font-semibold text-slate-500">{label}:</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function CuzkPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [addressQuery, setAddressQuery] = useState("");
  const [addressFromQuery, setAddressFromQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<RuianMatch[]>([]);
  const [selectedKod, setSelectedKod] = useState<number | null>(null);
  const [result, setResult] = useState<unknown>(null);

  // našeptávač
  const [suggestions, setSuggestions] = useState<RuianMatch[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggestWrapRef = useRef<HTMLDivElement | null>(null);
  const suggestReqSeq = useRef(0);
  const suppressSuggestRef = useRef(false);
  const autoLookupAddressRef = useRef<string | null>(null);

  const [showJson, setShowJson] = useState(false);
  const [gmapsEmbedError, setGmapsEmbedError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("address") ?? params.get("q") ?? "";
    const normalized = String(raw ?? "").trim();
    setAddressFromQuery(normalized);
  }, []);

  useEffect(() => {
    if (!addressFromQuery) return;
    setAddressQuery((prev) => (prev === addressFromQuery ? prev : addressFromQuery));
  }, [addressFromQuery]);

  const canSearch = useMemo(() => !!user && addressQuery.trim().length >= 2, [user, addressQuery]);

  const clearAll = () => {
    setError(null);
    setResult(null);
    setMatches([]);
    setSelectedKod(null);

    setSuggestions([]);
    setSuggestOpen(false);
    setSuggestLoading(false);
    setActiveIdx(-1);

    setShowJson(false);
    setGmapsEmbedError(null);
  };

  useEffect(() => {
    if (!user) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveIdx(-1);
      return;
    }

    const typed = normalizeSpaces(addressQuery);
    if (typed.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveIdx(-1);
      return;
    }

    if (suppressSuggestRef.current) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveIdx(-1);
      suppressSuggestRef.current = false;
      return;
    }

    const mySeq = ++suggestReqSeq.current;

    const t = setTimeout(async () => {
      try {
        setSuggestLoading(true);
        setSuggestOpen(true);
        const payload = await callCuzkSearchApi(user, {
          action: "suggest",
          q: typed,
        });
        const list = Array.isArray(payload.suggestions) ? payload.suggestions : [];

        if (mySeq !== suggestReqSeq.current) return;
        setSuggestions(list);
        setActiveIdx(-1);
        setSuggestOpen(list.length > 0);
      } catch {
        if (mySeq !== suggestReqSeq.current) return;
        setSuggestions([]);
        setSuggestOpen(false);
        setActiveIdx(-1);
      } finally {
        if (mySeq !== suggestReqSeq.current) return;
        setSuggestLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [addressQuery, user]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = suggestWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setSuggestOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pickSuggestion = (m: RuianMatch) => {
    suppressSuggestRef.current = true;
    setAddressQuery(m.adresa);
    const k = Number(m.kod);
    setSelectedKod(Number.isFinite(k) && k > 0 ? k : null);

    setSuggestions([]);
    setSuggestOpen(false);
    setActiveIdx(-1);
    setMatches([]);
  };

  const handleSearchAddress = useCallback(async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }
    const q = addressQuery.trim();
    if (q.length < 2) {
      setError("Zadej prosím adresu (aspoň pár znaků). Např. „Dlouhá 12, Praha“.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setMatches([]);
    setShowJson(false);
    setGmapsEmbedError(null);

    try {
      const payload =
        selectedKod && Number.isFinite(selectedKod) && selectedKod > 0
          ? await callCuzkSearchApi(user, {
              action: "detail",
              kod: String(selectedKod),
              includeUnits: "1",
            })
          : await callCuzkSearchApi(user, {
              action: "search",
              q,
              includeUnits: "1",
            });
      const data = payload.data ?? null;
      const resolvedAddress = payload.resolvedAddress;
      if (resolvedAddress) {
        suppressSuggestRef.current = true;
        setAddressQuery(resolvedAddress);
      }
      setSelectedKod(null);
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message ?? "Nepodařilo se načíst data."));
    } finally {
      setLoading(false);
    }
  }, [addressQuery, selectedKod, user]);

  useEffect(() => {
    if (!user) return;
    const query = addressFromQuery.trim();
    if (query.length < 2) return;
    const marker = query.toLowerCase();
    if (autoLookupAddressRef.current === marker) return;
    autoLookupAddressRef.current = marker;
    setSelectedKod(null);
    setMatches([]);
    setLoading(true);
    setError(null);
    setResult(null);
    setShowJson(false);
    setGmapsEmbedError(null);

    void (async () => {
      try {
        const payload = await callCuzkSearchApi(user, {
          action: "search",
          q: query,
          includeUnits: "1",
        });
        const data = payload.data ?? null;
        const resolvedAddress = payload.resolvedAddress;
        if (resolvedAddress) {
          suppressSuggestRef.current = true;
          setAddressQuery(resolvedAddress);
        }
        setResult(data);
      } catch (e: any) {
        setError(String(e?.message ?? "Nepodařilo se načíst data."));
      } finally {
        setLoading(false);
      }
    })();
  }, [user, addressFromQuery]);

  const handleLoadSelected = async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }
    if (!selectedKod || !Number.isFinite(selectedKod) || selectedKod <= 0) {
      setError("Vyber prosím konkrétní adresu ze seznamu.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setShowJson(false);
    setGmapsEmbedError(null);

    try {
      const payload = await callCuzkSearchApi(user, {
        action: "detail",
        kod: String(selectedKod),
        includeUnits: "1",
      });
      const data = payload.data ?? null;
      setMatches([]);
      setSelectedKod(null);
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message ?? "Nepodařilo se načíst detail."));
    } finally {
      setLoading(false);
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

  const jednotky = Array.isArray(obj?.jednotky) ? obj.jednotky : [];
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
  const summaryOwner = safeStr(obj?.forUser ?? obj?.user ?? obj?.email);

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

  const hasAnyResult = result !== null && !loading;

  return (
    <AppLayout active="tools">
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
        <header className="pt-1 pb-2 sm:pb-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <h1 className="flex items-center gap-3 text-5xl sm:text-6xl font-semibold leading-[0.95] tracking-tight text-slate-900">
                <Building2 className="h-9 w-9 text-slate-700 sm:h-11 sm:w-11" />
                <span>Katastr nemovitostí</span>
              </h1>
            </div>
            <Image
              src="/icons/icon_domex.png"
              alt="Domex"
              width={800}
              height={520}
              className="h-44 w-auto self-start lg:h-56 lg:self-end"
              priority
            />
          </div>
        </header>

        {/* ✅ vždy NAD výsledkem (kvůli dropdownu) */}
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr] items-start">
          {/* Levý box: dotaz */}
          <section className="relative z-30 isolate overflow-visible rounded-3xl border border-slate-200 bg-white px-6 py-6 space-y-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-900 via-sky-400 to-emerald-400" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Search className="h-4 w-4 text-slate-600" />
                    <span>Vyhledávání v katastru ČÚZK</span>
                  </h2>
                  <div className="mt-1 text-xs text-slate-500">
                    Našeptávání adres z RÚIAN, detail se načte včetně jednotek.
                  </div>
                </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                  Jednotky: automaticky
                </span>
                {!user && (
                  <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-500/50 rounded-full px-3 py-1">
                    Přihlaš se, aby šlo volat ČÚZK.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Adresa + našeptávač (full width) */}
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/40 p-3 text-sm text-slate-800" ref={suggestWrapRef}>
                <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Adresa</span>
                </span>

                <div className="relative">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => {
                      suppressSuggestRef.current = false;
                      setAddressQuery(e.target.value);
                      setSelectedKod(null);
                    }}
                    onFocus={() => {
                      if (suggestions.length) setSuggestOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!suggestOpen || !suggestions.length) return;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveIdx((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        if (activeIdx >= 0 && activeIdx < suggestions.length) {
                          e.preventDefault();
                          pickSuggestion(suggestions[activeIdx]);
                        }
                      } else if (e.key === "Escape") {
                        setSuggestOpen(false);
                        setActiveIdx(-1);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
                    placeholder='např. "Tyršova 133, Kadaň"'
                  />

                  {user && suggestOpen && (suggestLoading || suggestions.length > 0) && (
                    <div className="absolute z-[999] mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
                      {suggestLoading && <div className="px-3 py-2 text-xs text-slate-600">Našeptávám…</div>}
                      {!suggestLoading && suggestions.length > 0 && (
                        <div className="max-h-72 overflow-auto">
                          {suggestions.map((m, idx) => {
                            const active = idx === activeIdx;
                            return (
                              <button
                                key={`${m.kod}-${m.adresa}-${idx}`}
                                type="button"
                                onClick={() => pickSuggestion(m)}
                                onMouseEnter={() => setActiveIdx(idx)}
                                className={[
                                  "w-full text-left px-3 py-2 transition",
                                  "border-b border-slate-200 last:border-b-0",
                                  active ? "bg-slate-100" : "bg-transparent hover:bg-slate-100",
                                ].join(" ")}
                              >
                                <div className="text-sm text-slate-900">{m.adresa}</div>
                                <div className="text-[11px] text-slate-500">
                                  RÚIAN: <span className="text-slate-800">{m.kod ? m.kod : "—"}</span>
                                  {m.psc ? (
                                    <>
                                      {" "}
                                      • PSČ: <span className="text-slate-800">{m.psc}</span>
                                    </>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* Akce */}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleSearchAddress}
                  disabled={loading || !canSearch}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {loading ? "Hledám…" : "Vyhledat"}
                </button>

                <button
                  type="button"
                  onClick={clearAll}
                  disabled={loading || (result === null && matches.length === 0 && !error)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Vyčistit
                </button>
              </div>

              <div className="min-h-[18px]">
                {error ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-500/60 rounded-xl px-3 py-2">
                    {error}
                  </p>
                ) : result !== null ? (
                  <span className="text-[11px] text-emerald-700">Výsledek načten {new Date().toLocaleTimeString("cs-CZ")}.</span>
                ) : null}
              </div>
            </div>

            {matches.length > 0 && (
              <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-900 font-semibold">Nalezeno více adres — vyber správnou:</p>
                  <span className="text-[11px] text-slate-500">{matches.length} možností</span>
                </div>

                <div className="space-y-2">
                  {matches.map((m) => (
                    <label
                      key={m.kod}
                      className="flex items-start gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="ruian_match"
                        checked={selectedKod === m.kod}
                        onChange={() => setSelectedKod(m.kod)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="space-y-0.5">
                        <div className="text-sm text-slate-900">{m.adresa}</div>
                        <div className="text-[11px] text-slate-500">
                          RÚIAN kód: <span className="text-slate-800">{m.kod}</span>
                          {m.psc ? (
                            <>
                              {" "}
                              • PSČ: <span className="text-slate-800">{m.psc}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleLoadSelected}
                    disabled={loading || !user}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-600 bg-emerald-100 px-6 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 hover:border-emerald-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Načítám…" : "Načíst vybranou adresu"}
                  </button>
                </div>
              </div>
            )}

          </section>

          {/* Pravý panel: rychlé odkazy */}
          <aside className="rounded-3xl border border-slate-200 bg-white px-5 py-5 space-y-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-600">
                  <Map className="h-3.5 w-3.5" />
                  <span>Rychlé odkazy</span>
                </div>
              </div>
              {vdpUrl && (
                <span className="text-[11px] rounded-full border border-emerald-600 bg-emerald-100 px-2.5 py-0.5 text-emerald-900">
                  Aktivní
                </span>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (!gmapsUrl) return;
                  window.open(gmapsUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!gmapsUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-900 disabled:bg-slate-900 disabled:text-white disabled:opacity-100"
              >
                <MapPin className="h-4 w-4" />
                Google Mapy
                <ExternalLink className="h-3.5 w-3.5 opacity-90" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!marushkaUrl) return;
                  window.open(marushkaUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!marushkaUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-900 disabled:bg-slate-900 disabled:text-white disabled:opacity-100"
              >
                <Map className="h-4 w-4" />
                Katastrální Mapy
                <ExternalLink className="h-3.5 w-3.5 opacity-90" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!vdpUrl) return;
                  window.open(vdpUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!vdpUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-900 disabled:bg-slate-900 disabled:text-white disabled:opacity-100"
              >
                <Building2 className="h-4 w-4" />
                Katastr
                <ExternalLink className="h-3.5 w-3.5 opacity-90" />
              </button>
            </div>

          </aside>
        </div>

        {/* Výsledek */}
        <section className="relative z-0 overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] space-y-6">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-900 via-sky-400 to-emerald-400" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                <Building2 className="h-4 w-4 text-slate-700" />
              </span>
              <span>Výsledek</span>
            </h2>
            <div className="flex items-center gap-2">
              {result !== null && (
                <button
                  type="button"
                  onClick={() => setShowJson((s) => !s)}
                  className="text-[11px] rounded-full border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                >
                  {showJson ? "Skrýt JSON" : "Zobrazit JSON"}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">Načítám data…</div>
          ) : !hasAnyResult ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Zatím nic nezobrazuji. Zadej adresu a klikni na „Vyhledat adresu“.
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
                <span className="absolute inset-x-0 top-0 h-1 bg-slate-900" />
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                      Přehled nemovitosti
                    </div>
                    <div className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">{summaryAddress}</div>
                    <div className="text-[12px] text-slate-600">
                      Detail z RÚIAN s technickými údaji a vazbami na parcelu.
                    </div>
                  </div>

                  <div className="hidden shrink-0 lg:block">
                    <Image
                      src="/icons/icon_domex.png"
                      alt="Ilustrace nemovitosti"
                      width={140}
                      height={96}
                      className="h-20 w-auto opacity-95"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SummaryPill icon={MapPin} label="RÚIAN adresa" value={summaryRuianCode} />
                  <SummaryPill icon={Building2} label="Stavba" value={summaryBuildingCode} />
                  <SummaryPill icon={Ruler} label="Parcely" value={`${parcels.length}`} />
                  <SummaryPill icon={UserRound} label="Uživatel" value={summaryOwner} />
                </div>
              </div>

              {dateInsights.length > 0 ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarClock className="h-4 w-4 text-sky-700" />
                      Časová osa dat
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      RÚIAN / ČÚZK
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {dateInsights.map((item) => (
                      <div
                        key={item.key}
                        className={`rounded-xl border px-3 py-2.5 ${dateInsightToneClass(item.tone)}`}
                      >
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</div>
                        <div className="mt-1 text-sm font-bold text-slate-900">{formatDateCs(item.date)}</div>
                        <div className="mt-1 text-[12px] text-slate-700">{item.hint}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{relativeDateLabel(item.date)}</div>
                      </div>
                    ))}
                  </div>

                  {dateInsights.length > 1 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                        {dateInsights.map((item, idx) => (
                          <span key={`line-${item.key}`} className="inline-flex items-center gap-2">
                            <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" />
                            <span className="font-medium text-slate-700">{item.label}:</span>
                            <span>{formatDateCs(item.date)}</span>
                            {idx < dateInsights.length - 1 ? (
                              <span className="text-slate-400">→</span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Sparkles className="h-4 w-4 text-slate-700" />
                    Metadata odpovědi
                  </div>
                </div>
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-3 sm:grid-cols-2">
                  <Field label="Aktuálnost dat k" value={formatDateTimeCs(obj?.aktualnostDatK)} />
                  <Field label="Pro uživatele" value={summaryOwner} />
                </div>
              </div>

              {showJson ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-800 space-y-1">
                  <div>
                    <span className="text-slate-500">gmapsEmbedUrl:</span> {gmapsEmbedUrl ? gmapsEmbedUrl : "—"}
                  </div>
                  <div>
                    <span className="text-slate-500">obj.links.mapPreview:</span> {obj?.links?.mapPreview ? String(obj.links.mapPreview) : "—"}
                  </div>
                  <div>
                    <span className="text-slate-500">marushkaUrl:</span> {marushkaUrl ? marushkaUrl : "—"}
                  </div>
                </div>
              ) : null}

              {gmapsEmbedUrl ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Map className="h-4 w-4 text-sky-700" />
                      Náhled mapy
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Google Maps
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <iframe
                      key={gmapsEmbedUrl}
                      title="Náhled mapy"
                      src={gmapsEmbedUrl}
                      className="w-full h-[280px]"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                      onLoad={() => setGmapsEmbedError(null)}
                      onError={() =>
                        setGmapsEmbedError(
                          "Google Maps náhled se nepodařilo načíst (blokováno prohlížečem / CSP / rozšířením)."
                        )
                      }
                    />
                  </div>

                  {gmapsEmbedError ? (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                      {gmapsEmbedError}
                    </div>
                  ) : null}

                  <div className="text-[11px] text-slate-500">
                    Tip: Klikni na tlačítko <span className="text-slate-800">Google Mapy</span> vpravo pro otevření v novém okně.
                  </div>
                </div>
              ) : null}




              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Home className="h-4 w-4 text-slate-700" />
                    Stavba
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    ID: {safeStr(stavba?.id)}
                  </div>
                </div>

                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <Field label="Typ stavby" value={safeStr(stavba?.typStavby?.nazev ?? stavba?.typStavby)} />
                  <Field
                    label="Způsob využití"
                    value={safeStr(
                      stavba?.zpusobVyuziti?.nazev ??
                        stavba?.zpusobVyuziti ??
                        stavba?.druhStavby?.nazev ??
                        stavba?.druhStavby
                    )}
                  />
                  <Field label="Obec" value={safeStr(stavba?.obec?.nazev ?? stavba?.obec)} />
                  <Field label="Část obce" value={safeStr(stavba?.castObce?.nazev ?? stavba?.castObce)} />
                  <Field
                    label="Číslo domovní"
                    value={safeStr(
                      Array.isArray(stavba?.cislaDomovni)
                        ? stavba.cislaDomovni.join(", ")
                        : stavba?.cisloDomovni ?? stavba?.cislodomovni
                    )}
                  />
                  <Field label="Číslo orientační" value={safeStr(stavba?.cisloOrientacni ?? stavba?.cisloorientacni)} />
                  <Field
                    label="Dočasná stavba"
                    value={typeof stavba?.docasna === "boolean" ? (stavba.docasna ? "Ano" : "Ne") : safeStr(stavba?.docasna)}
                  />
                  <Field
                    label="Vazba"
                    value={safeStr(stavba?.typVazby ?? stavba?.typyVazby ?? stavba?.vazba)}
                  />
                </div>
              </div>

              {ruianStavebniObjekt ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Landmark className="h-4 w-4 text-emerald-700" />
                      Stavební objekt (RÚIAN) – technicko‑ekonomické atributy
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Kód: {safeStr(ruianStavebniObjekt?.kod)}
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <Field label="ISKN budova ID" value={safeStr(ruianStavebniObjekt?.isknbudovaid)} />
                    <Field label="Identifikační parcela (ID)" value={safeStr(ruianStavebniObjekt?.identifikacniparcela)} />

                    <Field label="Datum dokončení" value={formatEpochMsCs(ruianStavebniObjekt?.dokonceni)} />
                    <Field label="Platí od" value={formatEpochMsCs(ruianStavebniObjekt?.platiod)} />

                    <Field
                      label="Zastavěná plocha"
                      value={
                        safeNum(ruianStavebniObjekt?.zastavenaplocha) != null
                          ? `${safeNum(ruianStavebniObjekt?.zastavenaplocha)} m²`
                          : "—"
                      }
                    />
                    <Field
                      label="Obestavěný prostor"
                      value={
                        safeNum(ruianStavebniObjekt?.obestavenyprostor) != null
                          ? `${safeNum(ruianStavebniObjekt?.obestavenyprostor)} m³`
                          : "—"
                      }
                    />

                    <Field label="Počet bytů" value={safeStr(ruianStavebniObjekt?.pocetbytu)} />
                    <Field label="Počet podlaží" value={safeStr(ruianStavebniObjekt?.pocetpodlazi)} />

                    <Field
                      label="Podlahová plocha"
                      value={
                        safeNum(ruianStavebniObjekt?.podlahovaplocha) != null
                          ? `${safeNum(ruianStavebniObjekt?.podlahovaplocha)} m²`
                          : "—"
                      }
                    />
                    <Field label="Druh konstrukce (kód)" value={safeStr(ruianStavebniObjekt?.druhkonstrukcekod)} />

                    <Field
                      label="Plocha geometrie (ST_Area)"
                      value={
                        safeNum((ruianStavebniObjekt as any)?.["st_area(shape)"]) != null
                          ? `${safeNum((ruianStavebniObjekt as any)?.["st_area(shape)"])} m²`
                          : "—"
                      }
                    />
                    <Field
                      label="Délka geometrie (ST_Length)"
                      value={
                        safeNum((ruianStavebniObjekt as any)?.["st_length(shape)"]) != null
                          ? `${safeNum((ruianStavebniObjekt as any)?.["st_length(shape)"])} m`
                          : "—"
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Ruler className="h-4 w-4 text-amber-700" />
                    Parcely / pozemky
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {parcels.length ? `${parcels.length} položek` : "—"}
                  </div>
                </div>

                {parcels.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1">
                    {parcels.map((p, idx) => (
                      <div
                        key={`${p.id ?? p.parcela ?? "p"}-${idx}`}
                        className="border-b border-slate-200 px-1 py-3 last:border-b-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-slate-900">
                            <span className="font-semibold">Parcela:</span> {p.parcela ? p.parcela : "—"}
                            {p.typParcely ? <span className="text-slate-500"> ({p.typParcely})</span> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {p.katUzemi ? (
                              <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">
                                KÚ: {p.katUzemi}
                              </span>
                            ) : null}
                            {p.lv != null ? (
                              <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">
                                LV: {p.lv}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-1 text-[12px] text-slate-600">
                          {p.druh ? (
                            <>
                              Druh: <span className="text-slate-800">{p.druh}</span>
                            </>
                          ) : (
                            <>Druh: —</>
                          )}
                          {"  "}•{" "}
                          {p.vymeraM2 != null ? (
                            <>
                              Výměra: <span className="text-slate-800">{p.vymeraM2} m²</span>
                            </>
                          ) : (
                            <>Výměra: —</>
                          )}
                        </div>

                        {p.vymeraM2 == null ? (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Pozn.: stavba vrací jen základ parcely (ParcelaDef). Pro výměru je potřeba dotáhnout detail parcely/pozemku v backendu.
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                    Parcely/výměra se v téhle odpovědi nenašly.
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-sky-700" />
                    Adresní místa
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {adresniMista.length ? `${adresniMista.length} položek` : "—"}
                  </div>
                </div>

                {adresniMista.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1">
                    {adresniMista.map((a, idx) => (
                      <div
                        key={`${a.adresa}-${a.ruian ?? "x"}-${idx}`}
                        className="border-b border-slate-200 px-1 py-3 last:border-b-0"
                      >
                        <div className="text-sm text-slate-900">{a.adresa}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">
                            RÚIAN: {a.ruian != null ? a.ruian : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                    Žádné adresní místo v odpovědi.
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Building2 className="h-4 w-4 text-indigo-700" />
                    Jednotky
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {jednotky.length ? `${jednotky.length} ks` : "0 ks"}
                  </div>
                </div>

                {jednotky.length ? (
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    {jednotky.slice(0, 8).map((j: any, idx: number) => (
                      <div
                        key={`${j?.id ?? "j"}-${idx}`}
                        className="rounded-lg bg-white px-3 py-2.5"
                      >
                        <div className="text-sm text-slate-900">Jednotka ID: {safeStr(j?.id)}</div>
                        <div className="mt-1 text-[12px] text-slate-600">
                          {j?.typJednotky?.nazev ? `Typ: ${j.typJednotky.nazev}` : "Typ: —"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                    Žádné jednotky nejsou k dispozici.
                  </div>
                )}
              </div>

              {showJson && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-900">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
