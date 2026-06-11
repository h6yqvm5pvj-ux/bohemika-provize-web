"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  GraduationCap,
  HeartPulse,
  Home,
  PiggyBank,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney } from "@/app/lib/formatters";
import SplitTitle from "../plan-produkce/SplitTitle";

type StepId = "base" | "family" | "debtEducation" | "confirm";
type ProviderRole = "main" | "secondary";
type InputKey =
  | "age"
  | "insuredIncome"
  | "essentialExpenses"
  | "loanPayments"
  | "totalDebt"
  | "otherHouseholdIncome"
  | "childrenCount"
  | "childHorizonYears"
  | "mortgageYears"
  | "mortgageRate"
  | "educationMonthlyPerChild"
  | "educationYears"
  | "funeralCost";
type InputValues = Record<InputKey, string>;

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "base", label: "Základ" },
  { id: "family", label: "Rodina" },
  { id: "debtEducation", label: "Hypotéka" },
  { id: "confirm", label: "Potvrzení" },
];

const INVALIDITY_RATIOS = [0.4, 0.6, 1] as const;
const INVALIDITY_LABELS = ["1. stupeň", "2. stupeň", "3. stupeň"] as const;
const RETIREMENT_AGE = 65;
const DEATH_COVERAGE_END_AGE = 75;
const DAILY_TARGET_RATIO = 0.4;
const DEFAULT_SOLO_DEATH_YEARS = 5;
const FIELD_TEXT_STYLE: CSSProperties = {
  color: "#fff",
  WebkitTextFillColor: "#fff",
};

const BASE_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
  {
    key: "age",
    label: "Věk",
    description: "Pro invaliditu počítáme krytí do 65 let, pro smrt orientačně do 75 let.",
    badge: "roky",
    icon: Activity,
  },
  {
    key: "insuredIncome",
    label: "Čistý měsíční příjem",
    description: "Příjem klienta, který v modelu při smrti vypadne.",
    badge: "Kč / měsíc",
    icon: Banknote,
  },
  {
    key: "essentialExpenses",
    label: "Závazky - nutné výdaje",
    description: "Bydlení, energie, jídlo, domácnost a další pevné náklady.",
    badge: "Kč / měsíc",
    icon: Home,
  },
  {
    key: "loanPayments",
    label: "Závazky - splátky úvěru / hypoték",
    description: "Měsíční splátky hypotéky, úvěrů a dalších závazků.",
    badge: "Kč / měsíc",
    icon: Wallet,
  },
  {
    key: "totalDebt",
    label: "Celková dlužná částka",
    description: "Aktuální zůstatek hypotéky, úvěrů a dalších dluhů.",
    badge: "Kč celkem",
    icon: CircleDollarSign,
  },
];

const FAMILY_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
  {
    key: "otherHouseholdIncome",
    label: "Ostatní příjem domácnosti",
    description: "Příjem partnera nebo jiný příjem, který po smrti klienta zůstane.",
    badge: "Kč / měsíc",
    icon: Users,
  },
  {
    key: "childrenCount",
    label: "Počet dětí",
    description: "Počet dětí, pro které má být krytý horizont do dospělosti a studium.",
    badge: "děti",
    icon: GraduationCap,
  },
  {
    key: "childHorizonYears",
    label: "Let do dospělosti dětí",
    description: "U rodiny typicky 10 až 15 let podle věku dětí.",
    badge: "roky",
    icon: Activity,
  },
];

const DEBT_EDUCATION_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
  {
    key: "mortgageYears",
    label: "Zbývající doba splácení",
    description: "Pro anuitně klesající smrt k hypotéce nebo úvěru.",
    badge: "roky",
    icon: Home,
  },
  {
    key: "mortgageRate",
    label: "Úrok úvěru",
    description: "Orientační sazba pro poznámku k anuitně klesající částce.",
    badge: "% p.a.",
    icon: PiggyBank,
  },
  {
    key: "educationMonthlyPerChild",
    label: "Studium na dítě měsíčně",
    description: "Průměrně 15 000 Kč na ubytování, jídlo, dopravu a běžné výdaje.",
    badge: "Kč / měsíc",
    icon: GraduationCap,
  },
  {
    key: "educationYears",
    label: "Délka studia",
    description: "Typicky 3 až 5 let.",
    badge: "roky",
    icon: Activity,
  },
  {
    key: "funeralCost",
    label: "Náklady na rozloučení",
    description: "Orientačně 50 000 až 100 000 Kč jako konstantní částka.",
    badge: "Kč",
    icon: HeartPulse,
  },
];

function parseInput(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeInputValue(value: string): string {
  return value.replace(/[^\d,. ]/g, "");
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function roundUp(value: number, step = 50_000): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} %`;
}

export default function LifeInsuranceSetupPage() {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providerRole, setProviderRole] = useState<ProviderRole>("main");
  const [values, setValues] = useState<InputValues>({
    age: "35",
    insuredIncome: "35000",
    essentialExpenses: "30000",
    loanPayments: "8000",
    totalDebt: "3000000",
    otherHouseholdIncome: "25000",
    childrenCount: "2",
    childHorizonYears: "15",
    mortgageYears: "25",
    mortgageRate: "5",
    educationMonthlyPerChild: "15000",
    educationYears: "5",
    funeralCost: "100000",
  });

  const numbers = useMemo(() => {
    const age = Math.max(0, Math.round(parseInput(values.age)));
    const insuredIncome = roundMoney(parseInput(values.insuredIncome));
    const essentialExpenses = roundMoney(parseInput(values.essentialExpenses));
    const loanPayments = roundMoney(parseInput(values.loanPayments));
    const totalDebt = roundMoney(parseInput(values.totalDebt));
    const otherHouseholdIncome = roundMoney(parseInput(values.otherHouseholdIncome));
    const childrenCount = Math.max(0, Math.round(parseInput(values.childrenCount)));
    const childHorizonYears = Math.max(0, Math.round(parseInput(values.childHorizonYears)));
    const mortgageYears = Math.max(0, Math.round(parseInput(values.mortgageYears)));
    const mortgageRate = Math.max(0, parseInput(values.mortgageRate));
    const educationMonthlyPerChild = roundMoney(parseInput(values.educationMonthlyPerChild));
    const educationYears = Math.max(0, Math.round(parseInput(values.educationYears)));
    const funeralCost = roundMoney(parseInput(values.funeralCost));
    const monthlyExpenses = essentialExpenses + loanPayments;
    const householdIncome = insuredIncome + otherHouseholdIncome;
    const monthlyReserve = householdIncome - monthlyExpenses;
    const incomeAfterDeath = otherHouseholdIncome;
    const monthlyGapAfterDeath = Math.max(0, monthlyExpenses - incomeAfterDeath);
    const invalidityYears = Math.max(0, RETIREMENT_AGE - age);
    const invalidityMonths = invalidityYears * 12;
    const deathTermTo75 = Math.max(0, DEATH_COVERAGE_END_AGE - age);
    const incomeGapYears =
      childrenCount > 0 ? Math.max(1, childHorizonYears) : DEFAULT_SOLO_DEATH_YEARS;

    return {
      age,
      insuredIncome,
      essentialExpenses,
      loanPayments,
      totalDebt,
      otherHouseholdIncome,
      childrenCount,
      childHorizonYears,
      mortgageYears,
      mortgageRate,
      educationMonthlyPerChild,
      educationYears,
      funeralCost,
      monthlyExpenses,
      householdIncome,
      monthlyReserve,
      incomeAfterDeath,
      monthlyGapAfterDeath,
      invalidityYears,
      invalidityMonths,
      deathTermTo75,
      incomeGapYears,
    };
  }, [values]);

  const sickLeave = useMemo(() => {
    const stateBenefit = Math.round(numbers.insuredIncome * 0.6);
    const incomeShortfall = Math.max(0, numbers.insuredIncome - stateBenefit);
    const commitmentGap = Math.max(0, numbers.monthlyExpenses - stateBenefit);
    const minimumTarget = numbers.insuredIncome * DAILY_TARGET_RATIO;
    const recommendedMonthly = roundMoney(
      Math.max(minimumTarget, incomeShortfall, commitmentGap)
    );

    return {
      stateBenefit,
      incomeShortfall,
      commitmentGap,
      recommendedMonthly,
      recommendedDaily: roundUp(recommendedMonthly / 30, 10),
    };
  }, [numbers.insuredIncome, numbers.monthlyExpenses]);

  const invalidity = useMemo(() => {
    return INVALIDITY_RATIOS.map((ratio, index) => {
      const monthlyNeed = roundMoney(
        Math.max(numbers.insuredIncome * ratio, numbers.monthlyExpenses * ratio)
      );
      const lumpWithoutDebt = roundMoney(monthlyNeed * numbers.invalidityMonths);

      return {
        label: INVALIDITY_LABELS[index],
        ratio,
        monthlyNeed,
        lumpWithoutDebt,
      };
    });
  }, [numbers.insuredIncome, numbers.invalidityMonths, numbers.monthlyExpenses]);

  const death = useMemo(() => {
    const incomeGapCoverage = roundMoney(
      numbers.monthlyGapAfterDeath * 12 * numbers.incomeGapYears
    );
    const educationCoverage = roundMoney(
      numbers.childrenCount *
        numbers.educationMonthlyPerChild *
        12 *
        numbers.educationYears
    );
    const salaryFloor = roundMoney(numbers.insuredIncome * 12 * DEFAULT_SOLO_DEATH_YEARS);
    const needsBasedDecreasing = incomeGapCoverage + educationCoverage;
    const decreasingAmount = roundUp(
      numbers.childrenCount > 0
        ? Math.max(needsBasedDecreasing, salaryFloor)
        : Math.max(needsBasedDecreasing, salaryFloor),
      100_000
    );
    const constantAmount = roundUp(clamp(numbers.funeralCost, 50_000, 100_000), 10_000);
    const annuityMortgageAmount = roundUp(numbers.totalDebt, 50_000);

    return {
      incomeGapCoverage,
      educationCoverage,
      salaryFloor,
      needsBasedDecreasing,
      decreasingAmount,
      constantAmount,
      annuityMortgageAmount,
    };
  }, [
    numbers.childrenCount,
    numbers.educationMonthlyPerChild,
    numbers.educationYears,
    numbers.funeralCost,
    numbers.incomeGapYears,
    numbers.insuredIncome,
    numbers.monthlyGapAfterDeath,
    numbers.totalDebt,
  ]);

  const currentStep = STEPS[step]?.id ?? "base";
  const lastStep = STEPS.length - 1;
  const canCalculate =
    numbers.age > 0 && numbers.insuredIncome > 0 && numbers.invalidityMonths > 0;
  const householdExpenseRatio =
    numbers.householdIncome > 0
      ? Math.round((numbers.monthlyExpenses / numbers.householdIncome) * 100)
      : 0;

  const updateValue = (key: InputKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: sanitizeInputValue(value) }));
    setCompleted(false);
    setFormError(null);
  };

  const validateInputs = () => {
    if (numbers.age <= 0) {
      setFormError("Doplň věk klienta.");
      return false;
    }

    if (numbers.age >= RETIREMENT_AGE) {
      setFormError("Pro výpočet invalidity musí být věk nižší než 65 let.");
      return false;
    }

    if (numbers.insuredIncome <= 0) {
      setFormError("Doplň čistý měsíční příjem klienta.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const goToNextStep = () => {
    if (!validateInputs()) return;

    if (step < lastStep) {
      setStep((prev) => Math.min(prev + 1, lastStep));
      return;
    }

    setCompleted(true);
  };

  const goToPreviousStep = () => {
    setFormError(null);
    setCompleted(false);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-2 pb-10 sm:px-3">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SplitTitle
            text="Nastavení Životního pojištění"
            className="!text-3xl sm:!text-5xl"
          />
          {completed ? (
            <button
              type="button"
              onClick={() => {
                setCompleted(false);
                setStep(0);
              }}
              className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50 sm:self-auto"
            >
              <ChevronLeft className="h-4 w-4" />
              Upravit vstupy
            </button>
          ) : null}
        </header>

        <style jsx global>{`
          body.simple-bg.simple-bg-white
            .app-content
            .life-setup-dark-panel
            .text-white,
          body.simple-bg.simple-bg-white
            .app-content
            .life-setup-dark-panel
            .\\!text-white,
          body.simple-bg.simple-bg-white
            .app-content
            .life-setup-dark-panel
            .life-setup-force-white,
          body.simple-bg.simple-bg-white
            .app-content
            .life-setup-dark-panel
            input {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
          }
        `}</style>

        {!completed ? (
          <section className="life-setup-dark-panel relative overflow-hidden rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                  Pomůcka
                </p>
                <h2 className="life-setup-force-white mt-1 text-xl font-bold tracking-tight text-white">
                  Nejdřív zadej vstupní informace
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-violet-300/30 bg-violet-400/15 px-3 py-1.5 text-xs font-semibold text-violet-100">
                <ShieldCheck className="h-4 w-4" />
                Náhled se zobrazí po potvrzení
              </div>
            </div>

            <StepperProgress step={step} setStep={setStep} validateInputs={validateInputs} />

            <div className="mt-5">
              {currentStep === "base" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {BASE_FIELDS.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                      />
                    ))}
                  </div>
                  <WizardMetrics
                    items={[
                      {
                        label: "Měsíční náklady",
                        value: formatMoney(numbers.monthlyExpenses),
                      },
                      {
                        label: "Příjem domácnosti",
                        value: formatMoney(numbers.householdIncome),
                      },
                      {
                        label: "Rezerva po nákladech",
                        value: formatMoney(numbers.monthlyReserve),
                        danger: numbers.monthlyReserve < 0,
                      },
                    ]}
                  />
                </div>
              ) : null}

              {currentStep === "family" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {FAMILY_FIELDS.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                      />
                    ))}
                  </div>
                  <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      Kdo je hlavní živitel
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[
                        {
                          id: "main" as const,
                          label: "Klient je hlavní živitel",
                          description: "Vhodné, když přináší větší část rodinného příjmu.",
                        },
                        {
                          id: "secondary" as const,
                          label: "Klient není hlavní živitel",
                          description: "Výpočet stále kryje výpadek příjmu klienta.",
                        },
                      ].map((item) => {
                        const selected = providerRole === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setProviderRole(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? "border-violet-200/70 bg-violet-400/20 shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                                : "border-white/14 bg-white/[0.03] hover:border-violet-300/40 hover:bg-white/[0.07]"
                            }`}
                          >
                            <span className="life-setup-force-white block text-sm font-semibold text-white">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-violet-100/65">
                              {item.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === "debtEducation" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {DEBT_EDUCATION_FIELDS.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                      />
                    ))}
                  </div>
                  <WizardMetrics
                    items={[
                      {
                        label: "Výpadek po smrti",
                        value: formatMoney(numbers.monthlyGapAfterDeath),
                      },
                      {
                        label: "Studium dětí",
                        value: formatMoney(death.educationCoverage),
                      },
                      {
                        label: "Hypotéka / dluhy",
                        value: formatMoney(numbers.totalDebt),
                      },
                    ]}
                  />
                </div>
              ) : null}

              {currentStep === "confirm" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <ConfirmTile
                      label="Klient"
                      value={`${numbers.age} let`}
                      note={`Příjem ${formatMoney(numbers.insuredIncome)}.`}
                    />
                    <ConfirmTile
                      label="Domácnost"
                      value={formatMoney(numbers.householdIncome)}
                      note={`Náklady jsou ${householdExpenseRatio} % příjmu domácnosti.`}
                    />
                    <ConfirmTile
                      label="Děti"
                      value={`${numbers.childrenCount}`}
                      note={
                        numbers.childrenCount > 0
                          ? `Horizont ${numbers.childHorizonYears} let.`
                          : "Bez nákladů na studium."
                      }
                    />
                    <ConfirmTile
                      label="Smrt - výpadek"
                      value={formatMoney(numbers.monthlyGapAfterDeath)}
                      note="Měsíčně po smrti klienta."
                    />
                  </div>
                  <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-sm leading-relaxed text-violet-50">
                    Po potvrzení se zobrazí náhled doporučeného nastavení: denní
                    dávka pracovní neschopnosti, pojistné částky invalidity a tři
                    části krytí smrti.
                  </div>
                </div>
              ) : null}
            </div>

            {formError ? (
              <p className="mt-4 rounded-2xl border border-rose-300/45 bg-rose-400/15 px-3 py-2 text-xs text-rose-100">
                {formError}
              </p>
            ) : null}

            {!canCalculate && currentStep !== "base" ? (
              <p className="mt-4 rounded-2xl border border-amber-200/35 bg-amber-300/12 px-3 py-2 text-xs text-amber-50">
                Pro výpočet doplň v prvním kroku věk nižší než 65 let a čistý měsíční příjem.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-violet-100/70">
                Krok {step + 1} / {STEPS.length}
              </p>
              <div className="ml-auto flex items-center gap-2">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Zpět
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={goToNextStep}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110"
                >
                  {step < lastStep ? "Pokračovat" : "Potvrdit a zobrazit náhled"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <PreviewPanel
            numbers={numbers}
            providerRole={providerRole}
            sickLeave={sickLeave}
            invalidity={invalidity}
            death={death}
          />
        )}
      </div>
    </AppLayout>
  );
}

function StepperProgress({
  step,
  setStep,
  validateInputs,
}: {
  step: number;
  setStep: (step: number) => void;
  validateInputs: () => boolean;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
      >
        {STEPS.map((stepItem, index) => {
          const stepDone = step > index;
          const stepActive = step === index;

          return (
            <button
              key={stepItem.id}
              type="button"
              onClick={() => {
                if (index === 0 || validateInputs()) {
                  setStep(index);
                }
              }}
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-1 text-center transition hover:bg-white/[0.05]"
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                  stepDone
                    ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                    : stepActive
                      ? "border-violet-200/70 bg-violet-400/30 text-[#f8fafc]"
                      : "border-white/20 bg-white/[0.03] text-violet-200/70"
                }`}
              >
                {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  stepActive || stepDone ? "text-[#f4f0ff]" : "text-violet-200/60"
                }`}
              >
                {stepItem.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)] transition-[width] duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function NumberField({
  field,
  value,
  onChange,
}: {
  field: {
    key: InputKey;
    label: string;
    description: string;
    badge: string;
    icon: LucideIcon;
  };
  value: string;
  onChange: (value: string) => void;
}) {
  const Icon = field.icon;

  return (
    <label className="group min-h-[172px] overflow-hidden rounded-2xl border border-white/14 bg-white/[0.05] transition focus-within:border-violet-300/40 focus-within:bg-white/[0.08]">
      <div className="flex h-full flex-col px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] text-violet-100">
            <Icon className="h-5 w-5" />
          </span>
          <span className="rounded-full border border-violet-200/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-semibold text-violet-50">
            {field.badge}
          </span>
        </div>
        <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/85">
          {field.label}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full border-0 border-b border-white/18 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none !text-white outline-none transition placeholder:text-white/30 focus:border-violet-200 focus:ring-0"
          style={FIELD_TEXT_STYLE}
          placeholder="0"
        />
        <span className="mt-2 text-[11px] leading-snug text-violet-100/65">
          {field.description}
        </span>
      </div>
    </label>
  );
}

function WizardMetrics({
  items,
}: {
  items: Array<{ label: string; value: string; danger?: boolean }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/80">
            {item.label}
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              item.danger ? "text-rose-100" : "text-white"
            }`}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/[0.06] px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/80">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-tight text-white">
        {value}
      </div>
      <p className="mt-2 text-xs leading-snug text-violet-100/65">{note}</p>
    </div>
  );
}

function PreviewPanel({
  numbers,
  providerRole,
  sickLeave,
  invalidity,
  death,
}: {
  numbers: {
    age: number;
    insuredIncome: number;
    essentialExpenses: number;
    loanPayments: number;
    totalDebt: number;
    otherHouseholdIncome: number;
    childrenCount: number;
    childHorizonYears: number;
    mortgageYears: number;
    mortgageRate: number;
    educationMonthlyPerChild: number;
    educationYears: number;
    funeralCost: number;
    monthlyExpenses: number;
    householdIncome: number;
    monthlyReserve: number;
    incomeAfterDeath: number;
    monthlyGapAfterDeath: number;
    invalidityYears: number;
    invalidityMonths: number;
    deathTermTo75: number;
    incomeGapYears: number;
  };
  providerRole: ProviderRole;
  sickLeave: {
    stateBenefit: number;
    incomeShortfall: number;
    commitmentGap: number;
    recommendedMonthly: number;
    recommendedDaily: number;
  };
  invalidity: Array<{
    label: string;
    ratio: number;
    monthlyNeed: number;
    lumpWithoutDebt: number;
  }>;
  death: {
    incomeGapCoverage: number;
    educationCoverage: number;
    salaryFloor: number;
    needsBasedDecreasing: number;
    decreasingAmount: number;
    constantAmount: number;
    annuityMortgageAmount: number;
  };
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="life-setup-dark-panel border-b border-slate-200 bg-[linear-gradient(135deg,#2e1065_0%,#7c3aed_52%,#a855f7_100%)] px-5 py-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
            Náhled nastavení
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            Co a jak nastavit ve smlouvě
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-violet-50/78">
            Výpočet vychází z toho, co po smrti nebo dlouhodobém zdravotním
            problému v domácnosti reálně chybí: příjem, dluhy, horizont dětí a
            jednorázové náklady.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-4">
          <PreviewMetric
            label="Příjem domácnosti"
            value={formatMoney(numbers.householdIncome)}
            note={`Klient ${formatMoney(numbers.insuredIncome)} + ostatní ${formatMoney(numbers.otherHouseholdIncome)}.`}
          />
          <PreviewMetric
            label="Náklady domácnosti"
            value={formatMoney(numbers.monthlyExpenses)}
            note={`Nutné výdaje ${formatMoney(numbers.essentialExpenses)} + splátky ${formatMoney(numbers.loanPayments)}.`}
          />
          <PreviewMetric
            label="Po smrti klienta chybí"
            value={formatMoney(numbers.monthlyGapAfterDeath)}
            note={`Zůstane příjem ${formatMoney(numbers.incomeAfterDeath)}.`}
          />
          <PreviewMetric
            label="Role klienta"
            value={providerRole === "main" ? "Hlavní živitel" : "Vedlejší příjem"}
            note={`Nastavení smrti počítá s výpadkem příjmu klienta.`}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                Smrt
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">
                Doporučené nastavení
              </h3>
            </div>
            <HeartPulse className="h-8 w-8 text-violet-700" />
          </div>

          <div className="mt-5 space-y-3">
            <RecommendationRow
              label="Konstantní PČ pro případ smrti"
              value={formatMoney(death.constantAmount)}
              note="Na náklady rozloučení. Držet konstantně, typicky 50 000 až 100 000 Kč."
            />
            <RecommendationRow
              label="Klesající PČ pro případ smrti"
              value={formatMoney(death.decreasingAmount)}
              note={`Výpadek příjmu ${formatMoney(death.incomeGapCoverage)} + vzdělání dětí ${formatMoney(death.educationCoverage)}. Orientačně do ${numbers.deathTermTo75} let věku klienta.`}
            />
            <RecommendationRow
              label="Anuitně klesající PČ k hypotéce / úvěru"
              value={formatMoney(death.annuityMortgageAmount)}
              note={
                numbers.totalDebt > 0
                  ? `Nastavit podle dluhu na ${numbers.mortgageYears} let, úrok ${formatPercent(numbers.mortgageRate)} p.a.`
                  : "Pokud klient nemá dluh, tuto část není potřeba nastavovat."
              }
            />
          </div>

          <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-950">
            Kontrola proti rychlé metodě: 5 ročních příjmů klienta vychází na{" "}
            <strong>{formatMoney(death.salaryFloor)}</strong>. Pro rodinu je ale
            důležitější výpadek příjmu, dluhy a horizont dětí.
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                Pracovní neschopnost
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">
                Denní dávka
              </h3>
            </div>
            <ShieldCheck className="h-8 w-8 text-violet-700" />
          </div>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Nastavit
            </div>
            <div className="mt-2 text-4xl font-bold text-violet-950">
              {formatMoney(sickLeave.recommendedDaily)} / den
            </div>
            <p className="mt-2 text-sm leading-relaxed text-violet-900">
              Měsíčně přibližně {formatMoney(sickLeave.recommendedMonthly)}.
              Výpočet hlídá minimálně 40 % příjmu a zároveň krytí měsíčních
              nákladů.
            </p>
          </div>

          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
            <SmallCalcRow
              label="Orientační státní nemocenská"
              value={formatMoney(sickLeave.stateBenefit)}
            />
            <SmallCalcRow
              label="Pokles proti příjmu klienta"
              value={formatMoney(sickLeave.incomeShortfall)}
            />
            <SmallCalcRow
              label="Mezera proti nákladům"
              value={formatMoney(sickLeave.commitmentGap)}
            />
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Invalidita
            </p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">
            Rentové pojistné částky podle stupně
            </h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Krytí do 65 let: {numbers.invalidityYears} let
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {invalidity.map((item) => (
            <article
              key={item.label}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
            >
              <div className="h-1.5 bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)]" />
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Stupeň invalidity
                    </div>
                    <h4 className="mt-1 text-lg font-semibold text-slate-950">
                      {item.label}
                    </h4>
                  </div>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-800">
                    {Math.round(item.ratio * 100)} %
                  </span>
                </div>
                <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
                  <SmallCalcRow
                    label="Měsíční renta"
                    value={formatMoney(item.monthlyNeed)}
                  />
                  <SmallCalcRow
                    label="PČ bez dluhů"
                    value={formatMoney(item.lumpWithoutDebt)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>

        {numbers.totalDebt > 0 ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                  Invalidita a úvěr
                </div>
                <h4 className="mt-1 text-lg font-bold text-violet-950">
                  Anuitně klesající PČ k hypotéce / úvěru na invaliditu
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-violet-900">
                  Nastavit samostatně podle aktuální dlužné částky na dobu splácení.
                  Renta výše kryje výpadek příjmu, tato část kryje splacení dluhu.
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="text-3xl font-bold tabular-nums text-violet-950">
                  {formatMoney(death.annuityMortgageAmount)}
                </div>
                <div className="mt-1 text-xs font-semibold text-violet-800">
                  {numbers.mortgageYears > 0
                    ? `${numbers.mortgageYears} let, úrok ${formatPercent(numbers.mortgageRate)} p.a.`
                    : `Podle doby splácení, úrok ${formatPercent(numbers.mortgageRate)} p.a.`}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-b border-slate-200 px-5 py-4 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <p className="mt-1 text-xs leading-snug text-slate-500">{note}</p>
    </div>
  );
}

function RecommendationRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">{label}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{note}</p>
        </div>
        <div className="shrink-0 text-right text-xl font-bold tabular-nums text-violet-800">
          {value}
        </div>
      </div>
    </div>
  );
}

function SmallCalcRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-slate-950">
        {value}
      </span>
    </div>
  );
}
