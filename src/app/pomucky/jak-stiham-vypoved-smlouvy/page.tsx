"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HeartPulse,
  Info,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { systemSansFont } from "@/lib/fonts";
import styles from "./timing.module.css";

const pageFont = systemSansFont;

type VariantId =
  | "lifeAnniversary"
  | "nonLifeAnniversary"
  | "twoMonths"
  | "postClaim"
  | "lifeWithdrawal";

type VariantConfig = {
  id: VariantId;
  label: string;
  shortLabel: string;
  description: string;
  eyebrow: string;
  title: string;
  formDescription: string;
  icon: typeof HeartPulse;
};

type ResultTone = "success" | "warning" | "neutral";

type CalculationResult = {
  tone: ResultTone;
  headline: string;
  details: {
    label: string;
    value: string;
  }[];
  message: string;
  nextIfDeadlineMissed?: {
    terminationDate: string;
    deliveryDeadline: string;
  };
};

const VARIANTS: VariantConfig[] = [
  {
    id: "lifeAnniversary",
    label: "K výročí s 6ti týdenní výpovědní lhůtou (Životní pojištění)",
    shortLabel: "Životní pojištění",
    description: "Měsíční výročí podle dne počátku smlouvy.",
    eyebrow: "Měsíční výročí",
    title: "Výpočet ukončení životního pojištění",
    formDescription:
      "Zadej datum počátku smlouvy a datum doručení výpovědi. Systém najde nejbližší měsíční výročí, které splní šestitýdenní lhůtu.",
    icon: HeartPulse,
  },
  {
    id: "nonLifeAnniversary",
    label: "K výročí s 6ti týdenní výpovědní lhůtou (Neživotní pojištění)",
    shortLabel: "Neživotní pojištění",
    description: "Roční výročí podle dne počátku smlouvy.",
    eyebrow: "Roční výročí",
    title: "Výpočet ukončení neživotního pojištění",
    formDescription:
      "Zadej datum počátku smlouvy a datum doručení výpovědi. Systém najde nejbližší roční výročí, které splní šestitýdenní lhůtu.",
    icon: ShieldCheck,
  },
  {
    id: "twoMonths",
    label: "Do 2 měsíců od uzavření smlouvy",
    shortLabel: "Do 2 měsíců",
    description: "Výpověď v prvních dvou měsících, zánik po 8 dnech.",
    eyebrow: "Dvouměsíční lhůta",
    title: "Výpočet výpovědi do 2 měsíců",
    formDescription:
      "Zadej datum uzavření smlouvy a datum doručení výpovědi. Výpověď musí být doručena do 2 měsíců a pojištění zanikne po 8 dnech od doručení.",
    icon: Clock3,
  },
  {
    id: "postClaim",
    label: "Po pojistné události",
    shortLabel: "Po pojistné události",
    description: "Výpověď do 3 měsíců, zánik po 30 dnech od doručení.",
    eyebrow: "Pojistná událost",
    title: "Výpočet výpovědi po pojistné události",
    formDescription:
      "Zadej datum oznámení pojistné události a datum doručení výpovědi. Výpověď musí být doručena do 3 měsíců a smlouva zanikne po 30 dnech od doručení.",
    icon: CalendarDays,
  },
  {
    id: "lifeWithdrawal",
    label: "Odstoupení od smlouvy do 1 měsíce od uzavření (Životní pojištění)",
    shortLabel: "Odstoupení ŽP",
    description: "Kontrola měsíční lhůty pro odstoupení od životní smlouvy.",
    eyebrow: "Odstoupení od smlouvy",
    title: "Výpočet odstoupení od životního pojištění",
    formDescription:
      "Zadej datum uzavření smlouvy a datum doručení odstoupení. Pomůcka ověří měsíční lhůtu a zobrazí rozhodné datum odstoupení.",
    icon: RotateCcw,
  },
];

const createLocalDate = (year: number, monthIndex: number, day: number): Date =>
  new Date(year, monthIndex, day, 12, 0, 0, 0);

const normalizeLocalDate = (date: Date): Date =>
  createLocalDate(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date => {
  const next = normalizeLocalDate(date);
  next.setDate(next.getDate() + days);
  return normalizeLocalDate(next);
};

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const addCalendarMonths = (date: Date, months: number): Date => {
  const normalized = normalizeLocalDate(date);
  const targetMonth = createLocalDate(
    normalized.getFullYear(),
    normalized.getMonth() + months,
    1
  );
  const targetDay = Math.min(
    normalized.getDate(),
    daysInMonth(targetMonth.getFullYear(), targetMonth.getMonth())
  );
  return createLocalDate(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    targetDay
  );
};

const parseDateInput = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;

  const parsed = createLocalDate(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const formatDateCz = (date: Date): string =>
  new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const anniversaryInYear = (policyStartDate: Date, year: number): Date => {
  const monthIndex = policyStartDate.getMonth();
  const day = Math.min(
    policyStartDate.getDate(),
    daysInMonth(year, monthIndex)
  );
  return createLocalDate(year, monthIndex, day);
};

const monthlyAnniversaryOnOrAfter = (
  policyStartDate: Date,
  minimumDate: Date
): Date => {
  let year = minimumDate.getFullYear();
  let monthIndex = minimumDate.getMonth();
  let candidate = createLocalDate(
    year,
    monthIndex,
    Math.min(policyStartDate.getDate(), daysInMonth(year, monthIndex))
  );

  while (candidate < minimumDate || candidate < policyStartDate) {
    monthIndex += 1;
    const month = createLocalDate(year, monthIndex, 1);
    year = month.getFullYear();
    monthIndex = month.getMonth();
    candidate = createLocalDate(
      year,
      monthIndex,
      Math.min(policyStartDate.getDate(), daysInMonth(year, monthIndex))
    );
  }

  return candidate;
};

const annualAnniversaryOnOrAfter = (
  policyStartDate: Date,
  minimumDate: Date
): Date => {
  let anniversaryYear = Math.max(
    minimumDate.getFullYear(),
    policyStartDate.getFullYear() + 1
  );
  let candidate = anniversaryInYear(policyStartDate, anniversaryYear);

  while (candidate < minimumDate) {
    anniversaryYear += 1;
    candidate = anniversaryInYear(policyStartDate, anniversaryYear);
  }

  return candidate;
};

const calculateAnniversaryTermination = (
  policyStartDate: Date,
  deliveryDate: Date,
  mode: "monthly" | "annual"
): CalculationResult => {
  if (deliveryDate < policyStartDate) {
    return {
      tone: "warning",
      headline: "Zkontroluj zadaná data.",
      details: [
        { label: "Počátek smlouvy", value: formatDateCz(policyStartDate) },
        { label: "Doručeno", value: formatDateCz(deliveryDate) },
        { label: "Ukončení smlouvy", value: "—" },
      ],
      message:
        "Datum doručení výpovědi je před datem počátku smlouvy. Zkontroluj zadaná data.",
    };
  }

  const earliestTerminationDate = addDays(deliveryDate, 42);
  const terminationDate =
    mode === "monthly"
      ? monthlyAnniversaryOnOrAfter(policyStartDate, earliestTerminationDate)
      : annualAnniversaryOnOrAfter(policyStartDate, earliestTerminationDate);
  const deliveryDeadline = addDays(terminationDate, -42);
  const nextTerminationDate =
    mode === "monthly"
      ? monthlyAnniversaryOnOrAfter(policyStartDate, addDays(terminationDate, 1))
      : annualAnniversaryOnOrAfter(policyStartDate, addDays(terminationDate, 1));
  const nextDeliveryDeadline = addDays(nextTerminationDate, -42);

  return {
    tone: "success",
    headline: "Výpověď splňuje šestitýdenní lhůtu.",
    details: [
      { label: "Doručeno", value: formatDateCz(deliveryDate) },
      { label: "Doručit nejpozději", value: formatDateCz(deliveryDeadline) },
      { label: "Ukončení smlouvy", value: formatDateCz(terminationDate) },
    ],
    message: `Smlouva bude ukončena k ${formatDateCz(
      terminationDate
    )}. Jde o nejbližší ${
      mode === "monthly" ? "měsíční" : "roční"
    } výročí, které je alespoň 6 týdnů po doručení výpovědi.`,
    nextIfDeadlineMissed: {
      terminationDate: formatDateCz(nextTerminationDate),
      deliveryDeadline: formatDateCz(nextDeliveryDeadline),
    },
  };
};

const calculateTwoMonthsTermination = (
  contractSignedDate: Date,
  deliveryDate: Date
): CalculationResult => {
  const deliveryDeadline = addCalendarMonths(contractSignedDate, 2);
  const terminationDate = addDays(deliveryDate, 8);
  const deliveryBeforeContract = deliveryDate < contractSignedDate;
  const inDeadline = !deliveryBeforeContract && deliveryDate <= deliveryDeadline;

  return {
    tone: deliveryBeforeContract || !inDeadline ? "warning" : "success",
    headline: inDeadline ? "Výpověď je v dvouměsíční lhůtě." : "Výpověď je mimo dvouměsíční lhůtu.",
    details: [
      { label: "Uzavření smlouvy", value: formatDateCz(contractSignedDate) },
      { label: "Doručit nejpozději", value: formatDateCz(deliveryDeadline) },
      { label: "Ukončení smlouvy", value: formatDateCz(terminationDate) },
    ],
    message: deliveryBeforeContract
      ? "Datum doručení je před datem uzavření smlouvy. Zkontroluj zadaná data."
      : inDeadline
        ? `Výpověď je doručená včas. Pojištění bude ukončeno k ${formatDateCz(
            terminationDate
          )}.`
        : `Výpověď byla doručena po lhůtě. Nejpozdější doručení bylo ${formatDateCz(
            deliveryDeadline
          )}.`,
  };
};

const calculatePostClaimTermination = (
  claimNoticeDate: Date,
  deliveryDate: Date
): CalculationResult => {
  const deliveryDeadline = addCalendarMonths(claimNoticeDate, 3);
  const terminationDate = addDays(deliveryDate, 30);
  const deliveryBeforeNotice = deliveryDate < claimNoticeDate;
  const inDeadline = !deliveryBeforeNotice && deliveryDate <= deliveryDeadline;

  return {
    tone: deliveryBeforeNotice || !inDeadline ? "warning" : "success",
    headline: inDeadline ? "Výpověď je v tříměsíční lhůtě." : "Výpověď je mimo tříměsíční lhůtu.",
    details: [
      { label: "Oznámení pojistné události", value: formatDateCz(claimNoticeDate) },
      { label: "Doručit nejpozději", value: formatDateCz(deliveryDeadline) },
      { label: "Ukončení smlouvy", value: formatDateCz(terminationDate) },
    ],
    message: deliveryBeforeNotice
      ? "Datum doručení je před datem oznámení pojistné události. Zkontroluj zadaná data."
      : inDeadline
        ? `Výpověď je doručená včas. Smlouva bude ukončena k ${formatDateCz(
            terminationDate
          )}.`
        : `Výpověď byla doručena po lhůtě. Nejpozdější doručení bylo ${formatDateCz(
            deliveryDeadline
          )}.`,
  };
};

const calculateLifeWithdrawal = (
  contractSignedDate: Date,
  deliveryDate: Date
): CalculationResult => {
  const deliveryDeadline = addCalendarMonths(contractSignedDate, 1);
  const deliveryBeforeContract = deliveryDate < contractSignedDate;
  const inDeadline = !deliveryBeforeContract && deliveryDate <= deliveryDeadline;

  return {
    tone: deliveryBeforeContract || !inDeadline ? "warning" : "success",
    headline: inDeadline ? "Odstoupení je v měsíční lhůtě." : "Odstoupení je mimo měsíční lhůtu.",
    details: [
      { label: "Uzavření smlouvy", value: formatDateCz(contractSignedDate) },
      { label: "Doručit nejpozději", value: formatDateCz(deliveryDeadline) },
      { label: "Rozhodné datum odstoupení", value: formatDateCz(deliveryDate) },
    ],
    message: deliveryBeforeContract
      ? "Datum doručení je před datem uzavření smlouvy. Zkontroluj zadaná data."
      : inDeadline
        ? `Odstoupení je doručené včas. Rozhodné datum odstoupení je ${formatDateCz(
            deliveryDate
          )}.`
        : `Odstoupení bylo doručeno po lhůtě. Nejpozdější doručení bylo ${formatDateCz(
            deliveryDeadline
          )}.`,
  };
};

const VARIANT_PRESENTATION: Record<VariantId, { caption: string; badge: string }> = {
  lifeAnniversary: { caption: "K měsíčnímu výročí smlouvy", badge: "6 týdnů" },
  nonLifeAnniversary: { caption: "K ročnímu výročí smlouvy", badge: "6 týdnů" },
  twoMonths: { caption: "Od uzavření smlouvy", badge: "2 měsíce" },
  postClaim: { caption: "Od oznámení pojistné události", badge: "3 měsíce" },
  lifeWithdrawal: { caption: "Od uzavření životního pojištění", badge: "1 měsíc" },
};

function TimingIllustration() {
  return (
    <svg viewBox="0 0 300 220" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="150" cy="119" rx="123" ry="88" fill="#f4edf8" />
      <ellipse cx="151" cy="191" rx="109" ry="10" fill="#e9deef" opacity=".6" />
      <g transform="rotate(-7 125 105)">
        <rect x="47" y="39" width="164" height="139" rx="15" fill="white" stroke="#d7c4e3" strokeWidth="1.5" />
        <path d="M47 55a16 16 0 0 1 16-16h132a16 16 0 0 1 16 16v24H47V55Z" fill="#ece0f4" />
        <path d="M82 30v22m91-22v22" stroke="#a782bc" strokeWidth="6" strokeLinecap="round" />
        <path d="M67 79h125" stroke="#decce8" />
        {[0, 1, 2].map((row) => [0, 1, 2, 3].map((column) => (
          <rect key={`${row}-${column}`} x={68 + column * 31} y={95 + row * 23} width="17" height="12" rx="3" fill={row === 1 && column === 2 ? "#9a75b2" : "#f1eaf6"} />
        )))}
        <path d="m133 123 3 3 5-6" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="rotate(7 218 144)">
        <rect x="168" y="118" width="100" height="66" rx="9" fill="#fff" stroke="#cbb5d9" strokeWidth="1.5" />
        <path d="m171 125 46 32 48-32M170 179l30-25m65 25-30-25" stroke="#d4c1e0" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <circle cx="240" cy="65" r="24" fill="#fff" stroke="#d6c3e1" strokeWidth="1.5" />
      <path d="M240 51v15l10 6" stroke="#9670ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="137" r="4" fill="#d9c5e6" />
      <path d="M274 101h9m-4.5-4.5v9M30 72h8m-4-4v8" stroke="#c4a7d5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function VariantCard({ variant, active, onSelect }: {
  variant: VariantConfig; active: boolean; onSelect: () => void;
}) {
  const Icon = variant.icon;
  const presentation = VARIANT_PRESENTATION[variant.id];
  return (
    <button type="button" onClick={onSelect} className={styles.variantCard}
      aria-pressed={active} aria-controls="timing-calculator" aria-label={variant.label}>
      <span className={styles.variantIcon}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
      <span className={styles.variantCopy}>
        <strong>{variant.shortLabel}</strong>
        <span>{presentation.caption}</span>
        <small>{presentation.badge}</small>
      </span>
      <span className={styles.variantCheck} aria-hidden="true">{active ? <Check size={13} /> : <ArrowRight size={13} />}</span>
    </button>
  );
}

function DateInput({ id, label, value, onChange, order }: {
  id: string; label: string; value: string; onChange: (value: string) => void; order: string;
}) {
  return (
    <div className={styles.dateField}>
      <label htmlFor={id}><span>{order}</span>{label}</label>
      <input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ResultPanel({ result }: { result: CalculationResult }) {
  const StatusIcon = result.tone === "warning" ? TriangleAlert : result.tone === "success" ? CheckCircle2 : Info;
  return (
    <section className={styles.result} data-tone={result.tone} aria-labelledby="timing-result-title" role="status">
      <div className={styles.resultHeading}>
        <div><p className={styles.eyebrow}>03 · Výsledek</p><h3 id="timing-result-title">{result.tone === "success" ? "Tvoje rozhodné termíny" : "Zkontroluj lhůtu a zadaná data"}</h3></div>
        <span className={styles.resultIcon}><StatusIcon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
      </div>
      <dl className={styles.dates}>
        {result.details.map((detail, index) => (
          <div key={detail.label} data-important={index === result.details.length - 1 && result.tone === "success"}>
            <dt>{detail.label}</dt><dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.resultMessage}>
        <StatusIcon size={16} aria-hidden="true" />
        <div><strong>{result.headline}</strong><p>{result.message}</p></div>
      </div>
      {result.nextIfDeadlineMissed && (
        <div className={styles.nextDate}>
          <Clock3 size={16} aria-hidden="true" />
          <p>Pokud propásneš nejzazší doručení, další možné ukončení je <strong>{result.nextIfDeadlineMissed.terminationDate}</strong>. Výpověď pro tento termín doruč nejpozději <strong>{result.nextIfDeadlineMissed.deliveryDeadline}</strong>.</p>
        </div>
      )}
      {result.tone === "success" && <div className={styles.resultFooter}><span><FileCheck2 size={14} aria-hidden="true" />Teď můžeš připravit výpověď.</span><Link href="/pomucky/vypoved-smlouvy">Připravit výpověď<ArrowRight size={14} aria-hidden="true" /></Link></div>}
    </section>
  );
}

function CalculatorBox({ variant }: { variant: VariantConfig }) {
  const [primaryDate, setPrimaryDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const primary = parseDateInput(primaryDate);
  const delivery = parseDateInput(deliveryDate);

  const primaryLabel =
    variant.id === "postClaim"
      ? "Datum oznámení pojistné události"
      : variant.id === "lifeAnniversary" || variant.id === "nonLifeAnniversary"
        ? "Datum počátku smlouvy"
        : "Datum uzavření smlouvy";
  const deliveryLabel =
    variant.id === "lifeWithdrawal"
      ? "Datum doručení odstoupení"
      : "Datum doručení výpovědi";

  const result = useMemo<CalculationResult | null>(() => {
    if (!primary || !delivery) return null;
    if (variant.id === "lifeAnniversary") return calculateAnniversaryTermination(primary, delivery, "monthly");
    if (variant.id === "nonLifeAnniversary") return calculateAnniversaryTermination(primary, delivery, "annual");
    if (variant.id === "twoMonths") return calculateTwoMonthsTermination(primary, delivery);
    if (variant.id === "postClaim") return calculatePostClaimTermination(primary, delivery);
    return calculateLifeWithdrawal(primary, delivery);
  }, [delivery, primary, variant.id]);

  const deadlinePreview = useMemo(() => {
    if (!primary) return null;
    if (variant.id === "twoMonths") return `Nejpozdější doručení výpovědi: ${formatDateCz(addCalendarMonths(primary, 2))}.`;
    if (variant.id === "postClaim") return `Nejpozdější doručení výpovědi: ${formatDateCz(addCalendarMonths(primary, 3))}.`;
    if (variant.id === "lifeWithdrawal") return `Nejpozdější doručení odstoupení: ${formatDateCz(addCalendarMonths(primary, 1))}.`;
    return null;
  }, [primary, variant.id]);

  return (
    <div id="timing-calculator" className={styles.calculator}>
      <section className={styles.formPanel} aria-labelledby="timing-calculator-title">
        <div className={styles.formHeading}>
          <div><p className={styles.eyebrow}>02 · Rozhodná data</p><h2 id="timing-calculator-title">{variant.title}</h2></div>
          <span className={styles.formBadge}>{variant.eyebrow}</span>
        </div>
        <p className={styles.formDescription}>{variant.formDescription}</p>
        <div className={styles.dateInputs}>
          <DateInput id={`${variant.id}-primary-date`} label={primaryLabel} value={primaryDate} onChange={setPrimaryDate} order="1" />
          <DateInput id={`${variant.id}-delivery-date`} label={deliveryLabel} value={deliveryDate} onChange={setDeliveryDate} order="2" />
        </div>
        <div className={styles.formFooter}>
          <span><CalendarDays size={14} aria-hidden="true" />Výsledek se přepočítá automaticky.</span>
          <button type="button" disabled={!primaryDate && !deliveryDate} onClick={() => { setPrimaryDate(""); setDeliveryDate(""); }}><RotateCcw size={13} aria-hidden="true" />Vymazat data</button>
        </div>
      </section>
      {result ? <ResultPanel result={result} /> : (
        <section className={styles.waitingResult} aria-live="polite">
          <span className={styles.waitingIcon}><Clock3 size={25} strokeWidth={1.5} aria-hidden="true" /></span>
          <div><p className={styles.eyebrow}>03 · Výsledek</p><h3>{deadlinePreview ? "První termín už známe" : "Ještě doplň rozhodná data"}</h3><p>{deadlinePreview ?? "Po zadání obou dat uvidíš nejzazší doručení a datum ukončení smlouvy."}</p></div>
        </section>
      )}
    </div>
  );
}

export default function TerminationTimingPage() {
  const [selectedVariantId, setSelectedVariantId] = useState<VariantId | null>(null);
  const selectedVariant = VARIANTS.find((variant) => variant.id === selectedVariantId) ?? null;
  return (
    <AppLayout active="tools">
      <div className={`${pageFont.className} ${styles.page}`}>
        <Link href="/pomucky" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />Zpět na pomůcky</Link>
        <header className={styles.hero}>
          <div><p className={styles.eyebrow}><Clock3 size={14} aria-hidden="true" />Pomůcky · Výpovědní lhůty</p><h1>Jak stíhám<br />výpověď smlouvy<span>?</span></h1><p className={styles.heroDescription}>Pár dat a máš jasno. Ověř termín doručení výpovědi a zjisti, kdy může smlouva skončit.</p><div className={styles.heroMeta}><span><CalendarDays size={13} aria-hidden="true" />Přehled rozhodných termínů</span><span><ShieldCheck size={13} aria-hidden="true" />5 způsobů ukončení</span></div></div>
          <div className={styles.heroArt}><TimingIllustration /></div>
        </header>
        <div className={styles.workspace}>
          <section className={styles.choices} aria-labelledby="timing-variants-heading">
            <div className={styles.choicesHeading}><p className={styles.eyebrow}>01 · Způsob ukončení</p><h2 id="timing-variants-heading">Vyber svoji situaci</h2><p>Každá varianta má vlastní lhůtu.</p></div>
            <div className={styles.variantList}>{VARIANTS.map((variant) => <VariantCard key={variant.id} variant={variant} active={variant.id === selectedVariantId} onSelect={() => setSelectedVariantId(variant.id)} />)}</div>
          </section>
          {selectedVariant ? <CalculatorBox key={selectedVariant.id} variant={selectedVariant} /> : (
            <section id="timing-calculator" className={styles.emptyPanel} aria-labelledby="timing-empty-title">
              <div className={styles.emptyArtwork}><CalendarDays size={42} strokeWidth={1.2} aria-hidden="true" /><span><Check size={18} aria-hidden="true" /></span></div>
              <p className={styles.eyebrow}>Tvůj přehled termínů</p><h2 id="timing-empty-title">Zjisti, kdy může smlouva skončit.</h2><p>Začni výběrem způsobu ukončení. Pak stačí zadat dvě data a rozhodné termíny se zobrazí tady.</p>
              <ol className={styles.emptySteps}><li><span>1</span>Vyber variantu</li><li><span>2</span>Zadej data</li><li><span>3</span>Získej termíny</li></ol>
            </section>
          )}
        </div>
        <aside className={styles.note}><Info size={16} aria-hidden="true" /><p>Výpočet je orientační pomůcka pro kontrolu lhůt. U konkrétní smlouvy vždy ověř přesné pojistné podmínky a datum doručení pojišťovně.</p></aside>
      </div>
    </AppLayout>
  );
}
