import type { SicknessBenefits } from "./sicknessBenefits";
import { formatMoney } from "@/app/lib/formatters";

export type StepId = "base" | "family" | "children" | "mortgage" | "confirm";
export type EmploymentType = "employee" | "selfEmployed";
export type SicknessInsuranceChoice = "yes" | "no";
export type ProviderRole = "main" | "secondary";
export type InvalidityModel = "insurance" | "investment";
export type InvalidityInvestmentVariantId = "investika" | "savings";
export type FutureFamilyPlan = "yes" | "maybe" | "no";
export type PdfLanguage = "cs" | "en" | "uk" | "ne" | "hi";
export type InputKey =
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
export type InputValues = Record<InputKey, string>;
export type AdvisorFooterInfo = {
  fullName: string;
  roleLabel: string;
  ico: string;
  phone: string;
  email: string;
};

export const INVALIDITY_SCENARIOS = [
  { id: "veryLow", label: "Velmi nízké", ratios: [0.1, 0.2, 0.3] },
  { id: "low", label: "Nízké", ratios: [0.3, 0.5, 0.8] },
  { id: "medium", label: "Střední", ratios: [0.4, 0.6, 1] },
  { id: "high", label: "Vyšší", ratios: [0.5, 0.75, 1.2] },
] as const;
export const INVALIDITY_LABELS = ["1. stupeň", "2. stupeň", "3. stupeň"] as const;
export type InvalidityScenarioId = (typeof INVALIDITY_SCENARIOS)[number]["id"];
export const RETIREMENT_AGE = 65;
export const DEATH_COVERAGE_END_AGE = 75;
export const DAILY_TARGET_RATIO = 0.4;
export const SICK_LEAVE_EXPENSE_RESERVE_RATIO = 0.2;
export const DEFAULT_SOLO_DEATH_YEARS = 5;
export const INVESTIKA_RETURN_RANGE = { min: 0.055, max: 0.06 };
export const INVESTMENT_PRODUCT_NAME = "INVESTIKA Realitní Fond";
export const SAVINGS_ACCOUNT_RETURN_RANGE = { min: 0.0285, max: 0.0285 };
export const INVALIDITY_INVESTMENT_VARIANTS: Array<{
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
export const PDF_COPY = {
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
    sickLeaveFormula: "Tato dávka má při pracovní neschopnosti nahradit přibližně 40 % čistého příjmu. Skutečný výpadek závisí na platbě od zaměstnavatele a OSSZ.",
    sickLeaveFormulaNoState:
      "Doporučená denní dávka je nastavena tak, aby pokryla měsíční náklady klienta navýšené o 20 % rezervu.",
    sickLeaveNoStateTitle: "OSVČ bez nemocenského pojištění",
    sickLeaveNoStateNote:
      "Klient musí doložit pojišťovně potvrzení od ČSSZ. Obecně je maximální denní dávka přibližně 600 Kč / den bez dokládání příjmu. Výše příjmu se dokládá při vstupu do pojištění a při pojistné události. Pokud je příjem při pojistné události nižší, plnění bude kráceno podle příjmu.",
    stateSicknessBenefit: "Orientační státní nemocenská",
    incomeDrop: "Pokles proti příjmu klienta",
    incomeDropNoState: "Pokles oproti příjmu",
    expenseGapInfo: "Mezera proti nákladům informativně",
    expenseGapInfoNoState: "Zbytková mezera proti nákladům",
    expenseReserveTarget: "Závazky + 20 % rezerva",
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
    sickLeaveFormula: "This benefit aims to replace approximately 40% of net income during sick leave. The actual income shortfall depends on payments from the employer and OSSZ.",
    sickLeaveFormulaNoState:
      "The recommended daily benefit covers the client's monthly expenses with a 20% buffer and is converted into a daily amount.",
    sickLeaveNoStateTitle: "Self-employed without sickness insurance",
    sickLeaveNoStateNote:
      "The client must provide the insurer with confirmation from CSSZ. In general, the maximum daily benefit is approximately CZK 600 per day without income documentation.",
    stateSicknessBenefit: "Estimated state sickness benefit",
    incomeDrop: "Drop compared with the client's income",
    incomeDropNoState: "Remaining drop after the recommended benefit",
    expenseGapInfo: "Indicative gap compared with expenses",
    expenseGapInfoNoState: "Remaining gap compared with expenses",
    expenseReserveTarget: "Commitments + 20% buffer",
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
    sickLeaveFormula: "Ця виплата має замінити приблизно 40 % чистого доходу під час непрацездатності. Фактична втрата доходу залежить від виплат роботодавця та OSSZ.",
    sickLeaveFormulaNoState:
      "Рекомендована денна виплата покриває місячні витрати клієнта з резервом 20% і перераховується на денну суму.",
    sickLeaveNoStateTitle: "ФОП без страхування на випадок хвороби",
    sickLeaveNoStateNote:
      "Клієнт має надати страховій компанії підтвердження від CSSZ. Загалом максимальна денна виплата становить приблизно 600 Kč на день без підтвердження доходу.",
    stateSicknessBenefit: "Орієнтовна державна лікарняна виплата",
    incomeDrop: "Зниження порівняно з доходом клієнта",
    incomeDropNoState: "Залишкове зниження після рекомендованої виплати",
    expenseGapInfo: "Орієнтовний розрив відносно витрат",
    expenseGapInfoNoState: "Залишковий розрив відносно витрат",
    expenseReserveTarget: "Зобов'язання + резерв 20%",
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
    sickLeaveFormula: "यो भत्ताको उद्देश्य बिरामी बिदामा शुद्ध आम्दानीको करिब ४०% पूर्ति गर्नु हो। वास्तविक आयको कमी रोजगारदाता र OSSZ को भुक्तानीमा निर्भर हुन्छ।",
    sickLeaveFormulaNoState:
      "सिफारिस गरिएको दैनिक भत्ताले ग्राहकका मासिक खर्चमा २०% रिजर्भ थपेर कभर गर्छ र दैनिक रकममा रूपान्तरण गर्छ।",
    sickLeaveNoStateTitle: "बिरामी बीमा नतिर्ने स्वरोजगार ग्राहक",
    sickLeaveNoStateNote:
      "ग्राहकले बीमा कम्पनीलाई CSSZ को पुष्टि पेश गर्नुपर्छ। आम्दानी प्रमाणित नगरी अधिकतम दैनिक भत्ता सामान्यतया करिब CZK 600 प्रति दिन हुन्छ।",
    stateSicknessBenefit: "अनुमानित सरकारी बिरामी भत्ता",
    incomeDrop: "ग्राहकको आम्दानीको तुलनामा कमी",
    incomeDropNoState: "सिफारिस गरिएको भत्तापछि बाँकी कमी",
    expenseGapInfo: "खर्चको तुलनामा अनुमानित कमी",
    expenseGapInfoNoState: "खर्चको तुलनामा बाँकी कमी",
    expenseReserveTarget: "दायित्व + २०% रिजर्भ",
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
    sickLeaveFormula: "इस भत्ते का उद्देश्य बीमारी की छुट्टी के दौरान शुद्ध आय के लगभग ४०% की भरपाई करना है। वास्तविक आय की कमी नियोक्ता और OSSZ के भुगतान पर निर्भर करती है।",
    sickLeaveFormulaNoState:
      "अनुशंसित दैनिक लाभ ग्राहक के मासिक खर्चों को २०% रिजर्व के साथ कवर करता है और उसे दैनिक राशि में बदला जाता है।",
    sickLeaveNoStateTitle: "बीमारी बीमा न देने वाला स्व-रोजगार ग्राहक",
    sickLeaveNoStateNote:
      "ग्राहक को बीमा कंपनी को CSSZ से पुष्टि देनी होगी। आय प्रमाणित किए बिना अधिकतम दैनिक लाभ सामान्यतः लगभग CZK 600 प्रति दिन होता है।",
    stateSicknessBenefit: "अनुमानित सरकारी बीमारी लाभ",
    incomeDrop: "ग्राहक की आय की तुलना में कमी",
    incomeDropNoState: "अनुशंसित लाभ के बाद बची कमी",
    expenseGapInfo: "खर्चों की तुलना में अनुमानित कमी",
    expenseGapInfoNoState: "खर्चों की तुलना में बची कमी",
    expenseReserveTarget: "दायित्व + २०% रिजर्व",
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

export function formatGeneratedDate(value: Date, language: PdfLanguage): string {
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

export function formatYears(value: number, language: PdfLanguage): string {
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

export function formatPdfMoney(value: number, language: PdfLanguage): string {
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

export function formatPdfPercent(value: number, language: PdfLanguage): string {
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

export function translateAdvisorRole(roleLabel: string, language: PdfLanguage): string {
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


export type LifeInsuranceResultData = {
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
  sicknessBenefits: SicknessBenefits;
  sickLeave: {
    hasStateSicknessBenefit: boolean;
    stateBenefit: number | null;
    incomeShortfall: number | null;
    commitmentGap: number | null;
    expenseReserveTargetMonthly: number;
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
  invalidityInvestmentVariantId: InvalidityInvestmentVariantId;
  invalidityScenarioId: InvalidityScenarioId;
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
  clientName: string;
  advisorFooter: AdvisorFooterInfo;
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}


export function requiredCapitalForRenta(
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
