"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
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

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const ARES_LOADING_PHASES = [
  "Validuji zadané parametry dotazu",
  "Napojení na veřejné registry ARES",
  "Sestavuji přehled nalezených subjektů",
] as const;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function revealStyle(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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

function AresLoadingState({ phaseIndex }: { phaseIndex: number }) {
  const safePhaseIndex = clamp(phaseIndex, 0, ARES_LOADING_PHASES.length - 1);
  const progressPct = ((safePhaseIndex + 1) / ARES_LOADING_PHASES.length) * 100;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/60 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="pointer-events-none absolute -left-20 top-8 h-36 w-36 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-36 w-36 rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative">
        <div className="flex items-start gap-4">
          <div className="relative mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <span className="absolute inset-0 rounded-2xl border border-emerald-300/70 motion-safe:animate-ping" />
            <Building2 className="h-5 w-5 text-emerald-700 motion-safe:animate-bounce" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
              <Loader2 className="h-4 w-4 text-emerald-700 motion-safe:animate-spin" />
              Vyhledávám data v ARES
            </div>
            <p className="mt-1 text-sm text-slate-600">{ARES_LOADING_PHASES[safePhaseIndex]}</p>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-100/90">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-sky-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {ARES_LOADING_PHASES.map((phase, idx) => {
            const isActive = idx === safePhaseIndex;
            const isDone = idx < safePhaseIndex;
            return (
              <div
                key={phase}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-emerald-300 bg-white text-emerald-900 shadow-sm"
                    : isDone
                      ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
                      : "border-slate-200 bg-white/80 text-slate-500"
                }`}
              >
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isActive || isDone ? "bg-emerald-500" : "bg-slate-300"}`}>
                  {isActive && <span className="absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-ping" />}
                </span>
                <span className="truncate font-medium">{phase}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function AresToolPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ico, setIco] = useState("");
  const [obchodniJmeno, setObchodniJmeno] = useState("");
  const [obec, setObec] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActivated, setSearchActivated] = useState(false);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [entities, setEntities] = useState<AresEntity[]>([]);
  const [pocetCelkem, setPocetCelkem] = useState(0);
  const [detailByIco, setDetailByIco] = useState<Record<string, AresDetail>>({});
  const [activeDetailIco, setActiveDetailIco] = useState<string | null>(null);
  const [detailLoadingIco, setDetailLoadingIco] = useState<string | null>(null);
  const [detailErrorByIco, setDetailErrorByIco] = useState<Record<string, string>>({});
  const [showHistoricalStatutarni, setShowHistoricalStatutarni] = useState(false);
  const [statutarniReferenceDate, setStatutarniReferenceDate] = useState<Date>(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    return current;
  });

  const primaryInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!loading) return;
    setLoadingPhaseIndex(0);
    const interval = window.setInterval(() => {
      setLoadingPhaseIndex((current) => (current + 1) % ARES_LOADING_PHASES.length);
    }, 900);
    return () => window.clearInterval(interval);
  }, [loading]);

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
    return ico.length === 8 || obchodniJmeno.trim().length >= 2;
  }, [ico, obchodniJmeno]);

  const handleSearch = useCallback(async () => {
    setSearchActivated(true);

    if (!user) {
      setError("Přihlaš se, aby šlo volat data ARES.");
      return;
    }

    if (!canSearch) {
      setError("Vyplň IČO nebo alespoň 2 znaky obchodního jména.");
      return;
    }

    setLoading(true);
    setError(null);
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
      setLoading(false);
    }
  }, [canSearch, ico, obec, obchodniJmeno, user]);

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

    const previousOverflow = document.body.style.overflow;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDetailIco(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
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

  return (
    <AppLayout active="tools">
      <div className="ares-tool-shell mx-auto w-full max-w-6xl space-y-5 pb-10 md:[zoom:0.92] xl:[zoom:0.86]">
        <section className="ares-reveal px-2 py-10 sm:px-4 sm:py-14" style={revealStyle(20)}>
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <div className="ares-float inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Oficiální data ARES
              </div>
              <h1 className={`${headingFont.className} ares-hero-title mx-auto mt-5 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight text-slate-900 sm:text-6xl md:text-7xl`}>
                Vyhledej firmu v ARES
                <span className="block text-sky-600">podle IČO nebo názvu</span>
              </h1>
            </div>

            <div className="ares-glow mx-auto mt-8 w-full max-w-4xl rounded-[30px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60">
              <div className="grid gap-2 md:grid-cols-[1.2fr_1.3fr_1fr_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 px-4 py-2">
                  <Hash className="h-6 w-6 text-slate-400" />
                  <input
                    ref={primaryInputRef}
                    type="text"
                    inputMode="numeric"
                    value={ico}
                    onChange={(event) => setIco(normalizeIcoInput(event.target.value))}
                    className="w-full border-none bg-transparent text-xl font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    placeholder="IČO (8 číslic)"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                    }}
                  />
                </div>

                <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 px-4 py-2">
                  <Building2 className="h-6 w-6 text-slate-400" />
                  <input
                    type="text"
                    value={obchodniJmeno}
                    onChange={(event) => setObchodniJmeno(normalizeInput(event.target.value))}
                    className="w-full border-none bg-transparent text-lg font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    placeholder="Obchodní jméno"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                    }}
                  />
                </div>

                <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 px-4 py-2">
                  <MapPin className="h-6 w-6 text-slate-400" />
                  <input
                    type="text"
                    value={obec}
                    onChange={(event) => setObec(normalizeInput(event.target.value))}
                    className="w-full border-none bg-transparent text-lg font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    placeholder="Obec (volitelně)"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={loading || !canSearch}
                  className="ares-cta group inline-flex h-14 items-center justify-center gap-3 rounded-[20px] border border-emerald-900/30 bg-[linear-gradient(135deg,#0f766e_0%,#059669_48%,#22c55e_100%)] px-7 text-lg font-semibold tracking-tight text-white shadow-[0_16px_36px_rgba(5,150,105,0.34),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? "Hledám..." : "Vyhledat"}
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25 transition group-hover:translate-x-0.5">
                    {loading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <ChevronRight className="h-5 w-5" />}
                  </span>
                </button>
              </div>
            </div>

            <div className="mx-auto mt-5 max-w-4xl text-center">
              {!user && (
                <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Přihlaš se, aby šlo volat data ARES.
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>

        <div ref={resultScrollTargetRef} className="scroll-mt-28" />

        {searchActivated && loading && (
          <div className="ares-reveal" style={revealStyle(60)}>
            <AresLoadingState phaseIndex={loadingPhaseIndex} />
          </div>
        )}

        {searchActivated && !loading && entities.length > 0 && (
          <section className="ares-reveal rounded-3xl border border-slate-200 bg-white p-5" style={revealStyle(40)}>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="green">Nalezeno: {pocetCelkem}</Pill>
              {ico.length === 8 && <Pill>IČO: {ico}</Pill>}
              {obchodniJmeno.trim().length > 0 && <Pill>Název: {obchodniJmeno.trim()}</Pill>}
              {obec.trim().length > 0 && <Pill>Obec: {obec.trim()}</Pill>}
            </div>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Výsledky ARES vyhledávání
            </h2>

            <div className={`mt-5 grid gap-4 ${entities.length === 1 ? "mx-auto max-w-3xl" : ""} md:grid-cols-2`}>
              {entities.map((entity, idx) => {
                const isActive = !entity.datumZaniku;
                const activeRegisters = entity.aktivniRegistry.slice(0, 3);
                const extraRegisters = Math.max(0, entity.aktivniRegistry.length - activeRegisters.length);
                const entityIco = entity.ico;
                const canLoadDetail = !!entityIco && entityIco.length === 8;
                const isSelected = canLoadDetail && activeDetailIco === entityIco;
                const primarySourceLabel = (entity.primarniZdroj ?? "ARES").toUpperCase();
                const fallbackAddress = [entity.sidlo.psc, entity.sidlo.nazevObce, entity.sidlo.nazevStatu].filter(Boolean).join(" ");
                const addressText =
                  entity.sidlo.textovaAdresa ??
                  (fallbackAddress || "Adresa neuvedena");
                const timelineLabel = `${formatDateCs(entity.datumVzniku)} / ${formatDateCs(entity.datumZaniku)}`;

                return (
                  <button
                    key={`${entity.ico ?? entity.icoId ?? entity.obchodniJmeno}-${idx}`}
                    type="button"
                    disabled={!canLoadDetail}
                    onClick={() => void handleOpenDetail(entity)}
                    className={`group relative overflow-hidden rounded-[26px] p-[1px] text-left transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 ${
                      isSelected ? "shadow-[0_24px_52px_rgba(15,23,42,0.15)]" : "hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.12)]"
                    } disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0`}
                  >
                    <div
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(148,163,184,0.38),rgba(148,163,184,0.14)_42%,rgba(52,211,153,0.36))] transition-opacity ${
                        isSelected ? "opacity-100" : "opacity-75 group-hover:opacity-100"
                      }`}
                    />

                    <div
                      className={`relative rounded-[25px] px-5 py-4 ${
                        isSelected ? "bg-emerald-50/80" : "bg-white/95"
                      }`}
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-8 top-0 h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(100,116,139,0.45),rgba(30,41,59,0.72),rgba(100,116,139,0.45),rgba(148,163,184,0))]"
                      />
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-10 top-[2px] h-px rounded-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(226,232,240,0.88),rgba(148,163,184,0))]"
                      />

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{primarySourceLabel}</p>
                          <h3 className="mt-1 line-clamp-2 text-2xl leading-[1.05] font-semibold tracking-tight text-slate-900 sm:text-3xl">
                            {entity.obchodniJmeno}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                            isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {isActive ? "AKTIVNÍ" : "ZANIKLÝ"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 border-t border-slate-200/90 pt-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">IČO</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{entity.ico ?? entity.icoId ?? "—"}</p>
                        </div>
                        <div className="border-l border-slate-200 pl-4 text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Vznik / zánik</p>
                          <p className="mt-1 text-sm font-medium text-slate-700">{timelineLabel}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <span className="line-clamp-2">{addressText}</span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {activeRegisters.length > 0 ? (
                          activeRegisters.map((register) => (
                            <span
                              key={`${entity.ico ?? entity.icoId}-${register}`}
                              className="inline-flex rounded-full border border-slate-200 bg-slate-100/75 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-700"
                            >
                              {register}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100/75 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-700">
                            Bez registru
                          </span>
                        )}
                        {extraRegisters > 0 && (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100/75 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-700">
                            +{extraRegisters}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-200/90 pt-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Detail subjektu</p>
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                          {canLoadDetail ? "Otevřít" : "Nedostupný"}
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition ${
                              isSelected ? "translate-x-0.5" : "group-hover:translate-x-0.5"
                            }`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {activeDetailIco && (
          <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] sm:p-6">
            <button
              type="button"
              aria-label="Zavřít detail subjektu"
              onClick={handleCloseDetail}
              className="absolute inset-0"
            />

            <section className="relative z-10 w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
              <header className="border-b border-slate-200 bg-slate-50/90 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Detail subjektu</p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
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

              <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-6">
                {activeDetailLoading && (
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    Načítám detail ze všech registrů ARES
                  </div>
                )}

                {activeDetailError && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {activeDetailError}
                  </div>
                )}

                {!activeDetailLoading && !activeDetailError && activeDetail && (
                  <div className="space-y-4">
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
          <section className="ares-reveal rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600" style={revealStyle(60)}>
            <div className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Pro zadané parametry nebyly nalezeny žádné subjekty.
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes ares-bg-pan {
          0% {
            transform: translate3d(-10%, -12%, 0) scale(1);
            opacity: 0.52;
          }
          50% {
            transform: translate3d(8%, 4%, 0) scale(1.06);
            opacity: 0.7;
          }
          100% {
            transform: translate3d(16%, -10%, 0) scale(1.03);
            opacity: 0.5;
          }
        }

        @keyframes ares-reveal-up {
          0% {
            opacity: 0;
            transform: translateY(26px) scale(0.985);
            filter: blur(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes ares-float-y {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes ares-glow-pulse {
          0%,
          100% {
            box-shadow: 0 12px 28px rgba(2, 132, 199, 0.08), 0 0 0 1px rgba(16, 185, 129, 0.08);
          }
          50% {
            box-shadow: 0 16px 34px rgba(2, 132, 199, 0.16), 0 0 0 1px rgba(16, 185, 129, 0.18);
          }
        }

        @keyframes ares-cta-shimmer {
          0% {
            transform: translateX(-130%);
          }
          50%,
          100% {
            transform: translateX(130%);
          }
        }

        .ares-tool-shell {
          position: relative;
          isolation: isolate;
        }

        .ares-tool-shell::before {
          content: "";
          position: absolute;
          inset: 32px 16px auto 16px;
          height: 300px;
          z-index: -1;
          border-radius: 44px;
          background: radial-gradient(50% 60% at 18% 44%, rgba(16, 185, 129, 0.16), transparent 74%),
            radial-gradient(58% 62% at 82% 36%, rgba(14, 165, 233, 0.18), transparent 78%);
          filter: blur(18px);
          animation: ares-bg-pan 14s ease-in-out infinite alternate;
        }

        .ares-reveal {
          opacity: 0;
          animation: ares-reveal-up 760ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .ares-float {
          animation: ares-float-y 4.6s ease-in-out infinite;
        }

        .ares-glow {
          animation: ares-glow-pulse 4.2s ease-in-out infinite;
        }

        .ares-hero-title {
          text-wrap: balance;
        }

        .ares-cta {
          position: relative;
          overflow: hidden;
        }

        .ares-cta::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 34%, rgba(255, 255, 255, 0.35) 50%, transparent 66%);
          transform: translateX(-130%);
          animation: ares-cta-shimmer 3.3s ease-in-out infinite;
          pointer-events: none;
        }

        .ares-cta:disabled::after {
          animation: none;
        }

        :root[data-motion="off"] .ares-tool-shell::before,
        :root[data-motion="off"] .ares-reveal,
        :root[data-motion="off"] .ares-float,
        :root[data-motion="off"] .ares-glow,
        :root[data-motion="off"] .ares-cta::after {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .ares-tool-shell::before,
          .ares-reveal,
          .ares-float,
          .ares-glow,
          .ares-cta::after {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>
    </AppLayout>
  );
}
