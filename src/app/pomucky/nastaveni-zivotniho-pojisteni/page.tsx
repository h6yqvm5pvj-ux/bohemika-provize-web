"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileDown,
  GraduationCap,
  HeartPulse,
  Home,
  Loader2,
  Percent,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { formatMoney } from "@/app/lib/formatters";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import SplitTitle from "../plan-produkce/SplitTitle";

type StepId = "base" | "family" | "children" | "mortgage" | "confirm";
type ProviderRole = "main" | "secondary";
type InvalidityModel = "insurance" | "investment";
type InvalidityInvestmentVariantId = "investika" | "savings";
type FutureFamilyPlan = "yes" | "maybe" | "no";
type PdfLanguage = "cs" | "en" | "uk" | "ne" | "hi";
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
type AdvisorFooterInfo = {
  fullName: string;
  roleLabel: string;
  ico: string;
  phone: string;
  email: string;
};

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "base", label: "Základ" },
  { id: "family", label: "Rodina" },
  { id: "children", label: "Děti" },
  { id: "mortgage", label: "Úvěr / Hypotéka" },
  { id: "confirm", label: "Potvrzení" },
];

const LIFE_SETUP_TITLE = "Jak nastavit Životní pojištění";
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
const INVALIDITY_SCENARIOS = [
  { id: "veryLow", label: "Velmi nízké", ratios: [0.1, 0.2, 0.3] },
  { id: "low", label: "Nízké", ratios: [0.3, 0.5, 0.8] },
  { id: "medium", label: "Střední", ratios: [0.4, 0.6, 1] },
  { id: "high", label: "Vyšší", ratios: [0.5, 0.75, 1.2] },
] as const;
const INVALIDITY_LABELS = ["1. stupeň", "2. stupeň", "3. stupeň"] as const;
type InvalidityScenarioId = (typeof INVALIDITY_SCENARIOS)[number]["id"];
const RETIREMENT_AGE = 65;
const DEATH_COVERAGE_END_AGE = 75;
const DAILY_TARGET_RATIO = 0.4;
const DEFAULT_SOLO_DEATH_YEARS = 5;
const INVESTIKA_RETURN_RANGE = { min: 0.055, max: 0.06 };
const INVESTMENT_PRODUCT_NAME = "INVESTIKA Realitní Fond";
const SAVINGS_ACCOUNT_RETURN_RANGE = { min: 0.0285, max: 0.0285 };
const INVALIDITY_INVESTMENT_VARIANTS: Array<{
  id: InvalidityInvestmentVariantId;
  label: string;
  productName: string;
  returnRange: { min: number; max: number };
  returnLabel: string;
  detail: string;
}> = [
  {
    id: "investika",
    label: "Investika Realitní fond",
    productName: INVESTMENT_PRODUCT_NAME,
    returnRange: INVESTIKA_RETURN_RANGE,
    returnLabel: "5,5-6 % p.a.",
    detail: "Modelovaný výnos použitý pro výpočet potřebného kapitálu.",
  },
  {
    id: "savings",
    label: "Spořicí účet",
    productName: "Spořicí účet",
    returnRange: SAVINGS_ACCOUNT_RETURN_RANGE,
    returnLabel: "2,85 % čistého p.a.",
    detail:
      "K červnu 2026: hrubě cca 3,35-3,40 % p.a. pro částky nad 1 000 000 Kč. Pro model počítáme konzervativně s 2,85 % čistého p.a. po 15% srážkové dani.",
  },
];
const FIELD_TEXT_STYLE: CSSProperties = {
  color: "#fff",
  WebkitTextFillColor: "#fff",
};

const PDF_LANGUAGE_OPTIONS: Array<{
  id: PdfLanguage;
  label: string;
  flag: string;
  description: string;
}> = [
  {
    id: "cs",
    label: "Čeština",
    flag: "🇨🇿",
    description: "Výchozí jazyk PDF.",
  },
  {
    id: "en",
    label: "Angličtina",
    flag: "🇬🇧",
    description: "English version for clients.",
  },
  {
    id: "uk",
    label: "Ukrajinština",
    flag: "🇺🇦",
    description: "Українська версія для клієнтів.",
  },
  {
    id: "ne",
    label: "Nepálština",
    flag: "🇳🇵",
    description: "ग्राहकका लागि नेपाली संस्करण।",
  },
  {
    id: "hi",
    label: "Hindština",
    flag: "🇮🇳",
    description: "ग्राहकों के लिए हिंदी संस्करण।",
  },
];

const PDF_COPY = {
  cs: {
    previewEyebrow: "Náhled nastavení",
    previewTitle: "Co a jak nastavit ve smlouvě",
    previewIntro:
      "Výpočet vychází z toho, co po smrti nebo dlouhodobém zdravotním problému v domácnosti reálně chybí: příjem, dluhy, horizont dětí a jednorázové náklady.",
    householdIncome: "Příjem domácnosti",
    householdExpenses: "Náklady domácnosti",
    missingAfterDeath: "Po smrti klienta chybí",
    clientRole: "Role klienta",
    client: "Klient",
    otherIncome: "ostatní",
    essentialExpenses: "Nutné výdaje",
    installments: "splátky",
    remainingIncome: "Zůstane příjem",
    mainProvider: "Hlavní živitel",
    secondaryProvider: "Vedlejší příjem",
    deathSetupNote: "Nastavení smrti počítá s výpadkem příjmu klienta.",
    death: "Smrt",
    recommendedSetup: "Doporučené nastavení",
    constantDeathSum: "Konstantní PČ pro případ smrti",
    constantDeathNote:
      "Na náklady rozloučení. Držet konstantně, typicky 50 000 až 100 000 Kč.",
    decreasingDeathSum: "Klesající PČ pro případ smrti",
    incomeGap: "Výpadek příjmu",
    childrenEducation: "vzdělání dětí",
    approximatelyFor: "Orientačně na",
    annuityDeathSum: "Anuitně klesající PČ k hypotéce / úvěru",
    setByDebt: "Nastavit podle dluhu na",
    interest: "úrok",
    perYear: "p.a.",
    noDebtDeathNote: "Pokud klient nemá dluh, tuto část není potřeba nastavovat.",
    noChildrenDeathNote:
      "Bez dětí nebo jiné závislé rodiny ji aktuálně nepočítáme vysoko. Aktuální potřebu smrti kryje rozloučení a případně samostatné krytí dluhu.",
    futureFamilyTitle: "Budoucí rodina",
    futureFamilyAmountLabel: "Orientační budoucí rodinný scénář",
    futureFamilyText:
      "Aktuálně klient vysokou PČ na smrt nepotřebuje. Pokud ale rodinu plánuje nebo si není jistý, dává smysl zvážit sjednání krytí už teď, dokud je mladší a zdravotně pojistitelný. Později může být pojištění dražší nebo omezené výlukami/přirážkami.",
    futureFamilyAmountNote:
      "Kontrolní hodnota vychází z rychlé metody 5 ročních příjmů. Nezvyšuje automaticky aktuální doporučení smrti.",
    quickMethodPrefix: "Kontrola proti rychlé metodě: 5 ročních příjmů klienta vychází na",
    quickMethodSuffix:
      "Pro rodinu je ale důležitější výpadek příjmu, dluhy a horizont dětí.",
    sickLeave: "Pracovní neschopnost",
    dailyBenefit: "Denní dávka",
    set: "Nastavit",
    perDay: "den",
    monthlyApprox: "Měsíčně přibližně",
    sickLeaveFormula: "Výpočet bere 40 % čistého příjmu a dělí ho 30 dny.",
    stateSicknessBenefit: "Orientační státní nemocenská",
    incomeDrop: "Pokles proti příjmu klienta",
    expenseGapInfo: "Mezera proti nákladům informativně",
    disability: "Invalidita",
    investmentByDegree: "Investiční varianta podle stupně",
    insuranceByDegree: "Rentové pojistné částky podle stupně",
    coverageTo65: "Krytí do 65 let",
    disabilityCoverageVariant: "Varianta krytí invalidity",
    insurancePayout: "Pojistné plnění",
    investmentVariant: "Investiční varianta",
    coveragePrefix: "Pokrytí",
    incomeCoverageSuffix: "příjmu",
    degreeOfDisability: "Stupeň invalidity",
    monthlyAnnuity: "Měsíční renta",
    requiredDeposit: "Potřebný vklad",
    sumWithoutDebt: "PČ bez dluhů",
    to: "až",
    investmentNote:
      "Investiční varianta modeluje kapitál, ze kterého by šla čerpat zvolená měsíční renta při vybraném výnosu. Nejde o investiční doporučení.",
    disabilityAndLoan: "Invalidita a úvěr",
    disabilityLoanTitle: "Anuitně klesající PČ k hypotéce / úvěru na invaliditu",
    disabilityLoanNote:
      "Nastavit samostatně podle aktuální dlužné částky na dobu splácení. Renta výše kryje výpadek příjmu, tato část kryje splacení dluhu.",
    byRepaymentPeriod: "Podle doby splácení",
    scenarioLabels: {
      veryLow: "Velmi nízké",
      low: "Nízké",
      medium: "Střední",
      high: "Vyšší",
    },
    degreeLabels: ["1. stupeň", "2. stupeň", "3. stupeň"],
    footer: {
      manager: "Manažer",
      advisor: "Poradce",
      companyId: "IČO",
      phone: "Telefon",
      email: "E-mail",
      generated: "Vygenerováno",
      missing: "neuvedeno",
    },
  },
  en: {
    previewEyebrow: "Setup preview",
    previewTitle: "What to set up in the policy",
    previewIntro:
      "The calculation is based on what the household would realistically lack after death or a long-term health problem: income, debt cover, the children's support horizon, and one-off costs.",
    householdIncome: "Household income",
    householdExpenses: "Household expenses",
    missingAfterDeath: "Shortfall after the client's death",
    clientRole: "Client role",
    client: "Client",
    otherIncome: "other income",
    essentialExpenses: "Essential expenses",
    installments: "loan payments",
    remainingIncome: "Remaining income",
    mainProvider: "Main provider",
    secondaryProvider: "Secondary income",
    deathSetupNote: "The death cover is calculated around the loss of the client's income.",
    death: "Death",
    recommendedSetup: "Recommended setup",
    constantDeathSum: "Fixed sum insured for death",
    constantDeathNote:
      "For final expenses. Keep this amount fixed, typically CZK 50,000 to 100,000.",
    decreasingDeathSum: "Decreasing sum insured for death",
    incomeGap: "Income shortfall",
    childrenEducation: "children's education",
    approximatelyFor: "Approximately for",
    annuityDeathSum: "Annuity-decreasing sum insured for a mortgage / loan",
    setByDebt: "Set according to the debt for",
    interest: "interest",
    perYear: "p.a.",
    noDebtDeathNote: "If the client has no debt, this part does not need to be set.",
    noChildrenDeathNote:
      "Without children or another financially dependent family, this cover is not calculated high for the current situation. The current death need is covered by final expenses and, if applicable, separate debt cover.",
    futureFamilyTitle: "Future family",
    futureFamilyAmountLabel: "Indicative future-family scenario",
    futureFamilyText:
      "The client does not currently need a high death sum insured. If they plan a family or are unsure, it can make sense to consider arranging cover now while they are younger and insurable. Later, the cover may be more expensive or limited by exclusions or loadings.",
    futureFamilyAmountNote:
      "The control value uses the quick method of 5 years of income. It does not automatically increase the current death recommendation.",
    quickMethodPrefix: "Quick-method check: 5 years of the client's income equals",
    quickMethodSuffix:
      "For a family, however, the income shortfall, debts, and the children's support horizon matter more.",
    sickLeave: "Incapacity for work",
    dailyBenefit: "Daily benefit",
    set: "Set",
    perDay: "day",
    monthlyApprox: "Approximately per month",
    sickLeaveFormula: "The calculation uses 40% of net income and divides it by 30 days.",
    stateSicknessBenefit: "Estimated state sickness benefit",
    incomeDrop: "Drop compared with the client's income",
    expenseGapInfo: "Indicative gap compared with expenses",
    disability: "Disability",
    investmentByDegree: "Investment variant by disability degree",
    insuranceByDegree: "Annuity-based sums insured by disability degree",
    coverageTo65: "Cover until age 65",
    disabilityCoverageVariant: "Disability cover variant",
    insurancePayout: "Insurance payout",
    investmentVariant: "Investment variant",
    coveragePrefix: "Coverage",
    incomeCoverageSuffix: "income",
    degreeOfDisability: "Disability degree",
    monthlyAnnuity: "Monthly annuity",
    requiredDeposit: "Required deposit",
    sumWithoutDebt: "Sum insured excluding debts",
    to: "to",
    investmentNote:
      "The investment variant models the capital from which the selected monthly annuity could be drawn at the selected return. This is not investment advice.",
    disabilityAndLoan: "Disability and loan",
    disabilityLoanTitle: "Annuity-decreasing sum insured for mortgage / loan disability cover",
    disabilityLoanNote:
      "Set this separately according to the current outstanding debt and repayment period. The annuity above covers the income shortfall; this part covers repayment of the debt.",
    byRepaymentPeriod: "According to the repayment period",
    scenarioLabels: {
      veryLow: "Very low",
      low: "Low",
      medium: "Medium",
      high: "Higher",
    },
    degreeLabels: ["Degree I", "Degree II", "Degree III"],
    footer: {
      manager: "Manager",
      advisor: "Advisor",
      companyId: "Company ID",
      phone: "Phone",
      email: "E-mail",
      generated: "Generated",
      missing: "not provided",
    },
  },
  uk: {
    previewEyebrow: "Попередній перегляд налаштувань",
    previewTitle: "Що і як налаштувати в договорі",
    previewIntro:
      "Розрахунок виходить із того, чого реально бракуватиме домогосподарству у разі смерті або тривалої проблеми зі здоров'ям: доходу, покриття боргів, горизонту забезпечення дітей і одноразових витрат.",
    householdIncome: "Дохід домогосподарства",
    householdExpenses: "Витрати домогосподарства",
    missingAfterDeath: "Бракує після смерті клієнта",
    clientRole: "Роль клієнта",
    client: "Клієнт",
    otherIncome: "інші доходи",
    essentialExpenses: "обов'язкові витрати",
    installments: "платежі за кредитами",
    remainingIncome: "Залишається дохід",
    mainProvider: "Основний годувальник",
    secondaryProvider: "Додатковий дохід",
    deathSetupNote: "Налаштування покриття смерті враховує втрату доходу клієнта.",
    death: "Смерть",
    recommendedSetup: "Рекомендоване налаштування",
    constantDeathSum: "Фіксована страхова сума на випадок смерті",
    constantDeathNote:
      "На витрати на прощання. Тримати суму фіксованою, зазвичай 50 000-100 000 Kč.",
    decreasingDeathSum: "Зменшувана страхова сума на випадок смерті",
    incomeGap: "Втрата доходу",
    childrenEducation: "освіта дітей",
    approximatelyFor: "Орієнтовно на",
    annuityDeathSum: "Ануїтетно-зменшувана страхова сума для іпотеки / кредиту",
    setByDebt: "Налаштувати за сумою боргу на",
    interest: "ставка",
    perYear: "річних",
    noDebtDeathNote: "Якщо у клієнта немає боргу, цю частину налаштовувати не потрібно.",
    noChildrenDeathNote:
      "Без дітей або іншої фінансово залежної сім'ї це покриття зараз не розраховується як високе. Поточну потребу на випадок смерті покривають витрати на прощання і, за потреби, окреме покриття боргу.",
    futureFamilyTitle: "Майбутня сім'я",
    futureFamilyAmountLabel: "Орієнтовний сценарій для майбутньої сім'ї",
    futureFamilyText:
      "Зараз клієнту не потрібна висока страхова сума на випадок смерті. Якщо він планує сім'ю або не впевнений, варто розглянути оформлення покриття вже зараз, поки він молодший і може пройти медичну оцінку. Пізніше покриття може бути дорожчим або обмеженим винятками чи надбавками.",
    futureFamilyAmountNote:
      "Контрольна величина базується на швидкому методі 5 річних доходів. Вона автоматично не збільшує поточну рекомендацію.",
    quickMethodPrefix: "Перевірка швидким методом: 5 річних доходів клієнта дорівнює",
    quickMethodSuffix:
      "Для сім'ї важливіші втрата доходу, борги та горизонт забезпечення дітей.",
    sickLeave: "Тимчасова непрацездатність",
    dailyBenefit: "Денна виплата",
    set: "Налаштувати",
    perDay: "день",
    monthlyApprox: "Орієнтовно на місяць",
    sickLeaveFormula: "Розрахунок бере 40% чистого доходу і ділить його на 30 днів.",
    stateSicknessBenefit: "Орієнтовна державна лікарняна виплата",
    incomeDrop: "Зниження порівняно з доходом клієнта",
    expenseGapInfo: "Орієнтовний розрив відносно витрат",
    disability: "Інвалідність",
    investmentByDegree: "Інвестиційний варіант за ступенем інвалідності",
    insuranceByDegree: "Страхові суми для ренти за ступенем інвалідності",
    coverageTo65: "Покриття до 65 років",
    disabilityCoverageVariant: "Варіант покриття інвалідності",
    insurancePayout: "Страхова виплата",
    investmentVariant: "Інвестиційний варіант",
    coveragePrefix: "Покриття",
    incomeCoverageSuffix: "доходу",
    degreeOfDisability: "Ступінь інвалідності",
    monthlyAnnuity: "Місячна рента",
    requiredDeposit: "Необхідний внесок",
    sumWithoutDebt: "Страхова сума без боргів",
    to: "до",
    investmentNote:
      "Інвестиційний варіант моделює капітал, з якого можна було б отримувати обрану місячну ренту за обраної дохідності. Це не є інвестиційною рекомендацією.",
    disabilityAndLoan: "Інвалідність і кредит",
    disabilityLoanTitle:
      "Ануїтетно-зменшувана страхова сума для іпотеки / кредиту на випадок інвалідності",
    disabilityLoanNote:
      "Налаштувати окремо за актуальною сумою боргу на строк погашення. Рента вище покриває втрату доходу; ця частина покриває погашення боргу.",
    byRepaymentPeriod: "За строком погашення",
    scenarioLabels: {
      veryLow: "Дуже низьке",
      low: "Низьке",
      medium: "Середнє",
      high: "Вище",
    },
    degreeLabels: ["I ступінь", "II ступінь", "III ступінь"],
    footer: {
      manager: "Менеджер",
      advisor: "Консультант",
      companyId: "Ідентифікаційний номер",
      phone: "Телефон",
      email: "E-mail",
      generated: "Згенеровано",
      missing: "не вказано",
    },
  },
  ne: {
    previewEyebrow: "सेटिङको पूर्वावलोकन",
    previewTitle: "बीमा सम्झौतामा के र कसरी सेट गर्ने",
    previewIntro:
      "यो गणना मृत्यु वा दीर्घकालीन स्वास्थ्य समस्यापछि परिवारमा वास्तवमै कमी हुने कुरामा आधारित छ: आम्दानी, ऋणको सुरक्षा, बालबालिकाको सहयोग अवधि र एकपटक लाग्ने खर्चहरू।",
    householdIncome: "परिवारको आम्दानी",
    householdExpenses: "परिवारका खर्चहरू",
    missingAfterDeath: "ग्राहकको मृत्युपछि अपुग हुने रकम",
    clientRole: "ग्राहकको भूमिका",
    client: "ग्राहक",
    otherIncome: "अन्य आम्दानी",
    essentialExpenses: "आवश्यक खर्च",
    installments: "ऋणका किस्ताहरू",
    remainingIncome: "बाँकी रहने आम्दानी",
    mainProvider: "मुख्य आयस्रोत",
    secondaryProvider: "सहायक आय",
    deathSetupNote: "मृत्यु कभरेज ग्राहकको आम्दानी गुम्ने आधारमा गणना गरिएको छ।",
    death: "मृत्यु",
    recommendedSetup: "सिफारिस गरिएको सेटिङ",
    constantDeathSum: "मृत्युका लागि स्थिर बीमित रकम",
    constantDeathNote:
      "अन्तिम संस्कार / विदाइ खर्चका लागि। यो रकम स्थिर राख्नुहोस्, सामान्यतया CZK 50,000 देखि 100,000।",
    decreasingDeathSum: "मृत्युका लागि घट्दै जाने बीमित रकम",
    incomeGap: "आम्दानीको कमी",
    childrenEducation: "बालबालिकाको शिक्षा",
    approximatelyFor: "करिब",
    annuityDeathSum: "हाइपोथेक / ऋणका लागि वार्षिकी रूपमा घट्दै जाने बीमित रकम",
    setByDebt: "ऋणको आधारमा सेट गर्ने अवधि",
    interest: "ब्याज",
    perYear: "वार्षिक",
    noDebtDeathNote: "ग्राहकसँग ऋण छैन भने यो भाग सेट गर्न आवश्यक छैन।",
    noChildrenDeathNote:
      "बालबालिका वा आर्थिक रूपमा निर्भर परिवार नभए अहिले यो कभर उच्च रूपमा गणना गरिँदैन। हालको मृत्यु आवश्यकता अन्तिम खर्च र आवश्यक भए छुट्टै ऋण कभरले समेट्छ।",
    futureFamilyTitle: "भविष्यको परिवार",
    futureFamilyAmountLabel: "भविष्यको परिवारका लागि संकेतात्मक परिदृश्य",
    futureFamilyText:
      "हाल ग्राहकलाई मृत्युका लागि उच्च बीमित रकम आवश्यक छैन। तर परिवार योजना छ वा अनिश्चितता छ भने, ग्राहक युवा र स्वास्थ्य रूपमा बीमायोग्य हुँदा नै कभर सोच्नु उपयोगी हुन सक्छ। पछि कभर महँगो वा बहिष्करण/अतिरिक्त शुल्कसहित सीमित हुन सक्छ।",
    futureFamilyAmountNote:
      "जाँच मूल्य ५ वर्षको आम्दानीको छिटो विधिमा आधारित छ। यसले हालको मृत्यु सिफारिस स्वतः बढाउँदैन।",
    quickMethodPrefix: "छिटो विधिबाट जाँच: ग्राहकको ५ वर्षको आम्दानी बराबर",
    quickMethodSuffix:
      "तर परिवारका लागि आम्दानीको कमी, ऋण र बालबालिकाको सहयोग अवधि बढी महत्त्वपूर्ण हुन्छ।",
    sickLeave: "काम गर्न असमर्थता",
    dailyBenefit: "दैनिक भत्ता",
    set: "सेट गर्ने",
    perDay: "दिन",
    monthlyApprox: "मासिक करिब",
    sickLeaveFormula: "गणनाले शुद्ध आम्दानीको ४०% लिएर ३० दिनले भाग गर्छ।",
    stateSicknessBenefit: "अनुमानित सरकारी बिरामी भत्ता",
    incomeDrop: "ग्राहकको आम्दानीको तुलनामा कमी",
    expenseGapInfo: "खर्चको तुलनामा अनुमानित कमी",
    disability: "अपाङ्गता",
    investmentByDegree: "अपाङ्गताको स्तरअनुसार लगानी विकल्प",
    insuranceByDegree: "अपाङ्गताको स्तरअनुसार रेन्टाका बीमित रकमहरू",
    coverageTo65: "६५ वर्ष उमेरसम्म कभरेज",
    disabilityCoverageVariant: "अपाङ्गता कभरेज विकल्प",
    insurancePayout: "बीमा भुक्तानी",
    investmentVariant: "लगानी विकल्प",
    coveragePrefix: "कभरेज",
    incomeCoverageSuffix: "आम्दानी",
    degreeOfDisability: "अपाङ्गताको स्तर",
    monthlyAnnuity: "मासिक रेन्टा",
    requiredDeposit: "आवश्यक जम्मा रकम",
    sumWithoutDebt: "ऋणबाहेकको बीमित रकम",
    to: "देखि",
    investmentNote:
      "लगानी विकल्पले चयन गरिएको प्रतिफलमा मासिक रेन्टा झिक्न सकिने पूँजीको मोडल देखाउँछ। यो लगानी सल्लाह होइन।",
    disabilityAndLoan: "अपाङ्गता र ऋण",
    disabilityLoanTitle: "अपाङ्गताका लागि हाइपोथेक / ऋणमा वार्षिकी रूपमा घट्दै जाने बीमित रकम",
    disabilityLoanNote:
      "हालको बाँकी ऋण र भुक्तानी अवधिको आधारमा यो अलग सेट गर्नुहोस्। माथिको रेन्टाले आम्दानीको कमी कभर गर्छ; यो भागले ऋण चुक्ता गर्ने रकम कभर गर्छ।",
    byRepaymentPeriod: "भुक्तानी अवधिअनुसार",
    scenarioLabels: {
      veryLow: "धेरै कम",
      low: "कम",
      medium: "मध्यम",
      high: "उच्च",
    },
    degreeLabels: ["पहिलो तह", "दोस्रो तह", "तेस्रो तह"],
    footer: {
      manager: "प्रबन्धक",
      advisor: "सल्लाहकार",
      companyId: "कम्पनी आईडी",
      phone: "फोन",
      email: "E-mail",
      generated: "सिर्जना गरिएको",
      missing: "उल्लेख छैन",
    },
  },
  hi: {
    previewEyebrow: "सेटअप पूर्वावलोकन",
    previewTitle: "पॉलिसी में क्या और कैसे सेट करें",
    previewIntro:
      "यह गणना इस बात पर आधारित है कि मृत्यु या दीर्घकालिक स्वास्थ्य समस्या के बाद परिवार को वास्तव में किन चीज़ों की कमी होगी: आय, ऋण सुरक्षा, बच्चों की सहायता अवधि और एकमुश्त खर्च।",
    householdIncome: "परिवार की आय",
    householdExpenses: "परिवार के खर्च",
    missingAfterDeath: "ग्राहक की मृत्यु के बाद कमी",
    clientRole: "ग्राहक की भूमिका",
    client: "ग्राहक",
    otherIncome: "अन्य आय",
    essentialExpenses: "आवश्यक खर्च",
    installments: "ऋण की किस्तें",
    remainingIncome: "बची हुई आय",
    mainProvider: "मुख्य आय अर्जक",
    secondaryProvider: "सहायक आय",
    deathSetupNote: "मृत्यु कवर ग्राहक की आय में होने वाली कमी के आधार पर गणना किया गया है।",
    death: "मृत्यु",
    recommendedSetup: "अनुशंसित सेटअप",
    constantDeathSum: "मृत्यु के लिए स्थिर बीमित राशि",
    constantDeathNote:
      "अंतिम खर्चों के लिए। इस राशि को स्थिर रखें, सामान्यतः CZK 50,000 से 100,000।",
    decreasingDeathSum: "मृत्यु के लिए घटती बीमित राशि",
    incomeGap: "आय की कमी",
    childrenEducation: "बच्चों की शिक्षा",
    approximatelyFor: "लगभग",
    annuityDeathSum: "बंधक / ऋण के लिए वार्षिकी-घटती बीमित राशि",
    setByDebt: "ऋण के आधार पर अवधि सेट करें",
    interest: "ब्याज",
    perYear: "प्रति वर्ष",
    noDebtDeathNote: "यदि ग्राहक पर कोई ऋण नहीं है, तो यह भाग सेट करने की आवश्यकता नहीं है।",
    noChildrenDeathNote:
      "बच्चे या आर्थिक रूप से निर्भर परिवार न होने पर इस कवर को वर्तमान स्थिति में अधिक नहीं गिना जाता। मृत्यु की मौजूदा जरूरत अंतिम खर्च और जरूरत हो तो अलग ऋण कवर से पूरी होती है।",
    futureFamilyTitle: "भविष्य का परिवार",
    futureFamilyAmountLabel: "भविष्य के परिवार का संकेतात्मक परिदृश्य",
    futureFamilyText:
      "अभी ग्राहक को मृत्यु के लिए उच्च बीमित राशि की जरूरत नहीं है। लेकिन यदि परिवार की योजना है या अनिश्चितता है, तो युवा और स्वास्थ्य रूप से बीमायोग्य रहते हुए कवर पर विचार करना उचित हो सकता है। बाद में कवर महंगा हो सकता है या बहिष्करण/अतिरिक्त प्रीमियम से सीमित हो सकता है।",
    futureFamilyAmountNote:
      "जांच राशि ५ वर्षों की आय वाली त्वरित पद्धति पर आधारित है। यह मौजूदा मृत्यु सिफारिश को स्वतः नहीं बढ़ाती।",
    quickMethodPrefix: "त्वरित पद्धति से जाँच: ग्राहक की ५ वर्षों की आय बराबर है",
    quickMethodSuffix:
      "लेकिन परिवार के लिए आय की कमी, ऋण और बच्चों की सहायता अवधि अधिक महत्वपूर्ण हैं।",
    sickLeave: "कार्य-असमर्थता",
    dailyBenefit: "दैनिक लाभ",
    set: "सेट करें",
    perDay: "दिन",
    monthlyApprox: "मासिक लगभग",
    sickLeaveFormula: "गणना शुद्ध आय का ४०% लेकर उसे ३० दिनों से विभाजित करती है।",
    stateSicknessBenefit: "अनुमानित सरकारी बीमारी लाभ",
    incomeDrop: "ग्राहक की आय की तुलना में कमी",
    expenseGapInfo: "खर्चों की तुलना में अनुमानित कमी",
    disability: "विकलांगता",
    investmentByDegree: "विकलांगता स्तर के अनुसार निवेश विकल्प",
    insuranceByDegree: "विकलांगता स्तर के अनुसार रेंट-आधारित बीमित राशियाँ",
    coverageTo65: "६५ वर्ष की आयु तक कवर",
    disabilityCoverageVariant: "विकलांगता कवर विकल्प",
    insurancePayout: "बीमा भुगतान",
    investmentVariant: "निवेश विकल्प",
    coveragePrefix: "कवर",
    incomeCoverageSuffix: "आय",
    degreeOfDisability: "विकलांगता स्तर",
    monthlyAnnuity: "मासिक रेंट",
    requiredDeposit: "आवश्यक जमा राशि",
    sumWithoutDebt: "ऋणों को छोड़कर बीमित राशि",
    to: "से",
    investmentNote:
      "निवेश विकल्प उस पूँजी का मॉडल दिखाता है जिससे चुने गए प्रतिफल पर मासिक रेंट निकाला जा सकता है। यह निवेश सलाह नहीं है।",
    disabilityAndLoan: "विकलांगता और ऋण",
    disabilityLoanTitle: "विकलांगता कवर के लिए बंधक / ऋण पर वार्षिकी-घटती बीमित राशि",
    disabilityLoanNote:
      "इसे वर्तमान बकाया ऋण और चुकौती अवधि के अनुसार अलग से सेट करें। ऊपर दिया गया रेंट आय की कमी को कवर करता है; यह भाग ऋण चुकाने को कवर करता है।",
    byRepaymentPeriod: "चुकौती अवधि के अनुसार",
    scenarioLabels: {
      veryLow: "बहुत कम",
      low: "कम",
      medium: "मध्यम",
      high: "अधिक",
    },
    degreeLabels: ["स्तर I", "स्तर II", "स्तर III"],
    footer: {
      manager: "प्रबंधक",
      advisor: "सलाहकार",
      companyId: "कंपनी आईडी",
      phone: "फ़ोन",
      email: "E-mail",
      generated: "जनरेट किया गया",
      missing: "उल्लेखित नहीं",
    },
  },
} as const;

type Html2CanvasFn = (
  element: HTMLElement,
  options?: {
    scale?: number;
    backgroundColor?: string;
    useCORS?: boolean;
    imageTimeout?: number;
    logging?: boolean;
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
      displayNameFromUser(user) ||
      nameFromEmail(fallbackEmail),
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

function formatGeneratedDate(value: Date, language: PdfLanguage): string {
  const locale =
    language === "en"
      ? "en-GB"
      : language === "uk"
        ? "uk-UA"
        : language === "ne"
          ? "ne-NP"
          : language === "hi"
            ? "hi-IN"
            : "cs-CZ";

  return value.toLocaleDateString(locale, {
    day: "2-digit",
    month: language === "cs" ? "2-digit" : "long",
    year: "numeric",
  });
}

function formatYears(value: number, language: PdfLanguage): string {
  const years = Math.max(0, Math.round(value));

  if (language === "en") {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  if (language === "ne") {
    return `${years.toLocaleString("ne-NP", { maximumFractionDigits: 0 })} वर्ष`;
  }

  if (language === "hi") {
    return `${years.toLocaleString("hi-IN", { maximumFractionDigits: 0 })} वर्ष`;
  }

  if (language === "uk") {
    const lastTwo = years % 100;
    const last = years % 10;
    const unit =
      lastTwo >= 11 && lastTwo <= 14
        ? "років"
        : last === 1
          ? "рік"
          : last >= 2 && last <= 4
            ? "роки"
            : "років";
    return `${years} ${unit}`;
  }

  const unit = years === 1 ? "rok" : years >= 2 && years <= 4 ? "roky" : "let";
  return `${years} ${unit}`;
}

function formatPdfMoney(value: number, language: PdfLanguage): string {
  if (language === "cs") return formatMoney(value);

  if (language === "uk") {
    const formatted = Math.round(value).toLocaleString("uk-UA", {
      maximumFractionDigits: 0,
    });

    return `${formatted} Kč`;
  }

  const formatted = Math.round(value).toLocaleString("en-GB", {
    maximumFractionDigits: 0,
  });

  return `CZK ${formatted}`;
}

function formatPdfPercent(value: number, language: PdfLanguage): string {
  const locale =
    language === "en"
      ? "en-GB"
      : language === "uk"
        ? "uk-UA"
        : language === "ne"
          ? "ne-NP"
          : language === "hi"
            ? "hi-IN"
            : "cs-CZ";

  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} %`;
}

function translateAdvisorRole(roleLabel: string, language: PdfLanguage): string {
  const normalized = roleLabel.trim().toLowerCase();
  const footer = PDF_COPY[language].footer;

  if (
    normalized.startsWith("manazer") ||
    normalized.startsWith("manažer") ||
    normalized === "manager"
  ) {
    return footer.manager;
  }

  if (
    normalized.startsWith("poradce") ||
    normalized === "advisor" ||
    normalized === "consultant"
  ) {
    return footer.advisor;
  }

  return roleLabel || footer.advisor;
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

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function roundUp(value: number, step = 50_000): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function requiredCapitalForRenta(
  monthly: number,
  months: number,
  annualRate: number
): number {
  if (!Number.isFinite(monthly) || monthly <= 0 || months <= 0) return 0;
  if (!Number.isFinite(annualRate) || annualRate <= 0) {
    return monthly * months;
  }

  const monthlyRate = annualRate / 12;
  const factor = (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
  return monthly * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function LifeInsuranceSetupPage() {
  const pdfContentRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLanguageModalOpen, setPdfLanguageModalOpen] = useState(false);
  const [selectedPdfLanguage, setSelectedPdfLanguage] = useState<PdfLanguage>("cs");
  const [pdfRenderLanguage, setPdfRenderLanguage] = useState<PdfLanguage>("cs");
  const [pdfGeneratedAt, setPdfGeneratedAt] = useState(() => new Date());
  const [advisorFooter, setAdvisorFooter] = useState<AdvisorFooterInfo>(() =>
    advisorFooterFromProfile(null, auth.currentUser)
  );
  const [providerRole, setProviderRole] = useState<ProviderRole>("main");
  const [invalidityScenarioId, setInvalidityScenarioId] =
    useState<InvalidityScenarioId>("medium");
  const [invalidityModel, setInvalidityModel] =
    useState<InvalidityModel>("insurance");
  const [invalidityInvestmentVariantId, setInvalidityInvestmentVariantId] =
    useState<InvalidityInvestmentVariantId>("investika");
  const [hasChildren, setHasChildren] = useState<boolean | null>(null);
  const [futureFamilyPlan, setFutureFamilyPlan] = useState<FutureFamilyPlan | null>(null);
  const [hasMortgageOrLoan, setHasMortgageOrLoan] = useState<boolean | null>(null);
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
    const stateBenefit = Math.round(numbers.insuredIncome * 0.6);
    const incomeShortfall = Math.max(0, numbers.insuredIncome - stateBenefit);
    const commitmentGap = Math.max(0, numbers.monthlyExpenses - stateBenefit);
    const recommendedDaily = Math.max(
      0,
      Math.round((numbers.insuredIncome * DAILY_TARGET_RATIO) / 30)
    );
    const recommendedMonthly = recommendedDaily * 30;

    return {
      stateBenefit,
      incomeShortfall,
      commitmentGap,
      recommendedMonthly,
      recommendedDaily,
    };
  }, [numbers.insuredIncome, numbers.monthlyExpenses]);

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
    let cancelled = false;
    const loadFooter = (currentUser: FirebaseUser | null) => {
      setAdvisorFooter(advisorFooterFromProfile(null, currentUser));
      if (!currentUser) return;

      getUserProfileCached(currentUser, { force: true })
        .then((payload) => {
          if (cancelled) return;
          const payloadEmail =
            typeof (payload as { email?: unknown }).email === "string"
              ? (payload as { email?: string }).email
              : "";
          setAdvisorFooter(
            advisorFooterFromProfile(payload.profile, currentUser, payloadEmail)
          );
        })
        .catch((error) => {
          console.warn(
            "Profil poradce pro PDF patičku se nepodařilo načíst.",
            error
          );
        });
    };

    loadFooter(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      loadFooter(currentUser);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const updateValue = (key: InputKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: sanitizeInputValue(value) }));
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
      setStep((prev) => Math.min(prev + 1, lastStep));
    }
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

    if (currentStep === "children" && hasChildren === null) {
      setFormError("Vyber, jestli klient má děti.");
      return false;
    }

    if (currentStep === "children" && hasChildren === false && futureFamilyPlan === null) {
      setFormError("Vyber, jestli klient v budoucnu plánuje rodinu / děti.");
      return false;
    }

    if (currentStep === "mortgage" && hasMortgageOrLoan === null) {
      setFormError("Vyber, jestli klient má hypotéku nebo úvěr.");
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

  const openPdfLanguageModal = () => {
    setSelectedPdfLanguage("cs");
    setPdfLanguageModalOpen(true);
  };

  const handleDownloadPdf = async (language: PdfLanguage) => {
    const source = pdfContentRef.current;
    if (!source) return;

    setPdfRenderLanguage(language);
    setPdfLanguageModalOpen(false);
    setPdfGenerating(true);
    setPdfError(null);
    setPdfGeneratedAt(new Date());

    try {
      await waitForNextFrame();
      await waitForNextFrame();

      const html2canvas = await getHtml2CanvasPro();
      const JsPdfCtor = await getJsPdfCtor();
      const sourceRect = source.getBoundingClientRect();
      const sourceWidth = Math.ceil(sourceRect.width);

      const canvas = await html2canvas(source, {
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        backgroundColor: "#ffffff",
        useCORS: true,
        imageTimeout: 20000,
        logging: false,
        onclone: (doc) => {
          doc
            .querySelectorAll<HTMLElement>("[data-pdf-ignore='1']")
            .forEach((node) => node.remove());

          const clonedSource = doc.querySelector<HTMLElement>(
            "[data-life-setup-pdf='1']"
          );
          if (clonedSource) {
            clonedSource.style.width = `${sourceWidth}px`;
            clonedSource.style.maxWidth = `${sourceWidth}px`;
            clonedSource.style.margin = "0";
            clonedSource.style.padding = "0";
            clonedSource.style.background = "#ffffff";
          }

          doc.querySelectorAll<HTMLElement>("[data-pdf-only='1']").forEach((node) => {
            node.style.setProperty("display", "block", "important");
          });
        },
      });

      const pdf = new JsPdfCtor({
        unit: "pt",
        format: "a4",
        orientation: "portrait",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 22;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const pxPerPt = canvas.width / contentWidth;
      const sliceHeightPx = Math.max(1, Math.floor(contentHeight * pxPerPt));
      const sliceCanvas = document.createElement("canvas");
      const sliceCtx = sliceCanvas.getContext("2d");

      if (!sliceCtx) {
        throw new Error("Prohlížeč nepodporuje přípravu PDF canvasu.");
      }

      let renderedFirstPage = false;
      for (let offsetY = 0; offsetY < canvas.height; offsetY += sliceHeightPx) {
        const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY);
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = currentSliceHeight;
        sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.fillStyle = "#ffffff";
        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          canvas.width,
          currentSliceHeight
        );

        if (renderedFirstPage) {
          pdf.addPage();
        }

        const sliceHeightPt = currentSliceHeight / pxPerPt;
        pdf.addImage(
          sliceCanvas.toDataURL("image/jpeg", 0.96),
          "JPEG",
          margin,
          margin,
          contentWidth,
          sliceHeightPt,
          undefined,
          "FAST"
        );
        renderedFirstPage = true;
      }

      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`nastaveni-zivotniho-pojisteni-${language}-${today}.pdf`);
    } catch (error) {
      console.error("PDF export nastavení životního pojištění selhal:", error);
      setPdfError("PDF se nepodařilo vygenerovat. Zkus to prosím znovu.");
    } finally {
      setPdfGenerating(false);
      setPdfRenderLanguage("cs");
    }
  };

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-2 pb-10 sm:px-3">
        <style jsx global>{`
          .life-setup-dark-panel,
          .life-setup-dark-panel :where(h1, h2, h3, h4, p, span, div, label, button, input) {
            color: #f8fafc !important;
            -webkit-text-fill-color: #f8fafc !important;
          }

          .life-setup-dark-panel input,
          .life-setup-dark-panel .\\!text-white,
          .life-setup-dark-panel .text-white,
          .life-setup-dark-panel .life-setup-force-white {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
          }

          .life-setup-dark-panel input::placeholder {
            color: rgba(255, 255, 255, 0.35) !important;
            -webkit-text-fill-color: rgba(255, 255, 255, 0.35) !important;
          }
        `}</style>

        <div ref={pdfContentRef} data-life-setup-pdf="1" className="space-y-6 bg-white">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div data-pdf-ignore="1">
              <SplitTitle text={LIFE_SETUP_TITLE} className="!text-3xl sm:!text-5xl" />
            </div>
            {completed ? (
              <div
                className="flex flex-wrap items-center gap-2 sm:justify-end"
                data-pdf-ignore="1"
              >
                <button
                  type="button"
                  onClick={openPdfLanguageModal}
                  disabled={pdfGenerating}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-violet-300 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-4 py-2 text-sm font-semibold !text-white shadow-[0_12px_26px_rgba(124,58,237,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:self-auto"
                >
                  {pdfGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin !text-white" />
                  ) : (
                    <FileDown className="h-4 w-4 !text-white" />
                  )}
                  {pdfGenerating ? "Připravuji PDF" : "Tisk do PDF"}
                </button>
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
              </div>
            ) : null}
          </header>

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
                  <div className="grid gap-3 md:grid-cols-3">
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

              {currentStep === "children" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
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
                            onClick={() => handleChildrenChoice(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? "border-violet-200/70 bg-violet-400/20 shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                                : "border-white/14 bg-white/[0.03] hover:border-violet-300/40 hover:bg-white/[0.07]"
                            }`}
                          >
                            <span className="life-setup-force-white flex items-center gap-2 text-sm font-semibold text-white">
                              <CheckCircle2
                                className={`h-4 w-4 ${
                                  selected ? "text-emerald-200" : "text-violet-100/35"
                                }`}
                              />
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

                  {hasChildren === false ? (
                    <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
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
                              onClick={() => handleFutureFamilyPlanChoice(item.id)}
                              className={`rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? "border-violet-200/70 bg-violet-400/20 shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                                  : "border-white/14 bg-white/[0.03] hover:border-violet-300/40 hover:bg-white/[0.07]"
                              }`}
                            >
                              <span className="life-setup-force-white flex items-center gap-2 text-sm font-semibold text-white">
                                <CheckCircle2
                                  className={`h-4 w-4 ${
                                    selected ? "text-emerald-200" : "text-violet-100/35"
                                  }`}
                                />
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
                  ) : null}

                  {hasChildren ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                  <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
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
                            onClick={() => handleMortgageChoice(item.id)}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? "border-violet-200/70 bg-violet-400/20 shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                                : "border-white/14 bg-white/[0.03] hover:border-violet-300/40 hover:bg-white/[0.07]"
                            }`}
                          >
                            <span className="life-setup-force-white flex items-center gap-2 text-sm font-semibold text-white">
                              <CheckCircle2
                                className={`h-4 w-4 ${
                                  selected ? "text-emerald-200" : "text-violet-100/35"
                                }`}
                              />
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

                  {hasMortgageOrLoan ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              futureFamilyPlan={futureFamilyPlan}
              sickLeave={sickLeave}
              invalidity={invalidity}
              invalidityModel={invalidityModel}
              onInvalidityModelChange={setInvalidityModel}
              invalidityInvestmentVariantId={invalidityInvestmentVariantId}
              onInvalidityInvestmentVariantChange={setInvalidityInvestmentVariantId}
              invalidityScenarioId={invalidityScenarioId}
              onInvalidityScenarioChange={setInvalidityScenarioId}
              death={death}
              advisorFooter={advisorFooter}
              generatedAtLabel={formatGeneratedDate(pdfGeneratedAt, pdfRenderLanguage)}
              language={pdfRenderLanguage}
            />
          )}
        </div>

        {pdfError ? (
          <p
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            data-pdf-ignore="1"
          >
            {pdfError}
          </p>
        ) : null}
      </div>

      {pdfLanguageModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          data-pdf-ignore="1"
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.28)]">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                Jazyk PDF
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                Vyber jazyk pro tisk
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Čeština je výchozí. Po kliknutí na tisk se PDF vygeneruje ve
                zvoleném jazyce.
              </p>
            </div>

            <div className="grid max-h-[58vh] gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2 lg:grid-cols-5">
              {PDF_LANGUAGE_OPTIONS.map((option) => {
                const selected = selectedPdfLanguage === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedPdfLanguage(option.id)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      selected
                        ? "border-violet-500 bg-violet-50 shadow-[0_12px_28px_rgba(124,58,237,0.18)]"
                        : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
                    }`}
                  >
                    <span className="block text-4xl leading-none">{option.flag}</span>
                    <span className="mt-3 block text-base font-bold text-slate-950">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setPdfLanguageModalOpen(false)}
                disabled={pdfGenerating}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedPdfLanguage)}
                disabled={pdfGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-300 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pdfGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin !text-white" />
                ) : (
                  <FileDown className="h-4 w-4 !text-white" />
                )}
                {pdfGenerating ? "Připravuji PDF" : "Tisk"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/35 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_70%,#c084fc_100%)] text-white shadow-[0_10px_22px_rgba(124,58,237,0.24)]">
            <Icon className="h-5 w-5" />
          </span>
          <span className="rounded-full border border-violet-200/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-semibold text-violet-50">
            {field.badge}
          </span>
        </div>
        <span className="mt-3 flex min-h-[32px] items-start text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.14em] text-violet-200/85">
          {field.label}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full border-0 border-b border-white/18 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none !text-white outline-none transition placeholder:text-white/30 focus:border-violet-200 focus:ring-0"
          style={FIELD_TEXT_STYLE}
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300/85">
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
  futureFamilyPlan,
  sickLeave,
  invalidity,
  invalidityModel,
  onInvalidityModelChange,
  invalidityInvestmentVariantId,
  onInvalidityInvestmentVariantChange,
  invalidityScenarioId,
  onInvalidityScenarioChange,
  death,
  advisorFooter,
  generatedAtLabel,
  language,
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
  futureFamilyPlan: FutureFamilyPlan | null;
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
  invalidityModel: InvalidityModel;
  onInvalidityModelChange: (model: InvalidityModel) => void;
  invalidityInvestmentVariantId: InvalidityInvestmentVariantId;
  onInvalidityInvestmentVariantChange: (
    variantId: InvalidityInvestmentVariantId
  ) => void;
  invalidityScenarioId: InvalidityScenarioId;
  onInvalidityScenarioChange: (scenarioId: InvalidityScenarioId) => void;
  death: {
    incomeGapCoverage: number;
    educationCoverage: number;
    salaryFloor: number;
    needsBasedDecreasing: number;
    decreasingAmount: number;
    constantAmount: number;
    annuityMortgageAmount: number;
    futureFamilyAmount: number;
  };
  advisorFooter: AdvisorFooterInfo;
  generatedAtLabel: string;
  language: PdfLanguage;
}) {
  const [investmentVariantPickerOpen, setInvestmentVariantPickerOpen] = useState(false);
  const copy = PDF_COPY[language];
  const money = (value: number) => formatPdfMoney(value, language);
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

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="life-setup-dark-panel border-b border-slate-200 bg-[linear-gradient(135deg,#2e1065_0%,#7c3aed_52%,#a855f7_100%)] px-5 py-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
            {copy.previewEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            {copy.previewTitle}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-violet-50/78">
            {copy.previewIntro}
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-4">
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

      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                {copy.death}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">
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

        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                {copy.sickLeave}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">
                {copy.dailyBenefit}
              </h3>
            </div>
            <ShieldCheck className="h-8 w-8 text-violet-700" />
          </div>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              {copy.set}
            </div>
            <div className="mt-2 text-4xl font-bold text-violet-950">
              {money(sickLeave.recommendedDaily)} / {copy.perDay}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-violet-900">
              {copy.monthlyApprox} {money(sickLeave.recommendedMonthly)}.{" "}
              {copy.sickLeaveFormula}
            </p>
          </div>

          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
            <SmallCalcRow
              label={copy.stateSicknessBenefit}
              value={money(sickLeave.stateBenefit)}
            />
            <SmallCalcRow
              label={copy.incomeDrop}
              value={money(sickLeave.incomeShortfall)}
            />
            <SmallCalcRow
              label={copy.expenseGapInfo}
              value={money(sickLeave.commitmentGap)}
            />
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              {copy.disability}
            </p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">
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

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
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
            className="flex max-w-full flex-col gap-2 overflow-x-auto pb-1 lg:pb-0"
            data-pdf-ignore="1"
          >
            <div className="inline-flex min-w-max items-center rounded-2xl border border-violet-200 bg-white p-1 shadow-[0_8px_18px_rgba(124,58,237,0.08)]">
              {[
                { id: "insurance" as const, label: "Pojistné plnění" },
                { id: "investment" as const, label: "Investiční varianta" },
              ].map((model) => {
                const active = model.id === invalidityModel;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      if (model.id === "investment") {
                        setInvestmentVariantPickerOpen(true);
                        return;
                      }
                      onInvalidityModelChange(model.id);
                    }}
                    className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-[linear-gradient(135deg,#312e81_0%,#7c3aed_100%)] !text-white shadow-[0_8px_18px_rgba(49,46,129,0.24)]"
                        : "text-slate-600 hover:bg-violet-50 hover:text-violet-900"
                    }`}
                  >
                    {model.label}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex min-w-max items-center rounded-2xl border border-violet-200 bg-white p-1 shadow-[0_8px_18px_rgba(124,58,237,0.08)]">
              {INVALIDITY_SCENARIOS.map((scenario) => {
                const active = scenario.id === invalidityScenarioId;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => onInvalidityScenarioChange(scenario.id)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-[linear-gradient(135deg,#6d28d9_0%,#a855f7_100%)] !text-white shadow-[0_8px_18px_rgba(124,58,237,0.28)]"
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
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="h-1.5 bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)]" />
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
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-800">
                      {invalidityModel === "investment"
                        ? `${copy.coveragePrefix} ${percent(Math.round(item.ratio * 100))} ${copy.incomeCoverageSuffix}`
                        : `${percent(Math.round(item.ratio * 100))} ${copy.incomeCoverageSuffix}`}
                    </span>
                  </div>
                  <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
                    <SmallCalcRow
                      label={copy.monthlyAnnuity}
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

function PdfAdvisorFooter({
  advisor,
  generatedAtLabel,
  language,
}: {
  advisor: AdvisorFooterInfo;
  generatedAtLabel: string;
  language: PdfLanguage;
}) {
  const footerCopy = PDF_COPY[language].footer;
  const advisorRole = translateAdvisorRole(advisor.roleLabel, language);
  const advisorName = advisor.fullName || `${advisorRole} Bohemika`;
  const contactItems = [
    { label: footerCopy.companyId, value: advisor.ico || footerCopy.missing },
    { label: footerCopy.phone, value: advisor.phone || footerCopy.missing },
    { label: footerCopy.email, value: advisor.email || footerCopy.missing },
    { label: footerCopy.generated, value: generatedAtLabel },
  ];

  return (
    <footer
      data-pdf-only="1"
      className="hidden rounded-2xl border border-violet-200 bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
    >
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <div className="h-1.5 bg-[linear-gradient(90deg,#2e1065_0%,#7c3aed_52%,#a855f7_100%)]" />
        <div className="grid gap-3 px-3 py-2.5 md:grid-cols-[0.9fr_2.35fr] md:items-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white shadow-[0_6px_14px_rgba(124,58,237,0.1)]">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
            </span>
            <div className="min-w-0">
              <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                {advisorRole}
              </div>
              <div className="mt-0.5 text-base font-bold leading-tight text-slate-950">
                {advisorName}
              </div>
              <div className="text-[10px] font-semibold leading-tight text-slate-500">
                Bohemika a.s.
              </div>
            </div>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-4">
            {contactItems.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
              >
                <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </div>
                <div className="mt-0.5 break-words text-[11px] font-bold leading-tight text-slate-950">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
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
