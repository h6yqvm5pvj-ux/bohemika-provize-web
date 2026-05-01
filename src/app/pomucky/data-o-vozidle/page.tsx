"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  Activity,
  CalendarDays,
  CalendarClock,
  Car,
  CarFront,
  Copy,
  FileText,
  Fuel,
  Gauge,
  Leaf,
  Palette,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Weight,
  Wind,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { rsvVehicleLookupByVin } from "@/app/lib/rsv";

type VehicleData = Record<string, unknown>;

type LookupPayload = {
  Status?: unknown;
  Data?: VehicleData;
};

type LookupResult = {
  vin?: unknown;
  forUser?: unknown;
  payload?: LookupPayload;
};

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function safeStr(v: unknown): string {
  if (!hasValue(v)) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function normalizeVinInput(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().toUpperCase().replace(/\s+/g, "");
}

function fmtDateCZ(v: unknown): string {
  if (!hasValue(v)) return "—";
  const s = String(v).trim();
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("cs-CZ");
}

function parseDateLoose(v: unknown): Date | null {
  if (!hasValue(v)) return null;
  const dt = new Date(String(v).trim());
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("cs-CZ", { maximumFractionDigits: decimals });
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (!hasValue(v)) return null;
  const raw = String(v).trim().replace(/\s+/g, " ");
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function firstOf(data: VehicleData | null, keys: string[]): unknown {
  if (!data) return null;
  for (const key of keys) {
    if (key in data && hasValue(data[key])) {
      return data[key];
    }
  }
  return null;
}

function findByPattern(data: VehicleData | null, patterns: string[]): string[] {
  if (!data) return [];

  const out: string[] = [];
  const lowered = patterns.map((p) => p.toLowerCase());

  for (const [key, value] of Object.entries(data)) {
    const name = key.toLowerCase();
    if (!lowered.some((p) => name.includes(p))) continue;
    if (!hasValue(value)) continue;

    const str = String(value).trim();
    if (!str || str === "0" || str === "-") continue;
    if (!out.includes(str)) out.push(str);
  }

  return out;
}

function yesNoValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "ANO" : "NE";
  const s = safeStr(v);
  if (s === "—") return s;
  const normalized = s.toLowerCase();

  if (["ano", "yes", "true", "1"].includes(normalized)) return "ANO";
  if (["ne", "no", "false", "0"].includes(normalized)) return "NE";

  return s.toUpperCase();
}

function statusLabel(data: VehicleData | null): string {
  const raw = firstOf(data, [
    "VozidloStav",
    "StavVozidla",
    "StatusVozidla",
    "Provozovane",
    "VozidloProvozovane",
  ]);

  if (typeof raw === "boolean") return raw ? "PROVOZOVANÉ" : "MIMO PROVOZ";

  const s = safeStr(raw);
  if (s !== "—") return s.toUpperCase();

  const firstReg = firstOf(data, ["DatumPrvniRegistrace", "DatumPrvniRegistraceVCr"]);
  return hasValue(firstReg) ? "PROVOZOVANÉ" : "NEZNÁMÝ STAV";
}

function statusTone(status: string): "green" | "amber" {
  if (status.includes("PROVOZ") || status.includes("AKTIV")) return "green";
  return "amber";
}

function stkTone(stkDateRaw: unknown): "green" | "amber" | "rose" {
  const date = parseDateLoose(stkDateRaw);
  if (!date) return "amber";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "rose";
  if (diffDays <= 60) return "amber";
  return "green";
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "rose";
}) {
  const colorMap: Record<typeof tone, string> = {
    neutral:
      "border-slate-300 bg-white text-slate-900",
    blue:
      "border-sky-300 bg-sky-100 text-sky-900",
    green:
      "border-emerald-300 bg-emerald-100 text-emerald-900",
    amber:
      "border-amber-300 bg-amber-100 text-amber-900",
    rose:
      "border-rose-300 bg-rose-100 text-rose-900",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${colorMap[tone]}`}
    >
      {children}
    </span>
  );
}

function InfoCard({
  icon,
  title,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-slate-300 bg-white p-4 sm:p-5 ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="relative z-10 mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700">
          {icon}
        </span>
        <h3 className="text-lg font-semibold text-slate-900/95">{title}</h3>
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

function SpecRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-300 py-2 last:border-b-0">
      <dt className="text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          {icon && (
            <span className="inline-flex h-4 w-4 items-center justify-center text-slate-500">
              {icon}
            </span>
          )}
          <span>{label}</span>
        </span>
      </dt>
      <dd className="text-sm font-semibold text-slate-900 text-right">{value}</dd>
    </div>
  );
}

function MetricRing({
  label,
  value,
  unit,
  max,
}: {
  label: string;
  value: number | null;
  unit: string;
  max: number;
}) {
  const pct = value == null || max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const radius = 30;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const gradId = `ring-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${unit.toLowerCase()}`;

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-300 bg-white px-3 py-3">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-sm font-bold text-slate-900">{fmtNumber(value)}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{unit}</div>
        </div>
      </div>
      <div className="text-xs font-medium text-slate-600">{label}</div>
    </div>
  );
}

export default function VehicleDataPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [vin, setVin] = useState("");
  const [vinFromQuery, setVinFromQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [copiedVin, setCopiedVin] = useState(false);
  const [copiedOrv, setCopiedOrv] = useState(false);
  const [searchActivated, setSearchActivated] = useState(false);
  const autoLookupVinRef = useRef<string | null>(null);
  const compactVinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const qsVin = normalizeVinInput(new URLSearchParams(window.location.search).get("vin"));
    setVinFromQuery(qsVin);
  }, []);

  const canSearch = useMemo(() => !!user && vin.trim().length >= 11, [user, vin]);

  const payload = result?.payload;
  const data = (payload?.Data ?? null) as VehicleData | null;

  const vehicle = useMemo(() => {
    if (!data) {
      return null;
    }

    const brand = safeStr(firstOf(data, ["TovarniZnacka", "Znacka", "ZnackaVozidla"]));
    const model = safeStr(firstOf(data, ["ObchodniOznaceni", "Model", "Typ"]));
    const color = safeStr(firstOf(data, ["VozidloKaroserieBarva", "Barva", "BarvaVozidla"]));

    const firstRegRaw = firstOf(data, ["DatumPrvniRegistrace", "PrvniRegistrace"]);
    const firstReg = fmtDateCZ(firstRegRaw);
    const firstRegCz = fmtDateCZ(firstOf(data, ["DatumPrvniRegistraceVCr", "PrvniRegistraceVCr"]));

    const yearFromApi = toNumber(firstOf(data, ["RokVyroby", "VozidloRokVyroby"]));
    const year = yearFromApi ?? (firstReg !== "—" ? new Date(firstRegRaw as string).getFullYear() : null);

    const regularTechnicalInspectionRaw = firstOf(data, [
      "PravidelnaTechnickaProhlidkaDo",
    ]);
    const stkRaw = firstOf(data, [
      "PravidelnaTechnickaProhlidkaDo",
      "StkDo",
      "STKDo",
      "DatumStkDo",
      "TechnickaProhlidkaDo",
      "PlatnostStkDo",
    ]);
    const stkDo = fmtDateCZ(stkRaw);
    const regularTechnicalInspectionDo = fmtDateCZ(regularTechnicalInspectionRaw);

    const powerKw = toNumber(firstOf(data, ["MotorMaxVykon", "Vykon", "MaxVykon"]));
    const displacement = toNumber(firstOf(data, ["MotorZdvihObjem", "ZdvihovyObjem", "ObjemMotoru"]));

    const operatingWeight = toNumber(firstOf(data, ["HmotnostiProvozni", "ProvozniHmotnost"]));
    const maxWeight = toNumber(firstOf(data, ["HmotnostiPripPov", "HmotnostiPripPovJS", "NejvetsiPovolenaHmotnost"]));
    const utilizationPct =
      operatingWeight != null && maxWeight != null && maxWeight > 0
        ? Math.min(100, Math.round((operatingWeight / maxWeight) * 100))
        : null;

    const lengthMm = toNumber(firstOf(data, ["Delka", "VozidloDelka", "RozmeryDelka", "DelkaVozidla"]));
    const widthMm = toNumber(firstOf(data, ["Sirka", "VozidloSirka", "RozmerySirka", "SirkaVozidla"]));
    const heightMm = toNumber(firstOf(data, ["Vyska", "VozidloVyska", "RozmeryVyska", "VyskaVozidla"]));
    const wheelbaseMm = toNumber(firstOf(data, ["Rozvor", "RozvorNaprav", "VozidloRozvor"]));

    const tireValues = findByPattern(data, ["pneu", "pneumatik"]);
    const statusByRegistry = safeStr(firstOf(data, ["StatusNazev"]));

    return {
      brand,
      model,
      color,
      firstReg,
      firstRegCz,
      year,
      stkDo,
      stkTone: stkTone(stkRaw),
      status: statusByRegistry !== "—" ? statusByRegistry : statusLabel(data),
      statusByRegistry,
      regularTechnicalInspectionDo,
      powerKw,
      displacement,
      topSpeed: toNumber(firstOf(data, ["NejvyssiRychlost"])),
      operatingWeight,
      maxWeight,
      utilizationPct,
      lengthMm,
      widthMm,
      heightMm,
      wheelbaseMm,
      tireValues,
      fuel: safeStr(firstOf(data, ["Palivo", "DruhPaliva"])),
      emissionNorm: safeStr(firstOf(data, ["EmisniNorma", "EmisniLimit", "EuroNorma"])),
      consumption: safeStr(firstOf(data, ["Spotreba", "SpotrebaKomb", "SpotrebaKombinovana"])),
      category: safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"])),
      vehicleType: safeStr(firstOf(data, ["Typ", "DruhVozidla"])),
      seats: safeStr(firstOf(data, ["VozidloKaroserieMist", "PocetMist"])),
      hybrid: yesNoValue(firstOf(data, ["VozidloHybridni", "Hybridni"])),
      electric: yesNoValue(firstOf(data, ["VozidloElektricke", "Elektricke"])),
      tp: safeStr(firstOf(data, ["CisloTp", "CisloTP"])),
      orv: safeStr(firstOf(data, ["CisloOrv", "CisloORV"])),
      engineType: safeStr(firstOf(data, ["TypMotoru", "MotorTyp"])),
      engineCode: safeStr(firstOf(data, ["CisloMotoru", "KodMotoru"])),
      engineMaker: safeStr(firstOf(data, ["MotorVyrobce", "VyrobceMotoru"])),
      co2: safeStr(firstOf(data, ["EmiseCo2Komb", "Co2", "CO2"])),
      noise: safeStr(firstOf(data, ["Hluk", "HlukJizda"])),
      vehiclePurpose: safeStr(firstOf(data, ["VozidloUcel"])),
      ownerCount: safeStr(firstOf(data, ["PocetVlastniku"])),
      operatorCount: safeStr(firstOf(data, ["PocetProvozovatelu"])),
      trailerBraked: fmtNumber(
        toNumber(firstOf(data, ["PripojneBrzdene", "PripojneBrzdeneKg"]))
      ),
      trailerUnbraked: fmtNumber(
        toNumber(firstOf(data, ["PripojneNebrzd", "PripojneNebrzdene", "PripojneNebrzdeneKg"]))
      ),
    };
  }, [data]);

  const tireItems = useMemo(() => {
    if (!vehicle) return [];
    const split = vehicle.tireValues
      .flatMap((value) => String(value).split(/[,;]+/))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value !== "/" && value !== "-");

    return Array.from(new Set(split)).slice(0, 4);
  }, [vehicle]);

  const handleSearchByVin = useCallback(async (value: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = (await rsvVehicleLookupByVin(value)) as LookupResult;
      setResult(data);
      setLoadedAt(new Date());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nepodařilo se načíst data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    setSearchActivated(true);
    await handleSearchByVin(vin);
  }, [handleSearchByVin, vin]);

  useEffect(() => {
    if (!vinFromQuery) return;
    setVin((prev) => (prev === vinFromQuery ? prev : vinFromQuery));
  }, [vinFromQuery]);

  useEffect(() => {
    if (!user) return;
    if (vinFromQuery.length < 11) return;
    if (autoLookupVinRef.current === vinFromQuery) return;
    autoLookupVinRef.current = vinFromQuery;
    setSearchActivated(true);
    void handleSearchByVin(vinFromQuery);
  }, [user, vinFromQuery, handleSearchByVin]);

  useEffect(() => {
    if (!searchActivated || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const input = compactVinInputRef.current;
      if (!input) return;
      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchActivated]);

  const handleResetVin = useCallback(() => {
    setVin("");
    setSearchActivated(false);
    setResult(null);
    setError(null);
    setLoadedAt(null);
  }, []);

  const handleCopyVin = async () => {
    const val = safeStr(result?.vin ?? vin);
    if (val === "—") return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedVin(true);
      window.setTimeout(() => setCopiedVin(false), 1400);
    } catch {
      setCopiedVin(false);
    }
  };

  const handleCopyOrv = async () => {
    const val = safeStr(vehicle?.orv);
    if (val === "—") return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedOrv(true);
      window.setTimeout(() => setCopiedOrv(false), 1400);
    } catch {
      setCopiedOrv(false);
    }
  };

  const displayedVin = safeStr(result?.vin ?? vin);
  const valuationHref =
    displayedVin !== "—"
      ? `/pomucky/naceneni-vozidla?vin=${encodeURIComponent(displayedVin)}`
      : "/pomucky/naceneni-vozidla";
  const windshieldHref =
    displayedVin !== "—"
      ? `/pomucky/naceneni-celniho-skla?vin=${encodeURIComponent(displayedVin)}`
      : "/pomucky/naceneni-celniho-skla";

  return (
    <AppLayout active="tools">
      <div className="mx-auto w-full max-w-6xl space-y-4 pb-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              <CarFront className="h-7 w-7 text-slate-700" />
              <span>Data o vozidle</span>
            </h1>
            <Link href="/pomucky" className="inline-flex text-xs text-slate-600 transition hover:text-slate-900">
              ← Zpět na pomůcky
            </Link>
          </div>
          {searchActivated && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
              Datový přehled z registru vozidel podle VIN.
            </div>
          )}
        </header>

        {searchActivated ? (
          <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 transition-all duration-300">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
              <div className="min-w-0 flex-1 space-y-1.5 lg:max-w-[620px]">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">VIN</label>
                <input
                  ref={compactVinInputRef}
                  type="text"
                  value={vin}
                  onChange={(event) => setVin(normalizeVinInput(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder='např. "TMB..."'
                />
              </div>
              <div className="flex flex-wrap gap-2 lg:shrink-0 lg:pb-0.5">
                <button
                  type="button"
                  onClick={handleResetVin}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Vymazat
                </button>
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={loading || !canSearch}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {loading ? "Načítám..." : "Načíst data"}
                </button>
              </div>
            </div>
            {!user && (
              <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Přihlaš se, aby šlo volat data o vozidle.
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {error}
              </p>
            )}
          </section>
        ) : (
          <section className="flex min-h-[58vh] items-center justify-center px-2 py-8 sm:px-4">
            <div className="mx-auto w-full max-w-5xl">
              <div className="mx-auto max-w-4xl text-center">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Zadej VIN vozidla
                </h2>
              </div>

              <div className="mx-auto mt-7 max-w-4xl space-y-4">
                <input
                  autoFocus
                  type="text"
                  value={vin}
                  onChange={(event) => setVin(normalizeVinInput(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                  }}
                  className="h-[72px] w-full rounded-2xl border border-emerald-300 bg-white px-6 text-center text-xl font-semibold tracking-[0.08em] text-slate-900 outline-none transition placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder='např. "WAUZZZ..."'
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetVin}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Vymazat
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSearch()}
                    disabled={loading || !canSearch}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    {loading ? "Načítám..." : "Načíst data"}
                  </button>
                </div>
              </div>

              {!user && (
                <p className="mx-auto mt-4 max-w-4xl rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Přihlaš se, aby šlo volat data o vozidle.
                </p>
              )}
              {error && (
                <p className="mx-auto mt-3 max-w-4xl rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {error}
                </p>
              )}
            </div>
          </section>
        )}

        {searchActivated && loadedAt && (
          <p className="inline-flex w-full items-center justify-center gap-1 text-[11px] text-slate-400">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
            Načteno: {loadedAt.toLocaleDateString("cs-CZ")} {loadedAt.toLocaleTimeString("cs-CZ")}
          </p>
        )}

        {searchActivated && (loading ? (
          <section className="rounded-3xl border border-slate-300 bg-white px-4 py-4 space-y-3 animate-pulse">
            <div className="h-7 w-2/5 rounded-lg bg-white" />
            <div className="h-4 w-3/5 rounded-lg bg-white" />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-28 rounded-2xl bg-white" />
              <div className="h-28 rounded-2xl bg-white" />
              <div className="h-28 rounded-2xl bg-white" />
            </div>
            <div className="h-64 rounded-3xl bg-white" />
          </section>
        ) : !result ? (
          <section className="rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
            Zatím nejsou načtená data vozidla.
          </section>
        ) : !vehicle ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Odpověď neobsahuje validní data vozidla.
          </section>
        ) : (
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-3xl border border-slate-300 bg-white p-4 sm:p-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone="neutral">OSOBNÍ AUTOMOBIL</Tag>
                    <Tag tone={statusTone(vehicle.status)}>{vehicle.status}</Tag>
                    <Tag tone={vehicle.stkTone}>
                      STK {vehicle.stkTone === "rose" ? "PO TERMÍNU" : vehicle.stkTone === "amber" ? "BRZY KONČÍ" : "OK"}
                    </Tag>
                  </div>

                  <div>
                    <h2 className="text-5xl leading-tight font-semibold text-slate-900 tracking-tight">
                      {vehicle.brand} <span className="text-slate-700">{vehicle.model}</span>
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone="blue">VIN · {safeStr(result?.vin ?? vin)}</Tag>
                    <Tag tone="neutral">{vehicle.color}</Tag>
                    {vehicle.hybrid !== "—" && <Tag tone="neutral">Hybrid: {vehicle.hybrid}</Tag>}
                    {vehicle.electric !== "—" && <Tag tone="neutral">EV: {vehicle.electric}</Tag>}
                    <button
                      type="button"
                      onClick={() => void handleCopyVin()}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedVin ? "Zkopírováno" : "Kopírovat VIN"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyOrv()}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedOrv ? "Zkopírováno" : "Kopírovat ORV"}
                    </button>
                    <Link
                      href={valuationHref}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition"
                    >
                      <CarFront className="h-3.5 w-3.5" />
                      Nacenit vozidlo
                    </Link>
                    <Link
                      href={windshieldHref}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition"
                    >
                      <Wind className="h-3.5 w-3.5" />
                      Nacenit sklo
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 min-w-[240px]">
                  <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Rok výroby
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{fmtNumber(vehicle.year)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      STK do
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{vehicle.stkDo}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3 col-span-2">
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      1. registrace / ČR
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {vehicle.firstReg} <span className="text-slate-500">/</span> {vehicle.firstRegCz}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                    <Gauge className="h-3.5 w-3.5" />
                    Výkon
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {fmtNumber(vehicle.powerKw)} <span className="text-sm text-slate-500">kW</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                    <Ruler className="h-3.5 w-3.5" />
                    Objem
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {fmtNumber(vehicle.displacement)} <span className="text-sm text-slate-500">cm³</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                    <Fuel className="h-3.5 w-3.5" />
                    Palivo
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{vehicle.fuel}</div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                    <Users className="h-3.5 w-3.5" />
                    Místa
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{vehicle.seats}</div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_1.2fr]">
              <InfoCard icon={<Gauge className="h-4 w-4" />} title="Srdce vozu">
                <div className="grid grid-cols-2 gap-3">
                  <MetricRing label="Výkon" value={vehicle.powerKw} unit="kW" max={240} />
                  <MetricRing label="Objem" value={vehicle.displacement} unit="cm³" max={3500} />
                </div>

                <dl className="mt-3">
                  <SpecRow label="Palivo" value={vehicle.fuel} icon={<Fuel className="h-3.5 w-3.5" />} />
                  <SpecRow
                    label="Emisní norma"
                    value={vehicle.emissionNorm}
                    icon={<Leaf className="h-3.5 w-3.5" />}
                  />
                  <SpecRow
                    label="Spotřeba"
                    value={vehicle.consumption}
                    icon={<Activity className="h-3.5 w-3.5" />}
                  />
                </dl>
              </InfoCard>

              <InfoCard icon={<Ruler className="h-4 w-4" />} title="Rozměry, Kapacita a Obutí">
                <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                  <div className="rounded-2xl border border-slate-300 bg-white p-3">
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Vizualizace rozměrů</div>
                    <svg viewBox="0 0 420 180" className="w-full h-40">
                      <path
                        d="M34 118 L54 98 L100 90 L140 66 L250 66 L292 90 L345 95 L372 118"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="4"
                        strokeLinejoin="round"
                      />
                      <circle cx="110" cy="122" r="18" fill="none" stroke="#94a3b8" strokeWidth="4" />
                      <circle cx="300" cy="122" r="18" fill="none" stroke="#94a3b8" strokeWidth="4" />

                      <line x1="40" y1="155" x2="370" y2="155" stroke="#64748b" strokeWidth="2" />
                      <line x1="40" y1="148" x2="40" y2="162" stroke="#64748b" strokeWidth="2" />
                      <line x1="370" y1="148" x2="370" y2="162" stroke="#64748b" strokeWidth="2" />
                      <text x="205" y="149" fill="#0f172a" textAnchor="middle" fontSize="13" fontWeight="700">
                        {fmtNumber(vehicle.lengthMm)} mm
                      </text>

                      <line x1="390" y1="64" x2="390" y2="124" stroke="#64748b" strokeWidth="2" />
                      <line x1="383" y1="64" x2="397" y2="64" stroke="#64748b" strokeWidth="2" />
                      <line x1="383" y1="124" x2="397" y2="124" stroke="#64748b" strokeWidth="2" />
                      <text x="390" y="98" fill="#0f172a" textAnchor="middle" fontSize="12" fontWeight="700">
                        {fmtNumber(vehicle.heightMm)}
                      </text>

                      <text x="205" y="176" fill="#94a3b8" textAnchor="middle" fontSize="11">
                        Rozvor: {fmtNumber(vehicle.wheelbaseMm)} mm · Šířka: {fmtNumber(vehicle.widthMm)} mm
                      </text>
                    </svg>
                  </div>

                  <div className="rounded-2xl border border-slate-300 bg-white p-3">
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Schválené pneumatiky</div>
                    <div className="space-y-2">
                      {(tireItems.length ? tireItems : ["—"]).map((tire, idx) => (
                        <div
                          key={`${tire}-${idx}`}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        >
                          {tire}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </InfoCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard icon={<Weight className="h-4 w-4" />} title="Hmotnosti a Závěs">
                <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Vytížení</span>
                    <span className="text-sm font-bold text-slate-900">{fmtNumber(vehicle.utilizationPct)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white overflow-hidden ring-1 ring-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 via-violet-400 to-rose-400"
                      style={{ width: `${Math.max(0, Math.min(vehicle.utilizationPct ?? 0, 100))}%` }}
                    />
                  </div>

                  <dl>
                    <SpecRow
                      label="Provozní"
                      value={vehicle.operatingWeight != null ? `${fmtNumber(vehicle.operatingWeight)} kg` : "—"}
                      icon={<Weight className="h-3.5 w-3.5" />}
                    />
                    <SpecRow
                      label="Povolená"
                      value={vehicle.maxWeight != null ? `${fmtNumber(vehicle.maxWeight)} kg` : "—"}
                      icon={<Weight className="h-3.5 w-3.5" />}
                    />
                    <SpecRow
                      label="Přípojné (brzděné)"
                      value={vehicle.trailerBraked !== "—" ? `${vehicle.trailerBraked} kg` : "—"}
                      icon={<CarFront className="h-3.5 w-3.5" />}
                    />
                    <SpecRow
                      label="Přípojné (nebrzděné)"
                      value={vehicle.trailerUnbraked !== "—" ? `${vehicle.trailerUnbraked} kg` : "—"}
                      icon={<CarFront className="h-3.5 w-3.5" />}
                    />
                  </dl>
                </div>
              </InfoCard>

              <InfoCard icon={<Activity className="h-4 w-4" />} title="Detail Motoru a Emise">
                <dl>
                  <SpecRow label="Typ motoru" value={vehicle.engineType} icon={<Activity className="h-3.5 w-3.5" />} />
                  <SpecRow label="Výrobce motoru" value={vehicle.engineMaker} icon={<Car className="h-3.5 w-3.5" />} />
                  <SpecRow label="Číslo/Kód motoru" value={vehicle.engineCode} icon={<FileText className="h-3.5 w-3.5" />} />
                  <SpecRow
                    label="Nejvyšší rychlost"
                    value={vehicle.topSpeed != null ? `${fmtNumber(vehicle.topSpeed)} km/h` : "—"}
                    icon={<Gauge className="h-3.5 w-3.5" />}
                  />
                  <SpecRow label="Emisní limit" value={vehicle.emissionNorm} icon={<Leaf className="h-3.5 w-3.5" />} />
                  <SpecRow label="CO₂ (komb.)" value={vehicle.co2} icon={<Leaf className="h-3.5 w-3.5" />} />
                  <SpecRow label="Hluk" value={vehicle.noise} icon={<Wind className="h-3.5 w-3.5" />} />
                </dl>
              </InfoCard>

              <InfoCard icon={<CarFront className="h-4 w-4" />} title="Karoserie a Vzhled">
                <dl>
                  <SpecRow label="Druh vozidla" value={vehicle.vehicleType} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <SpecRow label="Status" value={vehicle.status} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
                  <SpecRow
                    label="Pravidelná technická do"
                    value={vehicle.regularTechnicalInspectionDo}
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                  />
                  <SpecRow label="Účel vozidla" value={vehicle.vehiclePurpose} icon={<Car className="h-3.5 w-3.5" />} />
                  <SpecRow label="Kategorie" value={vehicle.category} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <SpecRow label="Barva" value={vehicle.color} icon={<Palette className="h-3.5 w-3.5" />} />
                  <SpecRow label="Místa" value={vehicle.seats} icon={<Users className="h-3.5 w-3.5" />} />
                  <SpecRow label="Počet vlastníků" value={vehicle.ownerCount} icon={<Users className="h-3.5 w-3.5" />} />
                  <SpecRow label="Počet provozovatelů" value={vehicle.operatorCount} icon={<UserRound className="h-3.5 w-3.5" />} />
                  <SpecRow label="Číslo ORV" value={vehicle.orv} icon={<FileText className="h-3.5 w-3.5" />} />
                  <SpecRow label="Číslo TP" value={vehicle.tp} icon={<FileText className="h-3.5 w-3.5" />} />
                </dl>
              </InfoCard>
            </div>

            <section className="rounded-2xl border border-slate-300 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-xs text-slate-600 sm:px-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>VIN: {displayedVin}</span>
                </div>
                <span>Uživatel: {safeStr(result?.forUser)}</span>
                <span>Status odpovědi: {safeStr(payload?.Status)}</span>
              </div>
            </section>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
