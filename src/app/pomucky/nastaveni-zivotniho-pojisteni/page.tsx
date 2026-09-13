"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileDown,
  GraduationCap,
  HeartPulse,
  Home,
  Mail,
  Percent,
  Phone,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { formatMoney } from "@/app/lib/formatters";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import { SicknessBenefitInputs } from "./SicknessBenefitInputs";
import { SicknessBenefitBreakdown, SIMPLE_SICKNESS_COPY } from "./SicknessBenefitBreakdown";
import { calculateSicknessBenefits, DEFAULT_SICKNESS_INPUTS, validateSicknessInputs } from "./sicknessBenefits";
import styles from "./lifeInsuranceSetup.module.css";
import { LifeInsuranceExportDialog } from "./LifeInsuranceExportDialog";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";
import { DISABILITY_PENSION_COPY } from "./disabilityPensionCopy";
import { DisabilityPensionSource } from "./DisabilityPensionSource";
import {
  PDF_COPY, INVALIDITY_SCENARIOS, INVALIDITY_LABELS, RETIREMENT_AGE, DEATH_COVERAGE_END_AGE,
  DAILY_TARGET_RATIO, SICK_LEAVE_EXPENSE_RESERVE_RATIO, DEFAULT_SOLO_DEATH_YEARS,
  INVALIDITY_INVESTMENT_VARIANTS, formatGeneratedDate, formatYears, formatPdfMoney, formatPdfPercent,
  translateAdvisorRole, requiredCapitalForRenta, roundMoney,
  type StepId, type EmploymentType, type SicknessInsuranceChoice, type ProviderRole, type InvalidityModel,
  type InvalidityInvestmentVariantId, type FutureFamilyPlan, type PdfLanguage, type InputKey, type InputValues,
  type AdvisorFooterInfo, type InvalidityScenarioId, type LifeInsuranceResultData,
} from "./lifeInsuranceShared";

const STEPS: Array<{ id: StepId; label: string; title: string; description: string; icon: LucideIcon }> = [
  { id: "base", label: "Klient", title: "Začněme příjmem a výdaji", description: "Základní údaje pro ochranu životní úrovně klienta.", icon: Activity },
  { id: "family", label: "Domácnost", title: "Na koho se domácnost spoléhá?", description: "Doplň příjem, který by rodině zůstal, a jednorázové náklady.", icon: Home },
  { id: "children", label: "Děti", title: "Mysleme i na budoucnost dětí", description: "Zohledni dobu do jejich samostatnosti a náklady na studium.", icon: Users },
  { id: "mortgage", label: "Závazky", title: "Jaké závazky je potřeba pokrýt?", description: "Oddělíme běžné výdaje od splátek a celkového dluhu.", icon: Wallet },
  { id: "confirm", label: "Souhrn", title: "Vše připraveno k výpočtu", description: "Zkontroluj podklady. K jednotlivým krokům se můžeš kdykoli vrátit.", icon: ShieldCheck },
];

const EMPLOYMENT_TYPE_OPTIONS: Array<{
  id: EmploymentType;
  label: string;
  description: string;
}> = [
  {
    id: "employee",
    label: "Zaměstnanec",
    description: "Nemocenské pojištění je součástí zaměstnání.",
  },
  {
    id: "selfEmployed",
    label: "OSVČ",
    description: "Ověříme, jestli si klient platí nemocenské pojištění.",
  },
];

const SICKNESS_INSURANCE_OPTIONS: Array<{
  id: SicknessInsuranceChoice;
  label: string;
  description: string;
}> = [
  {
    id: "yes",
    label: "Ano",
    description: "Klient si nemocenské pojištění platí.",
  },
  {
    id: "no",
    label: "Ne",
    description: "Klient si nemocenské pojištění neplatí.",
  },
];

const LIFE_SETUP_TITLE = "Nastavení životního pojištění";
const EMPTY_INPUT_VALUES: InputValues = {
  age: "",
  insuredIncome: "",
  essentialExpenses: "",
  loanPayments: "",
  totalDebt: "",
  otherHouseholdIncome: "",
  childrenCount: "",
  childHorizonYears: "",
  mortgageYears: "",
  mortgageRate: "",
  educationMonthlyPerChild: "",
  educationYears: "",
  funeralCost: "",
};

function nameFromEmail(email: string | null | undefined): string {
  const localPart = (email ?? "").split("@")[0]?.trim();
  if (!localPart) return "";

  const words = localPart.split(/[._-]+/).filter(Boolean);
  if (!words.length) return localPart;

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function displayNameFromUser(user: FirebaseUser | null): string {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;

  return nameFromEmail(user?.email);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readProfileObject(profile: Record<string, unknown> | null | undefined): {
  onlineCard?: Record<string, unknown>;
} {
  const onlineCard =
    profile?.onlineCard && typeof profile.onlineCard === "object"
      ? (profile.onlineCard as Record<string, unknown>)
      : undefined;
  return { onlineCard };
}

function advisorFooterFromProfile(
  profile: Record<string, unknown> | null | undefined,
  user: FirebaseUser | null,
  fallbackEmailOverride?: string
): AdvisorFooterInfo {
  const { onlineCard } = readProfileObject(profile);
  const fallbackEmail = fallbackEmailOverride?.trim() || user?.email?.trim() || "";
  const position = readText(profile?.position).toLowerCase();
  const onlineCardTitle = readText(onlineCard?.title).toLowerCase();
  const roleLabel =
    position.startsWith("manazer") ||
    position.startsWith("manažer") ||
    onlineCardTitle.includes("manazer") ||
    onlineCardTitle.includes("manažer")
      ? "Manažer"
      : "Poradce";

  return {
    roleLabel,
    fullName:
      readText(onlineCard?.fullName) ||
      readText(profile?.fullName) ||
      readText(profile?.name) ||
      readText(profile?.displayName) ||
      nameFromEmail(fallbackEmail) ||
      displayNameFromUser(user),
    ico:
      readText(onlineCard?.ico) ||
      readText(profile?.ico) ||
      readText(profile?.ic) ||
      readText(profile?.companyId),
    phone:
      readText(onlineCard?.phone) ||
      readText(profile?.phoneNumber) ||
      readText(profile?.phone),
    email:
      readText(onlineCard?.email) ||
      readText(profile?.email) ||
      fallbackEmail,
  };
}

const BASE_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
  {
    key: "age",
    label: "Věk klienta",
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
    description:
      "Bydlení, energie, jídlo, domácnost a další pevné náklady. Splátky úvěru / hypotéky zde neuvádějte.",
    badge: "Kč / měsíc",
    icon: Home,
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
    icon: Banknote,
  },
  {
    key: "funeralCost",
    label: "Náklady na rozloučení",
    description: "Orientačně 50 000 až 100 000 Kč jako konstantní částka.",
    badge: "Kč",
    icon: HeartPulse,
  },
];

const CHILDREN_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
  {
    key: "childrenCount",
    label: "Počet dětí",
    description: "Počet dětí, pro které má být krytý horizont do dospělosti a studium.",
    badge: "děti",
    icon: Users,
  },
  {
    key: "childHorizonYears",
    label: "Let do dospělosti dětí",
    description: "U rodiny typicky 10 až 15 let podle věku dětí.",
    badge: "roky",
    icon: Clock3,
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
    icon: Clock3,
  },
];

const MORTGAGE_FIELDS: Array<{
  key: InputKey;
  label: string;
  description: string;
  badge: string;
  icon: LucideIcon;
}> = [
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
  {
    key: "mortgageYears",
    label: "Zbývající doba splácení",
    description: "Pro anuitně klesající smrt k hypotéce nebo úvěru.",
    badge: "roky",
    icon: Clock3,
  },
  {
    key: "mortgageRate",
    label: "Úrok úvěru",
    description: "Orientační sazba pro poznámku k anuitně klesající částce.",
    badge: "% p.a.",
    icon: Percent,
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

function roundUp(value: number, step = 50_000): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function LifeInsuranceSetupPage() {
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [furthestStep, setFurthestStep] = useState(0);
  const [clientName, setClientName] = useState("");
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(authUser?.email);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfLanguageModalOpen, setPdfLanguageModalOpen] = useState(false);
  const [advisorProfile, setAdvisorProfile] = useState<{ email: string; advisor: AdvisorFooterInfo } | null>(null);
  const advisorFooter = advisorProfile?.email === effectiveEmail ? advisorProfile.advisor : advisorFooterFromProfile(null, authUser, effectiveEmail);
  const [providerRole, setProviderRole] = useState<ProviderRole>("main");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("employee");
  const [selfEmployedSicknessInsurance, setSelfEmployedSicknessInsurance] =
    useState<SicknessInsuranceChoice | null>(null);
  const [invalidityScenarioId, setInvalidityScenarioId] =
    useState<InvalidityScenarioId>("medium");
  const [invalidityModel, setInvalidityModel] =
    useState<InvalidityModel>("insurance");
  const [invalidityInvestmentVariantId, setInvalidityInvestmentVariantId] =
    useState<InvalidityInvestmentVariantId>("investika");
  const [hasChildren, setHasChildren] = useState<boolean | null>(null);
  const [futureFamilyPlan, setFutureFamilyPlan] = useState<FutureFamilyPlan | null>(null);
  const [hasMortgageOrLoan, setHasMortgageOrLoan] = useState<boolean | null>(null);
  const [sicknessInputs, setSicknessInputs] = useState(DEFAULT_SICKNESS_INPUTS);
  const sicknessBenefits = useMemo(() => calculateSicknessBenefits(sicknessInputs, employmentType, employmentType === "employee" || selfEmployedSicknessInsurance === "yes"), [sicknessInputs, employmentType, selfEmployedSicknessInsurance]);
  const [values, setValues] = useState<InputValues>(EMPTY_INPUT_VALUES);

  const numbers = useMemo(() => {
    const age = Math.max(0, Math.round(parseInput(values.age)));
    const insuredIncome = roundMoney(parseInput(values.insuredIncome));
    const essentialExpenses = roundMoney(parseInput(values.essentialExpenses));
    const loanPayments = roundMoney(parseInput(values.loanPayments));
    const totalDebt = roundMoney(parseInput(values.totalDebt));
    const otherHouseholdIncome = roundMoney(parseInput(values.otherHouseholdIncome));
    const childrenCount = hasChildren
      ? Math.max(0, Math.round(parseInput(values.childrenCount)))
      : 0;
    const childHorizonYears = hasChildren
      ? Math.max(0, Math.round(parseInput(values.childHorizonYears)))
      : 0;
    const mortgageYears = Math.max(0, Math.round(parseInput(values.mortgageYears)));
    const mortgageRate = Math.max(0, parseInput(values.mortgageRate));
    const educationMonthlyPerChild = hasChildren
      ? roundMoney(parseInput(values.educationMonthlyPerChild))
      : 0;
    const educationYears = hasChildren
      ? Math.max(0, Math.round(parseInput(values.educationYears)))
      : 0;
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
  }, [hasChildren, values]);

  const sickLeave = useMemo(() => {
    const hasStateSicknessBenefit =
      employmentType !== "selfEmployed" || selfEmployedSicknessInsurance === "yes";
    // A 30-day equivalent for comparing income; the actual first-month payments are shown separately.
    const dailyBenefit = sicknessBenefits.phases[0].daily;
    const stateBenefit = dailyBenefit === null ? null : dailyBenefit * 30;
    const incomeShortfallBeforeRecommendation = stateBenefit === null ? null : Math.max(0, numbers.insuredIncome - stateBenefit);
    const commitmentGapBeforeRecommendation = stateBenefit === null ? null : Math.max(0, numbers.monthlyExpenses - stateBenefit);
    const incomeTargetMonthly = roundMoney(numbers.insuredIncome * DAILY_TARGET_RATIO);
    const expenseReserveTargetMonthly = roundMoney(
      numbers.monthlyExpenses * (1 + SICK_LEAVE_EXPENSE_RESERVE_RATIO)
    );
    const targetMonthly = hasStateSicknessBenefit
      ? incomeTargetMonthly
      : Math.max(incomeTargetMonthly, expenseReserveTargetMonthly);
    const recommendedDaily = Math.max(
      0,
      hasStateSicknessBenefit
        ? Math.round(targetMonthly / 30)
        : Math.ceil(targetMonthly / 30)
    );
    const recommendedMonthly = recommendedDaily * 30;
    const totalMonthlyCoverage = (stateBenefit ?? 0) + recommendedMonthly;
    const incomeShortfall = hasStateSicknessBenefit
      ? incomeShortfallBeforeRecommendation
      : Math.max(0, numbers.insuredIncome - totalMonthlyCoverage);
    const commitmentGap = hasStateSicknessBenefit
      ? commitmentGapBeforeRecommendation
      : Math.max(0, numbers.monthlyExpenses - totalMonthlyCoverage);

    return {
      hasStateSicknessBenefit,
      stateBenefit,
      incomeShortfall,
      commitmentGap,
      expenseReserveTargetMonthly,
      recommendedMonthly,
      recommendedDaily,
    };
  }, [
    sicknessBenefits,
    employmentType,
    selfEmployedSicknessInsurance,
    numbers.insuredIncome,
    numbers.monthlyExpenses,
  ]);

  const invalidityScenario = useMemo(
    () =>
      INVALIDITY_SCENARIOS.find((scenario) => scenario.id === invalidityScenarioId) ??
      INVALIDITY_SCENARIOS[2],
    [invalidityScenarioId]
  );

  const invalidity = useMemo(() => {
    return invalidityScenario.ratios.map((ratio, index) => {
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
  }, [
    invalidityScenario.ratios,
    numbers.insuredIncome,
    numbers.invalidityMonths,
    numbers.monthlyExpenses,
  ]);

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
        : 0,
      100_000
    );
    const constantAmount = roundUp(clamp(numbers.funeralCost, 50_000, 100_000), 10_000);
    const annuityMortgageAmount = roundUp(numbers.totalDebt, 50_000);
    const futureFamilyAmount = roundUp(salaryFloor, 100_000);

    return {
      incomeGapCoverage,
      educationCoverage,
      salaryFloor,
      needsBasedDecreasing,
      decreasingAmount,
      constantAmount,
      annuityMortgageAmount,
      futureFamilyAmount,
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setAuthUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const currentUser = authUser;
    if (currentUser && effectiveEmail) {

      getUserProfileCached(currentUser, { force: true })
        .then((payload) => {
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== effectiveEmail
          ) return;
          const payloadEmail =
            typeof (payload as { email?: unknown }).email === "string"
              ? (payload as { email?: string }).email
              : "";
          setAdvisorProfile({ email: effectiveEmail, advisor:
            advisorFooterFromProfile(
              payload.profile,
              currentUser,
              payloadEmail || effectiveEmail
            )
          });
        })
        .catch((error) => {
          console.warn(
            "Profil poradce pro PDF patičku se nepodařilo načíst.",
            error
          );
        });
    }

    return () => {
      cancelled = true;
    };
  }, [authUser, effectiveEmail]);

  const updateValue = (key: InputKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: sanitizeInputValue(value) }));
    setCompleted(false);
    setFormError(null);
  };

  const handleEmploymentTypeChoice = (selected: EmploymentType) => {
    setEmploymentType(selected);
    setCompleted(false);
    setFormError(null);

    if (selected === "employee") {
      setSelfEmployedSicknessInsurance(null);
    }
  };

  const handleSicknessInsuranceChoice = (selected: SicknessInsuranceChoice) => {
    setSelfEmployedSicknessInsurance(selected);
    setCompleted(false);
    setFormError(null);
  };

  const clearChildrenValues = () => {
    setValues((prev) => ({
      ...prev,
      childrenCount: "",
      childHorizonYears: "",
      educationMonthlyPerChild: "",
      educationYears: "",
    }));
  };

  const handleChildrenChoice = (selected: boolean) => {
    setHasChildren(selected);
    setFutureFamilyPlan(null);
    setCompleted(false);
    setFormError(null);

    if (!selected) {
      clearChildrenValues();
    }
  };

  const handleFutureFamilyPlanChoice = (selected: FutureFamilyPlan) => {
    setFutureFamilyPlan(selected);
    setCompleted(false);
    setFormError(null);
  };

  const clearMortgageValues = () => {
    setValues((prev) => ({
      ...prev,
      loanPayments: "",
      totalDebt: "",
      mortgageYears: "",
      mortgageRate: "",
    }));
  };

  const handleMortgageChoice = (selected: boolean) => {
    setHasMortgageOrLoan(selected);
    setCompleted(false);
    setFormError(null);

    if (!selected) {
      clearMortgageValues();
    }
  };

  const validateInputs = (throughStep = step) => {
    if (numbers.age <= 0) {
      setStep(0);
      setFormError("Doplň věk klienta.");
      return false;
    }

    if (numbers.age >= RETIREMENT_AGE) {
      setStep(0);
      setFormError("Pro výpočet invalidity musí být věk nižší než 65 let.");
      return false;
    }

    if (numbers.insuredIncome <= 0) {
      setStep(0);
      setFormError("Doplň čistý měsíční příjem klienta.");
      return false;
    }

    if (
      employmentType === "selfEmployed" &&
      selfEmployedSicknessInsurance === null
    ) {
      setStep(0);
      setFormError("Vyber, jestli si OSVČ platí nemocenské pojištění.");
      return false;
    }

    const sicknessError = validateSicknessInputs(sicknessInputs, employmentType === "employee", employmentType === "employee" || selfEmployedSicknessInsurance === "yes");
    if (sicknessError) {
      setStep(0);
      setFormError(sicknessError);
      return false;
    }

    if (throughStep >= 2 && hasChildren === null) {
      setStep(2);
      setFormError("Vyber, jestli klient má děti.");
      return false;
    }

    if (throughStep >= 2 && hasChildren === false && futureFamilyPlan === null) {
      setStep(2);
      setFormError("Vyber, jestli klient v budoucnu plánuje rodinu / děti.");
      return false;
    }

    if (throughStep >= 3 && hasMortgageOrLoan === null) {
      setStep(3);
      setFormError("Vyber, jestli klient má hypotéku nebo úvěr.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const goToNextStep = () => {
    if (!validateInputs()) return;

    if (step < lastStep) {
      setFurthestStep(previous => Math.max(previous, step + 1));
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

  const goToStep = (target: number) => {
    if (target > furthestStep) return;
    if (target > step && !validateInputs(target - 1)) return;
    setFormError(null);
    setCompleted(false);
    setStep(target);
  };
  const resultData: LifeInsuranceResultData = { numbers, providerRole, futureFamilyPlan, sickLeave, sicknessBenefits,
    invalidity, invalidityModel, invalidityInvestmentVariantId, invalidityScenarioId, death,
    advisorFooter, clientName: clientName.trim() };

  useEffect(() => {
    stepHeadingRef.current?.focus({ preventScroll: true });
    stepHeadingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step, completed]);

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><HeartPulse size={15} aria-hidden="true" /> PLÁN OCHRANY PŘÍJMU</span>
            <h1>{LIFE_SETUP_TITLE}</h1>
            <p>Od životní situace k přehlednému návrhu krytí pro klienta.</p>
          </div>
          {completed ? <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => { setCompleted(false); setStep(4); }}><ChevronLeft size={16} />Upravit údaje</button>
            <button type="button" className={styles.primaryButton} onClick={() => setPdfLanguageModalOpen(true)}><FileDown size={17} />Tisk / PDF</button>
          </div> : <span className={styles.heroBadge}><ShieldCheck size={17} />5 kroků k návrhu krytí</span>}
        </header>
        <div>
          {!completed ? (
            <section className={styles.wizard} aria-label="Průvodce nastavením životního pojištění">
            <StepperProgress step={step} furthestStep={furthestStep} onStepChange={goToStep} />
            <div className={styles.stepContent}>
              <div className={styles.stepHeading}>
                <span className={styles.stepNumber}>{String(step + 1).padStart(2, "0")}</span>
                <div><h2 ref={stepHeadingRef} tabIndex={-1}>{STEPS[step].title}</h2><p>{STEPS[step].description}</p></div>
              </div>
              {currentStep === "base" ? (
                <div className="space-y-5">
                  <label className={styles.clientField}>Jméno klienta <span>nepovinné · pro výsledný dokument</span>
                    <input type="text" autoComplete="off" value={clientName} maxLength={120} placeholder="Např. Jan Novák" onChange={event => setClientName(event.target.value)} />
                  </label>
                  <div className="grid gap-4 md:grid-cols-3">
                    {BASE_FIELDS.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                      />
                    ))}
                  </div>
                  <div className={styles.questionGroup}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-xl">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                          Je klient
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          Vyber typ příjmu klienta. U OSVČ se ptáme zvlášť na dobrovolné nemocenské pojištění.
                        </p>
                      </div>
                      <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-[520px]">
                        {EMPLOYMENT_TYPE_OPTIONS.map((option) => {
                          const selected = employmentType === option.id;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleEmploymentTypeChoice(option.id)}
                              className={`min-h-[76px] rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? styles.choiceSelected
                                  : styles.choiceIdle
                              }`}
                            >
                              <span className=" flex items-center gap-2 text-sm font-semibold text-slate-800">
                                {selected ? (
                                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                                ) : null}
                                {option.label}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {employmentType === "selfEmployed" ? (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-xl">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                              Platí si nemocenské pojištění?
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              Tuhle odpověď pak použijeme pro navazující doporučení k pracovní neschopnosti.
                            </p>
                          </div>
                          <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-[520px]">
                            {SICKNESS_INSURANCE_OPTIONS.map((option) => {
                              const selected = selfEmployedSicknessInsurance === option.id;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => handleSicknessInsuranceChoice(option.id)}
                                  className={`min-h-[76px] rounded-2xl border px-4 py-3 text-left transition ${
                                    selected
                                      ? styles.choiceSelected
                                      : styles.choiceIdle
                                  }`}
                                >
                                  <span className=" flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    {selected ? (
                                      <CheckCircle2 className="h-4 w-4 text-violet-600" />
                                    ) : null}
                                    {option.label}
                                  </span>
                                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                                    {option.description}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <SicknessBenefitInputs values={sicknessInputs} employee={employmentType === "employee"} insured={employmentType === "employee" || selfEmployedSicknessInsurance === "yes"} onChange={setSicknessInputs} />
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
                  <div className="grid gap-3 md:grid-cols-2">
                    {FAMILY_FIELDS.map((field) => (
                      <NumberField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                      />
                    ))}
                  </div>
                  <div className={styles.questionGroup}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
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
                            aria-pressed={selected}
                            onClick={() => setProviderRole(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? styles.choiceSelected
                                : styles.choiceIdle
                            }`}
                          >
                            <span className=" block text-sm font-semibold text-slate-800">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                              {item.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === "children" ? (
                <div className="space-y-4">
                  <div className={styles.questionGroup}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                      Má klient děti?
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[
                        {
                          id: true,
                          label: "Ano",
                          description: "Do výpočtu vstoupí horizont do dospělosti a náklady na studium.",
                        },
                        {
                          id: false,
                          label: "Ne",
                          description: "Přeskočit dětskou část a pokračovat dál.",
                        },
                      ].map((item) => {
                        const selected = hasChildren === item.id;

                        return (
                          <button
                            key={item.label}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => handleChildrenChoice(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? styles.choiceSelected
                                : styles.choiceIdle
                            }`}
                          >
                            <span className=" flex items-center gap-2 text-sm font-semibold text-slate-800">
                              <CheckCircle2
                                className={`h-4 w-4 ${
                                  selected ? "text-violet-600" : "text-slate-300"
                                }`}
                              />
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                              {item.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {hasChildren === false ? (
                    <div className={styles.questionGroup}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                        Plánuje klient v budoucnu rodinu / děti?
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        {[
                          {
                            id: "yes" as const,
                            label: "Ano",
                            description: "V náhledu se zobrazí strategické doporučení sjednat smrt dříve.",
                          },
                          {
                            id: "maybe" as const,
                            label: "Nevím",
                            description: "Zobrazí se stejná poznámka, protože pojistitelnost se může změnit.",
                          },
                          {
                            id: "no" as const,
                            label: "Ne",
                            description: "Smrt se ponechá jen na aktuální potřebu rozloučení a dluhů.",
                          },
                        ].map((item) => {
                          const selected = futureFamilyPlan === item.id;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleFutureFamilyPlanChoice(item.id)}
                              className={`rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? styles.choiceSelected
                                  : styles.choiceIdle
                              }`}
                            >
                              <span className=" flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <CheckCircle2
                                  className={`h-4 w-4 ${
                                    selected ? "text-violet-600" : "text-slate-300"
                                  }`}
                                />
                                {item.label}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                                {item.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {hasChildren ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {CHILDREN_FIELDS.map((field) => (
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
                            label: "Počet dětí",
                            value: `${numbers.childrenCount}`,
                          },
                          {
                            label: "Studium dětí",
                            value: formatMoney(death.educationCoverage),
                          },
                          {
                            label: "Horizont",
                            value:
                              numbers.childrenCount > 0
                                ? `${numbers.childHorizonYears} let`
                                : "Bez dětí",
                          },
                        ]}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}

              {currentStep === "mortgage" ? (
                <div className="space-y-4">
                  <div className={styles.questionGroup}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                      Má klient hypotéku nebo úvěr?
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[
                        {
                          id: true,
                          label: "Ano",
                          description: "Zobrazit pole pro splátky, dluh, dobu a úrok.",
                        },
                        {
                          id: false,
                          label: "Ne",
                          description: "Přeskočit úvěrovou část a pokračovat dál.",
                        },
                      ].map((item) => {
                        const selected = hasMortgageOrLoan === item.id;

                        return (
                          <button
                            key={item.label}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => handleMortgageChoice(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? styles.choiceSelected
                                : styles.choiceIdle
                            }`}
                          >
                            <span className=" flex items-center gap-2 text-sm font-semibold text-slate-800">
                              <CheckCircle2
                                className={`h-4 w-4 ${
                                  selected ? "text-violet-600" : "text-slate-300"
                                }`}
                              />
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                              {item.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {hasMortgageOrLoan ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {MORTGAGE_FIELDS.map((field) => (
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
                            label: "Splátky měsíčně",
                            value: formatMoney(numbers.loanPayments),
                          },
                          {
                            label: "Hypotéka / dluhy",
                            value: formatMoney(numbers.totalDebt),
                          },
                        ]}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}

              {currentStep === "confirm" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <ConfirmTile
                      label="Klient"
                      value={`${numbers.age} let`}
                      note={`${clientName.trim() ? `${clientName.trim()} · ` : ""}Příjem ${formatMoney(numbers.insuredIncome)}.`}
                    />
                    <ConfirmTile
                      label="Typ klienta"
                      value={employmentType === "employee" ? "Zaměstnanec" : "OSVČ"}
                      note={
                        employmentType === "employee"
                          ? "Nemocenské pojištění řeší zaměstnavatel."
                          : selfEmployedSicknessInsurance === "yes"
                            ? "Platí si nemocenské pojištění."
                            : "Nemocenské pojištění si neplatí."
                      }
                    />
                    <ConfirmTile
                      label="Domácnost"
                      value={formatMoney(numbers.householdIncome)}
                      note={`Náklady jsou ${householdExpenseRatio} % příjmu domácnosti.`}
                    />
                    <ConfirmTile
                      label="Děti"
                      value={numbers.childrenCount > 0 ? `${numbers.childrenCount}` : "Ne"}
                      note={
                        numbers.childrenCount > 0
                          ? `Horizont ${numbers.childHorizonYears} let.`
                          : futureFamilyPlan === "yes"
                            ? "Rodinu v budoucnu plánuje."
                            : futureFamilyPlan === "maybe"
                              ? "Budoucí rodina nejistá."
                              : "Bez nákladů na studium."
                      }
                    />
                    <ConfirmTile
                      label="Úvěry / hypotéka"
                      value={formatMoney(numbers.totalDebt)}
                      note={`Měsíční splátky ${formatMoney(numbers.loanPayments)}.`}
                    />
                    <ConfirmTile
                      label="Smrt – výpadek"
                      value={formatMoney(numbers.monthlyGapAfterDeath)}
                      note="Měsíčně po smrti klienta."
                    />
                  </div>
                  <div className={styles.confirmNote}>
                    Po potvrzení se zobrazí náhled doporučeného nastavení: denní
                    dávka pracovní neschopnosti, pojistné částky invalidity a tři
                    části krytí smrti.
                  </div>
                </div>
              ) : null}

            {formError ? (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            ) : null}

            {!canCalculate && currentStep !== "base" ? (
              <p className={styles.confirmNote}>
                Pro výpočet doplň v prvním kroku věk nižší než 65 let a čistý měsíční příjem.
              </p>
            ) : null}

            <div className={styles.wizardFooter}>
              <p className={styles.footerHint}>
                Krok {step + 1} / {STEPS.length}
              </p>
              <div className="ml-auto flex items-center gap-2">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    className={styles.secondaryButton}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Zpět
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={goToNextStep}
                  className={styles.primaryButton}
                >
                  {step < lastStep ? "Pokračovat" : "Zobrazit návrh krytí"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            </div>
            </section>
          ) : (
            <PreviewPanel
              numbers={numbers}
              providerRole={providerRole}
              futureFamilyPlan={futureFamilyPlan}
              sickLeave={sickLeave}
              sicknessBenefits={sicknessBenefits}
              invalidity={invalidity}
              invalidityModel={invalidityModel}
              onInvalidityModelChange={setInvalidityModel}
              invalidityInvestmentVariantId={invalidityInvestmentVariantId}
              onInvalidityInvestmentVariantChange={setInvalidityInvestmentVariantId}
              invalidityScenarioId={invalidityScenarioId}
              onInvalidityScenarioChange={setInvalidityScenarioId}
              death={death}
              advisorFooter={advisorFooter}
              generatedAtLabel={formatGeneratedDate(new Date(), "cs")}
              language="cs"
              clientName={clientName.trim()}
              headingRef={stepHeadingRef}
            />
          )}
        </div>

      </div>
      {pdfLanguageModalOpen && <LifeInsuranceExportDialog data={resultData} onClose={() => setPdfLanguageModalOpen(false)} />}
    </AppLayout>
  );
}

function StepperProgress({ step, furthestStep, onStepChange }: {
  step: number; furthestStep: number; onStepChange: (step: number) => void;
}) {
  return <nav className={styles.stepper} aria-label="Kroky nastavení">
    <ol>{STEPS.map((item, index) => {
      const done = index < furthestStep && index !== step;
      const Icon = item.icon;
      return <li key={item.id} data-active={index === step} data-done={done}>
        <button type="button" onClick={() => onStepChange(index)} disabled={index > furthestStep} aria-label={`Krok ${index + 1}: ${item.label}`} aria-current={index === step ? "step" : undefined}>
          <span className={styles.stepDot}>{done ? <CheckCircle2 size={19} /> : <Icon size={19} />}</span>
          <span className={styles.stepLabel}><small>Krok {index + 1}</small><strong>{item.label}</strong></span>
        </button>
      </li>;
    })}</ol>
    <div className={styles.mobileProgress}><span>Krok {step + 1} z {STEPS.length} · {STEPS[step].label}</span><span>{Math.round(step / STEPS.length * 100)} %</span></div>
    <div className={styles.progressTrack} role="progressbar" aria-label="Dokončené kroky" aria-valuenow={step} aria-valuemin={0} aria-valuemax={STEPS.length}><span style={{ width: `${step / STEPS.length * 100}%` }} /></div>
  </nav>;
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

  return <div className={styles.numberField}>
    <label htmlFor={`life-${field.key}`}><Icon size={17} aria-hidden="true" />{field.label}</label>
    <div className={styles.numberInput}><input id={`life-${field.key}`} type="text" inputMode={field.key === "mortgageRate" ? "decimal" : "numeric"} value={value} placeholder="0" aria-describedby={`life-${field.key}-hint`} onChange={event => onChange(event.target.value)} /><span>{field.badge}</span></div>
    <p id={`life-${field.key}-hint`}>{field.description}</p>
  </div>;
}

function WizardMetrics({
  items,
}: {
  items: Array<{ label: string; value: string; danger?: boolean }>;
}) {
  return <div className={styles.wizardMetrics}>{items.map(item => <div key={item.label} data-danger={item.danger || undefined}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>;
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
  return <div className={styles.confirmTile}><span>{label}</span><strong>{value}</strong><p>{note}</p></div>;
}

function PreviewPanel({ numbers, providerRole, futureFamilyPlan, sickLeave, sicknessBenefits, invalidity, invalidityModel,
  onInvalidityModelChange, invalidityInvestmentVariantId, onInvalidityInvestmentVariantChange,
  invalidityScenarioId, onInvalidityScenarioChange, death, advisorFooter, generatedAtLabel, language, clientName, headingRef,
}: LifeInsuranceResultData & {
  onInvalidityModelChange: (model: InvalidityModel) => void;
  onInvalidityInvestmentVariantChange: (variant: InvalidityInvestmentVariantId) => void;
  onInvalidityScenarioChange: (scenario: InvalidityScenarioId) => void;
  generatedAtLabel: string; language: PdfLanguage; headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [investmentVariantPickerOpen, setInvestmentVariantPickerOpen] = useState(false);
  const copy = PDF_COPY[language];
  const pensionCopy = DISABILITY_PENSION_COPY[language];
  const money = (value: number | null) => value === null ? "—" : formatPdfMoney(value, language);
  const percent = (value: number) => formatPdfPercent(value, language);
  const activeInvestmentVariant =
    INVALIDITY_INVESTMENT_VARIANTS.find(
      (variant) => variant.id === invalidityInvestmentVariantId
    ) ?? INVALIDITY_INVESTMENT_VARIANTS[0];
  const activeInvalidityScenario =
    INVALIDITY_SCENARIOS.find((scenario) => scenario.id === invalidityScenarioId) ??
    INVALIDITY_SCENARIOS[2];
  const invalidityModelLabel =
    invalidityModel === "investment" ? copy.investmentVariant : copy.insurancePayout;
  const activeInvalidityScenarioLabel =
    copy.scenarioLabels[activeInvalidityScenario.id] ?? activeInvalidityScenario.label;
  const showFutureFamilyNote =
    numbers.childrenCount === 0 &&
    (futureFamilyPlan === "yes" || futureFamilyPlan === "maybe");

  const topInvalidity = invalidity[2];
  const topCapital = topInvalidity ? (invalidityModel === "investment"
    ? roundMoney(requiredCapitalForRenta(topInvalidity.monthlyNeed, numbers.invalidityMonths, activeInvestmentVariant.returnRange.min))
    : topInvalidity.lumpWithoutDebt) : 0;
  return (
    <div className={styles.results}>
      <section className={styles.resultIntro}>
        <div><span className={styles.eyebrow}><CheckCircle2 size={15} /> NÁVRH JE PŘIPRAVENÝ</span>
          <h2 ref={headingRef} tabIndex={-1}>{clientName ? `Plán ochrany pro ${clientName}` : "Přehled vašeho pojistného krytí"}</h2>
          <p>{copy.previewIntro}</p>
        </div><span className={styles.resultDate}><CalendarDays size={15} />{generatedAtLabel}</span>
      </section>
      <div className={styles.coverageOverview}>
        <a href="#life-death"><Image className={styles.overviewIllustration} src="/illustrations/life-insurance/memorial.webp" width={760} height={760} alt="" unoptimized /><span>{copy.death}<strong>{money(death.constantAmount + death.decreasingAmount + death.annuityMortgageAmount)}</strong><small>Součet počátečních pojistných částek<ChevronRight size={13} /></small></span></a>
        <a href="#life-sickness"><Image className={styles.overviewIllustration} src="/illustrations/life-insurance/recovery.webp" width={760} height={760} alt="" unoptimized /><span>{copy.sickLeave}<strong>{money(sickLeave.recommendedDaily)} <em>/ den</em></strong><small>Denní dávka při výpadku příjmu<ChevronRight size={13} /></small></span></a>
        <a href="#life-disability"><Image className={styles.overviewIllustration} src="/illustrations/life-insurance/independence.webp" width={760} height={760} alt="" unoptimized /><span>{copy.disability} · 3. stupeň<strong>{money(topCapital)}</strong><small>{invalidityModel === "investment" ? "Modelovaný vklad pro rentu" : "Pojistná částka bez dluhů"}<ChevronRight size={13} /></small></span></a>
      </div>
      <section className={styles.householdSummary} aria-label="Podklady výpočtu">
        <div className={styles.householdMetrics}>
          <PreviewMetric
            label={copy.householdIncome}
            value={money(numbers.householdIncome)}
            note={`${copy.client} ${money(numbers.insuredIncome)} + ${copy.otherIncome} ${money(numbers.otherHouseholdIncome)}.`}
          />
          <PreviewMetric
            label={copy.householdExpenses}
            value={money(numbers.monthlyExpenses)}
            note={`${copy.essentialExpenses} ${money(numbers.essentialExpenses)} + ${copy.installments} ${money(numbers.loanPayments)}.`}
          />
          <PreviewMetric
            label={copy.missingAfterDeath}
            value={money(numbers.monthlyGapAfterDeath)}
            note={`${copy.remainingIncome} ${money(numbers.incomeAfterDeath)}.`}
          />
          <PreviewMetric
            label={copy.clientRole}
            value={providerRole === "main" ? copy.mainProvider : copy.secondaryProvider}
            note={copy.deathSetupNote}
          />
        </div>
      </section>

      <section className={styles.resultColumns}>
        <article id="life-death" className={styles.resultCard}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                {copy.death}
              </p>
              <h3 className={styles.resultTitle}>
                {copy.recommendedSetup}
              </h3>
            </div>
            <HeartPulse className="h-8 w-8 text-violet-700" />
          </div>

          <div className="mt-5 space-y-3">
            <RecommendationRow
              label={copy.constantDeathSum}
              value={money(death.constantAmount)}
              note={copy.constantDeathNote}
            />
            {numbers.childrenCount > 0 ? (
              <RecommendationRow
                label={copy.decreasingDeathSum}
                value={money(death.decreasingAmount)}
                note={`${copy.incomeGap} ${money(death.incomeGapCoverage)} + ${copy.childrenEducation} ${money(death.educationCoverage)}. ${copy.approximatelyFor} ${formatYears(numbers.deathTermTo75, language)}.`}
              />
            ) : null}
            {numbers.totalDebt > 0 ? (
              <RecommendationRow
                label={copy.annuityDeathSum}
                value={money(death.annuityMortgageAmount)}
                note={`${copy.setByDebt} ${formatYears(numbers.mortgageYears, language)}, ${copy.interest} ${percent(numbers.mortgageRate)} ${copy.perYear}.`}
              />
            ) : null}
          </div>

          {numbers.childrenCount > 0 ? (
            <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-950">
              {copy.quickMethodPrefix} <strong>{money(death.salaryFloor)}</strong>.{" "}
              {copy.quickMethodSuffix}
            </div>
          ) : null}

          {showFutureFamilyNote ? (
            <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-950">
              <strong>{copy.futureFamilyTitle}:</strong> {copy.futureFamilyText}{" "}
              {copy.futureFamilyAmountLabel}:{" "}
              <strong>{money(death.futureFamilyAmount)}</strong>.{" "}
              {copy.futureFamilyAmountNote}
            </div>
          ) : null}
        </article>

        <article id="life-sickness" className={styles.resultCard}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                {copy.sickLeave}
              </p>
              <h3 className={styles.resultTitle}>
                {SIMPLE_SICKNESS_COPY[language].privateBenefit}
              </h3>
            </div>
            <ShieldCheck className="h-8 w-8 text-violet-700" />
          </div>

          {!sickLeave.hasStateSicknessBenefit ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                {copy.sickLeaveNoStateTitle}
              </div>
              <p className="mt-1 text-sm leading-relaxed">
                {copy.sickLeaveNoStateNote}
              </p>
            </div>
          ) : null}

          <div className={styles.dailyBenefit}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              {copy.set}
            </div>
            <div className="mt-2 text-4xl font-bold text-violet-950">
              {money(sickLeave.recommendedDaily)} / {copy.perDay}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-violet-900">
              {copy.monthlyApprox} {money(sickLeave.recommendedMonthly)}.{" "}
              {sickLeave.hasStateSicknessBenefit
                ? copy.sickLeaveFormula
                : copy.sickLeaveFormulaNoState}
            </p>
          </div>

          {!sickLeave.hasStateSicknessBenefit && <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
            <SmallCalcRow label={copy.expenseReserveTarget} value={money(sickLeave.expenseReserveTargetMonthly)} />
            <SmallCalcRow label={copy.incomeDropNoState} value={money(sickLeave.incomeShortfall)} />
            <SmallCalcRow label={copy.expenseGapInfoNoState} value={money(sickLeave.commitmentGap)} />
          </div>}

        </article>
      </section>

      <SicknessBenefitBreakdown benefits={sicknessBenefits} language={language} classes={styles} />

      <section id="life-disability" className={styles.resultCard}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              {copy.disability}
            </p>
            <h3 className={styles.resultTitle}>
              {invalidityModel === "investment"
                ? copy.investmentByDegree
                : copy.insuranceByDegree}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <Accessibility className="h-8 w-8 text-violet-700" />
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {copy.coverageTo65}: {formatYears(numbers.invalidityYears, language)}
            </div>
          </div>
        </div>

        <div className={styles.modelControls}>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              {copy.disabilityCoverageVariant}
            </div>
            <div className="mt-1 text-xl font-bold text-violet-950">
              {activeInvalidityScenarioLabel}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-violet-800">
              {invalidityModelLabel}
              {invalidityModel === "investment"
                ? ` - ${activeInvestmentVariant.productName}`
                : ""}
            </div>
          </div>

          <div
            className={styles.modelOptions}
            data-pdf-ignore="1"
          >
            <div className={styles.segmented}>
              {[
                { id: "insurance" as const, label: "Pojistné plnění" },
                { id: "investment" as const, label: "Investiční varianta" },
              ].map((model) => {
                const active = model.id === invalidityModel;
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (model.id === "investment") {
                        setInvestmentVariantPickerOpen(true);
                        return;
                      }
                      onInvalidityModelChange(model.id);
                    }}
                    className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? styles.segmentActive
                        : "text-slate-600 hover:bg-violet-50 hover:text-violet-900"
                    }`}
                  >
                    {model.label}
                  </button>
                );
              })}
            </div>

            <div className={styles.segmented}>
              {INVALIDITY_SCENARIOS.map((scenario) => {
                const active = scenario.id === invalidityScenarioId;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onInvalidityScenarioChange(scenario.id)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? styles.segmentActive
                        : "text-slate-600 hover:bg-violet-50 hover:text-violet-900"
                    }`}
                  >
                    {scenario.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900">
            {copy.coveragePrefix}:{" "}
            {activeInvalidityScenario.ratios
              .map((ratio) => percent(Math.round(ratio * 100)))
              .join(" / ")}
            {invalidityModel === "investment"
              ? ` | ${activeInvestmentVariant.returnLabel}`
              : ""}
          </div>
        </div>

        {investmentVariantPickerOpen ? (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-4"
            role="dialog"
            aria-modal="true"
            aria-label="Vybrat investiční variantu"
            data-pdf-ignore="1"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
              aria-label="Zavřít výběr investiční varianty"
              onClick={() => setInvestmentVariantPickerOpen(false)}
            />
            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#312e81_0%,#7c3aed_55%,#22c55e_100%)]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                    Investiční varianta
                  </p>
                  <h4 className="mt-1 text-xl font-bold text-slate-950">
                    Vyber výnos pro výpočet
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setInvestmentVariantPickerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  aria-label="Zavřít"
                >
                  <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {INVALIDITY_INVESTMENT_VARIANTS.map((variant) => {
                  const active = variant.id === invalidityInvestmentVariantId;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        onInvalidityInvestmentVariantChange(variant.id);
                        onInvalidityModelChange("investment");
                        setInvestmentVariantPickerOpen(false);
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-violet-500 bg-violet-50 shadow-[0_12px_26px_rgba(124,58,237,0.14)]"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/60"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-base font-bold text-slate-950">
                            {variant.label}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            {variant.detail}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                          {variant.returnLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {invalidity.map((item, index) => {
            const minInvestmentCapital = roundMoney(
              requiredCapitalForRenta(
                item.monthlyNeed,
                numbers.invalidityMonths,
                activeInvestmentVariant.returnRange.max
              )
            );
            const maxInvestmentCapital = roundMoney(
              requiredCapitalForRenta(
                item.monthlyNeed,
                numbers.invalidityMonths,
                activeInvestmentVariant.returnRange.min
              )
            );
            const investmentCapitalLabel =
              minInvestmentCapital === maxInvestmentCapital
                ? money(minInvestmentCapital)
                : `${money(minInvestmentCapital)} ${copy.to} ${money(maxInvestmentCapital)}`;
            const degreeLabel = copy.degreeLabels[index] ?? item.label;

            return (
              <article
                key={item.label}
                className={styles.degreeCard}
              >
                <div className={styles.degreeAccent} />
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {copy.degreeOfDisability}
                      </div>
                      <h4 className="mt-1 text-lg font-semibold text-slate-950">
                        {degreeLabel}
                      </h4>
                    </div>
                  </div>
                  <div className={styles.pensionReference}>
                    <span>{pensionCopy.average}</span>
                    <strong>{money(DISABILITY_PENSION_STATISTICS.degrees[index].averageMonthly)}</strong>
                    <small>{pensionCopy.monthly}</small>
                  </div>
                  <div className={styles.privateCoverHeading}>
                    <span>{pensionCopy.privateCover}</span>
                    <span>{copy.coveragePrefix}: {percent(Math.round(item.ratio * 100))}</span>
                  </div>
                  <div className="divide-y divide-slate-200 border-b border-slate-100">
                    <SmallCalcRow
                      label={pensionCopy.privateAnnuity}
                      value={money(item.monthlyNeed)}
                    />
                    {invalidityModel === "investment" ? (
                      <SmallCalcRow
                        label={copy.requiredDeposit}
                        value={investmentCapitalLabel}
                      />
                    ) : (
                      <SmallCalcRow
                        label={copy.sumWithoutDebt}
                        value={money(item.lumpWithoutDebt)}
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <DisabilityPensionSource language={language} className={styles.pensionSource} />

        {invalidityModel === "investment" ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-950">
            {copy.investmentNote}{" "}
            <strong>{activeInvestmentVariant.productName}</strong>:{" "}
            <strong>{activeInvestmentVariant.returnLabel}</strong>.
          </div>
        ) : null}

        {numbers.totalDebt > 0 ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                  {copy.disabilityAndLoan}
                </div>
                <h4 className="mt-1 text-lg font-bold text-violet-950">
                  {copy.disabilityLoanTitle}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-violet-900">
                  {copy.disabilityLoanNote}
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="text-3xl font-bold tabular-nums text-violet-950">
                  {money(death.annuityMortgageAmount)}
                </div>
                <div className="mt-1 text-xs font-semibold text-violet-800">
                  {numbers.mortgageYears > 0
                    ? `${formatYears(numbers.mortgageYears, language)}, ${copy.interest} ${percent(numbers.mortgageRate)} ${copy.perYear}`
                    : `${copy.byRepaymentPeriod}, ${copy.interest} ${percent(numbers.mortgageRate)} ${copy.perYear}`}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <PdfAdvisorFooter
        advisor={advisorFooter}
        generatedAtLabel={generatedAtLabel}
        language={language}
      />
    </div>
  );
}

function PdfAdvisorFooter({ advisor, generatedAtLabel, language }: {
  advisor: AdvisorFooterInfo; generatedAtLabel: string; language: PdfLanguage;
}) {
  return <footer className={styles.advisor}>
    <span className={styles.advisorSymbol}><ShieldCheck size={22} /></span>
    <div><strong>{advisor.fullName || "Bohemika a.s."}</strong><span>{translateAdvisorRole(advisor.roleLabel, language)} · Bohemika a.s.</span></div>
    <div className={styles.advisorContact}>{advisor.phone && <a href={`tel:${advisor.phone.replace(/[^+0-9]/g, "")}`}><Phone size={14} />{advisor.phone}</a>}{advisor.email && <a href={`mailto:${advisor.email}`}><Mail size={14} />{advisor.email}</a>}<span>{generatedAtLabel}</span></div>
  </footer>;
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
  return <div className={styles.previewMetric}><span>{label}</span><strong>{value}</strong><p>{note}</p></div>;
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
  return <div className={styles.recommendation}><div><strong>{label}</strong><p>{note}</p></div><span>{value}</span></div>;
}

function SmallCalcRow({ label, value }: { label: string; value: string }) {
  return <div className={styles.calcRow}><span>{label}</span><strong>{value}</strong></div>;
}
