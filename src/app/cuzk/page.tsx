"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import { auth } from "../firebase";
import {
  cuzkLookupByAdresniMisto,
  cuzkLookupByAddress,
  cuzkSuggestAddress,
} from "@/lib/cuzk";

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

function normalizeSuggestPayload(data: any): RuianMatch[] {
  const raw =
    (Array.isArray(data) && data) ||
    (Array.isArray(data?.suggestions) && data.suggestions) ||
    (Array.isArray(data?.matches) && data.matches) ||
    (Array.isArray(data?.data) && data.data) ||
    [];

  return raw
    .map((x: any) => {
      if (typeof x === "string") return { kod: 0, adresa: x } as RuianMatch;

      if (x && typeof x === "object") {
        const adresa = String(x.adresa ?? x.text ?? x.label ?? "").trim();
        const kod = Number(x.kod ?? x.id ?? x.ruianKod ?? 0);

        return {
          kod: Number.isFinite(kod) ? kod : 0,
          adresa,
          psc: x.psc != null ? Number(x.psc) : undefined,
          cislodomovni: x.cislodomovni ?? x.cisloDomovni ?? undefined,
          cisloorientacni: x.cisloorientacni ?? x.cisloOrientacni ?? undefined,
          cisloorientacnipismeno:
            x.cisloorientacnipismeno ?? x.cisloOrientacniPismeno ?? "",
          // ✅ doplněno mapování stavebního objektu
          stavebniobjekt: safeNum(x.stavebniobjekt ?? x.stavebniObjekt) ?? null,
        } as RuianMatch;
      }
      return null;
    })
    .filter((m: any) => m && m.adresa && String(m.adresa).trim().length > 0)
    .slice(0, 12);
}

function normalizeSuggestQueryVariants(input: string): string[] {
  const base = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];

  const capFirst = (s: string) => {
    const t = String(s ?? "").trim();
    if (!t) return "";
    return t[0].toLocaleUpperCase("cs-CZ") + t.slice(1);
  };

  // Variant 1: exactly what user typed (some backends accept this)
  const v1 = base;
  // Variant 2: first character uppercased
  const v2 = capFirst(base);
  // Variant 3: uppercase first char of each comma-separated segment ("ulice... , obec")
  const v3 = base
    .split(",")
    .map((seg) => capFirst(seg))
    .filter(Boolean)
    .join(", ");

  // Unique, non-empty, min length 2
  return Array.from(new Set([v1, v2, v3].filter((s) => s && s.length >= 2)));
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
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
          <div className="text-sm text-slate-100">{value}</div>
        </div>
        {right ? <div className="text-[11px] text-slate-400">{right}</div> : null}
      </div>
    </div>
  );
}

export default function CuzkPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [addressQuery, setAddressQuery] = useState("");
  const [includeUnits, setIncludeUnits] = useState(true);
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

  const [showJson, setShowJson] = useState(false);
  const [gmapsEmbedError, setGmapsEmbedError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

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

    const variants = normalizeSuggestQueryVariants(addressQuery);
    const q = variants[0] ?? "";
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveIdx(-1);
      return;
    }

    const mySeq = ++suggestReqSeq.current;

    const t = setTimeout(async () => {
      try {
        setSuggestLoading(true);
        setSuggestOpen(true);

        let list: RuianMatch[] = [];

        for (const v of variants.length ? variants : [q]) {
          try {
            const data: any = await cuzkSuggestAddress(v);
            if (mySeq !== suggestReqSeq.current) return;

            const tmp = normalizeSuggestPayload(data);
            if (tmp.length) {
              list = tmp;
              break;
            }
          } catch {
            // try next variant
          }
        }

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
    setAddressQuery(m.adresa);
    const k = Number(m.kod);
    setSelectedKod(Number.isFinite(k) && k > 0 ? k : null);

    setSuggestions([]);
    setSuggestOpen(false);
    setActiveIdx(-1);
    setMatches([]);
  };

  const handleSearchAddress = async () => {
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
      if (selectedKod && Number.isFinite(selectedKod) && selectedKod > 0) {
        const data = await cuzkLookupByAdresniMisto(selectedKod, includeUnits);
        setSelectedKod(null);
        setResult(data);
        return;
      }

      const data: any = await cuzkLookupByAddress(q, includeUnits);

      if (data?.ok && data?.mode === "MULTI_MATCH" && Array.isArray(data?.matches)) {
        const list = data.matches as RuianMatch[];
        setMatches(list);
        setSelectedKod(list[0]?.kod ?? null);
        setResult(data);
        return;
      }

      setResult(data);
    } catch (e: any) {
      setError(String(e?.message ?? "Nepodařilo se načíst data."));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSelected = async () => {
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
      const data = await cuzkLookupByAdresniMisto(selectedKod, includeUnits);
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
      <div className="w-full max-w-5xl space-y-6">
        <header className="pt-6 pb-6 sm:pb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <SplitTitle text="Katastr nemovitostí" className="translate-y-28 sm:translate-y-32" />
              <Image
                src="/icons/icon_domex.png"
                alt="Domex"
                width={800}
                height={520}
                className="h-64 w-auto translate-x-8 sm:translate-x-14 translate-y-16 sm:translate-y-24"
                priority
              />
            </div>
            <Link
              href="/pomucky"
              className="inline-flex items-center text-xs text-slate-300 hover:text-white transition"
            >
              ← Zpět na pomůcky
            </Link>
          </div>
        </header>

        {/* ✅ vždy NAD výsledkem (kvůli dropdownu) */}
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr] items-start">
          {/* Levý box: dotaz */}
          <section className="relative z-30 isolate overflow-visible rounded-3xl border border-white/15 bg-gradient-to-br from-white/8 via-slate-900/40 to-slate-950/60 backdrop-blur-2xl px-6 py-6 shadow-[0_18px_70px_rgba(0,0,0,0.85)] space-y-5">
            <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.25),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(94,234,212,0.25),transparent_32%)]" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Vyhledávání v katastru ČÚZK</h2>
              </div>
              {!user && (
                <span className="text-[11px] text-amber-200 bg-amber-900/40 border border-amber-500/50 rounded-full px-3 py-1">
                  Přihlaš se, aby šlo volat ČÚZK.
                </span>
              )}
            </div>

            <div className="space-y-4">
              {/* Adresa + našeptávač (full width) */}
              <div className="space-y-2 text-sm text-slate-200" ref={suggestWrapRef}>
                <span className="block text-xs uppercase tracking-wide text-slate-300">Adresa</span>

                <div className="relative">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => {
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
                    className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder='např. "Tyršova 133, Kadaň"'
                  />

                  {user && suggestOpen && (suggestLoading || suggestions.length > 0) && (
                    <div className="absolute z-[999] mt-2 w-full overflow-hidden rounded-2xl border border-white/12 bg-slate-950/80 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.9)]">
                      {suggestLoading && <div className="px-3 py-2 text-xs text-slate-300">Našeptávám…</div>}
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
                                  "border-b border-white/5 last:border-b-0",
                                  active ? "bg-white/10" : "bg-transparent hover:bg-white/5",
                                ].join(" ")}
                              >
                                <div className="text-sm text-slate-100">{m.adresa}</div>
                                <div className="text-[11px] text-slate-400">
                                  RÚIAN: <span className="text-slate-200">{m.kod ? m.kod : "—"}</span>
                                  {m.psc ? (
                                    <>
                                      {" "}
                                      • PSČ: <span className="text-slate-200">{m.psc}</span>
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

              {/* Akce: 3 tlačítka vedle sebe */}
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setIncludeUnits((v) => !v)}
                  aria-pressed={includeUnits}
                  className={[
                    "w-full inline-flex items-center justify-between gap-3 rounded-full px-4 py-2 text-sm font-semibold transition shadow-[0_8px_28px_rgba(0,0,0,0.35)]",
                    includeUnits
                      ? "border border-emerald-300/70 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30 hover:border-emerald-100"
                      : "border border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/30",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={[
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                        includeUnits
                          ? "bg-emerald-500 text-slate-950 border border-emerald-200"
                          : "bg-slate-900/60 text-slate-300 border border-white/20",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {includeUnits ? "✓" : ""}
                    </span>
                    <span>Jednotky</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSearchAddress}
                  disabled={loading || !canSearch}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-sky-300/70 bg-sky-500/25 px-4 py-2 text-sm font-semibold text-sky-50 shadow-[0_0_22px_rgba(56,189,248,0.55)] hover:bg-sky-500/35 hover:border-sky-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Hledám…" : "Vyhledat"}
                </button>

                <button
                  type="button"
                  onClick={clearAll}
                  disabled={loading || (result === null && matches.length === 0 && !error)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-white/15 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Vyčistit
                </button>
              </div>

              <div className="min-h-[18px]">
                {error ? (
                  <p className="text-[11px] text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-xl px-3 py-2">
                    {error}
                  </p>
                ) : result !== null ? (
                  <span className="text-[11px] text-emerald-200">Výsledek načten {new Date().toLocaleTimeString("cs-CZ")}.</span>
                ) : null}
              </div>
            </div>

            {matches.length > 0 && (
              <div className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-white font-semibold">Nalezeno více adres — vyber správnou:</p>
                  <span className="text-[11px] text-slate-400">{matches.length} možností</span>
                </div>

                <div className="space-y-2">
                  {matches.map((m) => (
                    <label
                      key={m.kod}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 hover:bg-slate-900/55 transition cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="ruian_match"
                        checked={selectedKod === m.kod}
                        onChange={() => setSelectedKod(m.kod)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="space-y-0.5">
                        <div className="text-sm text-slate-100">{m.adresa}</div>
                        <div className="text-[11px] text-slate-400">
                          RÚIAN kód: <span className="text-slate-200">{m.kod}</span>
                          {m.psc ? (
                            <>
                              {" "}
                              • PSČ: <span className="text-slate-200">{m.psc}</span>
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
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-500/20 px-6 py-2 text-sm font-semibold text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.35)] hover:bg-emerald-500/30 hover:border-emerald-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Načítám…" : "Načíst vybranou adresu"}
                  </button>
                </div>
              </div>
            )}

          </section>

          {/* Pravý panel: rychlé odkazy */}
          <aside className="rounded-3xl border border-white/15 bg-gradient-to-br from-white/8 via-slate-900/45 to-slate-950/70 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_70px_rgba(0,0,0,0.65)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-300">Rychlé odkazy</div>
                <p className="text-[11px] text-slate-400">Otevři detail v dalších mapových podkladech.</p>
              </div>
              {vdpUrl && (
                <span className="text-[11px] rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2.5 py-0.5 text-emerald-100">
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-50 hover:bg-white/15 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Google Mapy
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!marushkaUrl) return;
                  window.open(marushkaUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!marushkaUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-50 hover:bg-white/15 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Katastrální Mapy
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!vdpUrl) return;
                  window.open(vdpUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!vdpUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-50 hover:bg-white/15 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Katastr
              </button>
            </div>

          </aside>
        </div>

        {/* Výsledek */}
        <section className="relative z-0 rounded-3xl border border-white/15 bg-slate-950/70 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.9)] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Výsledek</h2>
            <div className="flex items-center gap-2">
              {result !== null && (
                <button
                  type="button"
                  onClick={() => setShowJson((s) => !s)}
                  className="text-[11px] rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/10 transition"
                >
                  {showJson ? "Skrýt JSON" : "Zobrazit JSON"}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">Načítám data…</div>
          ) : !hasAnyResult ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Zatím nic nezobrazuji. Zadej adresu a klikni na „Vyhledat adresu“.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Aktuálnost dat k" value={formatDateTimeCs(obj?.aktualnostDatK)} />
                <Field label="Pro uživatele" value={safeStr(obj?.forUser ?? obj?.user ?? obj?.email)} />
              </div>

              {showJson ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] text-slate-200 space-y-1">
                  <div>
                    <span className="text-slate-400">gmapsEmbedUrl:</span> {gmapsEmbedUrl ? gmapsEmbedUrl : "—"}
                  </div>
                  <div>
                    <span className="text-slate-400">obj.links.mapPreview:</span> {obj?.links?.mapPreview ? String(obj.links.mapPreview) : "—"}
                  </div>
                  <div>
                    <span className="text-slate-400">marushkaUrl:</span> {marushkaUrl ? marushkaUrl : "—"}
                  </div>
                </div>
              ) : null}

              {gmapsEmbedUrl ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">Náhled mapy</div>
                    <div className="text-[11px] text-slate-400">Google Maps</div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
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
                    <div className="text-[11px] text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-xl px-3 py-2">
                      {gmapsEmbedError}
                    </div>
                  ) : null}

                  <div className="text-[11px] text-slate-400">
                    Tip: Klikni na tlačítko <span className="text-slate-200">Google Mapy</span> vpravo pro otevření v novém okně.
                  </div>
                </div>
              ) : null}




              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Stavba</div>
                  <div className="text-[11px] text-slate-400">ID: {safeStr(stavba?.id)}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">Stavební objekt (RÚIAN) – technicko‑ekonomické atributy</div>
                    <div className="text-[11px] text-slate-400">Kód: {safeStr(ruianStavebniObjekt?.kod)}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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

                    <Field label="Připojení kanalizace (kód)" value={safeStr(ruianStavebniObjekt?.pripojenikanalizacekod)} />
                    <Field label="Připojení vodovod (kód)" value={safeStr(ruianStavebniObjekt?.pripojenivodovodkod)} />

                    <Field label="Připojení plyn (kód)" value={safeStr(ruianStavebniObjekt?.pripojeniplynkod)} />
                    <Field label="Vybavení výtahem (kód)" value={safeStr(ruianStavebniObjekt?.vybavenivytahemkod)} />

                    <Field label="Způsob vytápění (kód)" value={safeStr(ruianStavebniObjekt?.zpusobvytapenikod)} />
                    <Field label="Zdroj" value={safeStr(ruianStavebniObjekt?.zdroj)} />

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

              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Parcely / pozemky</div>
                  <div className="text-[11px] text-slate-400">{parcels.length ? `${parcels.length} položek` : "—"}</div>
                </div>

                {parcels.length ? (
                  <div className="space-y-2">
                    {parcels.map((p, idx) => (
                      <div
                        key={`${p.id ?? p.parcela ?? "p"}-${idx}`}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-slate-100">
                            <span className="font-semibold">Parcela:</span> {p.parcela ? p.parcela : "—"}
                            {p.typParcely ? <span className="text-slate-400"> ({p.typParcely})</span> : null}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {p.katUzemi ? `KÚ: ${p.katUzemi}` : ""}
                            {p.lv != null ? ` • LV: ${p.lv}` : ""}
                          </div>
                        </div>

                        <div className="mt-1 text-[12px] text-slate-300">
                          {p.druh ? (
                            <>
                              Druh: <span className="text-slate-200">{p.druh}</span>
                            </>
                          ) : (
                            <>Druh: —</>
                          )}
                          {"  "}•{" "}
                          {p.vymeraM2 != null ? (
                            <>
                              Výměra: <span className="text-slate-200">{p.vymeraM2} m²</span>
                            </>
                          ) : (
                            <>Výměra: —</>
                          )}
                        </div>

                        {p.vymeraM2 == null ? (
                          <div className="mt-2 text-[11px] text-slate-400">
                            Pozn.: stavba vrací jen základ parcely (ParcelaDef). Pro výměru je potřeba dotáhnout detail parcely/pozemku v backendu.
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                    Parcely/výměra se v téhle odpovědi nenašly.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Adresní místa</div>
                  <div className="text-[11px] text-slate-400">{adresniMista.length ? `${adresniMista.length} položek` : "—"}</div>
                </div>

                {adresniMista.length ? (
                  <div className="space-y-2">
                    {adresniMista.map((a, idx) => (
                      <div
                        key={`${a.adresa}-${a.ruian ?? "x"}-${idx}`}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
                      >
                        <div className="text-sm text-slate-100">{a.adresa}</div>
                        <div className="text-[11px] text-slate-400">
                          RÚIAN: <span className="text-slate-200">{a.ruian != null ? a.ruian : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                    Žádné adresní místo v odpovědi.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Jednotky</div>
                  <div className="text-[11px] text-slate-400">{jednotky.length ? `${jednotky.length} ks` : "0 ks"}</div>
                </div>

                {jednotky.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {jednotky.slice(0, 8).map((j: any, idx: number) => (
                      <div
                        key={`${j?.id ?? "j"}-${idx}`}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
                      >
                        <div className="text-sm text-slate-100">Jednotka ID: {safeStr(j?.id)}</div>
                        <div className="text-[12px] text-slate-300">
                          {j?.typJednotky?.nazev ? `Typ: ${j.typJednotky.nazev}` : "Typ: —"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                    Žádné jednotky nejsou k dispozici.
                  </div>
                )}
              </div>

              {showJson && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-100">
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
