import { formatPdfMoney, type PdfLanguage } from "./lifeInsuranceShared";
import type { SicknessBenefits } from "./sicknessBenefits";

export const SICKNESS_COPY = {
  cs: {
    title: "Příjem během pracovní neschopnosti", subtitle: "Orientační model pro rok 2026 · náhrada mzdy a nemocenské",
    periods: ["1.–14. den", "15.–30. den", "31.–60. den", "Od 61. dne"], employer: "Zaměstnavatel", state: "OSSZ",
    employerRate: "60 % redukovaného hodinového výdělku", reduced: "redukovaného DVZ", perDay: "za kalendářní den",
    total: "Za období", lastTotal: "Za 61.–90. den", first: "Celkem za prvních", days: "dní", hours: "placených hodin",
    missing: "Chybí podklady", noEmployer: "OSVČ: bez náhrady od zaměstnavatele", uninsured: "Bez dobrovolného nemocenského pojištění: dávky OSSZ nejsou zahrnuty.",
    basis: "Denní vyměřovací základ", afterReduction: "Po redukci", gross: "Průměrný měsíční základ", hourly: "Hodinový výdělek",
    note: "Prvních 14 dní se náhrada vztahuje na rozvržené pracovní hodiny a placené svátky. OSSZ platí od 15. dne za všechny kalendářní dny. Model převádí měsíční základ × 12 / 365; nezohledňuje vyloučené dny ani zvláštní podmínky nároku. U OSVČ předpokládá splnění podmínek účasti. Částky nezahrnují soukromé pojištění.",
    missingNote: "Pro nevyčíslené částky doplň příjmy a pracovní dobu v kroku Klient.", sources: "Pravidla a výpočet", monthlyReference: "OSSZ za 30 dní při sazbě 60 % (srovnání)",
  },
  en: {
    title: "Income during sick leave", subtitle: "2026 estimate · employer compensation and sickness benefit",
    periods: ["Days 1–14", "Days 15–30", "Days 31–60", "From day 61"], employer: "Employer", state: "OSSZ",
    employerRate: "60% of reduced hourly earnings", reduced: "of reduced daily assessment base", perDay: "per calendar day",
    total: "Period total", lastTotal: "Days 61–90 total", first: "Total for the first", days: "days", hours: "paid hours",
    missing: "Inputs needed", noEmployer: "Self-employed: no employer compensation", uninsured: "No voluntary sickness insurance: OSSZ benefits excluded.",
    basis: "Daily assessment base", afterReduction: "After reduction", gross: "Average monthly assessment base", hourly: "Hourly earnings",
    note: "During the first 14 days, compensation covers scheduled working hours and paid holidays. OSSZ pays for all calendar days from day 15. This model uses monthly base × 12 / 365; excluded days and special eligibility rules are not included. Self-employed participation requirements are assumed to be met. Private insurance is excluded.",
    missingNote: "Complete income and working hours in the Client step to calculate missing amounts.", sources: "Rules and calculation", monthlyReference: "OSSZ for 30 days at 60% (comparison)",
  },
  uk: {
    title: "Дохід під час непрацездатності", subtitle: "Орієнтовна модель 2026 · компенсація та лікарняні",
    periods: ["1–14-й день", "15–30-й день", "31–60-й день", "Від 61-го дня"], employer: "Роботодавець", state: "OSSZ",
    employerRate: "60 % зменшеного погодинного заробітку", reduced: "зменшеної денної бази", perDay: "за календарний день",
    total: "За період", lastTotal: "За 61–90-й день", first: "Разом за перші", days: "днів", hours: "оплачених годин",
    missing: "Бракує даних", noEmployer: "Самозайняті: без компенсації роботодавця", uninsured: "Без добровільного страхування: виплати OSSZ не включено.",
    basis: "Денна база", afterReduction: "Після зменшення", gross: "Середня місячна база", hourly: "Погодинний заробіток",
    note: "Перші 14 днів оплачуються робочі години за графіком та оплачувані свята. Від 15-го дня OSSZ оплачує всі календарні дні. Модель: місячна база × 12 / 365, без виключених днів та особливих умов права на виплати. Для самозайнятих передбачається виконання умов участі. Приватне страхування не включено.",
    missingNote: "Для розрахунку заповніть дохід і робочий час у кроці «Клієнт».", sources: "Правила та розрахунок", monthlyReference: "OSSZ за 30 днів за ставкою 60 % (порівняння)",
  },
  ne: {
    title: "बिरामी बिदाको समयमा आय", subtitle: "२०२६ को अनुमान · रोजगारदाता क्षतिपूर्ति र बिरामी भत्ता",
    periods: ["दिन १–१४", "दिन १५–३०", "दिन ३१–६०", "दिन ६१ देखि"], employer: "रोजगारदाता", state: "OSSZ",
    employerRate: "घटाइएको घण्टाको आम्दानीको ६०%", reduced: "घटाइएको दैनिक आधारको", perDay: "प्रति पात्रो दिन",
    total: "अवधिको जम्मा", lastTotal: "दिन ६१–९० को जम्मा", first: "सुरुका दिनहरूको जम्मा:", days: "दिन", hours: "भुक्तानी हुने घण्टा",
    missing: "विवरण आवश्यक", noEmployer: "स्वरोजगार: रोजगारदाता क्षतिपूर्ति छैन", uninsured: "स्वैच्छिक बिरामी बीमा नभएकाले OSSZ भत्ता समावेश छैन।",
    basis: "दैनिक गणना आधार", afterReduction: "घटाइएपछि", gross: "औसत मासिक आधार", hourly: "प्रति घण्टा आम्दानी",
    note: "पहिलो १४ दिनमा निर्धारित कार्यघण्टा र तलबसहितका बिदाको क्षतिपूर्ति हुन्छ। दिन १५ देखि OSSZ ले सबै पात्रो दिनको भत्ता दिन्छ। मोडेल: मासिक आधार × १२ / ३६५; बाहेक गरिएका दिन र विशेष योग्यता नियम समावेश छैनन्। स्वरोजगारको सहभागिता सर्त पूरा भएको मानिन्छ। निजी बीमा समावेश छैन।",
    missingNote: "बाँकी रकम गणना गर्न ग्राहक चरणमा आय र कार्यघण्टा भर्नुहोस्।", sources: "नियम र गणना", monthlyReference: "६०% दरमा ३० दिनको OSSZ (तुलना)",
  },
  hi: {
    title: "बीमारी की छुट्टी के दौरान आय", subtitle: "२०२६ का अनुमान · नियोक्ता मुआवज़ा और बीमारी भत्ता",
    periods: ["दिन १–१४", "दिन १५–३०", "दिन ३१–६०", "दिन ६१ से"], employer: "नियोक्ता", state: "OSSZ",
    employerRate: "घटाई गई प्रति घंटे आय का ६०%", reduced: "घटाए गए दैनिक आधार का", perDay: "प्रति कैलेंडर दिन",
    total: "अवधि का कुल", lastTotal: "दिन ६१–९० का कुल", first: "शुरुआती दिनों का कुल:", days: "दिन", hours: "भुगतान योग्य घंटे",
    missing: "विवरण आवश्यक", noEmployer: "स्वरोज़गार: नियोक्ता मुआवज़ा नहीं", uninsured: "स्वैच्छिक बीमारी बीमा के बिना OSSZ भत्ता शामिल नहीं है।",
    basis: "दैनिक आकलन आधार", afterReduction: "कटौती के बाद", gross: "औसत मासिक आधार", hourly: "प्रति घंटे आय",
    note: "पहले १४ दिनों में निर्धारित कार्यघंटों और सवेतन छुट्टियों का मुआवज़ा मिलता है। दिन १५ से OSSZ सभी कैलेंडर दिनों का भुगतान करता है। मॉडल: मासिक आधार × १२ / ३६५; अपवर्जित दिन और विशेष पात्रता नियम शामिल नहीं हैं। स्वरोज़गार की भागीदारी शर्तें पूरी मानी गई हैं। निजी बीमा शामिल नहीं है।",
    missingNote: "बाकी रकम की गणना के लिए ग्राहक चरण में आय और कार्यघंटे भरें।", sources: "नियम और गणना", monthlyReference: "६०% दर पर ३० दिनों का OSSZ (तुलना)",
  },
} satisfies Record<PdfLanguage, Record<string, string | string[]>>;

export const SIMPLE_SICKNESS_COPY = {
  cs: { workDays: "Pracovní dny", title: "Kolik klient dostane při neschopnosti?", subtitle: "Částky celkem za uvedené období.", employerNote: "Platí za pracovní dny podle rozvrhu.", stateNote: "Platí za každý den, včetně víkendů.", lastPeriod: "61.–90. den", first30: "Celkem za prvních 30 dní", details: "Podrobnosti výpočtu", shortNote: "Orientační výpočet pro rok 2026. Procenta se počítají z redukovaného základu. Soukromé pojištění není zahrnuto.", printNote: "Výpočet vychází ze zadaných příjmů a pracovní doby. Skutečná výše závisí na podkladech a nároku na dávku.", total: "celkem", privateBenefit: "Soukromé pojištění · doporučená denní dávka" },
  en: { workDays: "Working days", title: "How much will the client receive during sick leave?", subtitle: "Total amounts for each period shown.", employerNote: "Pays for scheduled working days.", stateNote: "Pays for every day, including weekends.", lastPeriod: "Days 61–90", first30: "Total for the first 30 days", details: "Calculation details", shortNote: "2026 estimate. Percentages apply to the reduced assessment base. Private insurance is not included.", printNote: "Based on the entered income and working hours. Actual payments depend on supporting records and eligibility.", total: "in total", privateBenefit: "Private insurance · recommended daily benefit" },
  uk: { workDays: "Робочі дні", title: "Скільки клієнт отримає під час непрацездатності?", subtitle: "Загальні суми за кожен зазначений період.", employerNote: "Оплачує робочі дні за графіком.", stateNote: "Оплачує кожен день, включно з вихідними.", lastPeriod: "61–90-й день", first30: "Разом за перші 30 днів", details: "Деталі розрахунку", shortNote: "Орієнтовний розрахунок на 2026 рік. Відсотки застосовуються до зменшеної бази. Приватне страхування не включено.", printNote: "Розрахунок за вказаним доходом і робочим часом. Фактична сума залежить від документів і права на виплату.", total: "разом", privateBenefit: "Приватне страхування · рекомендована денна виплата" },
  ne: { workDays: "कार्यदिन", title: "बिरामी बिदामा ग्राहकले कति पाउँछन्?", subtitle: "देखाइएको प्रत्येक अवधिको कुल रकम।", employerNote: "निर्धारित कार्यदिनको भुक्तानी।", stateNote: "सप्ताहान्तसहित हरेक दिनको भुक्तानी।", lastPeriod: "दिन ६१–९०", first30: "पहिलो ३० दिनको कुल", details: "गणनाको विवरण", shortNote: "२०२६ को अनुमान। प्रतिशत घटाइएको गणना आधारमा लागू हुन्छ। निजी बीमा समावेश छैन।", printNote: "दिइएको आय र कार्यघण्टामा आधारित। वास्तविक भुक्तानी कागजात र योग्यतामा निर्भर हुन्छ।", total: "जम्मा", privateBenefit: "निजी बीमा · सिफारिस गरिएको दैनिक भत्ता" },
  hi: { workDays: "कार्यदिवस", title: "बीमारी की छुट्टी में ग्राहक को कितना मिलेगा?", subtitle: "दिखाई गई प्रत्येक अवधि की कुल राशि।", employerNote: "निर्धारित कार्यदिवसों का भुगतान।", stateNote: "सप्ताहांत सहित हर दिन का भुगतान।", lastPeriod: "दिन ६१–९०", first30: "पहले ३० दिनों का कुल", details: "गणना का विवरण", shortNote: "२०२६ का अनुमान। प्रतिशत घटाए गए आकलन आधार पर लागू होते हैं। निजी बीमा शामिल नहीं है।", printNote: "दर्ज आय और कार्यघंटों पर आधारित। वास्तविक भुगतान दस्तावेज़ों और पात्रता पर निर्भर करता है।", total: "कुल", privateBenefit: "निजी बीमा · अनुशंसित दैनिक भत्ता" },
};

export function SicknessBenefitBreakdown({ benefits: b, language = "cs", classes, print = false }: {
  benefits: SicknessBenefits; language?: PdfLanguage; classes?: Record<string, string>; print?: boolean;
}) {
  const c = SICKNESS_COPY[language];
  const simple = SIMPLE_SICKNESS_COPY[language];
  const cn = (key: string) => classes?.[key] ?? key;
  const money = (value: number | null) => value === null ? "—" : formatPdfMoney(value, language);
  const decimal = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} Kč`;
  const missing = b.cumulative.some(value => value === null);
  return <section className={cn("sicknessBreakdown")}>
    <div className={`${cn("benefitHeading")} section-title`}><h3>{simple.title}</h3><p>{simple.subtitle}</p></div>
    <div className={`${cn("benefitPayers")} info-card`}>
      <div className={cn("employerPayment")}>
        <h4>{c.employer}</h4><p>{b.employee ? simple.employerNote : c.noEmployer}</p>
        <div className={cn("employerAmount")}><span>{c.periods[0]}{b.employee && <span className={cn("benefitRate")} title={c.employerRate} aria-label={c.employerRate}>60 %</span>}</span><strong>{money(b.employerTotal)}</strong><small>{b.employerTotal === null ? c.missing : simple.total}</small></div>
        {b.employee && b.paidHours !== null && <small className={cn("workSchedule")}>{simple.workDays}: {b.workingDays}</small>}
      </div>
      <div className={cn("statePayment")}>
        <h4>{c.state}</h4><p>{b.insured ? simple.stateNote : c.uninsured}</p>
        {b.insured ? <dl className={cn("statePeriods")}>{b.phases.map((phase, i) => <div key={phase.rate}>
          <dt>{i === 2 ? simple.lastPeriod : c.periods[i + 1]}<span className={cn("benefitRate")} title={`${Math.round(phase.rate * 100)} % ${c.reduced}`} aria-label={`${Math.round(phase.rate * 100)} % ${c.reduced}`}>{Math.round(phase.rate * 100)} %</span></dt><dd>{money(phase.total)}</dd>
        </div>)}</dl> : <div className={cn("employerAmount")}><strong>{money(0)}</strong><small>{simple.total}</small></div>}
      </div>
    </div>
    <div className={`${cn("firstMonthTotal")} info-card`}><span>{simple.first30}</span><strong>{money(b.cumulative[0])}</strong></div>
    <p className={`${cn("benefitNote")} info-card`}>{missing && `${c.missingNote} `}{simple.shortNote}{print && ` ${simple.printNote}`}</p>
    {!print && <details className={cn("benefitDetails")}>
      <summary>{simple.details}</summary>
      <div className={cn("benefitBasis")}>
        <span>{c.gross}: <b>{money(b.monthlyBase)}</b></span>{b.employee && <span>{c.hourly}: <b>{decimal(b.hourlyEarnings)}</b></span>}
        <span>{c.basis}: <b>{decimal(b.dailyBase)}</b></span><span>{c.afterReduction}: <b>{money(b.reducedDailyBase)}</b></span>
      </div>
      <ul className={cn("benefitDailyRates")}>
        {b.employee && <li>{c.employer}: {c.employerRate}. {b.workingDays} × {b.hoursPerDay} h = {b.paidHours} {c.hours}.</li>}
        {b.insured && b.phases.map((phase, i) => <li key={phase.rate}>{c.periods[i + 1]}: <b>{money(phase.daily)} {c.perDay}</b> · {Math.round(phase.rate * 100)} % {c.reduced}.</li>)}
      </ul>
      <p className={cn("benefitNote")}>{c.note}</p>
      <p className={cn("benefitSources")}>{c.sources}: <a href="https://www.cssz.gov.cz/nemocenske" target="_blank" rel="noreferrer">ČSSZ</a> · <a href="https://mpsv.gov.cz/kalkulacka-pro-vypocet-vyse-nahrady-mzdy-v-roce-2026" target="_blank" rel="noreferrer">MPSV</a></p>
    </details>}
  </section>;
}
