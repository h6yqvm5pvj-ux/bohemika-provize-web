"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  CarFront,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Eye,
  Gauge,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Thermometer,
  Trash2,
  Volume2,
  Wind,
  Wrench,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { rsvVehicleLookupByVin } from "@/app/lib/rsv";
import {
  buildWindshieldEstimate,
  inferWindshieldInputs,
  type CatalogGlassBasis,
  type CalibrationMode,
  type GlassQuality,
  type WindshieldInputs,
  type WindshieldVehicleSummary,
} from "./valuation";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const WINDSHIELD_LOADING_PHASES = [
  "Kontroluji formát VIN a připravuji dotaz",
  "Načítám technická data vozidla z registru",
  "Dopočítávám doporučený limit čelního skla",
] as const;

type VehicleData = Record<string, unknown>;

type LookupResult = {
  vin?: unknown;
  payload?: {
    Data?: VehicleData;
  };
};

type VehicleSummary = WindshieldVehicleSummary & {
  model: string;
  firstRegistrationLabel: string;
  displacement: number | null;
  color: string;
};

type PricingStrategy = "safe" | "selected" | "estimate";

type CatalogOffer = {
  id: string;
  priceInput: string;
  source: string;
  partNumber: string;
  note: string;
};

type ParsedCatalogOffer = CatalogOffer & {
  price: number;
};

type AutoKellyWindshieldOffer = {
  productId: string;
  name: string;
  code: string;
  brand: string;
  priceCzk: number;
  priceText: string;
  availability: string;
  url: string;
  isOriginal: boolean;
  kind: "original" | "aftermarket";
};

type AutoKellyPriceRangeStats = {
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
};

type AutoKellyWindshieldResponse = {
  ok: true;
  source: "autokelly";
  sourceUrl: string;
  fetchedAt: string;
  matched: {
    make: string;
    model: string;
    motor: string;
    categoryPath: string[];
  };
  offers: AutoKellyWindshieldOffer[];
  stats: {
    original: AutoKellyPriceRangeStats;
    aftermarket: AutoKellyPriceRangeStats;
    overall: AutoKellyPriceRangeStats;
  };
  originalCount: number;
  aftermarketCount: number;
  productCount: number;
};

const GLASS_QUALITY_LABELS: Record<GlassQuality, string> = {
  aftermarket: "Aftermarket",
  original: "Originální kvalita",
  dealer: "Autorizovaný servis",
};

const CALIBRATION_LABELS: Record<CalibrationMode, string> = {
  none: "Bez kalibrace",
  static: "Statická",
  dynamic: "Dynamická",
  full: "Statická + dynamická",
};

const PRICING_STRATEGY_LABELS: Record<PricingStrategy, string> = {
  safe: "Bezpečný limit",
  selected: "Konkrétní díl",
  estimate: "Odhad bez katalogu",
};

function createCatalogOffer(id: string): CatalogOffer {
  return {
    id,
    priceInput: "",
    source: "AutoKelly",
    partNumber: "",
    note: "",
  };
}

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

function parseMoneyInput(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!compact || compact === "-" || compact === "," || compact === ".") return null;

  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized =
      compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (hasComma) {
    const decimals = compact.split(",").at(-1)?.length ?? 0;
    normalized = decimals > 0 && decimals <= 2 ? compact.replace(",", ".") : compact.replace(/,/g, "");
  } else if (hasDot) {
    const decimals = compact.split(".").at(-1)?.length ?? 0;
    normalized = decimals === 3 ? compact.replace(/\./g, "") : compact;
  }

  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function isAutoKellyWindshieldResponse(value: unknown): value is AutoKellyWindshieldResponse {
  const row = readObject(value);
  if (!row || row.ok !== true || row.source !== "autokelly") return false;
  return Array.isArray(row.offers);
}

function formatCatalogPriceInput(value: number): string {
  return Math.round(value).toLocaleString("cs-CZ");
}

function formatAutoKellyRange(stats: AutoKellyPriceRangeStats): string {
  if (stats.count <= 0 || stats.min == null || stats.max == null) return "nenalezeno";
  if (stats.min === stats.max) return `${formatCurrency(stats.min)} (${stats.count}x)`;
  return `${formatCurrency(stats.min)} - ${formatCurrency(stats.max)} (${stats.count}x)`;
}

function autoKellyOfferNote(offer: AutoKellyWindshieldOffer): string {
  return [
    offer.kind === "original" ? "Origo" : "Neorigo",
    offer.name,
    offer.brand,
  ].filter((value) => value.trim().length > 0).join(" · ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function revealStyle(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
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

function SegmentControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeatureToggle({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`flex min-h-[58px] items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
        checked
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className={checked ? "text-emerald-700" : "text-slate-500"}>{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function WindshieldLoadingState({ phaseIndex }: { phaseIndex: number }) {
  const safePhaseIndex = clamp(phaseIndex, 0, WINDSHIELD_LOADING_PHASES.length - 1);
  const progressPct = ((safePhaseIndex + 1) / WINDSHIELD_LOADING_PHASES.length) * 100;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/60 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="pointer-events-none absolute -left-20 top-8 h-36 w-36 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-36 w-36 rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative">
        <div className="flex items-start gap-4">
          <div className="relative mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <span className="absolute inset-0 rounded-2xl border border-emerald-300/70 motion-safe:animate-ping" />
            <Wind className="h-5 w-5 text-emerald-700 motion-safe:animate-bounce" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
              <Loader2 className="h-4 w-4 text-emerald-700 motion-safe:animate-spin" />
              Načítám data pro nacenění skla
            </div>
            <p className="mt-1 text-sm text-slate-600">{WINDSHIELD_LOADING_PHASES[safePhaseIndex]}</p>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-100/90">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-sky-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {WINDSHIELD_LOADING_PHASES.map((phase, idx) => {
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

export default function WindshieldValuationPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [vin, setVin] = useState("");
  const [vinFromQuery, setVinFromQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchActivated, setSearchActivated] = useState(false);
  const [inputs, setInputs] = useState<WindshieldInputs>(() => inferWindshieldInputs(null));
  const [pricingStrategy, setPricingStrategy] = useState<PricingStrategy>("safe");
  const [catalogOffers, setCatalogOffers] = useState<CatalogOffer[]>(() => [createCatalogOffer("catalog-1")]);
  const [selectedCatalogOfferId, setSelectedCatalogOfferId] = useState("catalog-1");
  const [autokellyLoading, setAutokellyLoading] = useState(false);
  const [autokellyError, setAutokellyError] = useState<string | null>(null);
  const [autokellyResult, setAutokellyResult] = useState<AutoKellyWindshieldResponse | null>(null);
  const [selectedAutoKellyOfferId, setSelectedAutoKellyOfferId] = useState<string | null>(null);
  const nextCatalogOfferIdRef = useRef(2);
  const autoLookupVinRef = useRef<string | null>(null);
  const autoKellyLookupKeyRef = useRef<string | null>(null);
  const compactVinInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);

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
    if (!loading) return;
    setLoadingPhaseIndex(0);
    const interval = window.setInterval(() => {
      setLoadingPhaseIndex((current) => (current + 1) % WINDSHIELD_LOADING_PHASES.length);
    }, 900);
    return () => window.clearInterval(interval);
  }, [loading]);

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
    };
  }, [data]);

  useEffect(() => {
    if (!summary) return;
    setInputs(inferWindshieldInputs(summary));
  }, [summary]);

  const canSearch = !!user && vin.trim().length >= 11;
  const parsedCatalogOffers = useMemo<ParsedCatalogOffer[]>(
    () =>
      catalogOffers
        .map((offer) => {
          const price = parseMoneyInput(offer.priceInput);
          return price == null ? null : { ...offer, price };
        })
        .filter((offer): offer is ParsedCatalogOffer => offer != null),
    [catalogOffers]
  );
  const selectedCatalogOffer = useMemo(
    () => parsedCatalogOffers.find((offer) => offer.id === selectedCatalogOfferId) ?? null,
    [parsedCatalogOffers, selectedCatalogOfferId]
  );
  const highestCatalogOffer = useMemo(
    () =>
      parsedCatalogOffers.reduce<ParsedCatalogOffer | null>(
        (best, offer) => (best == null || offer.price > best.price ? offer : best),
        null
      ),
    [parsedCatalogOffers]
  );
  const invalidCatalogOfferCount = useMemo(
    () => catalogOffers.filter((offer) => offer.priceInput.trim().length > 0 && parseMoneyInput(offer.priceInput) == null).length,
    [catalogOffers]
  );
  const catalogBasis = useMemo<CatalogGlassBasis | null>(() => {
    if (pricingStrategy === "estimate") return null;
    const offer = pricingStrategy === "selected" ? selectedCatalogOffer : highestCatalogOffer;
    if (!offer) return null;
    return {
      price: offer.price,
      label: offer.note.trim() || "Katalogová varianta",
      source: offer.source.trim(),
      partNumber: offer.partNumber.trim(),
      variantCount: parsedCatalogOffers.length,
      strategy: pricingStrategy === "selected" ? "selected" : "highest",
    };
  }, [highestCatalogOffer, parsedCatalogOffers.length, pricingStrategy, selectedCatalogOffer]);
  const estimate = useMemo(
    () => buildWindshieldEstimate({ summary, inputs, catalogBasis }),
    [catalogBasis, inputs, summary]
  );
  const displayedVin = safeStr(result?.vin ?? vin);
  const vehicleLabel = summary ? `${summary.brand} ${summary.model}`.trim() : "Vozidlo";
  const visibleAutoKellyOffers = autokellyResult?.offers ?? [];
  const hasMoreAutoKellyOffers = (autokellyResult?.offers.length ?? 0) > visibleAutoKellyOffers.length;
  const selectedAutoKellyOffer =
    autokellyResult?.offers.find((offer) => offer.productId === selectedAutoKellyOfferId) ?? autokellyResult?.offers[0] ?? null;
  const selectedAutoKellyPreviewUrl = selectedAutoKellyOffer?.url || autokellyResult?.sourceUrl || "";
  const selectedAutoKellyGlassLabel = catalogBasis
    ? formatCurrency(catalogBasis.price)
    : "odhad bez katalogové ceny";

  const resetCatalogOffers = useCallback(() => {
    nextCatalogOfferIdRef.current = 2;
    autoKellyLookupKeyRef.current = null;
    setPricingStrategy("safe");
    setCatalogOffers([createCatalogOffer("catalog-1")]);
    setSelectedCatalogOfferId("catalog-1");
    setAutokellyLoading(false);
    setAutokellyError(null);
    setAutokellyResult(null);
    setSelectedAutoKellyOfferId(null);
  }, []);

  const handleSearchByVin = useCallback(async (value: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setInputs(inferWindshieldInputs(null));
    resetCatalogOffers();

    try {
      const payload = (await rsvVehicleLookupByVin(value)) as LookupResult;
      setResult(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : readApiError(err) ?? "Nepodařilo se načíst data vozidla.");
    } finally {
      setLoading(false);
    }
  }, [resetCatalogOffers]);

  const handleSearch = useCallback(async () => {
    setSearchActivated(true);
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
    if (!searchActivated || loading || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      resultScrollTargetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, searchActivated]);

  const handleResetVin = useCallback(() => {
    setVin("");
    setSearchActivated(false);
    setResult(null);
    setError(null);
    setInputs(inferWindshieldInputs(null));
    resetCatalogOffers();
  }, [resetCatalogOffers]);

  const updateInput = <K extends keyof WindshieldInputs,>(key: K, value: WindshieldInputs[K]) => {
    setInputs((prev) => {
      if (key === "calibration" && !prev.camera) {
        return { ...prev, calibration: "none" };
      }

      const next = { ...prev, [key]: value };
      if (key === "camera" && value === true && next.calibration === "none") {
        next.calibration = "dynamic";
      }
      if (key === "camera" && value === false) {
        next.calibration = "none";
      }
      return next;
    });
  };

  const updateCatalogOffer = <K extends keyof CatalogOffer,>(id: string, key: K, value: CatalogOffer[K]) => {
    setCatalogOffers((prev) => prev.map((offer) => (offer.id === id ? { ...offer, [key]: value } : offer)));
  };

  const addCatalogOffer = () => {
    const id = `catalog-${nextCatalogOfferIdRef.current}`;
    nextCatalogOfferIdRef.current += 1;
    const lastSource = catalogOffers.at(-1)?.source?.trim() || "AutoKelly";
    setCatalogOffers((prev) => [...prev, { ...createCatalogOffer(id), source: lastSource }]);
    setSelectedCatalogOfferId(id);
  };

  const removeCatalogOffer = (id: string) => {
    const next = catalogOffers.filter((offer) => offer.id !== id);
    if (next.length === 0) {
      nextCatalogOfferIdRef.current = 2;
      setCatalogOffers([createCatalogOffer("catalog-1")]);
      setSelectedCatalogOfferId("catalog-1");
      return;
    }

    setCatalogOffers(next);
    if (selectedCatalogOfferId === id) {
      setSelectedCatalogOfferId(next[0].id);
    }
  };

  const selectCatalogOffer = (id: string) => {
    setSelectedCatalogOfferId(id);
    setPricingStrategy("selected");
  };

  const selectAutoKellyOffer = (offer: AutoKellyWindshieldOffer) => {
    setSelectedAutoKellyOfferId(offer.productId);
    const catalogOffer = catalogOffers.find((item) => item.id.startsWith(`autokelly-${offer.productId}-`));
    if (catalogOffer) {
      setSelectedCatalogOfferId(catalogOffer.id);
      setPricingStrategy("selected");
    }
  };

  const handleAutoKellyLookup = useCallback(async () => {
    if (!user) {
      setAutokellyError("Přihlaš se, aby šlo načíst ceny z AutoKelly.");
      return;
    }

    if (!summary) {
      setAutokellyError("Nejdřív načti VIN, aby bylo jasné vozidlo pro AutoKelly.");
      return;
    }

    setAutokellyLoading(true);
    setAutokellyError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/vehicle-market/autokelly-windshield", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          vin: normalizeVinInput(vin),
          brand: summary.brand,
          model: summary.model,
          year: summary.year,
          firstRegistrationYear: summary.firstRegistration?.getFullYear() ?? null,
          fuel: summary.fuel,
          powerKw: summary.powerKw,
          displacement: summary.displacement,
          category: summary.category,
          body: summary.body,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isAutoKellyWindshieldResponse(payload)) {
        throw new Error(readApiError(payload) ?? "Nepodařilo se načíst AutoKelly.");
      }

      const offers = payload.offers.map((offer, index) => ({
        id: `autokelly-${offer.productId}-${index + 1}`,
        priceInput: formatCatalogPriceInput(offer.priceCzk),
        source: "AutoKelly",
        partNumber: offer.code,
        note: autoKellyOfferNote(offer),
      }));

      if (offers.length === 0) {
        throw new Error("AutoKelly nenašlo naceněnou čelní variantu.");
      }

      const originalOffers = payload.offers
        .map((offer, index) => ({ offer, index }))
        .filter((item) => item.offer.kind === "original");
      const selectionPool = originalOffers.length > 0 ? originalOffers : payload.offers.map((offer, index) => ({ offer, index }));
      const defaultOfferIndex = selectionPool.reduce(
        (best, current) => (current.offer.priceCzk < best.offer.priceCzk ? current : best),
        selectionPool[0]
      ).index;

      nextCatalogOfferIdRef.current = offers.length + 1;
      setCatalogOffers(offers);
      setSelectedCatalogOfferId(offers[defaultOfferIndex]?.id ?? offers[0].id);
      setSelectedAutoKellyOfferId(payload.offers[defaultOfferIndex]?.productId ?? null);
      setPricingStrategy("selected");
      setAutokellyResult(payload);
    } catch (err: unknown) {
      setAutokellyError(err instanceof Error ? err.message : "Nepodařilo se načíst AutoKelly.");
      setAutokellyResult(null);
    } finally {
      setAutokellyLoading(false);
    }
  }, [summary, user, vin]);

  useEffect(() => {
    if (!searchActivated || loading || !user || !summary) return;
    const normalizedVin = normalizeVinInput(vin);
    if (normalizedVin.length < 11) return;

    const key = [
      normalizedVin,
      summary.brand,
      summary.model,
      summary.year ?? "",
      summary.powerKw ?? "",
      summary.fuel,
    ].join("|");
    if (autoKellyLookupKeyRef.current === key) return;
    autoKellyLookupKeyRef.current = key;
    void handleAutoKellyLookup();
  }, [handleAutoKellyLookup, loading, searchActivated, summary, user, vin]);

  const handleCopyResult = async () => {
    const activeFeatures = [
      inputs.rainSensor ? "senzor" : null,
      inputs.camera ? "kamera/ADAS" : null,
      inputs.heated ? "vyhřívání" : null,
      inputs.hud ? "HUD" : null,
      inputs.acoustic ? "akustické sklo" : null,
      inputs.antenna ? "anténa" : null,
    ].filter(Boolean);

    const text = [
      "Odhad ceny čelního skla",
      vehicleLabel,
      `VIN: ${displayedVin}`,
      `Odhad výměny: ${formatCurrency(estimate.replacementTotal)}`,
      `Doporučený limit skel: ${formatCurrency(estimate.recommendedLimit)}`,
      `Obvyklé rozpětí: ${formatCurrency(estimate.rangeLow)} - ${formatCurrency(estimate.rangeHigh)}`,
      ...(catalogBasis
        ? [
            `Katalogový podklad: ${formatCurrency(catalogBasis.price)} (${PRICING_STRATEGY_LABELS[pricingStrategy]})`,
            ...(catalogBasis.source ? [`Zdroj: ${catalogBasis.source}`] : []),
          ]
        : [`Kvalita skla: ${GLASS_QUALITY_LABELS[inputs.quality]}`]),
      ...(parsedCatalogOffers.length > 1
        ? [`Nalezené varianty: ${parsedCatalogOffers.map((offer) => formatCurrency(offer.price)).join(", ")}`]
        : []),
      ...(autokellyResult
        ? [
            `AutoKelly origo: ${formatAutoKellyRange(autokellyResult.stats.original)}`,
            `AutoKelly neorigo: ${formatAutoKellyRange(autokellyResult.stats.aftermarket)}`,
            `AutoKelly celkem: ${formatAutoKellyRange(autokellyResult.stats.overall)}`,
          ]
        : []),
      `Kalibrace: ${CALIBRATION_LABELS[inputs.calibration]}`,
      `Prvky skla: ${activeFeatures.length ? activeFeatures.join(", ") : "bez doplňkových prvků"}`,
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
      <div className="windshield-tool-shell mx-auto w-full max-w-6xl space-y-5 pb-10 md:[zoom:0.92] xl:[zoom:0.86]">
        <section className="windshield-reveal px-2 py-10 sm:px-4 sm:py-14" style={revealStyle(20)}>
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <div className="windshield-float inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Rychlý odhad skel
              </div>
              <h1 className={`${headingFont.className} windshield-hero-title mx-auto mt-5 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight text-slate-900 sm:text-6xl md:text-7xl`}>
                Nacenění čelního skla
                <span className="block text-sky-600">během pár vteřin</span>
              </h1>
            </div>

            <div className="windshield-glow mx-auto mt-8 w-full max-w-4xl rounded-[30px] border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/60">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2">
                  <Search className="h-8 w-8 text-slate-400" />
                  <input
                    ref={compactVinInputRef}
                    autoFocus
                    type="text"
                    value={vin}
                    onChange={(event) => setVin(normalizeVinInput(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                    }}
                    className="w-full border-none bg-transparent text-xl font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    placeholder='např. "WAUZZZ..."'
                  />
                </div>
                <div className="flex flex-wrap gap-2 px-2 pb-2 md:px-0 md:pb-0">
                  <button
                    type="button"
                    onClick={handleResetVin}
                    className="inline-flex h-16 items-center gap-2 rounded-[22px] border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Vymazat
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSearch()}
                    disabled={loading || !canSearch}
                    className="windshield-cta group inline-flex h-16 items-center justify-center gap-3 rounded-[22px] border border-emerald-900/30 bg-[linear-gradient(135deg,#0f766e_0%,#059669_48%,#22c55e_100%)] px-8 text-lg font-semibold tracking-tight text-white shadow-[0_16px_36px_rgba(5,150,105,0.34),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {loading ? "Načítám..." : "Načíst data"}
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25 transition group-hover:translate-x-0.5">
                      {loading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <ChevronRight className="h-5 w-5" />}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mx-auto mt-5 max-w-4xl text-center">
              {searchActivated && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                  VIN → doporučená cena výměny čelního skla.
                </div>
              )}
              {!user && (
                <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Přihlaš se, aby šlo volat data o vozidle.
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
          <div className="windshield-reveal" style={revealStyle(60)}>
            <WindshieldLoadingState phaseIndex={loadingPhaseIndex} />
          </div>
        )}

        {searchActivated && !loading && (
          <>
            <section className="windshield-reveal mx-auto max-w-4xl space-y-4 rounded-xl border border-slate-100 bg-white px-4 py-4" style={revealStyle(80)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-slate-700" />
                  <h2 className="text-lg font-semibold text-slate-900">Doporučená cena</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyResult()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {copied ? "Zkopírováno" : "Kopírovat"}
                </button>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-7 text-center shadow-[0_12px_28px_rgba(16,185,129,0.10)] sm:px-8 sm:py-9">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">
                  Doporučená cena výměny skla
                </div>

                <div className="mt-5 text-6xl font-semibold leading-none tracking-tight text-emerald-700 tabular-nums sm:text-7xl">
                  {formatCurrency(estimate.recommendedLimit)}
                </div>

                <div className="mt-4 text-sm font-medium text-slate-700">
                  {vehicleLabel} · VIN {displayedVin}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-600">
                  <span className="rounded-full border border-emerald-200 bg-white/85 px-3 py-1 font-semibold text-slate-900">
                    Rozptyl {formatCurrency(estimate.rangeLow)} - {formatCurrency(estimate.rangeHigh)}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-white/85 px-3 py-1 font-semibold text-slate-900">
                    Výměna {formatCurrency(estimate.replacementTotal)}
                  </span>
                </div>

                <div className="mt-5 text-xs font-medium text-slate-600">
                  {autokellyLoading
                    ? "AutoKelly právě hledá odpovídající čelní skla."
                    : autokellyResult
                      ? `AutoKelly: ${autokellyResult.offers.length} nálezů · Origo ${formatAutoKellyRange(
                          autokellyResult.stats.original
                        )} · Neorigo ${formatAutoKellyRange(autokellyResult.stats.aftermarket)}`
                      : autokellyError
                        ? autokellyError
                        : "Cena se dopočítá automaticky po načtení AutoKelly."}
                </div>
              </div>
            </section>

            <details className="windshield-reveal rounded-xl border border-slate-100 bg-white px-4 py-4" style={revealStyle(120)}>
              <summary className="flex cursor-pointer list-none flex-col gap-1 text-sm font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <Search className="h-5 w-5 text-slate-700" />
                  Nálezy a rozpad ceny
                </span>
                <span className="text-xs font-medium text-slate-500">
                  AutoKelly varianty, práce, materiál a kalibrace
                </span>
              </summary>

              <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
              <div className="space-y-4 rounded-xl border border-slate-100 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-slate-700" />
                    <h2 className="text-lg font-semibold text-slate-900">AutoKelly nálezy</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAutoKellyLookup()}
                    disabled={autokellyLoading || !user || !summary}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {autokellyLoading ? "Načítám..." : "Znovu načíst"}
                  </button>
                </div>

                {autokellyLoading && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                    Hledám čelní skla v AutoKelly podle načteného VIN a motorizace.
                  </div>
                )}

                {autokellyError && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {autokellyError}
                  </p>
                )}

                {autokellyResult ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <StatBox
                        label="Origo skla"
                        value={formatAutoKellyRange(autokellyResult.stats.original)}
                        icon={<BadgeCheck className="h-3.5 w-3.5" />}
                      />
                      <StatBox
                        label="Neorigo skla"
                        value={formatAutoKellyRange(autokellyResult.stats.aftermarket)}
                        icon={<Wind className="h-3.5 w-3.5" />}
                      />
                      <StatBox
                        label="Použito pro limit"
                        value={selectedAutoKellyGlassLabel}
                        icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      />
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Nalezeno {autokellyResult.offers.length} variant · {autokellyResult.matched.motor}
                      </span>
                      <a
                        href={autokellyResult.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-emerald-800 underline-offset-2 hover:underline"
                      >
                        Otevřít katalog
                      </a>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]">
                      <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-100 bg-slate-50/50">
                        <div className="divide-y divide-slate-100">
                          {visibleAutoKellyOffers.map((offer) => {
                            const active = selectedAutoKellyOffer?.productId === offer.productId;
                            return (
                              <button
                                key={offer.productId}
                                type="button"
                                onClick={() => selectAutoKellyOffer(offer)}
                                className={`grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-3 text-left text-sm transition ${
                                  active
                                    ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                                    : "bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                        offer.kind === "original"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {offer.kind === "original" ? "Origo" : "Neorigo"}
                                    </span>
                                    <span className="truncate font-semibold text-slate-900">{offer.name}</span>
                                  </div>
                                  <div className="mt-1 truncate text-xs text-slate-500">
                                    {offer.brand || "AutoKelly"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 whitespace-nowrap text-base font-semibold text-slate-950">
                                  {formatCurrency(offer.priceCzk)}
                                  <Eye className={`h-4 w-4 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {selectedAutoKellyOffer && (
                        <div className="rounded-lg border border-slate-100 bg-white">
                          <div className="space-y-3 border-b border-slate-100 px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                      selectedAutoKellyOffer.kind === "original"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {selectedAutoKellyOffer.kind === "original" ? "Origo" : "Neorigo"}
                                  </span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Cena s DPH
                                  </span>
                                </div>
                                <h3 className="mt-1 text-sm font-semibold text-slate-950">
                                  {selectedAutoKellyOffer.name}
                                </h3>
                              </div>
                              <div className="text-2xl font-semibold text-slate-950">
                                {formatCurrency(selectedAutoKellyOffer.priceCzk)}
                              </div>
                            </div>

                            <div className="grid gap-2 text-xs">
                              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="font-semibold uppercase tracking-wide text-slate-500">Výrobce</div>
                                <div className="mt-1 font-semibold text-slate-900">{selectedAutoKellyOffer.brand || "—"}</div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => selectAutoKellyOffer(selectedAutoKellyOffer)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Použít pro limit
                              </button>
                              {selectedAutoKellyPreviewUrl && (
                                <a
                                  href={selectedAutoKellyPreviewUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Otevřít v AutoKelly
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="p-3">
                            {selectedAutoKellyPreviewUrl ? (
                              <>
                                <div className="h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  <iframe
                                    key={selectedAutoKellyPreviewUrl}
                                    title={`AutoKelly ${selectedAutoKellyOffer.code || selectedAutoKellyOffer.name}`}
                                    src={selectedAutoKellyPreviewUrl}
                                    className="h-full w-full bg-white"
                                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                                  />
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                  Pokud AutoKelly náhled blokuje, otevři položku přes tlačítko výše.
                                </p>
                              </>
                            ) : (
                              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                                AutoKelly u této položky neposlalo detailní odkaz.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {hasMoreAutoKellyOffers && (
                      <p className="text-xs text-slate-500">
                        Zobrazuji prvních {visibleAutoKellyOffers.length} nálezů. Do rozpětí a limitu se počítají všechny načtené ceny.
                      </p>
                    )}
                  </>
                ) : !autokellyLoading && !autokellyError ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                    Po načtení VIN se AutoKelly spustí automaticky. Když katalog cenu nenajde, výpočet použije odhad podle vozidla.
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-xl border border-slate-100 bg-white px-4 py-4">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-slate-700" />
                  <h2 className="text-lg font-semibold text-slate-900">Rozpad ceny</h2>
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {estimate.lines.map((line) => (
                    <div key={`${line.label}-${line.note}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm">
                      <div>
                        <div className="font-semibold text-slate-900">{line.label}</div>
                        <div className="text-xs text-slate-500">{line.note}</div>
                      </div>
                      <div className={line.amount < 0 ? "font-semibold text-amber-700" : "font-semibold text-slate-900"}>
                        {line.amount < 0 ? `-${formatCurrency(Math.abs(line.amount))}` : formatCurrency(line.amount)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StatBox label="Součet výměny" value={formatCurrency(estimate.replacementTotal)} icon={<Wrench className="h-3.5 w-3.5" />} />
                  <StatBox label="Spolehlivost" value={`${estimate.confidenceScore}/100`} icon={<BadgeCheck className="h-3.5 w-3.5" />} />
                </div>
              </div>
              </section>
            </details>

            <details className="windshield-reveal rounded-xl border border-slate-100 bg-white px-4 py-4" style={revealStyle(160)}>
              <summary className="flex cursor-pointer list-none flex-col gap-1 text-sm font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-slate-700" />
                  Pokročilé upřesnění
                </span>
                <span className="text-xs font-medium text-slate-500">
                  ruční ceny, výbava skla, kvalita a kalibrace
                </span>
              </summary>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
                <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Katalogové varianty skla
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAutoKellyLookup()}
                        disabled={autokellyLoading || !user || !summary}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Search className="h-3.5 w-3.5" />
                        {autokellyLoading ? "Načítám AutoKelly..." : "Načíst z AutoKelly"}
                      </button>
                      <button
                        type="button"
                        onClick={addCatalogOffer}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Přidat variantu
                      </button>
                    </div>
                  </div>

                  <SegmentControl
                    label="Strategie ceny dílu"
                    value={pricingStrategy}
                    onChange={setPricingStrategy}
                    options={[
                      { value: "safe", label: "Bezpečný limit" },
                      { value: "selected", label: "Konkrétní díl" },
                      { value: "estimate", label: "Odhad" },
                    ]}
                  />

                  <div className="space-y-2">
                    {catalogOffers.map((offer, index) => {
                      const price = parseMoneyInput(offer.priceInput);
                      const invalid = offer.priceInput.trim().length > 0 && price == null;
                      const selected = selectedCatalogOfferId === offer.id;
                      const chosen =
                        pricingStrategy === "selected" && selected && price != null
                          ? true
                          : pricingStrategy === "safe" && highestCatalogOffer?.id === offer.id && price != null;

                      return (
                        <div
                          key={offer.id}
                          className={`rounded-lg border bg-white px-3 py-3 transition ${
                            chosen
                              ? "border-emerald-300 shadow-[0_8px_18px_rgba(16,185,129,0.10)]"
                              : invalid
                                ? "border-amber-300"
                                : "border-slate-200"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => selectCatalogOffer(offer.id)}
                              className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
                                selected ? "text-emerald-700" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                                  selected ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                                }`}
                              >
                                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </span>
                              Varianta {index + 1}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCatalogOffer(offer.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
                              aria-label={`Odebrat variantu ${index + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="relative min-w-0">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={offer.priceInput}
                                onChange={(event) => updateCatalogOffer(offer.id, "priceInput", event.target.value)}
                                className={`w-full min-w-0 rounded-lg border bg-white px-3 py-2 pr-11 text-sm font-medium text-slate-900 outline-none transition ${
                                  invalid
                                    ? "border-amber-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                    : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                }`}
                                placeholder="Cena s DPH"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                                Kč
                              </span>
                            </div>
                            <input
                              type="text"
                              value={offer.source}
                              onChange={(event) => updateCatalogOffer(offer.id, "source", event.target.value)}
                              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                placeholder="Zdroj"
                              />
                            <input
                              type="text"
                              value={offer.note}
                              onChange={(event) => updateCatalogOffer(offer.id, "note", event.target.value)}
                              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 sm:col-span-2"
                              placeholder="Poznámka"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-slate-600">
                    {catalogBasis
                      ? `${PRICING_STRATEGY_LABELS[pricingStrategy]} používá ${formatCurrency(catalogBasis.price)}.`
                      : invalidCatalogOfferCount > 0
                        ? "Některá katalogová cena není čitelná."
                        : "Bez katalogové varianty se cena skla dopočítá odhadem."}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FeatureToggle
                      checked={inputs.rainSensor}
                      onChange={() => updateInput("rainSensor", !inputs.rainSensor)}
                      label="Dešťový / světelný senzor"
                      icon={<Gauge className="h-4 w-4" />}
                    />
                    <FeatureToggle
                      checked={inputs.camera}
                      onChange={() => updateInput("camera", !inputs.camera)}
                      label="Kamera / ADAS"
                      icon={<Camera className="h-4 w-4" />}
                    />
                    <FeatureToggle
                      checked={inputs.heated}
                      onChange={() => updateInput("heated", !inputs.heated)}
                      label="Vyhřívané sklo"
                      icon={<Thermometer className="h-4 w-4" />}
                    />
                    <FeatureToggle
                      checked={inputs.hud}
                      onChange={() => updateInput("hud", !inputs.hud)}
                      label="Head-up display"
                      icon={<ShieldCheck className="h-4 w-4" />}
                    />
                    <FeatureToggle
                      checked={inputs.acoustic}
                      onChange={() => updateInput("acoustic", !inputs.acoustic)}
                      label="Akustické / termo sklo"
                      icon={<Volume2 className="h-4 w-4" />}
                    />
                    <FeatureToggle
                      checked={inputs.antenna}
                      onChange={() => updateInput("antenna", !inputs.antenna)}
                      label="Anténa ve skle"
                      icon={<Wind className="h-4 w-4" />}
                    />
                  </div>

                  <SegmentControl
                    label="Kvalita skla"
                    value={inputs.quality}
                    onChange={(value) => updateInput("quality", value)}
                    options={[
                      { value: "aftermarket", label: "Aftermarket" },
                      { value: "original", label: "Originální" },
                      { value: "dealer", label: "Autorizovaný" },
                    ]}
                  />

                  <SegmentControl
                    label="Kalibrace"
                    value={inputs.calibration}
                    onChange={(value) => updateInput("calibration", value)}
                    options={[
                      { value: "none", label: "Bez" },
                      { value: "static", label: "Statická" },
                      { value: "dynamic", label: "Dynamická" },
                      { value: "full", label: "Obě" },
                    ]}
                  />
                </div>
              </div>
            </details>

            <details className="windshield-reveal rounded-xl border border-slate-100 bg-white px-4 py-4" style={revealStyle(200)}>
              <summary className="flex cursor-pointer list-none flex-col gap-1 text-sm font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <CarFront className="h-5 w-5 text-slate-700" />
                  Data z registru
                </span>
                <span className="text-xs font-medium text-slate-500">{vehicleLabel}</span>
              </summary>

              <div className="mt-4">
              {!summary ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                  Zatím nejsou načtená data vozidla. Odhad výše používá obecný segment.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  <StatBox label="Vozidlo" value={`${summary.brand} ${summary.model}`} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <StatBox label="Rok / registrace" value={`${formatNumber(summary.year)} / ${summary.firstRegistrationLabel}`} icon={<CalendarDays className="h-3.5 w-3.5" />} />
                  <StatBox label="Výkon" value={`${formatNumber(summary.powerKw)} kW`} icon={<Gauge className="h-3.5 w-3.5" />} />
                  <StatBox label="Palivo" value={summary.fuel} icon={<Info className="h-3.5 w-3.5" />} />
                  <StatBox label="Objem" value={`${formatNumber(summary.displacement)} cm3`} icon={<Gauge className="h-3.5 w-3.5" />} />
                  <StatBox label="Kategorie" value={summary.category} icon={<Info className="h-3.5 w-3.5" />} />
                  <StatBox label="Karoserie" value={summary.body} icon={<CarFront className="h-3.5 w-3.5" />} />
                  <StatBox label="Barva" value={summary.color} icon={<Info className="h-3.5 w-3.5" />} />
                </div>
              )}
              </div>
            </details>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes windshield-bg-pan {
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

        @keyframes windshield-reveal-up {
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

        @keyframes windshield-float-y {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes windshield-glow-pulse {
          0%,
          100% {
            box-shadow: 0 12px 28px rgba(2, 132, 199, 0.08), 0 0 0 1px rgba(16, 185, 129, 0.08);
          }
          50% {
            box-shadow: 0 16px 34px rgba(2, 132, 199, 0.16), 0 0 0 1px rgba(16, 185, 129, 0.18);
          }
        }

        @keyframes windshield-cta-shimmer {
          0% {
            transform: translateX(-130%);
          }
          50%,
          100% {
            transform: translateX(130%);
          }
        }

        .windshield-tool-shell {
          position: relative;
          isolation: isolate;
        }

        .windshield-tool-shell::before {
          content: "";
          position: absolute;
          inset: 32px 16px auto 16px;
          height: 300px;
          z-index: -1;
          border-radius: 44px;
          background: radial-gradient(50% 60% at 18% 44%, rgba(16, 185, 129, 0.16), transparent 74%),
            radial-gradient(58% 62% at 82% 36%, rgba(14, 165, 233, 0.18), transparent 78%);
          filter: blur(18px);
          animation: windshield-bg-pan 14s ease-in-out infinite alternate;
        }

        .windshield-reveal {
          opacity: 0;
          animation: windshield-reveal-up 760ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .windshield-float {
          animation: windshield-float-y 4.6s ease-in-out infinite;
        }

        .windshield-glow {
          animation: windshield-glow-pulse 4.2s ease-in-out infinite;
        }

        .windshield-hero-title {
          text-wrap: balance;
        }

        .windshield-cta {
          position: relative;
          overflow: hidden;
        }

        .windshield-cta::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 34%, rgba(255, 255, 255, 0.35) 50%, transparent 66%);
          transform: translateX(-130%);
          animation: windshield-cta-shimmer 3.3s ease-in-out infinite;
          pointer-events: none;
        }

        .windshield-cta:disabled::after {
          animation: none;
        }

        :root[data-motion="off"] .windshield-tool-shell::before,
        :root[data-motion="off"] .windshield-reveal,
        :root[data-motion="off"] .windshield-float,
        :root[data-motion="off"] .windshield-glow,
        :root[data-motion="off"] .windshield-cta::after {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .windshield-tool-shell::before,
          .windshield-reveal,
          .windshield-float,
          .windshield-glow,
          .windshield-cta::after {
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
