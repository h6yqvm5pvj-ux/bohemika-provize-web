"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  BadgeCheck,
  Calculator,
  CalendarDays,
  CarFront,
  ChevronDown,
  ClipboardCopy,
  Fuel,
  Gauge,
  Info,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  TrendingDown,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { rsvVehicleLookupByVin } from "@/app/lib/rsv";
import { EstimateInputs } from "./components/EstimateInputs";
import { SautoPanel } from "./components/SautoPanel";
import {
  type Condition,
  type Damage,
  type Equipment,
  type Origin,
  type SautoMarketResponse,
  type ServiceHistory,
  type Usage,
} from "./types";
import {
  buildVehicleValuationEstimate,
  formatMultiplierLabel,
  roundTo,
  type VehicleValuationSummary,
} from "./valuation";

type VehicleData = Record<string, unknown>;

type LookupResult = {
  vin?: unknown;
  payload?: {
    Data?: VehicleData;
  };
};

type VehicleSummary = VehicleValuationSummary & {
  model: string;
  firstRegistrationLabel: string;
  displacement: number | null;
  color: string;
};

const CONDITION_LABELS: Record<Condition, string> = {
  excellent: "Výborný",
  good: "Dobrý",
  average: "Průměrný",
  worse: "Horší",
};
const SERVICE_HISTORY_LABELS: Record<ServiceHistory, string> = {
  full: "Doložená",
  partial: "Částečná",
  unknown: "Neznámá",
  none: "Bez doložení",
};
const ORIGIN_LABELS: Record<Origin, string> = {
  cz: "ČR",
  eu: "EU doložený",
  import: "Dovoz",
  unknown: "Neznámý",
};
const EQUIPMENT_LABELS: Record<Equipment, string> = {
  basic: "Základní",
  standard: "Standardní",
  high: "Nadstandardní",
  top: "Top výbava",
};
const DAMAGE_LABELS: Record<Damage, string> = {
  none: "Bez známého poškození",
  cosmetic: "Kosmetické vady",
  repaired: "Opravená větší škoda",
  unresolved: "Neopravené poškození",
};
const USAGE_LABELS: Record<Usage, string> = {
  private: "Soukromé",
  company: "Firemní",
  taxi: "Taxi / intenzivní",
  unknown: "Neznámé",
};

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function safeStr(value: unknown): string {
  if (!hasValue(value)) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

function normalizeVinInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!hasValue(value)) return null;
  const raw = String(value).replace(/\s+/g, " ").trim();
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function firstOf(data: VehicleData | null, keys: string[]): unknown {
  if (!data) return null;
  for (const key of keys) {
    if (key in data && hasValue(data[key])) return data[key];
  }
  return null;
}

function parseDateLoose(value: unknown): Date | null {
  if (!hasValue(value)) return null;
  const date = new Date(String(value).trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateCs(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("cs-CZ");
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("cs-CZ");
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readApiError(payload: unknown): string | null {
  const row = readObject(payload);
  if (!row) return null;
  const error = row.error ?? row.message ?? row.detail;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  return null;
}

function isSautoMarketResponse(payload: unknown): payload is SautoMarketResponse {
  const row = readObject(payload);
  return row?.ok === true && row.source === "sauto" && Array.isArray(row.listings) && readObject(row.stats) != null;
}

function StatBox({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const mountedRef = useRef(false);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const from = mountedRef.current ? previousValueRef.current : 0;
    previousValueRef.current = target;
    mountedRef.current = true;

    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    let frameId = 0;

    if (prefersReducedMotion || Math.abs(target - from) < 1) {
      frameId = window.requestAnimationFrame(() => setDisplayValue(target));
      return () => window.cancelAnimationFrame(frameId);
    }

    const durationMs = 850;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      setDisplayValue(progress >= 1 ? target : Math.round(next / 1000) * 1000);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return <span className={className}>{formatCurrency(displayValue)}</span>;
}

export default function VehicleValuationPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [vin, setVin] = useState("");
  const [vinFromQuery, setVinFromQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [inputsPanelOpen, setInputsPanelOpen] = useState(false);
  const autoLookupVinRef = useRef<string | null>(null);
  const compactVinInputRef = useRef<HTMLInputElement | null>(null);
  const [searchActivated, setSearchActivated] = useState(false);

  const [mileageKm, setMileageKm] = useState("");
  const [condition, setCondition] = useState<Condition>("good");
  const [serviceHistory, setServiceHistory] = useState<ServiceHistory>("unknown");
  const [origin, setOrigin] = useState<Origin>("unknown");
  const [equipment, setEquipment] = useState<Equipment>("standard");
  const [damage, setDamage] = useState<Damage>("none");
  const [usage, setUsage] = useState<Usage>("private");
  const [sautoLoading, setSautoLoading] = useState(false);
  const [sautoError, setSautoError] = useState<string | null>(null);
  const [sautoMarket, setSautoMarket] = useState<SautoMarketResponse | null>(null);
  const [sautoPanelActivated, setSautoPanelActivated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const qsVin = normalizeVinInput(new URLSearchParams(window.location.search).get("vin"));
    setVinFromQuery(qsVin);
  }, []);

  useEffect(() => {
    if (!vinFromQuery) return;
    setVin((prev) => (prev === vinFromQuery ? prev : vinFromQuery));
  }, [vinFromQuery]);

  const data = (result?.payload?.Data ?? null) as VehicleData | null;

  const summary = useMemo<VehicleSummary | null>(() => {
    if (!data) return null;

    const firstRegistrationRaw = firstOf(data, ["DatumPrvniRegistrace", "PrvniRegistrace"]);
    const firstRegistration = parseDateLoose(firstRegistrationRaw);
    const yearFromApi = toNumber(firstOf(data, ["RokVyroby", "VozidloRokVyroby"]));
    const year = yearFromApi ?? firstRegistration?.getFullYear() ?? null;

    return {
      brand: safeStr(firstOf(data, ["TovarniZnacka", "Znacka", "ZnackaVozidla"])),
      model: safeStr(firstOf(data, ["ObchodniOznaceni", "Model", "Typ"])),
      year,
      firstRegistration,
      firstRegistrationLabel: formatDateCs(firstRegistration),
      fuel: safeStr(firstOf(data, ["Palivo", "DruhPaliva"])),
      powerKw: toNumber(firstOf(data, ["MotorMaxVykon", "Vykon", "MaxVykon"])),
      displacement: toNumber(firstOf(data, ["MotorZdvihObjem", "ZdvihovyObjem", "ObjemMotoru"])),
      category: safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"])),
      body: safeStr(firstOf(data, ["DruhVozidla", "Typ", "VozidloKaroserieDruh"])),
      color: safeStr(firstOf(data, ["VozidloKaroserieBarva", "Barva", "BarvaVozidla"])),
      ownerCount: toNumber(firstOf(data, ["PocetVlastniku"])),
    };
  }, [data]);

  const canSearch = !!user && vin.trim().length >= 11;
  const mileageValue = toNumber(mileageKm);
  const isMileageFilled = mileageValue != null && mileageValue > 0;
  const detailFieldsTotal = 7;
  const detailFieldsDone = useMemo(() => {
    const completedDefaultSelects = 4;
    let done = completedDefaultSelects;
    if (isMileageFilled) done += 1;
    if (serviceHistory !== "unknown") done += 1;
    if (origin !== "unknown") done += 1;
    return done;
  }, [isMileageFilled, origin, serviceHistory]);
  const detailCompletionPct = Math.round((detailFieldsDone / detailFieldsTotal) * 100);
  const remainingHints = useMemo(() => {
    const hints: string[] = [];
    if (!isMileageFilled) hints.push("nájezd km");
    if (serviceHistory === "unknown") hints.push("servisní historii");
    if (origin === "unknown") hints.push("původ");
    return hints;
  }, [isMileageFilled, origin, serviceHistory]);
  const inputSummaryItems = useMemo(
    () => [
      { label: "Nájezd", value: isMileageFilled ? `${formatNumber(mileageValue)} km` : "Nedoplněn", muted: !isMileageFilled },
      { label: "Stav", value: CONDITION_LABELS[condition] },
      { label: "Servis", value: SERVICE_HISTORY_LABELS[serviceHistory], muted: serviceHistory === "unknown" },
      { label: "Původ", value: ORIGIN_LABELS[origin], muted: origin === "unknown" },
      { label: "Výbava", value: EQUIPMENT_LABELS[equipment] },
      { label: "Poškození", value: DAMAGE_LABELS[damage] },
      { label: "Užívání", value: USAGE_LABELS[usage] },
    ],
    [condition, damage, equipment, isMileageFilled, mileageValue, origin, serviceHistory, usage]
  );

  const estimate = useMemo(
    () =>
      buildVehicleValuationEstimate({
        summary,
        mileageKm: mileageValue,
        newPrice: null,
        condition,
        serviceHistory,
        origin,
        equipment,
        damage,
        usage,
      }),
    [condition, damage, equipment, mileageValue, origin, serviceHistory, summary, usage]
  );

  const hasVehicleForSauto = !!summary && summary.brand !== "—" && summary.model !== "—";
  const sautoCompact = sautoPanelActivated || sautoLoading || !!sautoMarket || !!sautoError;
  const marketRecommendation = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice)) return null;
    return roundTo(marketPrice * 0.7 + estimate.recommended * 0.3, 5_000);
  }, [estimate.recommended, sautoMarket?.stats.recommended]);
  const sautoVsInternalPct = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice) || estimate.recommended <= 0) return null;
    return ((marketPrice - estimate.recommended) / estimate.recommended) * 100;
  }, [estimate.recommended, sautoMarket?.stats.recommended]);
  const sautoDiffToneClass = useMemo(() => {
    if (sautoVsInternalPct == null) return "border-slate-200 bg-white text-slate-900";
    const abs = Math.abs(sautoVsInternalPct);
    if (abs <= 8) return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (abs <= 15) return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-rose-200 bg-rose-50 text-rose-800";
  }, [sautoVsInternalPct]);

  const handleSearchByVin = useCallback(async (value: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSautoError(null);
    setSautoMarket(null);

    try {
      const payload = (await rsvVehicleLookupByVin(value)) as LookupResult;
      setResult(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nepodařilo se načíst data vozidla.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    setSearchActivated(true);
    setInputsPanelOpen(true);
    await handleSearchByVin(vin);
  }, [handleSearchByVin, vin]);

  useEffect(() => {
    if (!user) return;
    if (vinFromQuery.length < 11) return;
    if (autoLookupVinRef.current === vinFromQuery) return;
    autoLookupVinRef.current = vinFromQuery;
    setSearchActivated(true);
    void handleSearchByVin(vinFromQuery);
  }, [handleSearchByVin, user, vinFromQuery]);

  useEffect(() => {
    setSautoError(null);
    setSautoMarket(null);
  }, [mileageKm, summary?.brand, summary?.displacement, summary?.fuel, summary?.model, summary?.powerKw, summary?.year]);

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

  useEffect(() => {
    if (!inputsPanelOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInputsPanelOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputsPanelOpen]);

  const handleResetVin = useCallback(() => {
    setVin("");
    setSearchActivated(false);
    setInputsPanelOpen(false);
    setSautoPanelActivated(false);
    setResult(null);
    setError(null);
    setSautoError(null);
    setSautoMarket(null);
  }, []);

  const handleSautoSearch = useCallback(async () => {
    setSautoPanelActivated(true);
    if (!user) {
      setSautoError("Přihlaš se, aby šlo načíst tržní data ze Sauto.");
      return;
    }

    if (!summary || !hasVehicleForSauto) {
      setSautoError("Nejdřív načti VIN, aby bylo jasné, jakou značku a model hledat.");
      return;
    }

    setSautoLoading(true);
    setSautoError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/vehicle-market/sauto", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          brand: summary.brand,
          model: summary.model,
          year: summary.year,
          mileageKm: mileageValue,
          fuel: summary.fuel,
          powerKw: summary.powerKw,
          displacement: summary.displacement,
          limit: 120,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isSautoMarketResponse(payload)) {
        throw new Error(readApiError(payload) ?? "Nepodařilo se načíst tržní data ze Sauto.");
      }

      setSautoMarket(payload);
    } catch (err: unknown) {
      setSautoError(err instanceof Error ? err.message : "Nepodařilo se načíst tržní data ze Sauto.");
    } finally {
      setSautoLoading(false);
    }
  }, [hasVehicleForSauto, mileageValue, summary, user]);

  const handleCopyResult = async () => {
    const text = [
      "Odhad ceny vozidla",
      `${summary?.brand ?? "Vozidlo"} ${summary?.model ?? ""}`.trim(),
      `VIN: ${safeStr(result?.vin ?? vin)}`,
      `Doporučená cena: ${formatCurrency(estimate.recommended)}`,
      `Obvyklé rozpětí: ${formatCurrency(estimate.rangeLow)} - ${formatCurrency(estimate.rangeHigh)}`,
      ...(marketRecommendation
        ? [
            `Tržní doporučení Sauto: ${formatCurrency(marketRecommendation)}`,
            `Sauto medián: ${formatCurrency(sautoMarket?.stats.median)}`,
            `Rozdíl Sauto vs interní odhad: ${formatSignedPercent(sautoVsInternalPct)}`,
          ]
        : []),
      `Spolehlivost odhadu: ${estimate.confidence}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AppLayout active="tools">
      <div className="mx-auto w-full max-w-6xl space-y-4 pb-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              <CarFront className="h-7 w-7 text-slate-700" />
              <span>Nacenění vozidla</span>
            </h1>
          </div>
          {searchActivated && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
              Výstup je orientační pomůcka pro nastavení pojistné částky u havarijního pojištění.
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

        {searchActivated && (
          <>
            <section className="space-y-4 rounded-xl border border-slate-100 bg-white px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-slate-700" />
                  <h2 className="text-lg font-semibold text-slate-900">Výsledek</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setInputsPanelOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    <Settings2 className="h-4 w-4" />
                    Upravit vstupy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyResult()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    {copied ? "Zkopírováno" : "Kopírovat"}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.48fr)]">
                <div className="min-h-[230px] rounded-2xl border border-emerald-200 bg-emerald-50/60 px-6 py-6 shadow-[0_12px_28px_rgba(16,185,129,0.10)]">
                  <div className="flex h-full flex-col justify-between gap-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
                        Doporučená cena pro pojištění
                      </div>
                      <div className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-800">
                        {estimate.confidence}
                      </div>
                    </div>

                    <AnimatedCurrency
                      value={estimate.recommended}
                      className="block text-6xl font-semibold leading-none tracking-tight text-emerald-700 tabular-nums"
                    />

                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span>Obvyklé rozpětí</span>
                      <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 font-semibold text-slate-900">
                        {formatCurrency(estimate.rangeLow)} - {formatCurrency(estimate.rangeHigh)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInputsPanelOpen(true)}
                  className={`rounded-xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    isMileageFilled ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <Settings2 className="h-4 w-4" />
                      Vstupy pro odhad
                    </div>
                    <div className="text-xs font-semibold text-slate-600">
                      {detailFieldsDone}/{detailFieldsTotal}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                    <div
                      className={`h-full rounded-full transition-all ${isMileageFilled ? "bg-emerald-500" : "bg-amber-400"}`}
                      style={{ width: `${detailCompletionPct}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {inputSummaryItems.slice(0, 5).map((item) => (
                      <span
                        key={item.label}
                        className={`rounded-full border bg-white/70 px-2 py-1 text-[11px] font-semibold ${
                          item.muted ? "border-amber-200 text-amber-800" : "border-slate-200 text-slate-700"
                        }`}
                      >
                        {item.label}: {item.value}
                      </span>
                    ))}
                  </div>
                  {remainingHints.length > 0 && (
                    <div className="mt-3 truncate text-xs text-slate-600">
                      Doplnit: <span className="font-semibold text-slate-800">{remainingHints.slice(0, 3).join(", ")}</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatBox label="Spolehlivost odhadu" value={estimate.confidence} icon={<BadgeCheck className="h-3.5 w-3.5" />} />
                <StatBox label="Stáří" value={`${estimate.ageYears} let`} icon={<CalendarDays className="h-3.5 w-3.5" />} />
                <StatBox label="Základ nového" value={formatCurrency(estimate.baseNewPrice)} icon={<TrendingDown className="h-3.5 w-3.5" />} />
              </div>

              <div className="rounded-lg border border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustmentsOpen((value) => !value)}
                  aria-expanded={adjustmentsOpen}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Settings2 className="h-4 w-4" />
                    Korekce odhadu
                  </span>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                    {estimate.adjustments.length}
                    <ChevronDown className={`h-4 w-4 transition-transform ${adjustmentsOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {adjustmentsOpen && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {estimate.adjustments.map((item) => (
                      <div key={`${item.label}-${item.note}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm">
                        <div>
                          <div className="font-semibold text-slate-900">{item.label}</div>
                          <div className="text-xs text-slate-500">{item.note}</div>
                        </div>
                        <div className={item.multiplier >= 1 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                          {formatMultiplierLabel(item.multiplier)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <SautoPanel
              compact={sautoCompact}
              loading={sautoLoading}
              error={sautoError}
              market={sautoMarket}
              hasVehicleForSauto={hasVehicleForSauto}
              onSearch={() => void handleSautoSearch()}
              searchDisabled={!user || !hasVehicleForSauto}
              marketRecommendation={marketRecommendation}
              internalEstimateRecommended={estimate.recommended}
              sautoDiffToneClass={sautoDiffToneClass}
              sautoVsInternalPct={sautoVsInternalPct}
              formatCurrency={formatCurrency}
              formatSignedPercent={formatSignedPercent}
              formatNumber={formatNumber}
            />

            <section className="rounded-xl border border-slate-100 bg-white px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-semibold text-slate-900">Data z registru</h2>
              </div>

              {!summary ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                  Zatím nejsou načtená data vozidla. Odhad výše stále funguje, ale spolehlivost bude nižší.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  <StatBox label="Vozidlo" value={`${summary.brand} ${summary.model}`} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <StatBox label="Rok / registrace" value={`${formatNumber(summary.year)} / ${summary.firstRegistrationLabel}`} icon={<CalendarDays className="h-3.5 w-3.5" />} />
                  <StatBox label="Výkon" value={`${formatNumber(summary.powerKw)} kW`} icon={<Gauge className="h-3.5 w-3.5" />} />
                  <StatBox label="Palivo" value={summary.fuel} icon={<Fuel className="h-3.5 w-3.5" />} />
                  <StatBox label="Objem" value={`${formatNumber(summary.displacement)} cm3`} icon={<Gauge className="h-3.5 w-3.5" />} />
                  <StatBox label="Kategorie" value={summary.category} icon={<Info className="h-3.5 w-3.5" />} />
                  <StatBox label="Karoserie" value={summary.body} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <StatBox label="Barva" value={summary.color} icon={<Info className="h-3.5 w-3.5" />} />
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {searchActivated && inputsPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Zavřít vstupy pro odhad"
            onClick={() => setInputsPanelOpen(false)}
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-inputs-title"
            className="relative z-10 flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-slate-700" />
                  <h2 id="estimate-inputs-title" className="text-lg font-semibold text-slate-900">
                    Upravit vstupy
                  </h2>
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {detailFieldsDone}/{detailFieldsTotal} doplněno
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInputsPanelOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <EstimateInputs
                mileageKm={mileageKm}
                setMileageKm={setMileageKm}
                condition={condition}
                setCondition={setCondition}
                serviceHistory={serviceHistory}
                setServiceHistory={setServiceHistory}
                origin={origin}
                setOrigin={setOrigin}
                equipment={equipment}
                setEquipment={setEquipment}
                damage={damage}
                setDamage={setDamage}
                usage={usage}
                setUsage={setUsage}
                isMileageFilled={isMileageFilled}
                detailFieldsDone={detailFieldsDone}
                detailFieldsTotal={detailFieldsTotal}
                detailCompletionPct={detailCompletionPct}
                remainingHints={remainingHints}
                frame="plain"
                showHeader={false}
              />
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setInputsPanelOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                Hotovo
              </button>
            </div>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
