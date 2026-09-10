"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { calculateMortgageTarget, effectiveAnnualReturnPct, getLiquidationValue, monthsToTarget, monthsToGrossTarget, requiredMonthlyContribution, type TaxMode, type SecuritiesTaxReason } from "./mortgageMath";
import styles from "./mortgage.module.css";

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

let html2canvasProPromise: Promise<Html2CanvasFn> | null = null;
let jsPdfCtorPromise: Promise<JsPdfCtor> | null = null;

const STRATEGIES: StrategyInput[] = [
  {
    key: "efektika",
    label: "INVESTIKA EFEKTIKA",
    shortLabel: "EFEKTIKA",
    description: "Akciový fond využívající ETF na index S&P 500. Vyšší kolísání, pro delší horizont.",
    annualReturn: 9,
    minYears: 5,
    sourceLabel: "INVESTIKA EFEKTIKA",
    sourceHref: "https://www.investika.cz/investicni-fondy/efektika",
    logoKey: "efektika",
    logoAlt: "EFEKTIKA",
    taxMode: "securities",
    taxLabel: "Časový test každého nákupu samostatně",
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
    taxLabel: "Časový test každého nákupu samostatně",
    accentClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: Building2,
  },
  {
    key: "sporiciUcet",
    label: "Spořicí účet",
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
const INCOME_TAX_SOURCE_URL = "https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby/ostatni";

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

function parseInputNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
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
  if (result.taxReason === "none") return "bez zdanitelného zisku v modelu";
  if (result.taxReason === "lowProceeds") return "osvobozeno do 100 000 Kč ročního výběru/prodeje";
  if (result.taxReason === "taxed" && result.withdrawalTax != null && result.withdrawalTax > 0) {
    return `daň z výnosu ${formatMoney(result.withdrawalTax)}`;
  }
  return result.taxLabel;
}

function formatDuration(months: number | null): string {
  if (months == null) return "Nedosaženo do 50 let";
  if (months <= 0) return "Už splněno";

  const years = Math.floor(months / 12);
  const restMonths = months % 12;

  if (years === 0) return `${restMonths} měs.`;
  if (restMonths === 0) return `${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "let"}`;
  return `${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "let"} a ${restMonths} měs.`;
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

      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] overflow-hidden rounded-lg border border-slate-300 bg-white">
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
              onChange(nextValue);
            }}
            onBlur={() => { if (numericValue != null) setSafeValue(numericValue); }}
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
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>("sporiciUcet");
  const [purpose, setPurpose] = useState("home");
  const [appraisal, setAppraisal] = useState("");
  const [reserve, setReserve] = useState("0");
  const [otherSales, setOtherSales] = useState("0");
  const [entryFee, setEntryFee] = useState("0");
  const [taxRate, setTaxRate] = useState(.15);
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
  const appraisalValue = appraisal.trim() ? parseInputNumber(appraisal) : propertyPriceValue;
  const reserveValue = parseInputNumber(reserve);
  const entryFeeValue = parseInputNumber(entryFee);
  const plannedAge = ageValue == null || targetYearsValue == null ? null : ageValue + targetYearsValue;
  const ownFundsPct = purpose === "investment" ? 30 : plannedAge == null ? null : plannedAge < 36 ? 10 : 20;
  const mortgageAmount = propertyPriceValue == null || appraisalValue == null || ownFundsPct == null ? null : calculateMortgageTarget(propertyPriceValue, appraisalValue, plannedAge ?? 36, purpose === "investment", reserveValue ?? 0).mortgage;
  const ownFundsTarget = mortgageAmount == null || propertyPriceValue == null || reserveValue == null ? null : propertyPriceValue - mortgageAmount + reserveValue;
  const missingAmount = ownFundsTarget == null || currentSavingsValue == null ? null : Math.max(0, ownFundsTarget - currentSavingsValue);
  const horizonMonths = targetYearsValue == null ? null : Math.round(targetYearsValue * 12);
  const canCalculate = ownFundsTarget != null && propertyPriceValue != null && propertyPriceValue >= 500000 && propertyPriceValue <= 50000000 &&
    appraisalValue != null && appraisalValue > 0 && appraisalValue <= 50000000 && ageValue != null && ageValue >= 18 && ageValue <= 75 &&
    currentSavingsValue != null && currentSavingsValue >= 0 && currentSavingsValue <= 50000000 &&
    monthlyContributionValue != null && monthlyContributionValue >= 0 && monthlyContributionValue <= 500000 &&
    horizonMonths != null && horizonMonths >= 12 && horizonMonths <= 360 && reserveValue != null && reserveValue >= 0 && reserveValue <= 10000000 &&
    entryFeeValue != null && entryFeeValue >= 0 && entryFeeValue <= 10 && parseInputNumber(otherSales) != null && (parseInputNumber(otherSales) ?? -1) >= 0;

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
          strategy.taxMode,
          { otherSaleProceeds: parseInputNumber(otherSales) ?? 0, taxRate, entryFeePct: entryFeeValue ?? 0 }
        );
        const months = monthsToTarget(
          ownFundsTarget,
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          strategy.taxMode,
          { otherSaleProceeds: parseInputNumber(otherSales) ?? 0, taxRate, entryFeePct: entryFeeValue ?? 0 }
        );
        const horizonLiquidation = getLiquidationValue(
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          horizonMonths,
          strategy.taxMode,
          { otherSaleProceeds: parseInputNumber(otherSales) ?? 0, taxRate, entryFeePct: entryFeeValue ?? 0 }
        );
        const detailMonths = horizonMonths;
        const totalContributed = currentSavingsValue + monthlyContributionValue * detailMonths;
        const reachedLiquidation = getLiquidationValue(
          currentSavingsValue,
          monthlyContributionValue,
          annualReturn,
          detailMonths,
          strategy.taxMode,
          { otherSaleProceeds: parseInputNumber(otherSales) ?? 0, taxRate, entryFeePct: entryFeeValue ?? 0 }
        );

        return {
          ...strategy,
          annualReturn,
          monthsToTarget: months,
          rawMonthsToTarget: grossMonths,
          totalContributed,
          growth: reachedLiquidation.netValue - totalContributed,
          valueAtHorizon: horizonLiquidation.netValue,
          requiredMonthlyForHorizon: requiredMonthlyContribution(
            ownFundsTarget,
            currentSavingsValue,
            annualReturn,
            horizonMonths,
            strategy.taxMode,
          { otherSaleProceeds: parseInputNumber(otherSales) ?? 0, taxRate, entryFeePct: entryFeeValue ?? 0 }
          ),
          effectiveAnnualReturn: effectiveAnnualReturnPct(annualReturn, strategy.taxMode),
          withdrawalTax: reachedLiquidation.tax,
          taxReason: reachedLiquidation.reason,
        };
      }),
    [canCalculate, currentSavingsValue, horizonMonths, monthlyContributionValue, ownFundsTarget, rates, otherSales, taxRate, entryFeeValue]
  );

  const selectedResult = results.find((result) => result.key === selectedStrategy) ?? results[0];
  const SelectedIcon = selectedResult.icon;
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
      <main ref={pdfContentRef} data-mortgage-pdf="1" className={styles.page}>
        <div className="mx-auto w-full max-w-7xl space-y-5">
          <section className={styles.hero}>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                Hypotéka a vlastní zdroje
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
                  Blíž k vlastnímu bydlení.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Spočítej vlastní zdroje, rezervu a měsíční vklad pro plánovanou koupi. Porovnej, jak se výsledek změní při různém výnosu.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2" data-pdf-ignore="1">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfGenerating || !canCalculate}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-300 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-4 py-2 text-sm font-semibold text-inherit shadow-[0_12px_26px_rgba(124,58,237,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {pdfGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-inherit" aria-hidden="true" />
                  ) : (
                    <FileDown className="h-4 w-4 text-inherit" aria-hidden="true" />
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
                    Pro vlastní bydlení je limit LTV 80 %, do 36 let 90 %. U pronájmu nebo třetí a další obytné nemovitosti ČNB od 1. 4. 2026 doporučuje LTV 70 % a DTI 7. LTV vychází z hodnoty zajištění.
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
            <div className={styles.inputs}>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Calculator className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-950">Vstupy</h2>
              </div>

              <label className={styles.selectLabel}>Účel koupě<select value={purpose} onChange={e => setPurpose(e.target.value)}><option value="home">Vlastní bydlení (1. nebo 2. nemovitost)</option><option value="investment">Pronájem / 3. a další nemovitost</option></select></label>
              <NumberStepper
                id="client-age"
                label="Současný věk klienta"
                value={age}
                min={18}
                max={75}
                step={1}
                suffix="let"
                help={plannedAge == null ? "doplň věk a horizont" : `Při koupi cca ${plannedAge} let`}
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

              <NumberStepper id="bank-appraisal" label="Bankovní odhad" value={appraisal} min={1} max={50000000} step={100000} suffix="Kč" placeholder="Stejný jako cena" help="prázdné = kupní cena" onChange={setAppraisal}/>
              <NumberStepper id="purchase-reserve" label="Rezerva a vedlejší náklady" value={reserve} min={0} max={10000000} step={10000} suffix="Kč" help="nad rámec akontace" onChange={setReserve}/>
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
                    {ownFundsPct == null ? "doplň věk, horizont a cenu" : `Kupní cena − úvěr + rezerva`}
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

              {canCalculate && <section className={styles.plan}>
                <span className={styles.eyebrow}>Tvůj plán za {targetYearsValue} let</span><h2>{(selectedResult.valueAtHorizon ?? 0) >= ownFundsTarget ? "Cíl podle modelu vychází." : `Do cíle zbývá ${formatMoney(ownFundsTarget - (selectedResult.valueAtHorizon ?? 0))}.`}</h2><p>Čistá hodnota {formatNullableMoney(selectedResult.valueAtHorizon)} z cíle {formatMoney(ownFundsTarget)}. Výnos i dostupnost peněz se mohou změnit.</p>
                <div className={styles.progress} role="progressbar" aria-label="Pokrytí cíle v plánovaném horizontu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, ownFundsTarget > 0 ? (selectedResult.valueAtHorizon ?? 0) / ownFundsTarget * 100 : 100))}><span style={{width:`${Math.min(100, ownFundsTarget > 0 ? (selectedResult.valueAtHorizon ?? 0) / ownFundsTarget * 100 : 100)}%`}}/></div>
                {targetYearsValue != null && (selectedResult.minYears > targetYearsValue || (selectedResult.monthsToTarget != null && selectedResult.monthsToTarget > 0 && selectedResult.monthsToTarget < selectedResult.minYears * 12)) && <p className={styles.notice}>Plánovaný termín nebo modelové dosažení cíle je dříve než doporučený horizont této varianty. Kolísání investice může koupi odložit; porovnej i spořicí účet.</p>}
                <p className={styles.note}>Počítám s dnešními pravidly, věkem při plánované koupi a zadanou cenou v době koupě. Čas dosažení níže se vztahuje k tomuto pevnému cíli. Schválení úvěru závisí také na příjmech a závazcích.</p>
              </section>}
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Porovnání variant</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Výnosy jsou modelové a můžeš je upravit podle konkrétní nabídky nebo profilu klienta.
                    </p>
                  </div>

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
                        aria-pressed={selected}
                        className={styles.strategy}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${selected ? "border-white/25 bg-white/15 text-white" : result.accentClass}`}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${selected ? "bg-white/15 text-inherit" : "bg-slate-100 text-slate-700"}`}>
                            {formatRateLabel(result)}
                          </span>
                        </div>

                        {result.logoKey && <span className={styles.brandLogo}><Image src={`/icons/logo-${result.logoKey}-inverzni.svg`} alt={result.logoAlt || result.label} width={210} height={25} unoptimized /></span>}
                        <div className="mt-3 min-h-[116px]">
                          <h3 className={selected ? "text-lg font-semibold text-inherit" : "text-lg font-semibold"}>
                            {result.label}
                          </h3>
                          <p
                            className={[
                              "mt-2 text-sm leading-5",
                              selected ? "text-inherit opacity-90" : "text-slate-600",
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
                                selected ? "text-inherit opacity-80" : "text-slate-500",
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
                                ? "bg-white/15 text-inherit"
                                : result.taxMode === "withholding"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-emerald-50 text-emerald-800",
                            ].join(" ")}
                          >
                            {canCalculate ? `V cílovém horizontu: ${formatTaxStatus(result)}` : result.taxLabel}
                          </p>
                          {result.taxMode === "withholding" ? (
                            <p className={`mt-1 text-xs ${selected ? "text-inherit opacity-80" : "text-slate-500"}`}>
                              Čistý modelový výnos cca {formatPercent(result.effectiveAnnualReturn)} p.a.
                            </p>
                          ) : null}
                          {canCalculate &&
                          result.taxMode === "securities" &&
                          result.taxReason === "taxed" &&
                          result.rawMonthsToTarget != null &&
                          result.monthsToTarget != null &&
                          result.rawMonthsToTarget < result.monthsToTarget ? (
                            <p className={`mt-1 text-xs ${selected ? "text-inherit opacity-80" : "text-slate-500"}`}>
                              Hrubě za {formatDuration(result.rawMonthsToTarget)}, čistě po dani za {formatDuration(result.monthsToTarget)}.
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-auto grid grid-cols-2 gap-2 pt-4 text-sm">
                          <div>
                            <p className={selected ? "text-inherit opacity-80" : "text-slate-500"}>Dosažení pevného cíle</p>
                            <p className={selected ? "mt-1 font-semibold text-inherit" : "mt-1 font-semibold"}>
                              {canCalculate ? formatDuration(result.monthsToTarget) : "Doplň vstupy"}
                            </p>
                          </div>
                          <div>
                            <p className={selected ? "text-inherit opacity-80" : "text-slate-500"}>
                              Vklad pro {targetYearsValue == null ? "horizont" : `${targetYearsValue} let`}
                            </p>
                            <p className={selected ? "mt-1 font-semibold text-inherit" : "mt-1 font-semibold"}>
                              {!canCalculate
                                ? "Doplň vstupy"
                                : result.requiredMonthlyForHorizon == null
                                ? "Nelze"
                                : `${formatMoney(Math.ceil(result.requiredMonthlyForHorizon))} / měs.`}
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

          <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  {selectedResult.logoKey && <span className={styles.brandLogo}><Image src={`/icons/logo-${selectedResult.logoKey}-inverzni.svg`} alt={selectedResult.logoAlt || selectedResult.label} width={210} height={25} unoptimized /></span>}
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
                      : formatMoney(Math.ceil(selectedResult.requiredMonthlyForHorizon))}
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
                      Daňový model v zadaném horizontu: {formatTaxStatus(selectedResult)}.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Vloženo v horizontu</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{formatNullableMoney(selectedResult.totalContributed)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Zhodnocení v horizontu</p>
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

              <div className={styles.taxOptions}>
                <NumberStepper id="entry-fee" label="Vstupní poplatek fondů" value={entryFee} min={0} max={10} step={.25} suffix="%" help="z každého vkladu" onChange={setEntryFee}/>
                <NumberStepper id="other-sales" label="Další prodeje cenných papírů v roce výběru" value={otherSales} min={0} max={100000000} step={10000} suffix="Kč" help="celková tržba, ne zisk" onChange={setOtherSales}/>
                <label>Modelová sazba daně ze zdanitelného zisku <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))}><option value={.15}>15 %</option><option value={.23}>23 % (vyšší daňové pásmo)</option></select></label>
              </div>
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Model předpokládá investování dosavadních úspor dnes a další vklady na konci měsíce. Časový test se posuzuje po jednotlivých nákupech, v měsíčním modelu až po více než 36 měsících. Limit 100 000 Kč platí pro celkové roční prodeje všech cenných papírů, nikoli pro zisk. K tomuto výběru přičítáme zadané tržby z dalších prodejů ve stejném roce. Skutečná daň může kombinovat sazby 15 % a 23 % podle celkového základu daně. Výnosy fondů zadávej po průběžných nákladech, vstupní poplatek se odečítá zvlášť. U účtu počítáme nominální sazbu / 12 a 15% daň z kladných úroků. Model nezahrnuje růst ceny nemovitosti ani lhůty odkupu investic. Cena a odhad mají odpovídat plánované koupi.
                <Link
                  href={INCOME_TAX_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-semibold text-blue-700 hover:text-blue-900"
                >
                  Pravidla Finanční správy
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
