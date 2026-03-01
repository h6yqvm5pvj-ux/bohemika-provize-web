"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  Activity,
  CalendarClock,
  CarFront,
  Copy,
  Gauge,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Weight,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
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
      "border-white/20 bg-white/[0.06] text-slate-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
    blue:
      "border-sky-200/45 bg-sky-400/15 text-sky-50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(186,230,253,0.35)]",
    green:
      "border-emerald-200/45 bg-emerald-400/15 text-emerald-50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(209,250,229,0.35)]",
    amber:
      "border-amber-200/45 bg-amber-400/15 text-amber-50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(254,243,199,0.35)]",
    rose:
      "border-rose-200/45 bg-rose-400/15 text-rose-50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,228,230,0.35)]",
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
      className={`relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.72),rgba(2,6,23,0.78))] px-4 py-4 backdrop-blur-xl shadow-[0_22px_60px_rgba(2,6,23,0.68)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="relative z-10 mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          {icon}
        </span>
        <h3 className="text-lg font-semibold text-white/95">{title}</h3>
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

function SpecRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2 last:border-b-0">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-100 text-right">{value}</dd>
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
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/[0.04] px-3 py-3 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
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
          <div className="text-sm font-bold text-slate-100">{fmtNumber(value)}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{unit}</div>
        </div>
      </div>
      <div className="text-xs font-medium text-slate-300">{label}</div>
    </div>
  );
}

export default function VehicleDataPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [copiedVin, setCopiedVin] = useState(false);
  const [copiedOrv, setCopiedOrv] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
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

    const stkRaw = firstOf(data, [
      "StkDo",
      "STKDo",
      "DatumStkDo",
      "TechnickaProhlidkaDo",
      "PlatnostStkDo",
    ]);
    const stkDo = fmtDateCZ(stkRaw);

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

    return {
      brand,
      model,
      color,
      firstReg,
      firstRegCz,
      year,
      stkDo,
      stkTone: stkTone(stkRaw),
      status: statusLabel(data),
      powerKw,
      displacement,
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
      engineMaker: safeStr(firstOf(data, ["VyrobceMotoru"])),
      co2: safeStr(firstOf(data, ["EmiseCo2Komb", "Co2", "CO2"])),
      noise: safeStr(firstOf(data, ["Hluk", "HlukJizda"])),
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

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = (await rsvVehicleLookupByVin(vin)) as LookupResult;
      setResult(data);
      setLoadedAt(new Date());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nepodařilo se načíst data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-[1000px] space-y-4">
        <header className="space-y-1">
          <SplitTitle text="Data o vozidle" />
          <p className="text-xs text-slate-300">
            Data z registru vozidel
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-300 hover:text-white transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[radial-gradient(circle_at_20%_-15%,rgba(56,189,248,0.22),transparent_45%),radial-gradient(circle_at_96%_0%,rgba(99,102,241,0.2),transparent_38%),linear-gradient(160deg,rgba(2,6,23,0.72),rgba(15,23,42,0.66))] px-3 py-3 sm:px-4 sm:py-4 space-y-3 backdrop-blur-2xl shadow-[0_22px_60px_rgba(2,6,23,0.5)]">
        <section className="relative z-10 rounded-3xl border border-white/15 bg-[linear-gradient(155deg,rgba(15,23,42,0.72),rgba(2,6,23,0.78))] px-4 py-4 backdrop-blur-xl shadow-[0_12px_35px_rgba(0,0,0,0.5)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Evidence Vozidel</h2>
              <p className="text-xs text-slate-300">Zadej VIN a načti datový přehled.</p>
            </div>

            {!user && (
              <Tag tone="amber">Přihlaš se, aby šlo volat API</Tag>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSearch && !loading) {
                  void handleSearch();
                }
              }}
              className="w-full rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2.5 text-sm text-white backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] outline-none focus:ring-2 focus:ring-sky-400/70 focus:border-sky-300/70"
              placeholder='např. "TMB..."'
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setVin("");
                  setResult(null);
                  setError(null);
                  setLoadedAt(null);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-white/25 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-white/40 hover:bg-white/[0.1] transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Vymazat
              </button>
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={loading || !canSearch}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-200/65 bg-[linear-gradient(135deg,rgba(56,189,248,0.42),rgba(59,130,246,0.3))] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(56,189,248,0.42),inset_0_1px_0_rgba(186,230,253,0.45)] backdrop-blur-md hover:brightness-110 hover:border-sky-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Načítám…" : "Vyhledat"}
              </button>
            </div>
          </div>

          {loadedAt && (
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
              Načteno: {loadedAt.toLocaleDateString("cs-CZ")} {loadedAt.toLocaleTimeString("cs-CZ")}
            </p>
          )}

          {error && (
            <p className="text-xs text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </section>

        {loading ? (
          <section className="rounded-3xl border border-white/15 bg-slate-950/55 px-4 py-4 space-y-3 animate-pulse backdrop-blur-lg">
            <div className="h-7 w-2/5 rounded-lg bg-white/10" />
            <div className="h-4 w-3/5 rounded-lg bg-white/10" />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-28 rounded-2xl bg-white/10" />
              <div className="h-28 rounded-2xl bg-white/10" />
              <div className="h-28 rounded-2xl bg-white/10" />
            </div>
            <div className="h-64 rounded-3xl bg-white/10" />
          </section>
        ) : !result ? (
          <section className="rounded-2xl border border-white/15 bg-slate-950/55 px-4 py-4 text-sm text-slate-300 backdrop-blur-lg">
            Zatím nic nezobrazuji. Zadej VIN a dej „Vyhledat“.
          </section>
        ) : !vehicle ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-950/30 px-4 py-4 text-sm text-amber-100">
            Odpověď neobsahuje validní data vozidla.
          </section>
        ) : (
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.2),transparent_36%),linear-gradient(145deg,rgba(2,6,23,0.78),rgba(15,23,42,0.72))] px-4 py-4 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.55)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone="neutral">OSOBNÍ AUTOMOBIL</Tag>
                    <Tag tone={statusTone(vehicle.status)}>{vehicle.status}</Tag>
                    <Tag tone={vehicle.stkTone}>
                      STK {vehicle.stkTone === "rose" ? "PO TERMÍNU" : vehicle.stkTone === "amber" ? "BRZY KONČÍ" : "OK"}
                    </Tag>
                  </div>

                  <div>
                    <h2 className="text-5xl leading-tight font-semibold text-white tracking-tight">
                      {vehicle.brand} <span className="text-sky-300">{vehicle.model}</span>
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
                      className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-sky-300/50 hover:text-sky-100 transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedVin ? "Zkopírováno" : "Kopírovat VIN"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyOrv()}
                      className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-sky-300/50 hover:text-sky-100 transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedOrv ? "Zkopírováno" : "Kopírovat ORV"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 min-w-[230px]">
                  <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Rok výroby</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{fmtNumber(vehicle.year)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">STK do</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{vehicle.stkDo}</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 col-span-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">1. registrace / ČR</div>
                    <div className="mt-1 text-sm font-semibold text-slate-100">
                      {vehicle.firstReg} <span className="text-slate-400">/</span> {vehicle.firstRegCz}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Výkon</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {fmtNumber(vehicle.powerKw)} <span className="text-sm text-slate-400">kW</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Objem</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {fmtNumber(vehicle.displacement)} <span className="text-sm text-slate-400">cm³</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Palivo</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">{vehicle.fuel}</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Místa</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">{vehicle.seats}</div>
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
                  <SpecRow label="Palivo" value={vehicle.fuel} />
                  <SpecRow label="Emisní norma" value={vehicle.emissionNorm} />
                  <SpecRow label="Spotřeba" value={vehicle.consumption} />
                </dl>
              </InfoCard>

              <InfoCard icon={<Ruler className="h-4 w-4" />} title="Rozměry, Kapacita a Obutí">
                <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                  <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-3 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Vizualizace rozměrů</div>
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
                      <text x="205" y="149" fill="#e2e8f0" textAnchor="middle" fontSize="13" fontWeight="700">
                        {fmtNumber(vehicle.lengthMm)} mm
                      </text>

                      <line x1="390" y1="64" x2="390" y2="124" stroke="#64748b" strokeWidth="2" />
                      <line x1="383" y1="64" x2="397" y2="64" stroke="#64748b" strokeWidth="2" />
                      <line x1="383" y1="124" x2="397" y2="124" stroke="#64748b" strokeWidth="2" />
                      <text x="390" y="98" fill="#e2e8f0" textAnchor="middle" fontSize="12" fontWeight="700">
                        {fmtNumber(vehicle.heightMm)}
                      </text>

                      <text x="205" y="176" fill="#94a3b8" textAnchor="middle" fontSize="11">
                        Rozvor: {fmtNumber(vehicle.wheelbaseMm)} mm · Šířka: {fmtNumber(vehicle.widthMm)} mm
                      </text>
                    </svg>
                  </div>

                  <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-3 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Schválené pneumatiky</div>
                    <div className="space-y-2">
                      {(tireItems.length ? tireItems : ["—"]).map((tire, idx) => (
                        <div
                          key={`${tire}-${idx}`}
                          className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-slate-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
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
                <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-3 space-y-2.5 backdrop-blur-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Vytížení</span>
                    <span className="text-sm font-bold text-slate-100">{fmtNumber(vehicle.utilizationPct)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden ring-1 ring-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 via-violet-400 to-rose-400"
                      style={{ width: `${Math.max(0, Math.min(vehicle.utilizationPct ?? 0, 100))}%` }}
                    />
                  </div>

                  <dl>
                    <SpecRow
                      label="Provozní"
                      value={vehicle.operatingWeight != null ? `${fmtNumber(vehicle.operatingWeight)} kg` : "—"}
                    />
                    <SpecRow
                      label="Povolená"
                      value={vehicle.maxWeight != null ? `${fmtNumber(vehicle.maxWeight)} kg` : "—"}
                    />
                    <SpecRow
                      label="Přípojné (brzděné)"
                      value={vehicle.trailerBraked !== "—" ? `${vehicle.trailerBraked} kg` : "—"}
                    />
                    <SpecRow
                      label="Přípojné (nebrzděné)"
                      value={vehicle.trailerUnbraked !== "—" ? `${vehicle.trailerUnbraked} kg` : "—"}
                    />
                  </dl>
                </div>
              </InfoCard>

              <InfoCard icon={<Activity className="h-4 w-4" />} title="Detail Motoru a Emise">
                <dl>
                  <SpecRow label="Typ motoru" value={vehicle.engineType} />
                  <SpecRow label="Výrobce motoru" value={vehicle.engineMaker} />
                  <SpecRow label="Číslo/Kód motoru" value={vehicle.engineCode} />
                  <SpecRow label="Emisní limit" value={vehicle.emissionNorm} />
                  <SpecRow label="CO₂ (komb.)" value={vehicle.co2} />
                  <SpecRow label="Hluk" value={vehicle.noise} />
                </dl>
              </InfoCard>

              <InfoCard icon={<CarFront className="h-4 w-4" />} title="Karoserie a Vzhled">
                <dl>
                  <SpecRow label="Druh vozidla" value={vehicle.vehicleType} />
                  <SpecRow label="Kategorie" value={vehicle.category} />
                  <SpecRow label="Barva" value={vehicle.color} />
                  <SpecRow label="Místa" value={vehicle.seats} />
                  <SpecRow label="Číslo ORV" value={vehicle.orv} />
                  <SpecRow label="Číslo TP" value={vehicle.tp} />
                </dl>
              </InfoCard>
            </div>

            <section className="rounded-2xl border border-white/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.65),rgba(2,6,23,0.75))] px-4 py-3 backdrop-blur-xl shadow-[0_12px_30px_rgba(2,6,23,0.5)]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  <span>VIN: {displayedVin}</span>
                </div>
                <span>Uživatel: {safeStr(result?.forUser)}</span>
                <span>Status odpovědi: {safeStr(payload?.Status)}</span>
              </div>
            </section>
          </div>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
