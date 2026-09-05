// src/app/pomucky/zlato/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gem,
  HandCoins,
  Package,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJson } from "@/app/lib/authenticatedApi";

import { GoldPriceChart } from "./GoldPriceChart";
import { GoldConverter } from "./GoldConverter";
import { OUNCE_G } from "./goldModel";
import styles from "./gold.module.css";

type Point = { t: number; v: number }; // v = CZK / oz

type GoldApiResponse = {
  ok: boolean;
  usdPerOz?: number;
  usdCzk?: number;
  czkPerOz?: number;
  ts?: number;
  stale?: boolean;
  asOfDate?: string;

  // historická data (preferované)
  history?: Point[];

  // fallback historie (když backend vrací jiný tvar)
  czkSeries?: any[];

  changes?: {
    d1?: number;
    m1?: number;
    m3?: number;
    y1?: number;
    y2?: number;
    y3?: number;
    y5?: number;
    y10?: number;
  };
  changesPct?: {
    "1d"?: number;
    "1m"?: number;
    "3m"?: number;
    "1y"?: number;
    "2y"?: number;
    "3y"?: number;
    "5y"?: number;
    "10y"?: number;
  };
  message?: string;
  error?: string;
};

const UNITS = {
  g1: { label: "1 g", grams: 1 },
  g5: { label: "5 g", grams: 5 },
  g10: { label: "10 g", grams: 10 },
  g20: { label: "20 g", grams: 20 },
  oz: { label: "1 oz", grams: OUNCE_G },
  g50: { label: "50 g", grams: 50 },
  g100: { label: "100 g", grams: 100 },
  g250: { label: "250 g", grams: 250 },
  kg1: { label: "1 kg", grams: 1000 },
} as const;

const RANGES = {
  w1: { label: "1 týden", days: 7 },
  m1: { label: "1 měsíc", days: 31 },
  m3: { label: "3 měsíce", days: 92 },
  y1: { label: "1 rok", days: 366 },
  y3: { label: "3 roky", days: 3 * 366 },
  y5: { label: "5 let", days: 5 * 366 },
  y10: { label: "10 let", days: 10 * 366 },
  max: { label: "MAX", days: 30 * 366 },
} as const;

type UnitKey = keyof typeof UNITS;
type RangeKey = keyof typeof RANGES;
type GoldView = "movement" | "comfort";
type ComfortBrand = "argor" | "pamp";
type ComfortPriceKey = "argor-1oz" | "argor-20g" | "pamp-1oz";
type ComfortPriceMode = "spot-scaled" | "official";
type ComfortProductReference = {
  label: string;
  displayWeight: string;
  grams: number;
  sellCzk: number;
  buybackCzk: number;
  imageSrc: string;
  spotCzkPerOz?: number;
  priceMode?: ComfortPriceMode;
  priceKey?: ComfortPriceKey;
  asOf?: string;
};
type ComfortBrandReference = {
  label: string;
  cardLabel: string;
  asOf: string;
  spotCzkPerOz: number;
  purity: string;
  products: readonly ComfortProductReference[];
};
type ComfortLivePrice = {
  sellCzk: number | null;
  buybackCzk: number | null;
  productId: number;
  productLabel: string;
};
type ComfortPricesApiResponse = {
  ok: boolean;
  source?: "live" | "fallback";
  stale?: boolean;
  fetchedAt?: number;
  prices?: Partial<Record<ComfortPriceKey, ComfortLivePrice>>;
  message?: string;
  error?: string;
};

const COMFORT_BRAND_REFERENCES: Record<ComfortBrand, ComfortBrandReference> = {
  argor: {
    label: "ARGOR",
    cardLabel: "ARGOR HERAEUS",
    asOf: "2. 5. 2026",
    spotCzkPerOz: 95911.45,
    purity: "999.9 Au",
    products: [
      {
        label: "ARGOR 1 oz",
        displayWeight: "1 oZ",
        grams: OUNCE_G,
        sellCzk: 102197,
        buybackCzk: 95214,
        priceKey: "argor-1oz",
        imageSrc: "/icons/argor1OZ.png",
        spotCzkPerOz: 95911.45,
        priceMode: "official",
        asOf: "4. 5. 2026",
      },
      {
        label: "ARGOR 20 g",
        displayWeight: "20 g",
        grams: 20,
        sellCzk: 67951,
        buybackCzk: 62011,
        priceKey: "argor-20g",
        imageSrc: "/icons/argor20g.png",
        spotCzkPerOz: 95911.45,
        priceMode: "official",
      },
      {
        label: "ARGOR 5 g",
        displayWeight: "5 g",
        grams: 5,
        sellCzk: 18355,
        buybackCzk: 15622,
        imageSrc: "/icons/argor5g.png",
        spotCzkPerOz: 95911.45,
      },
      {
        label: "ARGOR 2 g",
        displayWeight: "2 g",
        grams: 2,
        sellCzk: 7447,
        buybackCzk: 6214,
        imageSrc: "/icons/argor2g.png",
        spotCzkPerOz: 95911.45,
      },
    ],
  },
  pamp: {
    label: "PAMP",
    cardLabel: "PAMP",
    asOf: "20. 4. 2026",
    spotCzkPerOz: 98810.8,
    purity: "999.9 Au",
    products: [
      {
        label: "PAMP 1 oz",
        displayWeight: "1 oZ",
        grams: OUNCE_G,
        sellCzk: 104277,
        buybackCzk: 95514,
        priceKey: "pamp-1oz",
        imageSrc: "/icons/1oZpredni.png",
        spotCzkPerOz: 98810.8,
        priceMode: "official",
        asOf: "4. 5. 2026",
      },
      {
        label: "PAMP 20 g",
        displayWeight: "20 g",
        grams: 20,
        sellCzk: 68812,
        buybackCzk: 62011,
        imageSrc: "/icons/pamp20g.png",
        spotCzkPerOz: 95911.45,
      },
      {
        label: "PAMP 5 g",
        displayWeight: "5 g",
        grams: 5,
        sellCzk: 18668,
        buybackCzk: 15622,
        imageSrc: "/icons/pamp5g.png",
        spotCzkPerOz: 95911.45,
      },
    ],
  },
};

function getDefaultComfortIndex(brand: ComfortBrand): number {
  const products = COMFORT_BRAND_REFERENCES[brand].products;
  const oneOzIndex = products.findIndex((product) => Math.abs(product.grams - OUNCE_G) < 0.001);
  return oneOzIndex >= 0 ? oneOzIndex : 0;
}

function formatCzk(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (
    v.toLocaleString("cs-CZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function formatNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("cs-CZ", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function isWeekendDay(date = new Date()): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

async function fetchGold(input?: { days?: number; range?: RangeKey }): Promise<{
  usdPerOz: number;
  usdCzk: number;
  czkPerOz: number;
  ts: number;
  stale: boolean;
  asOfDate: string | null;
  history?: Point[];
  changes?: GoldApiResponse["changes"];
}> {
  const days = input?.days ?? 0;
  const range = input?.range;

  // Backend může podporovat buď `days`, nebo `range` – pošleme obojí.
  const qs = new URLSearchParams();
  if (days) qs.set("days", String(days));
  if (range) qs.set("range", String(range));

  const url = qs.toString() ? `/api/gold?${qs.toString()}` : "/api/gold";

  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as GoldApiResponse | null;

  if (!r.ok) {
    throw new Error(
      String(j?.message || j?.error || "Nepodařilo se načíst data o zlatě (API).")
    );
  }

  if (!j || j?.ok !== true) {
    throw new Error(String(j?.message || j?.error || "Nepodařilo se načíst data o zlatě."));
  }

  const usdPerOz = Number(j?.usdPerOz);
  const usdCzk = Number(j?.usdCzk);
  const czkPerOz = Number(j?.czkPerOz);
  const ts = Number(j?.ts || Date.now());

  if (!Number.isFinite(usdPerOz) || usdPerOz <= 0) throw new Error("Neplatná spot cena zlata.");
  if (!Number.isFinite(usdCzk) || usdCzk <= 0) throw new Error("Neplatný kurz USD/CZK.");
  if (!Number.isFinite(czkPerOz) || czkPerOz <= 0) throw new Error("Neplatná cena zlata v CZK.");

  const toTs = (x: any): number | null => {
    if (x == null) return null;

    // number
    if (typeof x === "number" && Number.isFinite(x)) {
      // if seconds, convert to ms
      if (x > 1e9 && x < 1e12) return Math.round(x * 1000);
      return Math.round(x);
    }

    // numeric string / date string
    if (typeof x === "string") {
      const s = x.trim();
      if (!s) return null;
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        if (n > 1e9 && n < 1e12) return Math.round(n * 1000);
        return Math.round(n);
      }
      const parsed = Date.parse(s);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  };

  const toNum = (x: any): number | null => {
    if (x == null) return null;
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string") {
      // normalize "93 360,41 Kč" -> "93360.41"
      const s = x
        .trim()
        .replace(/\s+/g, "")
        .replace(/Kč/gi, "")
        .replace(/,/g, ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  // 1) Preferuj `history` (t/v)
  const fromHistory = Array.isArray(j.history)
    ? (j.history as any[])
        .map((p) => ({
          t: toTs((p as any)?.t),
          v: toNum((p as any)?.v),
        }))
        .filter((p) => p.t != null && p.v != null && (p.v as number) > 0)
        .map((p) => ({ t: p.t as number, v: p.v as number }))
        .sort((a, b) => a.t - b.t)
    : undefined;

  // 2) Fallback: backend může vracet historii i jako `czkSeries` (date/value/close/...)
  const fromCzkSeries =
    !fromHistory?.length && Array.isArray((j as any).czkSeries)
      ? ((j as any).czkSeries as any[])
          .map((p) => {
            const t = toTs((p as any)?.t ?? (p as any)?.date ?? (p as any)?.d);
            const v = toNum((p as any)?.v ?? (p as any)?.value ?? (p as any)?.close ?? (p as any)?.c);
            return { t, v };
          })
          .filter((p) => p.t != null && p.v != null && (p.v as number) > 0)
          .map((p) => ({ t: p.t as number, v: p.v as number }))
          .sort((a, b) => a.t - b.t)
      : undefined;

  const history = (fromHistory?.length ? fromHistory : fromCzkSeries) ?? undefined;

  // Backend může vracet buď `changes` (y1/y2/...) nebo `changesPct` ("1y"/"2y"/...)
  const fromPct = (j as GoldApiResponse).changesPct;
  const toFinite = (value: unknown): number | undefined => {
    if (value == null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const changes =
    j.changes ??
    (fromPct
      ? {
          d1: toFinite(fromPct["1d"]),
          m1: toFinite(fromPct["1m"]),
          m3: toFinite(fromPct["3m"]),
          y1: toFinite(fromPct["1y"]),
          y2: toFinite(fromPct["2y"]),
          y3: toFinite(fromPct["3y"]),
          y5: toFinite(fromPct["5y"]),
          y10: toFinite(fromPct["10y"]),
        }
      : undefined);

  return {
    usdPerOz,
    usdCzk,
    czkPerOz,
    ts,
    stale: Boolean((j as GoldApiResponse).stale),
    asOfDate: typeof (j as GoldApiResponse).asOfDate === "string" ? (j as GoldApiResponse).asOfDate! : null,
    history,
    changes,
  };
}

async function fetchComfortPrices(): Promise<{
  source: "live" | "fallback";
  stale: boolean;
  message: string | null;
  prices: Partial<Record<ComfortPriceKey, ComfortLivePrice>>;
}> {
  await auth.authStateReady();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Pro načtení ceníku Comfort Commodity se přihlas.");
  }

  const { response, data } = await fetchAuthedJson(
    currentUser,
    "/api/comfort-prices",
    { cache: "no-store" }
  );
  const payload = data as ComfortPricesApiResponse | null;

  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(
      String(payload?.error || payload?.message || "Nepodařilo se načíst ceník Comfort Commodity.")
    );
  }

  return {
    source: payload.source ?? "live",
    stale: Boolean(payload.stale),
    message: typeof payload.message === "string" ? payload.message : null,
    prices: payload.prices ?? {},
  };
}

export default function GoldToolPage() {
  const [view, setView] = useState<GoldView>("movement");
  const [comfortBrand, setComfortBrand] = useState<ComfortBrand>("argor");
  const [activeComfortIndex, setActiveComfortIndex] = useState(() => getDefaultComfortIndex("argor"));
  const [unit, setUnit] = useState<UnitKey>("oz");
  const [range, setRange] = useState<RangeKey>("y1");
  const [loadingRange, setLoadingRange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [czkPerOz, setCzkPerOz] = useState<number | null>(null);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState(60);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [isWeekendPause, setIsWeekendPause] = useState(() => isWeekendDay());

  // historie – CZK / oz
  const [history, setHistory] = useState<Point[]>([]);
  // fallback série (kdyby historie nepřišla) – CZK / oz
  const [series, setSeries] = useState<Point[]>([]);

  const [changes, setChanges] = useState<GoldApiResponse["changes"] | null>(null);
  const [comfortLivePrices, setComfortLivePrices] = useState<
    Partial<Record<ComfortPriceKey, ComfortLivePrice>>
  >({});
  const [comfortSyncState, setComfortSyncState] = useState<"idle" | "live" | "fallback" | "error">("idle");
  const [comfortSyncMessage, setComfortSyncMessage] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const secondRef = useRef<number | null>(null);

  const selected = UNITS[unit];

  const czkForSelectedUnit = useMemo(() => {
    if (czkPerOz == null) return null;
    return (czkPerOz / OUNCE_G) * selected.grams;
  }, [czkPerOz, selected.grams]);

  const comfortReference = COMFORT_BRAND_REFERENCES[comfortBrand];

  const comfortRows = useMemo(() => {
    if (czkPerOz == null || !Number.isFinite(czkPerOz) || czkPerOz <= 0) {
      return comfortReference.products.map((product) => {
        const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
        const officialSell = livePrice?.sellCzk ?? product.sellCzk;
        const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;

        return {
          ...product,
          spotValue: null,
          sell: product.priceMode === "official" ? officialSell : null,
          buyback: product.priceMode === "official" ? officialBuyback : null,
          spread:
            product.priceMode === "official"
              ? officialSell - officialBuyback
              : null,
          sellPremiumPct: null,
          buybackPremiumPct: null,
        };
      });
    }

    if (comfortReference.spotCzkPerOz == null || !Number.isFinite(comfortReference.spotCzkPerOz) || comfortReference.spotCzkPerOz <= 0) {
      return comfortReference.products.map((product) => {
        const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
        const officialSell = livePrice?.sellCzk ?? product.sellCzk;
        const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;

        return {
          ...product,
          spotValue: (czkPerOz / OUNCE_G) * product.grams,
          sell: product.priceMode === "official" ? officialSell : null,
          buyback: product.priceMode === "official" ? officialBuyback : null,
          spread: product.priceMode === "official" ? officialSell - officialBuyback : null,
          sellPremiumPct: null,
          buybackPremiumPct: null,
        };
      });
    }

    return comfortReference.products.map((product) => {
      const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
      const officialSell = livePrice?.sellCzk ?? product.sellCzk;
      const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;
      const referenceSpot = product.spotCzkPerOz ?? comfortReference.spotCzkPerOz;
      const spotValue = (czkPerOz / OUNCE_G) * product.grams;
      const isOfficial = product.priceMode === "official";
      const scale = isOfficial ? 1 : czkPerOz / referenceSpot;
      const sell = isOfficial ? officialSell : Math.round(product.sellCzk * scale);
      const buyback = isOfficial ? officialBuyback : Math.round(product.buybackCzk * scale);
      const sellPremiumPct = sell != null && spotValue > 0 ? (sell / spotValue - 1) * 100 : null;
      const buybackPremiumPct = buyback != null && spotValue > 0 ? (buyback / spotValue - 1) * 100 : null;

      return {
        ...product,
        spotValue,
        sell,
        buyback,
        spread: sell == null || buyback == null ? null : sell - buyback,
        sellPremiumPct,
        buybackPremiumPct,
      };
    });
  }, [comfortLivePrices, comfortReference, czkPerOz]);

  useEffect(() => {
    setActiveComfortIndex(getDefaultComfortIndex(comfortBrand));
  }, [comfortBrand]);

  useEffect(() => {
    if (view === "comfort") {
      setActiveComfortIndex(getDefaultComfortIndex(comfortBrand));
    }
  }, [comfortBrand, view]);

  useEffect(() => {
    setActiveComfortIndex((prev) => {
      if (!comfortRows.length) return 0;
      return Math.min(prev, comfortRows.length - 1);
    });
  }, [comfortRows.length]);

  const moveComfortCarousel = (direction: -1 | 1) => {
    setActiveComfortIndex((prev) => {
      const total = comfortRows.length;
      if (total <= 1) return 0;
      return (prev + direction + total) % total;
    });
  };

  const activeComfortRow = comfortRows[activeComfortIndex] ?? null;
  const activeComfortApiOverride = Boolean(
    activeComfortRow?.priceMode === "official" &&
      activeComfortRow?.priceKey &&
      comfortLivePrices[activeComfortRow.priceKey]
  );
  const comfortSourceText =
    activeComfortRow?.priceMode === "official" && activeComfortApiOverride && comfortSyncState === "live"
      ? `${activeComfortRow.label}: živé ceny z Comfort Commodity API`
      : activeComfortRow?.priceMode === "official" && activeComfortApiOverride && comfortSyncState === "fallback"
        ? `${activeComfortRow.label}: ceny z cache Comfort Commodity API`
      : activeComfortRow?.priceMode === "official" && activeComfortRow.asOf
        ? `${activeComfortRow.label}: ceník Comfort Commodity ${activeComfortRow.asOf}`
      : comfortReference.asOf && comfortReference.spotCzkPerOz
        ? `Kalibrace ${comfortReference.asOf} při spotu ${formatCzk(comfortReference.spotCzkPerOz)}`
        : "Kalibrace bude doplněna";
  const comfortModelText =
    activeComfortRow?.priceMode === "official" && activeComfortApiOverride
      ? "Ceny 1 oz se synchronizují přímo z Comfort Commodity; ostatní gramáže se dál přepočítávají modelově."
      : activeComfortRow?.priceMode === "official"
        ? "Tato položka drží ručně zadaný ceník Comfort Commodity; ostatní gramáže se dál přepočítávají modelově."
      : "Model: kalibrační cena × aktuální spot / kalibrační spot. Comfort může ceny fixovat dávkově.";

  // animovaný „counter“ pro hlavní cenu
  // graf kopíruje vybranou jednotku
  const chartPoints: Point[] = useMemo(() => {
    const base = history.length >= 2 ? history : series;
    if (!base.length) return [];

    const factor = selected.grams / OUNCE_G;
    const scaled = base.map((p) => ({ t: p.t, v: p.v * factor }));
    return scaled;
  }, [history, series, selected.grams]);

  const loadComfortTick = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const snap = await fetchComfortPrices();
      if (isCancelled?.()) return;
      setComfortLivePrices(snap.prices);
      setComfortSyncState(snap.source === "fallback" ? "fallback" : "live");
      setComfortSyncMessage(snap.message);
    } catch (e: any) {
      if (isCancelled?.()) return;
      setComfortSyncState("error");
      setComfortSyncMessage(
        String(e?.message || "Nepodařilo se načíst ceník Comfort Commodity.")
      );
    }
  }, []);

  const loadTick = useCallback(async () => {
    const snap = await fetchGold({ days: 0 });

    setCzkPerOz(snap.czkPerOz);
    setLastUpdated(new Date(snap.ts));
    setIsStale(Boolean(snap.stale));
    setSecondsToRefresh(60);

    // nezahlcujeme – držíme max 120 bodů
    setSeries((prev) => {
      const next = [...prev, { t: snap.ts, v: snap.czkPerOz }];
      return next.slice(Math.max(0, next.length - 120));
    });

    await loadComfortTick();
  }, [loadComfortTick]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setLoadingRange(true);
        setHistory([]);
        setSeries([]);
        const snap = await fetchGold({ days: RANGES[range].days, range });
        if (cancelled) return;

        setCzkPerOz(snap.czkPerOz);
        setLastUpdated(new Date(snap.ts));
        setIsStale(Boolean(snap.stale));
        setSecondsToRefresh(60);

        if (snap.history?.length) setHistory(snap.history);
        else setHistory([]);

        setChanges(snap.changes ?? null);

        // fallback (jen aby UI neumřelo, když historie není)
        setSeries([{ t: snap.ts, v: snap.czkPerOz }]);
        await loadComfortTick(() => cancelled);
        if (cancelled) return;
      } catch (e: any) {
        if (cancelled) return;
        setIsStale(true);
        setErr(String(e?.message || "Nepodařilo se načíst data o zlatě."));
      } finally {
        if (cancelled) return;
        setLoading(false);
        setLoadingRange(false);
      }
    })();

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(async () => {
      const weekendNow = isWeekendDay();
      setIsWeekendPause((prev) => (prev === weekendNow ? prev : weekendNow));
      if (weekendNow) return;

      try {
        await loadTick();
      } catch {
        // ticho – při dalším ticku to zkusíme znovu
      }
    }, 60_000);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [range, loadComfortTick, loadTick]);

  useEffect(() => {
    if (secondRef.current) window.clearInterval(secondRef.current);
    setIsWeekendPause(isWeekendDay());
    secondRef.current = window.setInterval(() => {
      const weekendNow = isWeekendDay();
      setIsWeekendPause((prev) => (prev === weekendNow ? prev : weekendNow));
      if (weekendNow) return;

      setSecondsToRefresh((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => {
      if (secondRef.current) window.clearInterval(secondRef.current);
    };
  }, []);

  const manualRefresh = async () => {
    try {
      setRefreshingNow(true);
      setErr(null);
      await loadTick();
    } catch (e: any) {
      setIsStale(true);
      setErr(String(e?.message || "Nepodařilo se obnovit data."));
    } finally {
      setRefreshingNow(false);
    }
  };

  const changeRows: { label: string; value: number | null | undefined }[] = [
    { label: "1 den", value: changes?.d1 },
    { label: "1 měsíc", value: changes?.m1 },
    { label: "3 měsíce", value: changes?.m3 },
    { label: "1 rok", value: changes?.y1 },
    { label: "2 roky", value: changes?.y2 },
    { label: "3 roky", value: changes?.y3 },
    { label: "5 let", value: changes?.y5 },
    { label: "10 let", value: changes?.y10 },
  ];
  const comfortSyncBadge =
    comfortSyncState === "live"
      ? {
          label: "Comfort sync: LIVE",
          className: "border-violet-300 bg-violet-50 text-violet-800",
        }
      : comfortSyncState === "fallback"
        ? {
            label: "Comfort sync: CACHE",
            className: "border-slate-300 bg-white text-slate-700",
          }
        : comfortSyncState === "error"
          ? {
              label: "Comfort sync: ERROR",
              className: "border-slate-950 bg-slate-950 text-white",
            }
          : {
              label: "Comfort sync: INIT",
              className: "border-slate-300 bg-slate-50 text-slate-700",
            };

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className={styles.headingIcon}><Coins size={23} aria-hidden="true" /></span>
              <div><h1>Zlato</h1><p>Tržní cena, vývoj a přepočet hodnoty.</p></div>
            </div>
            <div className={styles.segmented} role="group" aria-label="Přehled zlata">
              <button type="button" aria-pressed={view === "movement"} onClick={() => setView("movement")}><ChartNoAxesCombined size={16} aria-hidden="true" />Vývoj ceny</button>
              <button type="button" aria-pressed={view === "comfort"} onClick={() => setView("comfort")}><Package size={16} aria-hidden="true" />Comfort Commodity</button>
            </div>
          </header>
          <section>
            {err && <div className={styles.error} role="alert">{err}</div>}
            {view === "movement" ? (
              <>
                <div className={styles.unitToolbar}>
                  <div className={styles.unitChoices} role="group" aria-label="Gramáž zlata">
                    <span>Gramáž</span>
                    {(Object.keys(UNITS) as UnitKey[]).map(k => <button key={k} type="button" data-unit={k} aria-pressed={unit === k} onClick={() => setUnit(k)}>{UNITS[k].label}</button>)}
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={manualRefresh} disabled={loading || refreshingNow}>
                    <RefreshCw size={14} className={refreshingNow ? styles.refreshing : undefined} aria-hidden="true" />{refreshingNow ? "Obnovuji…" : "Obnovit cenu"}
                  </button>
                </div>
                <div className={styles.movement}>
                  <div className={styles.summary}>
                    <section className={styles.priceCard} aria-label="Spotová cena zlata">
                      <div className={styles.priceLabel}><Coins size={17} aria-hidden="true" />Spotová cena · {selected.label}</div>
                      <div className={styles.price} data-gold-price>{czkForSelectedUnit == null ? loading ? "Načítám…" : "—" : formatCzk(czkForSelectedUnit)}</div>
                      <p className={styles.priceNote}>{czkPerOz == null ? "Čekám na cenu zlata" : `${formatCzk(czkPerOz / OUNCE_G)} / g`} · 1 oz = {formatNum(OUNCE_G, 4)} g</p>
                      <div className={styles.priceStatus}>
                        <span className={styles.status} data-stale={isStale}>{isStale ? "Poslední dostupná cena" : isWeekendPause ? "Víkend · automatická obnova pozastavena" : `Obnovení za ${secondsToRefresh} s`}</span>
                        {lastUpdated && <time dateTime={lastUpdated.toISOString()}>Aktualizováno {lastUpdated.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</time>}
                      </div>
                    </section>
                    <section className={styles.returns} aria-labelledby="gold-returns-title">
                      <div className={styles.sectionHeading}><div><h2 id="gold-returns-title" className="tool-card-title"><TrendingUp size={17} aria-hidden="true" />Změna ceny</h2><p>Porovnání za jednotlivá období v Kč</p></div></div>
                      <dl className={styles.returnGrid}>
                        {changeRows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={row.value == null || row.value === 0 ? styles.neutral : row.value < 0 ? styles.negative : styles.positive}>{row.value == null ? "—" : `${row.value > 0 ? "+" : ""}${formatNum(row.value, 1)} %`}</dd></div>)}
                      </dl>
                    </section>
                  </div>
                  <section className={styles.chartPanel} aria-labelledby="gold-history-title" aria-busy={loadingRange}>
                    <div className={styles.sectionHeading}>
                      <div><h2 id="gold-history-title" className="tool-card-title"><ChartNoAxesCombined size={18} aria-hidden="true" />Vývoj ceny</h2><p>Cena v Kč za {selected.label} · {RANGES[range].label}</p></div>
                      <div className={styles.ranges} role="group" aria-label="Období grafu">
                        {(Object.keys(RANGES) as RangeKey[]).map(k => <button key={k} type="button" data-range={k} aria-pressed={range === k} onClick={() => setRange(k)}>{RANGES[k].label}</button>)}
                      </div>
                    </div>
                    {loadingRange ? <div className={styles.emptyChart} role="status">Načítám historii ceny…</div> : <GoldPriceChart key={range} points={chartPoints} unitLabel={selected.label} />}
                  </section>
                  <GoldConverter pricePerOz={czkPerOz} onShowProducts={() => setView("comfort")} />
                  <p className={styles.note}>Graf vychází z dostupných historických cen přepočtených do Kč. Spotová cena je orientační; ceny konkrétních slitků najdeš v záložce Comfort Commodity.</p>
                </div>
              </>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_52%,#f3edff_100%)] px-4 py-4 shadow-[0_22px_58px_rgba(88,28,135,0.12)]">
                <div className="flex flex-col gap-4 border-b border-violet-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex shrink-0">
                    <Image
                      src="/icons/cclogo1.png"
                      alt="Comfort Commodity"
                      width={1110}
                      height={271}
                      className="h-12 w-auto object-contain sm:h-14"
                      priority
                    />
                  </div>

                  <div className="flex w-fit items-center gap-1 self-start rounded-full border border-violet-200 bg-white p-1 shadow-[0_14px_32px_rgba(88,28,135,0.12)] sm:self-auto">
                    {(["argor", "pamp"] as ComfortBrand[]).map((brand) => {
                      const active = comfortBrand === brand;
                      return (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setComfortBrand(brand)}
                          className={[
                            "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                            active
                              ? "bg-violet-700 !text-white shadow-[0_8px_20px_rgba(109,40,217,0.34)] [&_*]:!text-white"
                              : "text-slate-600 hover:bg-violet-50 hover:text-violet-800",
                          ].join(" ")}
                        >
                          <Package className="h-4 w-4" aria-hidden="true" />
                          {COMFORT_BRAND_REFERENCES[brand].label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative mt-5 overflow-hidden rounded-2xl border border-violet-100 bg-white/70 px-2 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:px-6">
                  <button
                    type="button"
                    onClick={() => moveComfortCarousel(-1)}
                    disabled={comfortRows.length <= 1}
                    className="absolute left-3 top-1/2 z-40 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition hover:-translate-x-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Předchozí gramáž"
                    title="Předchozí gramáž"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="relative mx-auto h-[570px] max-w-6xl" style={{ perspective: "1200px" }}>
                    {comfortRows.map((row, index) => {
                      const total = comfortRows.length;
                      let offset = index - activeComfortIndex;
                      if (offset > total / 2) offset -= total;
                      if (offset < -total / 2) offset += total;
                      const distance = Math.abs(offset);
                      if (distance > 1) return null;

                      const isActive = offset === 0;
                      const translate = offset * 245;

                      return (
                        <article
                          key={row.label}
                          onClick={() => {
                            if (!isActive) setActiveComfortIndex(index);
                          }}
                          className={[
                            "group absolute left-1/2 top-0 w-[min(78vw,320px)] overflow-hidden rounded-2xl border bg-white transition-all duration-500 ease-out",
                            isActive
                              ? "border-violet-300 shadow-[0_28px_70px_rgba(88,28,135,0.20)]"
                              : "cursor-pointer border-slate-200 shadow-[0_18px_44px_rgba(15,23,42,0.10)]",
                          ].join(" ")}
                          style={{
                            transform: `translateX(calc(-50% + ${translate}px)) scale(${isActive ? 1 : 0.82}) rotateY(${offset * -8}deg)`,
                            opacity: isActive ? 1 : 0.58,
                            zIndex: isActive ? 30 : 12,
                            filter: isActive ? "none" : "saturate(0.88)",
                          }}
                          aria-hidden={!isActive}
                        >
                          <div className="h-1 bg-[linear-gradient(90deg,#020617_0%,#6d28d9_54%,#c084fc_100%)]" />
                          <div className="relative overflow-hidden border-b border-violet-100 bg-[linear-gradient(160deg,#ffffff_0%,#fbf7ff_48%,#ede9fe_100%)] px-5 pb-5 pt-5">
                            <div className="relative z-10 flex items-start justify-between gap-3">
                              <div>
                                <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                  <Package className="h-4 w-4 text-violet-700" aria-hidden="true" />
                                  {comfortReference.cardLabel}
                                </div>
                                <div className="text-2xl font-semibold tracking-tight text-slate-950">{row.displayWeight}</div>
                              </div>
                              <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-800 shadow-[0_8px_18px_rgba(88,28,135,0.08)]">
                                <Gem className="h-3.5 w-3.5" aria-hidden="true" />
                                {comfortReference.purity}
                              </div>
                            </div>

                            <div className="relative mt-4 flex h-[220px] items-center justify-center">
                              <div className="absolute bottom-4 h-5 w-44 rounded-[999px] bg-violet-950/12 blur-md transition duration-300 group-hover:w-52 group-hover:bg-violet-950/18" />
                              {row.imageSrc ? (
                                <Image
                                  src={row.imageSrc}
                                  alt={row.label}
                                  width={1200}
                                  height={1200}
                                  className="relative z-10 h-[206px] w-full object-contain drop-shadow-[0_18px_26px_rgba(88,28,135,0.22)] transition-transform duration-300 group-hover:scale-[1.04]"
                                  sizes="(min-width: 768px) 32vw, 86vw"
                                />
                              ) : (
                                <div className="relative z-10 flex h-[190px] w-[150px] items-center justify-center rounded-xl border border-slate-300 bg-slate-950 text-2xl font-semibold tracking-[0.2em] text-white shadow-[0_18px_26px_rgba(15,23,42,0.24)] transition-transform duration-300 group-hover:scale-[1.04]">
                                  {comfortReference.label}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="px-5 py-4">
                            <div className="divide-y divide-slate-200">
                              <div className="flex items-end justify-between gap-3 py-3">
                                <div>
                                  <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                                    <Coins className="h-4 w-4" aria-hidden="true" />
                                    Prodej
                                  </div>
                                  <div className="mt-1 h-1 w-10 rounded-full bg-violet-600" />
                                </div>
                                <div className="text-right text-3xl font-semibold tracking-tight text-slate-950">
                                  {formatCzk(row.sell)}
                                </div>
                              </div>

                              <div className="flex items-end justify-between gap-3 py-3">
                                <div>
                                  <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    <HandCoins className="h-4 w-4" aria-hidden="true" />
                                    Výkup
                                  </div>
                                  <div className="mt-1 h-1 w-10 rounded-full bg-slate-300" />
                                </div>
                                <div className="text-right text-3xl font-semibold tracking-tight text-slate-950">
                                  {formatCzk(row.buyback)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => moveComfortCarousel(1)}
                    disabled={comfortRows.length <= 1}
                    className="absolute right-3 top-1/2 z-40 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition hover:translate-x-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Další gramáž"
                    title="Další gramáž"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="mt-3 flex justify-center gap-1.5">
                    {comfortRows.map((row, index) => (
                      <button
                        key={`comfort-nav-${row.label}`}
                        type="button"
                        onClick={() => setActiveComfortIndex(index)}
                        className={[
                          "h-2.5 rounded-full transition-all",
                          activeComfortIndex === index ? "w-8 bg-slate-950" : "w-2.5 bg-slate-300 hover:bg-slate-400",
                        ].join(" ")}
                        aria-label={`Zobrazit ${row.displayWeight}`}
                        title={row.displayWeight}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <div>
                      {comfortSourceText}
                      {lastUpdated ? ` • aktualizováno ${lastUpdated.toLocaleString("cs-CZ")}` : ""}
                    </div>
                    <div>{comfortModelText}</div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                          comfortSyncBadge.className,
                        ].join(" ")}
                      >
                        {comfortSyncBadge.label}
                      </span>
                      {comfortSyncMessage ? (
                        <span className="text-[10px] text-slate-500">{comfortSyncMessage}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={manualRefresh}
                    disabled={loading || loadingRange || refreshingNow}
                    className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-semibold !text-white shadow-[0_8px_20px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 [&_*]:!text-white"
                  >
                    <RefreshCw className={["h-3.5 w-3.5", refreshingNow ? "animate-spin" : ""].join(" ")} aria-hidden="true" />
                    {refreshingNow ? "Obnovuji…" : "Obnovit ceny"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
