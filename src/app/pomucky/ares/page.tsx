"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  Search,
  ArrowLeft,
  FileText,
  Hash,
  History,
  Loader2,
  Mailbox,
  MapPin,
  ShieldCheck,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { aresGetEntityDetail, aresSearchEntities } from "@/app/lib/ares";
import styles from "./ares.module.css";
import Link from "next/link";

const DETAIL_SOURCE_KEYS = ["core", "ros", "rzp", "vr", "res", "ceu", "nrpzs", "rcns", "rpsh", "rs", "szr"] as const;
type DetailSourceKey = (typeof DETAIL_SOURCE_KEYS)[number];

const DETAIL_SOURCE_LABELS: Record<DetailSourceKey, string> = {
  core: "Jádro ARES",
  ros: "ROS",
  rzp: "RŽP",
  vr: "VR",
  res: "RES",
  ceu: "CEÚ",
  nrpzs: "NRPZS",
  rcns: "RCNS",
  rpsh: "RPSH",
  rs: "RS",
  szr: "SZR",
};

type SourceHealthEntry = {
  ok: boolean;
  status: number;
  error: string | null;
};

type AresEntity = {
  ico: string | null;
  icoId: string | null;
  obchodniJmeno: string;
  pravniForma: string | null;
  pravniFormaRos: string | null;
  dic: string | null;
  datumVzniku: string | null;
  datumZaniku: string | null;
  primarniZdroj: string | null;
  sidlo: {
    textovaAdresa: string | null;
    nazevObce: string | null;
    psc: string | null;
    nazevStatu: string | null;
  };
  registrace: Record<string, string>;
  aktivniRegistry: string[];
};

type AresDetail = {
  ico: string;
  subject: {
    ico: string | null;
    icoId: string | null;
    obchodniJmeno: string | null;
    pravniForma: string | null;
    pravniFormaRos: string | null;
    dic: string | null;
    datumVzniku: string | null;
    datumZaniku: string | null;
    primarniZdroj: string | null;
    sidlo: string | null;
    datovaSchranka: string | null;
    datoveSchranky: Array<{
      identifikatorDs: string;
      typDatoveSchranky: string | null;
      platnostUdajeRos: string | null;
    }>;
    aktivniRegistry: string[];
    czNace: string[];
    czNace2008: string[];
    dalsiUdajeCount: number;
  };
  sections: {
    provozovnyRos: Array<{ icp: string | null; adresa: string | null; datumOd: string | null; datumDo: string | null }>;
    provozovnyRzp: Array<{ icp: string | null; nazev: string | null; adresa: string | null; datumOd: string | null; datumDo: string | null }>;
    zivnostiRzp: Array<{
      predmet: string | null;
      druh: string | null;
      datumVzniku: string | null;
      datumZaniku: string | null;
      provozovny: number;
      odpovedniZastupci: number;
    }>;
    statutarniRos: Array<{ jmeno: string | null; datumNarozeni: string | null }>;
    statutarniVr: Array<{
      organ: string | null;
      jmeno: string | null;
      role: string | null;
      datumZapisu: string | null;
      datumVymazu: string | null;
    }>;
    insolvencniUdalosti: Array<{ zdroj: "RZP" | "VR"; typ: string; datum: string | null; detail: string | null }>;
  };
  sourceStats: {
    zaznamy: Record<DetailSourceKey, number>;
    rzpZivnostiStav: Record<string, unknown> | null;
    rzpProvozovnyStav: Record<string, unknown> | null;
    resStatistickeUdaje: Record<string, unknown> | null;
  };
  sourceHealth: Record<DetailSourceKey, SourceHealthEntry>;
};

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeInput(value: string): string {
  return value.replace(/\s+/g, " ").trimStart();
}

function normalizeIcoInput(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 8);
}

function formatDateCs(value: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("cs-CZ");
}

function parseCzechDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year) &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) return null;
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseEntity(raw: unknown): AresEntity | null {
  const row = readObject(raw);
  if (!row) return null;

  const sidloRaw = readObject(row.sidlo);
  const registraceRaw = readObject(row.registrace);
  const aktivniRegistryRaw = Array.isArray(row.aktivniRegistry)
    ? row.aktivniRegistry.map((entry) => safeText(entry)).filter((entry): entry is string => !!entry)
    : [];

  const registrace: Record<string, string> = {};
  if (registraceRaw) {
    for (const [key, value] of Object.entries(registraceRaw)) {
      const label = safeText(value);
      if (!label) continue;
      registrace[key] = label;
    }
  }

  return {
    ico: safeText(row.ico),
    icoId: safeText(row.icoId),
    obchodniJmeno: safeText(row.obchodniJmeno) ?? "Neznámý subjekt",
    pravniForma: safeText(row.pravniForma),
    pravniFormaRos: safeText(row.pravniFormaRos),
    dic: safeText(row.dic),
    datumVzniku: safeText(row.datumVzniku),
    datumZaniku: safeText(row.datumZaniku),
    primarniZdroj: safeText(row.primarniZdroj),
    sidlo: {
      textovaAdresa: safeText(sidloRaw?.textovaAdresa),
      nazevObce: safeText(sidloRaw?.nazevObce),
      psc: safeText(sidloRaw?.psc),
      nazevStatu: safeText(sidloRaw?.nazevStatu),
    },
    registrace,
    aktivniRegistry: aktivniRegistryRaw,
  };
}

function toSafeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseSectionObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => readObject(entry)).filter((entry): entry is Record<string, unknown> => !!entry);
}

function parseDetail(raw: unknown): AresDetail | null {
  const root = readObject(raw);
  if (!root) return null;

  const subject = readObject(root.subject);
  const sections = readObject(root.sections);
  const sourceStats = readObject(root.sourceStats);
  const sourceHealth = readObject(root.sourceHealth);

  if (!subject || !sections || !sourceStats || !sourceHealth) return null;

  const activeRegistryRaw = Array.isArray(subject.aktivniRegistry) ? subject.aktivniRegistry : [];
  const czNaceRaw = Array.isArray(subject.czNace) ? subject.czNace : [];
  const czNace2008Raw = Array.isArray(subject.czNace2008) ? subject.czNace2008 : [];
  const datoveSchrankyRaw = Array.isArray(subject.datoveSchranky) ? subject.datoveSchranky : [];
  const sourceCounts = readObject(sourceStats.zaznamy);

  const healthPart = (key: DetailSourceKey): SourceHealthEntry => {
    const row = readObject(sourceHealth[key]) ?? {};
    return {
      ok: row.ok === true,
      status: typeof row.status === "number" && Number.isFinite(row.status) ? row.status : 0,
      error: safeText(row.error),
    };
  };

  const parsedSourceHealth = DETAIL_SOURCE_KEYS.reduce<Record<DetailSourceKey, SourceHealthEntry>>(
    (acc, key) => {
      acc[key] = healthPart(key);
      return acc;
    },
    {
      core: { ok: false, status: 0, error: null },
      ros: { ok: false, status: 0, error: null },
      rzp: { ok: false, status: 0, error: null },
      vr: { ok: false, status: 0, error: null },
      res: { ok: false, status: 0, error: null },
      ceu: { ok: false, status: 0, error: null },
      nrpzs: { ok: false, status: 0, error: null },
      rcns: { ok: false, status: 0, error: null },
      rpsh: { ok: false, status: 0, error: null },
      rs: { ok: false, status: 0, error: null },
      szr: { ok: false, status: 0, error: null },
    }
  );

  const parsedSourceCounts = DETAIL_SOURCE_KEYS.reduce<Record<DetailSourceKey, number>>(
    (acc, key) => {
      const countValue = sourceCounts ? sourceCounts[key] : 0;
      acc[key] = toSafeNumber(countValue);
      return acc;
    },
    {
      core: 0,
      ros: 0,
      rzp: 0,
      vr: 0,
      res: 0,
      ceu: 0,
      nrpzs: 0,
      rcns: 0,
      rpsh: 0,
      rs: 0,
      szr: 0,
    }
  );

  return {
    ico: safeText(root.ico) ?? "",
    subject: {
      ico: safeText(subject.ico),
      icoId: safeText(subject.icoId),
      obchodniJmeno: safeText(subject.obchodniJmeno),
      pravniForma: safeText(subject.pravniForma),
      pravniFormaRos: safeText(subject.pravniFormaRos),
      dic: safeText(subject.dic),
      datumVzniku: safeText(subject.datumVzniku),
      datumZaniku: safeText(subject.datumZaniku),
      primarniZdroj: safeText(subject.primarniZdroj),
      sidlo: safeText(subject.sidlo),
      datovaSchranka: safeText(subject.datovaSchranka),
      datoveSchranky: datoveSchrankyRaw
        .map((value) => readObject(value))
        .filter((value): value is Record<string, unknown> => !!value)
        .map((value) => {
          const identifikatorDs = safeText(value.identifikatorDs);
          if (!identifikatorDs) return null;
          return {
            identifikatorDs,
            typDatoveSchranky: safeText(value.typDatoveSchranky),
            platnostUdajeRos: safeText(value.platnostUdajeRos),
          };
        })
        .filter(
          (
            value
          ): value is {
            identifikatorDs: string;
            typDatoveSchranky: string | null;
            platnostUdajeRos: string | null;
          } => !!value
        ),
      aktivniRegistry: activeRegistryRaw.map((value) => safeText(value)).filter((value): value is string => !!value),
      czNace: czNaceRaw.map((value) => safeText(value)).filter((value): value is string => !!value),
      czNace2008: czNace2008Raw.map((value) => safeText(value)).filter((value): value is string => !!value),
      dalsiUdajeCount: toSafeNumber(subject.dalsiUdajeCount),
    },
    sections: {
      provozovnyRos: parseSectionObjectArray(sections.provozovnyRos).map((row) => ({
        icp: safeText(row.icp),
        adresa: safeText(row.adresa),
        datumOd: safeText(row.datumOd),
        datumDo: safeText(row.datumDo),
      })),
      provozovnyRzp: parseSectionObjectArray(sections.provozovnyRzp).map((row) => ({
        icp: safeText(row.icp),
        nazev: safeText(row.nazev),
        adresa: safeText(row.adresa),
        datumOd: safeText(row.datumOd),
        datumDo: safeText(row.datumDo),
      })),
      zivnostiRzp: parseSectionObjectArray(sections.zivnostiRzp).map((row) => ({
        predmet: safeText(row.predmet),
        druh: safeText(row.druh),
        datumVzniku: safeText(row.datumVzniku),
        datumZaniku: safeText(row.datumZaniku),
        provozovny: toSafeNumber(row.provozovny),
        odpovedniZastupci: toSafeNumber(row.odpovedniZastupci),
      })),
      statutarniRos: parseSectionObjectArray(sections.statutarniRos).map((row) => ({
        jmeno: safeText(row.jmeno),
        datumNarozeni: safeText(row.datumNarozeni),
      })),
      statutarniVr: parseSectionObjectArray(sections.statutarniVr).map((row) => ({
        organ: safeText(row.organ),
        jmeno: safeText(row.jmeno),
        role: safeText(row.role),
        datumZapisu: safeText(row.datumZapisu),
        datumVymazu: safeText(row.datumVymazu),
      })),
      insolvencniUdalosti: parseSectionObjectArray(sections.insolvencniUdalosti).map((row) => ({
        zdroj: safeText(row.zdroj) === "RZP" ? "RZP" : "VR",
        typ: safeText(row.typ) ?? "Insolvenční událost",
        datum: safeText(row.datum),
        detail: safeText(row.detail),
      })),
    },
    sourceStats: {
      zaznamy: parsedSourceCounts,
      rzpZivnostiStav: readObject(sourceStats.rzpZivnostiStav),
      rzpProvozovnyStav: readObject(sourceStats.rzpProvozovnyStav),
      resStatistickeUdaje: readObject(sourceStats.resStatistickeUdaje),
    },
    sourceHealth: parsedSourceHealth,
  };
}

function Pill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "rose";
  icon?: ReactNode;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${toneClass}`}>
      {icon && <span className="mr-1.5 inline-flex">{icon}</span>}
      {children}
    </span>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState("");
  return <button type="button" className={styles.copy} aria-label={`Kopírovat ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setState("Zkopírováno"); }
    catch { setState("Kopírování se nezdařilo"); }
  }}><Copy size={13}/><span role="status">{state || label}</span></button>;
}
function AresLoadingState({ query }: { query: string }) {
  return <section className={styles.loader} aria-busy="true"><div><span className={styles.eyebrow}>Vyhledávání v registru</span><h2>Hledám údaje o firmě.</h2><p>{query || "Načítám detail subjektu"}</p><div role="status" className={styles.loadingStatus}><Loader2 size={16}/> Načítám data z ARES…</div><div className={styles.track} aria-hidden="true"><span/></div></div><div className={styles.scanCard} aria-hidden="true"><span className={styles.companyIcon}><Building2 size={29}/></span><i/><i/><div><b/><b/></div><span className={styles.scanLine}/></div></section>;
}

export default function AresToolPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ico, setIco] = useState("");
  const [obchodniJmeno, setObchodniJmeno] = useState("");
  const [obec, setObec] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActivated, setSearchActivated] = useState(false);
  const [lastQuery, setLastQuery] = useState({ ico: "", obchodniJmeno: "", obec: "" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const searchInFlight = useRef(false);
  const detailPanelRef = useRef<HTMLElement>(null);
  const [entities, setEntities] = useState<AresEntity[]>([]);
  const [pocetCelkem, setPocetCelkem] = useState(0);
  const [detailByIco, setDetailByIco] = useState<Record<string, AresDetail>>({});
  const [activeDetailIco, setActiveDetailIco] = useState<string | null>(null);
  const [detailLoadingIco, setDetailLoadingIco] = useState<string | null>(null);
  const [detailErrorByIco, setDetailErrorByIco] = useState<Record<string, string>>({});
  const [showHistoricalStatutarni, setShowHistoricalStatutarni] = useState(false);
  const [embedMode, setEmbedMode] = useState(false);
  const [statutarniReferenceDate, setStatutarniReferenceDate] = useState<Date>(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    return current;
  });

  const primaryInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);
  const initialIcoFromUrlRef = useRef("");
  const initialIcoAutoSearchRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setEmbedMode(params.get("embed") === "1");

    const initialIco = normalizeIcoInput(params.get("ico") ?? "");
    if (!initialIco) return;

    initialIcoFromUrlRef.current = initialIco;
    setIco(initialIco);
    setObchodniJmeno("");
    setObec("");
    setSearchActivated(true);
  }, []);

  useEffect(() => {
    if (!searchActivated || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const input = primaryInputRef.current;
      if (!input) return;
      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchActivated]);

  useEffect(() => {
    if (!searchActivated || loading || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      resultScrollTargetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, searchActivated]);

  const canSearch = useMemo(() => {
    return ico ? ico.length === 8 : obchodniJmeno.trim().length >= 2;
  }, [ico, obchodniJmeno]);

  const handleSearch = useCallback(async () => {
    if (searchInFlight.current) return;
    setSearchActivated(true);

    if (!user) {
      setError("Přihlaš se, aby šlo volat data ARES.");
      return;
    }

    if (!canSearch) {
      setError("Vyplň IČO nebo alespoň 2 znaky obchodního jména.");
      return;
    }

    searchInFlight.current = true;
    setLoading(true);
    setError(null);
    setMoreError(null);
    setLastQuery({ ico, obchodniJmeno, obec });
    setActiveDetailIco(null);
    setDetailByIco({});
    setDetailErrorByIco({});

    try {
      const response = await aresSearchEntities({
        ico,
        obchodniJmeno,
        obec,
        start: 0,
        pocet: 20,
      });

      const rawEntities = Array.isArray(response.entities) ? response.entities : [];
      const parsedEntities = rawEntities
        .map((entry) => parseEntity(entry))
        .filter((entry): entry is AresEntity => !!entry);

      const rawCount = typeof response.pocetCelkem === "number" ? response.pocetCelkem : parsedEntities.length;
      setEntities(parsedEntities);
      setPocetCelkem(Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : parsedEntities.length);
    } catch (err: unknown) {
      setEntities([]);
      setPocetCelkem(0);
      setError(err instanceof Error ? err.message : "Nepodařilo se načíst data z ARES.");
    } finally {
      searchInFlight.current = false;
      setLoading(false);
    }
  }, [canSearch, ico, obec, obchodniJmeno, user]);

  useEffect(() => {
    const initialIco = initialIcoFromUrlRef.current;
    if (!initialIco || initialIcoAutoSearchRef.current || !user || ico !== initialIco) return;

    initialIcoAutoSearchRef.current = true;
    void handleSearch();
  }, [handleSearch, ico, user]);

  const handleLoadMore = async () => {
    if (searchInFlight.current || loadingMore) return;
    searchInFlight.current = true;
    setLoadingMore(true); setMoreError(null);
    try {
      const response = await aresSearchEntities({ ...lastQuery, start: entities.length, pocet: 20 });
      const rows = (Array.isArray(response.entities) ? response.entities : []).map(parseEntity).filter((row): row is AresEntity => !!row);
      setEntities(current => [...current, ...rows]);
      if (!rows.length) setPocetCelkem(entities.length);
    } catch (err) { setMoreError(err instanceof Error ? err.message : "Další výsledky se nepodařilo načíst."); }
    finally { searchInFlight.current = false; setLoadingMore(false); }
  };

  const handleOpenDetail = useCallback(
    async (entity: AresEntity) => {
      const entityIco = entity.ico;
      if (!entityIco || entityIco.length !== 8) return;

      setActiveDetailIco(entityIco);

      if (detailByIco[entityIco]) return;

      setDetailLoadingIco(entityIco);
      setDetailErrorByIco((current) => ({ ...current, [entityIco]: "" }));

      try {
        const response = await aresGetEntityDetail(entityIco);
        const parsed = parseDetail(response);
        if (!parsed) {
          throw new Error("Detail subjektu má neplatný formát odpovědi.");
        }
        setDetailByIco((current) => ({ ...current, [entityIco]: parsed }));
      } catch (err: unknown) {
        setDetailErrorByIco((current) => ({
          ...current,
          [entityIco]: err instanceof Error ? err.message : "Nepodařilo se načíst detail subjektu.",
        }));
      } finally {
        setDetailLoadingIco((current) => (current === entityIco ? null : current));
      }
    },
    [detailByIco]
  );

  const handleCloseDetail = useCallback(() => {
    setActiveDetailIco(null);
  }, []);

  useEffect(() => {
    if (!activeDetailIco || typeof window === "undefined") return;

    const previousFocus = document.activeElement;
    detailPanelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const controls = Array.from(detailPanelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1), active = document.activeElement;
        if (event.shiftKey && (active === first || active === detailPanelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (active === last || active === detailPanelRef.current)) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === "Escape") {
        setActiveDetailIco(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [activeDetailIco]);

  useEffect(() => {
    setShowHistoricalStatutarni(false);
    if (!activeDetailIco) return;
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    setStatutarniReferenceDate(current);
  }, [activeDetailIco]);

  const activeEntity = useMemo(
    () => (activeDetailIco ? entities.find((entity) => entity.ico === activeDetailIco) ?? null : null),
    [activeDetailIco, entities]
  );
  const activeDetail = activeDetailIco ? detailByIco[activeDetailIco] : null;
  const activeDetailError = activeDetailIco ? detailErrorByIco[activeDetailIco] : null;
  const activeDetailLoading = !!activeDetailIco && detailLoadingIco === activeDetailIco;
  const statutarniReferenceLabel = useMemo(
    () => statutarniReferenceDate.toLocaleDateString("cs-CZ"),
    [statutarniReferenceDate]
  );
  const currentStatutarniRos = activeDetail?.sections.statutarniRos ?? [];
  const statutarniVrByValidity = useMemo(() => {
    const current: AresDetail["sections"]["statutarniVr"] = [];
    const historical: AresDetail["sections"]["statutarniVr"] = [];
    const rows = activeDetail?.sections.statutarniVr ?? [];

    for (const row of rows) {
      const datumZapisu = parseCzechDate(row.datumZapisu);
      const datumVymazu = parseCzechDate(row.datumVymazu);
      const startsInFuture = !!datumZapisu && datumZapisu > statutarniReferenceDate;
      const endedBeforeReference = !!datumVymazu && datumVymazu < statutarniReferenceDate;

      if (startsInFuture || endedBeforeReference) {
        historical.push(row);
      } else {
        current.push(row);
      }
    }

    return { current, historical };
  }, [activeDetail, statutarniReferenceDate]);
  const currentStatutarniCount = currentStatutarniRos.length + statutarniVrByValidity.current.length;
  const loadingQueryLabel = useMemo(() => {
    const parts: string[] = [];
    if (ico.trim()) parts.push(`IČO ${ico.trim()}`);
    if (obchodniJmeno.trim()) parts.push(obchodniJmeno.trim());
    if (obec.trim()) parts.push(obec.trim());
    return parts.join(" · ");
  }, [ico, obec, obchodniJmeno]);

  const pageContent = (
    <>
      <div className={styles.page}>
        {!embedMode && <Link href="/pomucky" className={styles.back}><ArrowLeft size={15}/> Zpět na pomůcky</Link>}
        <header className={styles.hero}>
          <div><span className={styles.eyebrow}><Building2 size={16}/> Registr ekonomických subjektů</span><h1>ARES<span>Firmy a podnikatelé na jednom místě.</span></h1><p>Vyhledej subjekt a prohlédni si sídlo, živnosti, provozovny i statutární orgány.</p></div>
          <div className={styles.heroSymbol} aria-hidden="true"><Building2 size={58} strokeWidth={1.1}/><span>ARES</span></div>
        </header>
        <section className={styles.searchPanel} aria-label="Hledání v ARES">
          <form onSubmit={event => { event.preventDefault(); if (!loading && !loadingMore) void handleSearch(); }}>
            <label>IČO<div><Hash size={17}/><input ref={primaryInputRef} inputMode="numeric" value={ico} onChange={e => setIco(normalizeIcoInput(e.target.value))} placeholder="8 číslic" aria-describedby="ares-search-help"/></div></label>
            <label>Název firmy nebo jméno<div><Building2 size={17}/><input value={obchodniJmeno} onChange={e => setObchodniJmeno(normalizeInput(e.target.value))} placeholder="Např. název společnosti"/></div></label>
            <label>Obec <span>volitelně</span><div><MapPin size={17}/><input value={obec} onChange={e => setObec(normalizeInput(e.target.value))} placeholder="Např. Praha"/></div></label>
            <button className={styles.primary} disabled={!canSearch || loading || loadingMore}><Search size={17}/>{loading ? "Hledám…" : "Vyhledat"}</button>
          </form>
          <p id="ares-search-help" className={styles.help}>{ico && ico.length !== 8 ? "Doplň IČO na 8 číslic." : "Zadej IČO nebo alespoň 2 znaky názvu. Vyplněné údaje se při hledání kombinují."}</p>
          {!user && <p className={styles.notice}>Pro vyhledání se přihlas do aplikace.</p>}
          {error && <p role="alert" className={styles.notice}>{error}</p>}
        </section>
        {!searchActivated && <div className={styles.intro}>{[[Building2,"Základní údaje","IČO, sídlo a vznik subjektu"],[FileText,"Podnikání","Živnosti a evidované provozovny"],[ShieldCheck,"Detail registrů","Statutární orgány a dostupné záznamy"]].map(([Icon,title,description]) => { const ItemIcon = Icon as typeof Building2; return <div key={String(title)}><ItemIcon size={20}/><h2>{String(title)}</h2><p>{String(description)}</p></div>; })}</div>}

        <div ref={resultScrollTargetRef} className="scroll-mt-28" />

        {searchActivated && loading && <AresLoadingState query={loadingQueryLabel}/>}
        {searchActivated && !loading && entities.length > 0 && <section className={styles.results}>
          <div className={styles.resultsHeading}><div><span className={styles.eyebrow}>Výsledky vyhledávání</span><h2>Nalezené subjekty <span>{pocetCelkem.toLocaleString("cs-CZ")}</span></h2><p>{[lastQuery.ico && `IČO ${lastQuery.ico}`, lastQuery.obchodniJmeno, lastQuery.obec].filter(Boolean).join(" · ")}</p></div><span>Zobrazeno {entities.length} z {pocetCelkem}</span></div>
          <div className={styles.cards}>{entities.map((entity, idx) => <article key={`${entity.ico}-${idx}`} className={styles.card}>
            <div className={styles.cardTop}><span className={styles.companyIcon}><Building2 size={22}/></span><Pill tone={entity.datumZaniku ? "rose" : "green"}>{entity.datumZaniku ? "Zaniklý subjekt" : "Bez data zániku"}</Pill></div>
            <h3>{entity.obchodniJmeno}</h3>
            <div className={styles.identification}><span>IČO <strong>{entity.ico || "—"}</strong></span>{entity.ico && <CopyValue value={entity.ico} label="IČO"/>}</div>
            <p className={styles.address}><MapPin size={15}/>{entity.sidlo.textovaAdresa || [entity.sidlo.psc,entity.sidlo.nazevObce].filter(Boolean).join(" ") || "Adresa neuvedena"}</p>
            <div className={styles.facts}><span>Vznik <strong>{formatDateCs(entity.datumVzniku)}</strong></span>{entity.datumZaniku && <span>Zánik <strong>{formatDateCs(entity.datumZaniku)}</strong></span>}</div>
            <footer><span>{entity.aktivniRegistry.slice(0,3).join(" · ") || "ARES"}</span><button type="button" disabled={entity.ico?.length !== 8} onClick={() => void handleOpenDetail(entity)}>Detail subjektu <ChevronRight size={15}/></button></footer>
          </article>)}</div>
          {moreError && <p role="alert" className={styles.notice}>{moreError}</p>}
          {entities.length < pocetCelkem && entities.length <= 10000 && <button type="button" className={styles.more} disabled={loadingMore} onClick={() => void handleLoadMore()}>{loadingMore ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>} {loadingMore ? "Načítám další…" : "Načíst další subjekty"}</button>}
        </section>}

        {activeDetailIco && (
          <div className={styles.overlay}>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Zavřít detail subjektu"
              onClick={handleCloseDetail}
              className="absolute inset-0"
            />

            <section ref={detailPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ares-detail-heading" className={styles.dialog}>
              <header className="border-b border-slate-200 bg-slate-50/90 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Detail subjektu</p>
                    <h3 id="ares-detail-heading" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                      {activeEntity?.obchodniJmeno ?? activeDetail?.subject.obchodniJmeno ?? "Subjekt"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      IČO: {activeDetailIco}
                      {activeEntity?.primarniZdroj ? ` | Zdroj: ${activeEntity.primarniZdroj}` : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Zavřít"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>

              <div className={styles.detailBody}>
                {activeDetailLoading && <AresLoadingState query={activeEntity?.obchodniJmeno || activeDetailIco}/>}
                {activeDetailError && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {activeDetailError}
                    {activeEntity && <button type="button" className={styles.more} onClick={() => void handleOpenDetail(activeEntity)}>Zkusit znovu</button>}
                  </div>
                )}

                {!activeDetailLoading && !activeDetailError && activeDetail && (
                  <div className="space-y-4">
                    <section className={styles.identity}>
                      <div><span>IČO</span><strong>{activeDetail.subject.ico || activeDetailIco}</strong><CopyValue value={activeDetail.subject.ico || activeDetailIco} label="IČO"/></div>
                      <div><span>DIČ</span><strong>{activeDetail.subject.dic || "Neuvedeno"}</strong>{activeDetail.subject.dic && <CopyValue value={activeDetail.subject.dic} label="DIČ"/>}</div>
                      <div><span>Sídlo</span><strong>{activeDetail.subject.sidlo || "Neuvedeno"}</strong>{activeDetail.subject.sidlo && <CopyValue value={activeDetail.subject.sidlo} label="adresu"/>}</div>
                    </section>
                    <section className="space-y-2">
                      <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                        <Building2 className="h-4 w-4 text-slate-500" />
                        Souhrn detailu
                      </h4>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                            <Mailbox className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-slate-500">Datová schránka</p>
                            <p className="font-semibold text-slate-900">{activeDetail.subject.datovaSchranka ?? "—"}</p>
                            {activeDetail.subject.datovaSchranka && <CopyValue value={activeDetail.subject.datovaSchranka} label="datovou schránku"/>}
                            {activeDetail.subject.datoveSchranky.length > 1 && (
                              <p className="mt-1 text-xs text-slate-600">
                                Další schránky: {activeDetail.subject.datoveSchranky.slice(1).map((row) => row.identifikatorDs).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DETAIL_SOURCE_KEYS.map((sourceKey) => {
                          const health = activeDetail.sourceHealth[sourceKey];
                          const tone = health.ok ? "green" : sourceKey === "core" ? "rose" : "amber";
                          const label = DETAIL_SOURCE_LABELS[sourceKey];
                          return (
                            <Pill
                              key={`modal-health-${sourceKey}`}
                              tone={tone}
                              icon={
                                health.ok ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                )
                              }
                            >
                              {health.ok ? `${label} OK` : `${label} nedostupné`}
                            </Pill>
                          );
                        })}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                        <MapPin className="h-4 w-4 text-slate-500" />
                        Provozovny (ROS + RŽP)
                      </h4>
                      <div className="text-sm text-slate-700">
                        ROS: {activeDetail.sections.provozovnyRos.length} | RŽP: {activeDetail.sections.provozovnyRzp.length}
                      </div>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {activeDetail.sections.provozovnyRos.map((row, rowIdx) => (
                          <div key={`modal-ros-provozovna-${row.icp ?? "none"}-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-900">ROS ICP: {row.icp ?? "—"}</p>
                            <p className="text-slate-700">{row.adresa ?? "Adresa neuvedena"}</p>
                            <p className="text-xs text-slate-500">
                              {row.datumOd ?? "—"} - {row.datumDo ?? "dosud"}
                            </p>
                          </div>
                        ))}
                        {activeDetail.sections.provozovnyRzp.map((row, rowIdx) => (
                          <div key={`modal-rzp-provozovna-${row.icp ?? "none"}-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-900">RŽP ICP: {row.icp ?? "—"}</p>
                            <p className="text-slate-700">{row.nazev ?? "Bez názvu"}</p>
                            <p className="text-slate-700">{row.adresa ?? "Adresa neuvedena"}</p>
                            <p className="text-xs text-slate-500">
                              {row.datumOd ?? "—"} - {row.datumDo ?? "dosud"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                        <Building2 className="h-4 w-4 text-slate-500" />
                        Živnosti (RŽP)
                      </h4>
                      <div className="grid gap-2">
                        {activeDetail.sections.zivnostiRzp.map((row, rowIdx) => (
                          <div key={`modal-zivnost-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-900">{row.predmet ?? "Předmět podnikání neuveden"}</p>
                            <p className="text-slate-700">
                              Druh: {row.druh ?? "—"} | Provozovny: {row.provozovny} | Odpovědní zástupci: {row.odpovedniZastupci}
                            </p>
                            <p className="text-xs text-slate-500">
                              {row.datumVzniku ?? "—"} - {row.datumZaniku ?? "dosud"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                          <ShieldCheck className="h-4 w-4 text-slate-500" />
                          Statutární orgány (ROS + VR)
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowHistoricalStatutarni((current) => !current)}
                          aria-pressed={showHistoricalStatutarni}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          <History className="h-3.5 w-3.5" />
                          {showHistoricalStatutarni ? "Skrýt historické" : "Zobrazit historické"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">Aktuální ke dni {statutarniReferenceLabel}: {currentStatutarniCount}</p>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {currentStatutarniRos.map((row, rowIdx) => (
                          <div key={`modal-ros-statutarni-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-900">{row.jmeno ?? "Neuvedeno"}</p>
                            <p className="text-slate-600">ROS | nar.: {row.datumNarozeni ?? "—"}</p>
                          </div>
                        ))}
                        {statutarniVrByValidity.current.map((row, rowIdx) => (
                          <div key={`modal-vr-statutarni-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-900">{row.jmeno ?? "Neuvedeno"}</p>
                            <p className="text-slate-700">{row.organ ?? "VR orgán"} | {row.role ?? "role neuvedena"}</p>
                            <p className="text-xs text-slate-500">
                              {row.datumZapisu ?? "—"} - {row.datumVymazu ?? "dosud"}
                            </p>
                          </div>
                        ))}
                      </div>
                      {currentStatutarniCount === 0 && (
                        <p className="text-sm text-slate-600">
                          K datu {statutarniReferenceLabel} není v dostupných datech evidovaný aktuální statutární orgán.
                        </p>
                      )}
                      {showHistoricalStatutarni && (
                        <>
                          <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Historické položky (VR): {statutarniVrByValidity.historical.length}
                          </div>
                          {statutarniVrByValidity.historical.length > 0 ? (
                            <div className="grid gap-2 lg:grid-cols-2">
                              {statutarniVrByValidity.historical.map((row, rowIdx) => (
                                <div
                                  key={`modal-vr-statutarni-historical-${rowIdx}`}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <p className="font-semibold text-slate-900">{row.jmeno ?? "Neuvedeno"}</p>
                                  <p className="text-slate-700">{row.organ ?? "VR orgán"} | {row.role ?? "role neuvedena"}</p>
                                  <p className="text-xs text-slate-500">
                                    {row.datumZapisu ?? "—"} - {row.datumVymazu ?? "dosud"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-600">Historické záznamy pro VR nejsou dostupné.</p>
                          )}
                        </>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                        <AlertTriangle className="h-4 w-4 text-slate-500" />
                        Insolvence / konkurzy
                      </h4>
                      {activeDetail.sections.insolvencniUdalosti.length > 0 ? (
                        <div className="grid gap-2">
                          {activeDetail.sections.insolvencniUdalosti.map((row, rowIdx) => (
                            <div key={`modal-insolvence-${rowIdx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                              <p className="font-semibold text-slate-900">{row.typ}</p>
                              <p className="text-slate-700">
                                Zdroj: {row.zdroj} | Datum: {row.datum ?? "—"}
                              </p>
                              {row.detail && <p className="mt-1 text-xs text-slate-600">{row.detail}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">V dostupných registrech není evidovaná insolvenční událost.</p>
                      )}
                    </section>
                  </div>
                )}

                {!activeDetailLoading && !activeDetailError && !activeDetail && (
                  <p className="text-sm text-slate-600">Detail pro zvolený subjekt není zatím dostupný.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {searchActivated && !loading && entities.length === 0 && !error && (
          <section className={styles.empty} role="status">
            <div className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Pro zadané parametry nebyly nalezeny žádné subjekty.
            </div>
          </section>
        )}
      </div>

    </>
  );

  if (embedMode) return pageContent;

  return <AppLayout active="tools">{pageContent}</AppLayout>;
}
