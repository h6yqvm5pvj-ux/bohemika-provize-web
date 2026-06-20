"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Space_Grotesk } from "next/font/google";

import { AppLayout } from "@/components/AppLayout";

const pageFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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

function VariantCard({
  variant,
  active,
  onSelect,
}: {
  variant: VariantConfig;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = variant.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative isolate min-h-[168px] overflow-hidden rounded-[26px] border p-4 text-left shadow-[0_18px_44px_rgba(88,28,135,0.12)] transition duration-200 hover:-translate-y-0.5 sm:p-5 ${
        active
          ? "border-violet-500 bg-[linear-gradient(145deg,#2d135f_0%,#180b34_100%)] text-white ring-2 ring-violet-200"
          : "border-violet-100 bg-white/92 text-slate-900 hover:border-violet-300"
      }`}
    >
      <span
        className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl ${
          active ? "bg-violet-300/24" : "bg-violet-200/45"
        }`}
        aria-hidden="true"
      />
      <Icon
        className={`relative z-10 h-7 w-7 ${
          active ? "text-violet-200" : "text-violet-700"
        }`}
        strokeWidth={2.1}
        aria-hidden="true"
      />
      <div className="relative z-10 mt-4">
        <p
          className={`text-[11px] font-black uppercase tracking-[0.16em] ${
            active ? "text-violet-200" : "text-violet-700"
          }`}
        >
          {variant.shortLabel}
        </p>
        <h2
          className={`mt-1 text-[1.05rem] font-bold leading-snug tracking-[-0.01em] ${
            active ? "!text-white" : "text-slate-950"
          }`}
        >
          {variant.label}
        </h2>
        <p className={`mt-2 text-sm leading-5 ${active ? "!text-white/85" : "text-slate-600"}`}>
          {variant.description}
        </p>
      </div>
    </button>
  );
}

function DateInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-900" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)] outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-200/80"
      />
    </div>
  );
}

function ResultPanel({ result }: { result: CalculationResult }) {
  const toneClass =
    result.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : result.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="mt-6 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_18px_44px_rgba(15,23,42,0.10)] sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {result.details.map((detail) => (
          <div key={detail.label} className="rounded-2xl bg-slate-50 px-4 py-4">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {detail.label}
            </span>
            <span className="mt-1 block text-lg font-black text-slate-950">
              {detail.value}
            </span>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${toneClass}`}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
          <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
          <div>
            <p className="font-black">{result.headline}</p>
            <p className="mt-1 leading-6">{result.message}</p>
          </div>
        </div>
      </div>

      {result.nextIfDeadlineMissed ? (
        <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          Pokud se propásne datum <strong>Doručit nejpozději</strong>, další možné
          ukončení smlouvy bude k{" "}
          <strong>{result.nextIfDeadlineMissed.terminationDate}</strong>. Pro tento
          další termín musí být výpověď doručena nejpozději{" "}
          <strong>{result.nextIfDeadlineMissed.deliveryDeadline}</strong>.
        </div>
      ) : null}
    </div>
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

    if (variant.id === "lifeAnniversary") {
      return calculateAnniversaryTermination(primary, delivery, "monthly");
    }
    if (variant.id === "nonLifeAnniversary") {
      return calculateAnniversaryTermination(primary, delivery, "annual");
    }
    if (variant.id === "twoMonths") {
      return calculateTwoMonthsTermination(primary, delivery);
    }
    if (variant.id === "postClaim") {
      return calculatePostClaimTermination(primary, delivery);
    }
    return calculateLifeWithdrawal(primary, delivery);
  }, [delivery, primary, variant.id]);

  const deadlinePreview = useMemo(() => {
    if (!primary) return null;

    if (variant.id === "twoMonths") {
      return `Nejpozdější doručení výpovědi: ${formatDateCz(
        addCalendarMonths(primary, 2)
      )}.`;
    }
    if (variant.id === "postClaim") {
      return `Nejpozdější doručení výpovědi: ${formatDateCz(
        addCalendarMonths(primary, 3)
      )}.`;
    }
    if (variant.id === "lifeWithdrawal") {
      return `Nejpozdější doručení odstoupení: ${formatDateCz(
        addCalendarMonths(primary, 1)
      )}.`;
    }
    return null;
  }, [primary, variant.id]);

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-violet-200 bg-[linear-gradient(180deg,#fbfaff_0%,#f6f3ff_100%)] p-5 text-center shadow-[0_24px_70px_rgba(88,28,135,0.14)] sm:p-7">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">
          {variant.eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-slate-950 sm:text-3xl">
          {variant.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:text-base">
          {variant.formDescription}
        </p>
      </div>

      <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <DateInput
          id={`${variant.id}-primary-date`}
          label={primaryLabel}
          value={primaryDate}
          onChange={setPrimaryDate}
        />
        <DateInput
          id={`${variant.id}-delivery-date`}
          label={deliveryLabel}
          value={deliveryDate}
          onChange={setDeliveryDate}
        />
      </div>

      {result ? (
        <ResultPanel result={result} />
      ) : (
        <div className="mx-auto mt-6 max-w-3xl rounded-[22px] border border-white/80 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          {deadlinePreview ?? "Po zadání obou dat se zobrazí výsledek a datum ukončení smlouvy."}
        </div>
      )}
    </section>
  );
}

export default function TerminationTimingPage() {
  const [selectedVariantId, setSelectedVariantId] = useState<VariantId | null>(null);
  const selectedVariant =
    VARIANTS.find((variant) => variant.id === selectedVariantId) ?? null;

  return (
    <AppLayout active="tools">
      <div className={`${pageFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="mx-auto max-w-7xl space-y-5 px-1 sm:px-2 lg:px-3">
          <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.96)_0%,rgba(244,247,255,0.96)_46%,rgba(245,240,255,0.96)_100%)] px-5 py-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:px-8 sm:py-9">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[length:34px_34px] opacity-40" />
            <div className="relative z-10 max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.1} />
                Jak stíhám výpověď smlouvy?
              </span>
              <h1 className="mt-5 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                Ověř jak stíháš výpověď smlouvy a zjisti datum ukončení smlouvy.
              </h1>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {VARIANTS.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                active={variant.id === selectedVariantId}
                onSelect={() => setSelectedVariantId(variant.id)}
              />
            ))}
          </section>

          {selectedVariant ? (
            <CalculatorBox key={selectedVariant.id} variant={selectedVariant} />
          ) : (
            <section className="rounded-[30px] border border-dashed border-violet-200 bg-white/78 px-6 py-10 text-center shadow-[0_18px_44px_rgba(88,28,135,0.08)]">
              <p className="text-sm font-semibold text-slate-600 sm:text-base">
                Vyber nahoře variantu výpovědi a zde se zobrazí příslušný výpočet.
              </p>
            </section>
          )}

          <aside className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm leading-6 text-amber-950 shadow-[0_14px_34px_rgba(146,64,14,0.08)]">
            Výpočet je orientační pomůcka pro kontrolu lhůt. U konkrétní smlouvy vždy ověř přesné pojistné podmínky a datum doručení pojišťovně.
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
