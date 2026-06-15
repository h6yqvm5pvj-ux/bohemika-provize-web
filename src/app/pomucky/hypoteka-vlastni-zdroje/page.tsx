"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Building2,
  Calculator,
  Clock3,
  ExternalLink,
  FileDown,
  Home,
  Info,
  Landmark,
  Loader2,
  Minus,
  PiggyBank,
  Plus,
  Target,
  TrendingUp,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";

type StrategyKey = "efektika" | "realitniFond" | "sporiciUcet";
type LogoKey = "efektika" | "investika";
type TaxMode = "securities" | "withholding";
type SecuritiesTaxReason = "timeTest" | "lowProceeds" | "taxed" | "none";

type StrategyInput = {
  key: StrategyKey;
  label: string;
  shortLabel: string;
  description: string;
  annualReturn: number;
  minYears: number;
  sourceLabel: string;
  sourceHref: string;
  logoKey?: LogoKey;
  logoAlt?: string;
  taxMode: TaxMode;
  taxLabel: string;
  accentClass: string;
  icon: typeof TrendingUp;
};

type StrategyResult = StrategyInput & {
  monthsToTarget: number | null;
  rawMonthsToTarget: number | null;
  totalContributed: number | null;
  growth: number | null;
  valueAtHorizon: number | null;
  requiredMonthlyForHorizon: number | null;
  effectiveAnnualReturn: number;
  withdrawalTax: number | null;
  taxReason: SecuritiesTaxReason | null;
};

type LiquidationValue = {
  grossValue: number;
  netValue: number;
  tax: number;
  taxableGain: number;
  reason: SecuritiesTaxReason;
};

type Html2CanvasFn = (
  element: HTMLElement,
  options?: {
    scale?: number;
    backgroundColor?: string;
    useCORS?: boolean;
    imageTimeout?: number;
    logging?: boolean;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
    scrollX?: number;
    scrollY?: number;
    onclone?: (doc: Document) => void;
  }
) => Promise<HTMLCanvasElement>;

type JsPdfInstance = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
    alias?: string,
    compression?: string
  ) => unknown;
  addPage: () => unknown;
  save: (filename: string) => void;
};

type JsPdfCtor = new (options: Record<string, unknown>) => JsPdfInstance;

const INVESTMENT_TIME_TEST_MONTHS = 36;
const WITHHOLDING_TAX_RATE = 0.15;
const SECURITIES_TAX_RATE = 0.15;
const SECURITIES_LOW_PROCEEDS_LIMIT = 100_000;
let html2canvasProPromise: Promise<Html2CanvasFn> | null = null;
let jsPdfCtorPromise: Promise<JsPdfCtor> | null = null;

const STRATEGIES: StrategyInput[] = [
  {
    key: "efektika",
    label: "INVESTIKA EFEKTIKA",
    shortLabel: "EFEKTIKA",
    description: "Akciový fond kopírující přes ETF index S&P 500. Modelově vhodnější pro delší horizont.",
    annualReturn: 9,
    minYears: 5,
    sourceLabel: "INVESTIKA EFEKTIKA",
    sourceHref: "https://www.investika.cz/investicni-fondy/efektika",
    logoKey: "efektika",
    logoAlt: "EFEKTIKA",
    taxMode: "securities",
    taxLabel: "3 roky nebo roční výběr/prodej do 100 000 Kč",
    accentClass: "border-blue-200 bg-blue-50 text-blue-800",
    icon: TrendingUp,
  },
  {
    key: "realitniFond",
    label: "INVESTIKA realitní fond",
    shortLabel: "Realitní fond",
    description: "Konzervativnější fond komerčních nemovitostí s cílovým výnosem 4-6 % ročně.",
    annualReturn: 5,
    minYears: 5,
    sourceLabel: "INVESTIKA realitní fond",
    sourceHref: "https://www.investika.cz/investicni-fondy/investika-realitni-fond",
    logoKey: "investika",
    logoAlt: "INVESTIKA",
    taxMode: "securities",
    taxLabel: "3 roky nebo roční výběr/prodej do 100 000 Kč",
    accentClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: Building2,
  },
  {
    key: "sporiciUcet",
    label: "Průměrný spořicí účet",
    shortLabel: "Spořicí účet",
    description: "Modelová bankovní varianta pro peníze, které mají zůstat nízce kolísavé a rychle dostupné.",
    annualReturn: 3,
    minYears: 0,
    sourceLabel: "Modelová sazba",
    sourceHref: "https://www.cnb.cz/cs/statistika/menova_bankovni_stat/",
    taxMode: "withholding",
    taxLabel: "po 15% dani z úroků",
    accentClass: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Landmark,
  },
];

const CNB_SOURCE_URL =
  "https://www.cnb.cz/cs/financni-stabilita/makroobezretnostni-politika/stanoveni-horni-hranice-uverovych-ukazatelu/";
const INCOME_TAX_SOURCE_URL = "https://www.zakonyprolidi.cz/cs/1992-586";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function getHtml2CanvasPro(): Promise<Html2CanvasFn> {
  if (!html2canvasProPromise) {
    html2canvasProPromise = import("html2canvas-pro").then((mod: unknown) => {
      const candidate =
        (mod as { default?: unknown }).default ?? (mod as Record<string, unknown>);
      if (typeof candidate !== "function") {
        throw new Error("Nepodařilo se načíst renderer PDF.");
      }
      return candidate as Html2CanvasFn;
    });
  }
  return html2canvasProPromise;
}

async function getJsPdfCtor(): Promise<JsPdfCtor> {
  if (!jsPdfCtorPromise) {
    jsPdfCtorPromise = import("jspdf").then((mod: unknown) => {
      const typed = mod as {
        jsPDF?: unknown;
        default?: { jsPDF?: unknown } | unknown;
      };
      const candidate =
        typed.jsPDF ??
        (typed.default &&
        typeof typed.default === "object" &&
        "jsPDF" in typed.default
          ? (typed.default as { jsPDF?: unknown }).jsPDF
          : typed.default);
      if (typeof candidate !== "function") {
        throw new Error("Nepodařilo se načíst PDF engine.");
      }
      return candidate as JsPdfCtor;
    });
  }
  return jsPdfCtorPromise;
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function StrategyLogo({ logoKey, label }: { logoKey: LogoKey; label: string }) {
  if (logoKey === "efektika") {
    return (
      <svg
        viewBox="0 0 420 50"
        role="img"
        aria-label={label}
        className="h-auto w-full max-w-[168px]"
        preserveAspectRatio="xMinYMid meet"
      >
        <path
          fill="#ffffff"
          d="M298.5 0h-11.7l-16.5 39.5-14-16.5 21.5-23h-15.2l-17.8 20.3h-.2V0H233c1.2 2 1.8 4.3 1.8 6.7 0 2.7-.7 5-2 7.2V50h11.8V27h.2l18.3 23h15.7l3.7-9.8h19.3l3.8 9.8H319L298.5 0zm-12.3 30.5 6.3-17.2 6.3 17.2h-12.6zM169.3 0v10.3h14V50h12V10.3H208c-.3-1.2-.5-2.3-.5-3.5 0-2.5.7-4.7 1.8-6.7.2-.1-40-.1-40-.1zM215 18.8V50h12.2V18.8c-1.8.8-3.8 1.3-5.8 1.3-2.4.1-4.4-.4-6.4-1.3"
        />
        <path
          fill="#ff2b78"
          d="M214.5 6.7a6.7 6.7 0 1 0 13.4 0 6.7 6.7 0 0 0-13.4 0"
        />
        <path
          fill="#ffffff"
          d="M0 50V.2h33.5v10.2h-22v9.3h20.7v9.7H11.5v10.3h23.2V50H0zm40.2 0V.2h33.5v10.2h-22v9.3h20.7v9.7H51.7V50H40.2zm51.6-20.7h20.7v-9.7H91.8v-9.3h22V.2H80.3V50h34.8V39.8H91.8V29.3zM165.5.2h-15l-18 20.3h-.2V.2h-11.8V50h11.8V27L151 50h15.7L144 23.2l21.5-23z"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 420 50"
      role="img"
      aria-label={label}
      className="h-auto w-full max-w-[168px]"
      preserveAspectRatio="xMinYMid meet"
    >
      <path
        fill="#ffffff"
        d="M92.8 48.8H81.3L63.2 1.2h13L87.3 35h.3l11-33.8h12.7L92.8 48.8zm20.4 0V1.2h32v9.7h-20.8v9h19.8V29h-19.8v9.8h22.2v9.8l-33.4.2zm64.5-35.1c-2-2.5-5.5-4.2-8.5-4.2s-6.7 1-6.7 4.8c0 3.2 2.8 4.2 7.3 5.5 6.5 2 14.8 4.8 14.8 14.3 0 11-8.8 15.8-18.2 15.8-6.8 0-13.7-2.5-17.8-6.8l7.5-7.7c2.3 2.8 6.5 5 10.3 5 3.5 0 6.5-1.3 6.5-5.2 0-3.7-3.7-4.8-9.8-6.8-6-2-12.2-5-12.2-13.7C151 4.3 160.7 0 169.5 0c5.3 0 11.5 2 15.7 5.8l-7.5 7.9zM.8 19.2v29.7h11.7V19c-1.8 1-3.8 1.5-5.8 1.5S2.5 20 .8 19.2zm49-18 .3 31.2H50L30.8 1.2H17.7c1.2 2 1.7 4 1.7 6.5s-.7 4.5-1.7 6.5V49h11.2l-.3-31.2h.2l19 31.2H61V1.2H49.8z"
      />
      <path
        fill="#fde200"
        d="M13 7.5C13 11 10.2 14 6.5 14S0 11.2 0 7.5 2.8 1 6.5 1 13 4 13 7.5z"
      />
      <path
        fill="#ffffff"
        d="M310.2 1.2H299L283.2 39l-13.5-15.7 20.5-22h-14.3l-17.2 19.3h-.2V1.2h-11.2c1 2 1.7 4 1.7 6.5s-.7 4.8-2 6.7v34.5h11.3v-22h.2l17.7 22h15l3.5-9.3h18.7l3.7 9.3h12.8L310.2 1.2zm-11.9 29.1 6-16.3 6 16.3h-12zM186.8 1.2V11h13.5v37.8h11.5V11.2H224c-.3-1.2-.5-2.2-.5-3.5 0-2.3.5-4.5 1.7-6.5h-38.4zM230.3 19v29.8H242V19.2c-1.7.8-3.7 1.3-5.7 1.3s-4.1-.5-6-1.5z"
      />
      <path
        fill="#fde200"
        d="M242.8 7.5c0-3.5-2.8-6.5-6.5-6.5s-6.5 2.8-6.5 6.5 2.8 6.5 6.5 6.5 6.5-2.8 6.5-6.5z"
      />
    </svg>
  );
}

function parseInputNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number): string {
  return formatMoneyValue(Math.round(value), {
    currencyLabel: "Kč",
    maxFractionDigits: 0,
  });
}

function formatNullableMoney(value: number | null): string {
  return value == null ? "Doplň vstupy" : formatMoney(value);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("cs-CZ", {
    maximumFractionDigits: 2,
  })} %`;
}

function formatRateLabel(result: StrategyResult): string {
  return result.taxMode === "withholding"
    ? `${formatPercent(result.annualReturn)} p.a. hrubě`
    : `${formatPercent(result.annualReturn)} p.a.`;
}

function formatTaxStatus(result: StrategyResult): string {
  if (result.taxMode === "withholding") return result.taxLabel;
  if (result.taxReason === "timeTest") return "osvobozeno časovým testem";
  if (result.taxReason === "lowProceeds") return "osvobozeno do 100 000 Kč ročního výběru/prodeje";
  if (result.taxReason === "taxed" && result.withdrawalTax != null && result.withdrawalTax > 0) {
    return `daň z výnosu ${formatMoney(result.withdrawalTax)}`;
  }
  return result.taxLabel;
}

function formatDuration(months: number | null): string {
  if (months == null) return "Nelze dopočítat";
  if (months <= 0) return "Už splněno";

  const years = Math.floor(months / 12);
  const restMonths = months % 12;

  if (years === 0) return `${restMonths} měs.`;
  if (restMonths === 0) return `${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "let"}`;
  return `${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "let"} a ${restMonths} měs.`;
}

function monthlyRate(annualRatePct: number): number {
  return Math.pow(1 + Math.max(annualRatePct, -99) / 100, 1 / 12) - 1;
}

function monthlyRateAfterTax(annualRatePct: number, taxMode: TaxMode): number {
  const grossMonthlyRate = monthlyRate(annualRatePct);
  return taxMode === "withholding" ? grossMonthlyRate * (1 - WITHHOLDING_TAX_RATE) : grossMonthlyRate;
}

function effectiveAnnualReturnPct(annualRatePct: number, taxMode: TaxMode): number {
  return (Math.pow(1 + monthlyRateAfterTax(annualRatePct, taxMode), 12) - 1) * 100;
}

function getSecuritiesLiquidationValue(grossValue: number, totalContributed: number, months: number): LiquidationValue {
  if (months >= INVESTMENT_TIME_TEST_MONTHS) {
    return {
      grossValue,
      netValue: grossValue,
      tax: 0,
      taxableGain: 0,
      reason: "timeTest",
    };
  }

  if (grossValue <= SECURITIES_LOW_PROCEEDS_LIMIT) {
    return {
      grossValue,
      netValue: grossValue,
      tax: 0,
      taxableGain: 0,
      reason: "lowProceeds",
    };
  }

  const taxableGain = Math.max(0, grossValue - totalContributed);
  const tax = taxableGain * SECURITIES_TAX_RATE;

  return {
    grossValue,
    netValue: grossValue - tax,
    tax,
    taxableGain,
    reason: tax > 0 ? "taxed" : "none",
  };
}

function getLiquidationValue(
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode
): LiquidationValue {
  const grossValue = futureValue(currentSavings, monthlyContribution, annualRatePct, months, taxMode);
  const totalContributed = currentSavings + monthlyContribution * months;

  if (taxMode === "securities") {
    return getSecuritiesLiquidationValue(grossValue, totalContributed, months);
  }

  return {
    grossValue,
    netValue: grossValue,
    tax: 0,
    taxableGain: 0,
    reason: "none",
  };
}

function futureValue(
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode
): number {
  const rate = monthlyRateAfterTax(annualRatePct, taxMode);
  if (months <= 0) return currentSavings;
  if (Math.abs(rate) < 0.0000001) return currentSavings + monthlyContribution * months;

  const factor = Math.pow(1 + rate, months);
  return currentSavings * factor + monthlyContribution * ((factor - 1) / rate);
}

function monthsToTarget(
  target: number,
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  taxMode: TaxMode
): number | null {
  if (currentSavings >= target) return 0;
  if (monthlyContribution <= 0 && (currentSavings <= 0 || annualRatePct <= 0)) return null;

  for (let months = 1; months <= 600; months += 1) {
    if (
      getLiquidationValue(
        currentSavings,
        monthlyContribution,
        annualRatePct,
        months,
        taxMode
      ).netValue >= target
    ) {
      return months;
    }
  }

  return null;
}

function monthsToGrossTarget(
  target: number,
  currentSavings: number,
  monthlyContribution: number,
  annualRatePct: number,
  taxMode: TaxMode
): number | null {
  if (currentSavings >= target) return 0;
  if (monthlyContribution <= 0 && (currentSavings <= 0 || annualRatePct <= 0)) return null;

  for (let months = 1; months <= 600; months += 1) {
    if (futureValue(currentSavings, monthlyContribution, annualRatePct, months, taxMode) >= target) {
      return months;
    }
  }

  return null;
}

function requiredMonthlyContribution(
  target: number,
  currentSavings: number,
  annualRatePct: number,
  months: number,
  taxMode: TaxMode
): number | null {
  if (getLiquidationValue(currentSavings, 0, annualRatePct, months, taxMode).netValue >= target) return 0;
  if (months <= 0) return null;

  let low = 0;
  let high = Math.max(1_000, target / months);

  for (let guard = 0; guard < 30; guard += 1) {
    if (getLiquidationValue(currentSavings, high, annualRatePct, months, taxMode).netValue >= target) {
      break;
    }
    high *= 2;
  }

  if (getLiquidationValue(currentSavings, high, annualRatePct, months, taxMode).netValue < target) return null;

  for (let i = 0; i < 48; i += 1) {
    const mid = (low + high) / 2;
    const netValue = getLiquidationValue(currentSavings, mid, annualRatePct, months, taxMode).netValue;
    if (netValue >= target) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return Math.max(0, high);
}

function NumberStepper({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  help,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  help?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const setSafeValue = (nextValue: number) => {
    const safeValue = clamp(Number.isFinite(nextValue) ? nextValue : min, min, max);
    onChange(String(safeValue));
  };

  const numericValue = parseInputNumber(value);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-slate-900">
          {label}
        </label>
        {help ? <span className="text-right text-xs text-slate-500">{help}</span> : null}
      </div>

      <div className="grid grid-cols-[42px_1fr_42px] overflow-hidden rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          onClick={() => setSafeValue((numericValue ?? min) - step)}
          className="inline-flex h-11 items-center justify-center border-r border-slate-200 text-slate-700 transition hover:bg-slate-50"
          aria-label={`Snížit ${label}`}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            placeholder={placeholder ?? "Doplň"}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!nextValue) {
                onChange("");
                return;
              }
              const parsed = Number(nextValue);
              onChange(Number.isFinite(parsed) ? String(clamp(parsed, min, max)) : nextValue);
            }}
            className="h-11 w-full bg-white px-3 pr-12 text-center text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
              {suffix}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setSafeValue((numericValue ?? min - step) + step)}
          className="inline-flex h-11 items-center justify-center border-l border-slate-200 text-slate-700 transition hover:bg-slate-50"
          aria-label={`Zvýšit ${label}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function MortgageOwnFundsPage() {
  const pdfContentRef = useRef<HTMLElement | null>(null);
  const [age, setAge] = useState("");
  const [propertyPrice, setPropertyPrice] = useState("");
  const [currentSavings, setCurrentSavings] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetYears, setTargetYears] = useState("");
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>("efektika");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<StrategyKey, number>>({
    efektika: STRATEGIES[0].annualReturn,
    realitniFond: STRATEGIES[1].annualReturn,
    sporiciUcet: STRATEGIES[2].annualReturn,
  });

  const ageValue = parseInputNumber(age);
  const propertyPriceValue = parseInputNumber(propertyPrice);
  const currentSavingsValue = parseInputNumber(currentSavings);
  const monthlyContributionValue = parseInputNumber(monthlyContribution);
  const targetYearsValue = parseInputNumber(targetYears);
  const ownFundsPct = ageValue == null ? null : ageValue < 36 ? 10 : 20;
  const ownFundsTarget =
    propertyPriceValue == null || ownFundsPct == null ? null : propertyPriceValue * (ownFundsPct / 100);
  const mortgageAmount =
    propertyPriceValue == null || ownFundsTarget == null ? null : Math.max(0, propertyPriceValue - ownFundsTarget);
  const missingAmount =
    ownFundsTarget == null || currentSavingsValue == null ? null : Math.max(0, ownFundsTarget - currentSavingsValue);
  const horizonMonths = targetYearsValue == null ? null : Math.round(targetYearsValue * 12);
  const canCalculate =
    ownFundsTarget != null &&
    currentSavingsValue != null &&
    monthlyContributionValue != null &&
    horizonMonths != null;

  const results = useMemo<StrategyResult[]>(
    () =>
      STRATEGIES.map((strategy) => {
        const annualReturn = rates[strategy.key];
        if (!canCalculate) {
          return {
            ...strategy,
            annualReturn,
            monthsToTarget: null,
            rawMonthsToTarget: null,
            totalContributed: null,
            growth: null,
            valueAtHorizon: null,
            requiredMonthlyForHorizon: null,
            effectiveAnnualReturn: effectiveAnnualReturnPct(annualReturn, strategy.taxMode),
            withdrawalTax: null,
            taxReason: null,
          };
        }

        const grossMonths = monthsToGrossTarget(
          ownFundsTarget,
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          strategy.taxMode
        );
        const months = monthsToTarget(
          ownFundsTarget,
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          strategy.taxMode
        );
        const horizonLiquidation = getLiquidationValue(
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          horizonMonths,
          strategy.taxMode
        );
        const detailMonths = months ?? horizonMonths;
        const totalContributed = currentSavingsValue + monthlyContributionValue * detailMonths;
        const reachedLiquidation = getLiquidationValue(
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          detailMonths,
          strategy.taxMode
        );

        return {
          ...strategy,
          annualReturn,
          monthsToTarget: months,
          rawMonthsToTarget: grossMonths,
          totalContributed,
          growth: Math.max(0, reachedLiquidation.netValue - totalContributed),
          valueAtHorizon: horizonLiquidation.netValue,
          requiredMonthlyForHorizon: requiredMonthlyContribution(
            ownFundsTarget,
            currentSavingsValue,
            annualReturn,
            horizonMonths,
            strategy.taxMode
          ),
          effectiveAnnualReturn: effectiveAnnualReturnPct(annualReturn, strategy.taxMode),
          withdrawalTax: reachedLiquidation.tax,
          taxReason: reachedLiquidation.reason,
        };
      }),
    [canCalculate, currentSavingsValue, horizonMonths, monthlyContributionValue, ownFundsTarget, rates]
  );

  const selectedResult = results.find((result) => result.key === selectedStrategy) ?? results[0];
  const SelectedIcon = selectedResult.icon;
  const bestResult = results
    .filter((result) => canCalculate && result.monthsToTarget != null)
    .sort((a, b) => (a.monthsToTarget ?? 9999) - (b.monthsToTarget ?? 9999))[0];

  const handleDownloadPdf = async () => {
    const source = pdfContentRef.current;
    if (!source) return;

    setPdfGenerating(true);
    setPdfError(null);

    try {
      await waitForNextFrame();
      await waitForNextFrame();

      const html2canvas = await getHtml2CanvasPro();
      const JsPdfCtor = await getJsPdfCtor();
      const sourceRect = source.getBoundingClientRect();
      const sourceWidth = Math.ceil(source.scrollWidth || sourceRect.width);
      const sourceHeight = Math.ceil(source.scrollHeight || sourceRect.height);

      const canvas = await html2canvas(source, {
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        backgroundColor: "#ffffff",
        useCORS: true,
        imageTimeout: 20000,
        logging: false,
        width: sourceWidth,
        height: sourceHeight,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (doc) => {
          doc
            .querySelectorAll<HTMLElement>("[data-pdf-ignore='1']")
            .forEach((node) => {
              node.style.setProperty("visibility", "hidden", "important");
              node.style.setProperty("pointer-events", "none", "important");
            });

          const clonedSource = doc.querySelector<HTMLElement>("[data-mortgage-pdf='1']");
          if (clonedSource) {
            clonedSource.style.width = `${sourceWidth}px`;
            clonedSource.style.maxWidth = `${sourceWidth}px`;
            clonedSource.style.margin = "0";
            clonedSource.style.background = "#ffffff";
          }
        },
      });

      const pdf = new JsPdfCtor({
        unit: "px",
        format: [sourceWidth, sourceHeight],
        orientation: sourceWidth >= sourceHeight ? "landscape" : "portrait",
        compress: true,
        hotfixes: ["px_scaling"],
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, sourceWidth, sourceHeight);

      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`hypoteka-vlastni-zdroje-${today}.pdf`);
    } catch (error) {
      console.error("PDF export hypotéky vlastních zdrojů selhal:", error);
      setPdfError("PDF se nepodařilo vygenerovat. Zkus to prosím znovu.");
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <AppLayout active="tools">
      <main ref={pdfContentRef} data-mortgage-pdf="1" className="w-full bg-white px-2 pb-10 pt-8 sm:px-4">
        <div className="mx-auto w-full max-w-7xl space-y-5">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)] lg:items-end">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                Hypotéka a vlastní zdroje
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
                  Kolik naspořit na budoucí hypotéku
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Pomůcka počítá potřebné vlastní prostředky podle věku klienta a porovná, za jak dlouho se cíl dá dosáhnout při pravidelné investici nebo spoření.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2" data-pdf-ignore="1">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfGenerating}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-300 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_26px_rgba(124,58,237,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {pdfGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin !text-white" aria-hidden="true" />
                  ) : (
                    <FileDown className="h-4 w-4 !text-white" aria-hidden="true" />
                  )}
                  {pdfGenerating ? "Připravuji PDF" : "Tisk do PDF"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <Info className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">Pravidlo ČNB pro LTV</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Aktuální horní hranice LTV je 80 %, resp. 90 % pro žadatele mladší 36 let u pořízení obytné nemovitosti k vlastnímu bydlení.
                  </p>
                  <Link
                    href={CNB_SOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Zdroj ČNB
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {pdfError ? (
            <p
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
              data-pdf-ignore="1"
            >
              {pdfError}
            </p>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-[292px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]">
            <div className="w-full max-w-[310px] space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)] sm:p-5 lg:sticky lg:top-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Calculator className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Vstupy</h2>
              </div>

              <NumberStepper
                id="client-age"
                label="Věk klienta"
                value={age}
                min={18}
                max={75}
                step={1}
                suffix="let"
                help={
                  ageValue == null
                    ? "doplň věk"
                    : ageValue < 36
                      ? "10 % vlastních zdrojů"
                      : "20 % vlastních zdrojů"
                }
                placeholder="Věk"
                onChange={setAge}
              />

              <NumberStepper
                id="property-price"
                label="Cena nemovitosti"
                value={propertyPrice}
                min={500_000}
                max={50_000_000}
                step={100_000}
                suffix="Kč"
                placeholder="Cena"
                onChange={setPropertyPrice}
              />

              <NumberStepper
                id="current-savings"
                label="Již naspořeno"
                value={currentSavings}
                min={0}
                max={50_000_000}
                step={25_000}
                suffix="Kč"
                placeholder="Úspory"
                onChange={setCurrentSavings}
              />

              <NumberStepper
                id="monthly-contribution"
                label="Měsíční vklad"
                value={monthlyContribution}
                min={0}
                max={500_000}
                step={500}
                suffix="Kč"
                placeholder="Vklad"
                onChange={setMonthlyContribution}
              />

              <NumberStepper
                id="target-years"
                label="Cílový horizont"
                value={targetYears}
                min={1}
                max={30}
                step={1}
                suffix="let"
                help="pro výpočet potřebného vkladu"
                placeholder="Roky"
                onChange={setTargetYears}
              />
            </div>

            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <Target className="h-4 w-4" aria-hidden="true" />
                    Cíl
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{formatNullableMoney(ownFundsTarget)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {ownFundsPct == null ? "doplň věk a cenu nemovitosti" : `${ownFundsPct} % z ceny nemovitosti`}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <Banknote className="h-4 w-4" aria-hidden="true" />
                    Chybí
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{formatNullableMoney(missingAmount)}</p>
                  <p className="mt-1 text-sm text-slate-600">po započtení současných úspor</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Hypotéka
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{formatNullableMoney(mortgageAmount)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {ownFundsPct == null ? "po doplnění věku a ceny" : `orientační maximum při LTV ${100 - ownFundsPct} %`}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Porovnání variant</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Výnosy jsou modelové a můžeš je upravit podle konkrétní nabídky nebo profilu klienta.
                    </p>
                  </div>
                  {bestResult ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      Nejrychleji: <strong>{bestResult.shortLabel}</strong> za {formatDuration(bestResult.monthsToTarget)}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  {results.map((result) => {
                    const Icon = result.icon;
                    const selected = result.key === selectedStrategy;

                    return (
                      <button
                        key={result.key}
                        type="button"
                        onClick={() => setSelectedStrategy(result.key)}
                        className={[
                          "flex h-full min-h-[398px] flex-col rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                          selected
                            ? "border-violet-500 bg-[linear-gradient(145deg,#6d28d9_0%,#7c3aed_46%,#4c1d95_100%)] !text-white shadow-[0_18px_38px_rgba(109,40,217,0.32)] ring-1 ring-violet-200/60 [&_*]:!text-white"
                            : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${selected ? "border-white/25 bg-white/15 text-white" : result.accentClass}`}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${selected ? "bg-white/15 !text-white" : "bg-slate-100 text-slate-700"}`}>
                            {formatRateLabel(result)}
                          </span>
                        </div>

                        <div className="mt-4 h-12">
                          {result.logoKey ? (
                            <div
                              className={[
                                "flex h-12 items-center rounded-lg px-4",
                                selected
                                  ? "border border-slate-900 bg-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                                  : "border border-slate-900 bg-slate-950",
                              ].join(" ")}
                            >
                              <StrategyLogo logoKey={result.logoKey} label={result.logoAlt ?? result.label} />
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 min-h-[116px]">
                          <h3 className={selected ? "text-lg font-semibold !text-white" : "text-lg font-semibold"}>
                            {result.label}
                          </h3>
                          <p
                            className={[
                              "mt-2 text-sm leading-5",
                              selected ? "!text-white opacity-90" : "text-slate-600",
                            ].join(" ")}
                          >
                            {result.description}
                          </p>
                        </div>

                        <div className="min-h-[70px]">
                          {result.minYears > 0 ? (
                            <p
                              className={[
                                "text-xs font-semibold",
                                selected ? "!text-white opacity-80" : "text-slate-500",
                              ].join(" ")}
                            >
                              Doporučený horizont {result.minYears}+ let
                            </p>
                          ) : (
                            <div className="h-4" aria-hidden="true" />
                          )}
                          <p
                            className={[
                              "mt-2 rounded-md px-2.5 py-1.5 text-xs font-semibold",
                              selected
                                ? "bg-white/15 !text-white"
                                : result.taxMode === "withholding"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-emerald-50 text-emerald-800",
                            ].join(" ")}
                          >
                            {canCalculate ? formatTaxStatus(result) : result.taxLabel}
                          </p>
                          {result.taxMode === "withholding" ? (
                            <p className={`mt-1 text-xs ${selected ? "!text-white opacity-80" : "text-slate-500"}`}>
                              Čistý modelový výnos cca {formatPercent(result.effectiveAnnualReturn)} p.a.
                            </p>
                          ) : null}
                          {canCalculate &&
                          result.taxMode === "securities" &&
                          result.taxReason === "taxed" &&
                          result.rawMonthsToTarget != null &&
                          result.monthsToTarget != null &&
                          result.rawMonthsToTarget < result.monthsToTarget ? (
                            <p className={`mt-1 text-xs ${selected ? "!text-white opacity-80" : "text-slate-500"}`}>
                              Hrubě za {formatDuration(result.rawMonthsToTarget)}, čistě po dani za {formatDuration(result.monthsToTarget)}.
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-auto grid grid-cols-2 gap-2 pt-4 text-sm">
                          <div>
                            <p className={selected ? "!text-white opacity-80" : "text-slate-500"}>Dosažení cíle</p>
                            <p className={selected ? "mt-1 font-semibold !text-white" : "mt-1 font-semibold"}>
                              {canCalculate ? formatDuration(result.monthsToTarget) : "Doplň vstupy"}
                            </p>
                          </div>
                          <div>
                            <p className={selected ? "!text-white opacity-80" : "text-slate-500"}>
                              Vklad pro {targetYearsValue == null ? "horizont" : `${targetYearsValue} let`}
                            </p>
                            <p className={selected ? "mt-1 font-semibold !text-white" : "mt-1 font-semibold"}>
                              {!canCalculate
                                ? "Doplň vstupy"
                                : result.requiredMonthlyForHorizon == null
                                ? "Nelze"
                                : `${formatMoney(result.requiredMonthlyForHorizon)} / měs.`}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Vybraná varianta</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedResult.label}</h2>
                </div>
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border ${selectedResult.accentClass}`}>
                  <SelectedIcon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    Za jak dlouho
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-950">
                    {canCalculate ? formatDuration(selectedResult.monthsToTarget) : "Doplň vstupy"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    při měsíčním vkladu {formatNullableMoney(monthlyContributionValue)}
                  </p>
                  {canCalculate &&
                  selectedResult.taxMode === "securities" &&
                  selectedResult.taxReason === "taxed" &&
                  selectedResult.rawMonthsToTarget != null &&
                  selectedResult.monthsToTarget != null &&
                  selectedResult.rawMonthsToTarget < selectedResult.monthsToTarget ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Hrubá hodnota vychází za {formatDuration(selectedResult.rawMonthsToTarget)}, po dani z výnosu za {formatDuration(selectedResult.monthsToTarget)}.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <PiggyBank className="h-4 w-4" aria-hidden="true" />
                    Potřebný vklad
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-950">
                    {!canCalculate
                      ? "Doplň vstupy"
                      : selectedResult.requiredMonthlyForHorizon == null
                      ? "Nelze"
                      : formatMoney(selectedResult.requiredMonthlyForHorizon)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    měsíčně pro horizont {targetYearsValue == null ? "po doplnění" : `${targetYearsValue} let`}
                  </p>
                  {selectedResult.taxMode === "withholding" ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Spořicí účet počítá čistě po 15% dani z každého připsaného úroku.
                    </p>
                  ) : null}
                  {canCalculate && selectedResult.taxMode === "securities" ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Daňový režim: {formatTaxStatus(selectedResult)}.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Vloženo</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{formatNullableMoney(selectedResult.totalContributed)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Čisté zhodnocení</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-700">{formatNullableMoney(selectedResult.growth)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Čistá hodnota v horizontu</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{formatNullableMoney(selectedResult.valueAtHorizon)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Předpoklady výnosu</h2>
                  <p className="mt-1 text-sm text-slate-600">Uprav roční výnos pro konkrétní scénář.</p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {STRATEGIES.map((strategy) => {
                  const Icon = strategy.icon;
                  const value = rates[strategy.key];

                  return (
                    <div key={strategy.key} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${strategy.accentClass}`}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-950">{strategy.label}</h3>
                            <p className="mt-1 text-sm leading-5 text-slate-600">{strategy.description}</p>
                            <p className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                              {strategy.taxLabel}
                            </p>
                            <Link
                              href={strategy.sourceHref}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                            >
                              {strategy.sourceLabel}
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </div>
                        </div>

                        <div className="w-full sm:w-36">
                          <label htmlFor={`rate-${strategy.key}`} className="sr-only">
                            Roční výnos {strategy.label}
                          </label>
                          <div className="relative">
                            <input
                              id={`rate-${strategy.key}`}
                              type="number"
                              inputMode="decimal"
                              min="-20"
                              max="20"
                              step="0.25"
                              value={value}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                setRates((current) => ({
                                  ...current,
                                  [strategy.key]: clamp(Number.isFinite(next) ? next : 0, -20, 20),
                                }));
                              }}
                              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 text-right font-semibold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Výpočet je orientační, pracuje s pravidelným měsíčním vkladem na konci měsíce a se složeným úročením. U spořicího účtu model odečítá 15% srážkovou daň z připsaných úroků. U fondových variant model počítá s osvobozením po 3letém časovém testu nebo při ročním úhrnu výběrů/prodejů cenných papírů do 100 000 Kč za zdaňovací období; tento limit se vztahuje na částku výběru/prodeje, ne na zisk. Při prodeji před 3 roky nad tento limit model orientačně odečítá 15 % z výnosu. Nezahrnuje vstupní poplatky, inflaci ani změny ceny nemovitosti.
                <Link
                  href={INCOME_TAX_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-semibold text-blue-700 hover:text-blue-900"
                >
                  Zákon o daních z příjmů
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
