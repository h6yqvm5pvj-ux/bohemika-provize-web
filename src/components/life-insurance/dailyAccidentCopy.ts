import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

export const DAILY_ACCIDENT_SOURCES = {
  product: "https://www.cpp.cz/zivotni-a-urazove-pojisteni/neon",
  terms: "https://www.cpp.cz/file/edee/dokumenty/zivotni-rizikove-a-urazove-pojisteni/brozury-pojistnych-podminek/pojisteni-neon/neon-risk/brozura-neon-risk_01_2026.pdf",
};

export const DAILY_ACCIDENT_COPY = {
  cs: {
    title: "Denní odškodné za úraz", kicker: "Finanční pomoc při léčení", close: "Zavřít detail denního odškodného", detail: "Jak funguje plnění a progrese",
    badge: "Prostor na zotavení", intro: "Úraz může na čas změnit váš běžný život. Denní odškodné přináší finanční pomoc za léčení jeho následků — například na výdaje, které ani během zotavování nepočkají.",
    calculationTitle: "O výši plnění rozhoduje i tabulka", calculation: "Základem je sjednaná denní částka a počet dnů uznaných pojišťovnou. Oceňovací tabulky přiřazují jednotlivým poraněním počet dnů nebo jejich maximum. Skutečná délka léčení proto nemusí odpovídat počtu proplacených dnů.",
    formula: "Denní částka × uznané dny", formulaNote: "Základní výpočet bez progrese; podmínky a limity se mezi produkty liší.",
    timingTitle: "Od kdy lze získat plnění?",
    modernTitle: "Dnes lze sjednat už od 1. dne", modernText: "U vybraných produktů s tabulkovým plněním se nemusí čekat na ukončení léčby. ČPP u NEONU uvádí vyřízení podle dokumentace z prvotního vyšetření. Událost je potřeba nahlásit a doložit; „od 1. dne“ neznamená výplatu peněz v den úrazu.",
    olderTitle: "Ve starší smlouvě třeba 8., 10. či 15. den", olderText: "Starší smlouvy mohou mít vyšší minimální dobu léčení. Společně ověříme, od kdy vzniká nárok a zda se pak plní zpětně od prvního dne, nebo až od sjednaného dne. Kratší léčení nemusí splnit podmínky pro výplatu.",
    recommendationKicker: "Můj pohled · ČPP NEON", recommendationTitle: "Proč u úrazového pojištění doporučuji ČPP", recommendation: "Za mě patří ČPP k nejlepším volbám pro úrazové pojištění. Oceňuji hlavně kombinaci širší definice úrazu, plnění od prvního dne a možnosti progrese.",
    advantages: [
      ["ÚRAZ PLUS", "Zahrnuje i některé neúrazové děje — například poškození související s nadměrnou zátěží či prodělanou nemocí, pokud splní rozšířenou definici v podmínkách. Nejde o pojištění všech nemocí."],
      ["Plnění od 1. dne", "Lze zvolit krytí už od prvního dne. Tabulkové hodnocení umožňuje řešit výplatu před ukončením léčby."],
      ["Progrese až 500 %", "U sjednané progresivní varianty se denní částka s počtem uznaných dnů postupně zvyšuje, v nejvyšším pásmu až na pětinásobek."],
    ],
    progressionTitle: "Jak funguje progresivní plnění", progression: "Čím delší je uznaná doba léčení, tím vyšší může být denní částka. U ČPP NEON RISK se každé pásmo počítá zvlášť:",
    daysHeading: "Uznané dny léčení", rateHeading: "Výše denní částky", periods: ["1.–80. den", "81.–120. den", "121.–160. den", "161.–240. den", "241.–365. den"],
    progressionNote: "Vyšší násobek platí pouze pro dny v daném pásmu. Sazba 500 % se neuplatňuje na celé léčení zpětně. Tabulka vychází z varianty s progresí v podmínkách NEON RISK 01/2026; u jiných smluv se pravidla mohou lišit.",
    exampleTitle: "Příklad: 300 Kč denně a 100 uznaných dnů", withoutProgression: "Bez progrese", withProgression: "S progresí ČPP", exampleCalculation: "80 × 300 Kč + 20 × 600 Kč = 36 000 Kč", exampleNote: "Modelový výpočet při splnění podmínek, bez případného krácení. Sto dnů musí být uznáno podle oceňovací tabulky; samotné léčení po tuto dobu nestačí.",
    checkTitle: "Co spolu ještě ověříme", checks: [
      ["Vaši konkrétní smlouvu", "Definici úrazu, oceňovací tabulku, výluky, sporty i sjednanou denní částku. Rozsah krytí se u pojišťoven a jednotlivých verzí smluv liší."],
      ["Omezení u některých poranění", "NEON RISK u vybraných úrazů neprokazatelných zobrazovací technikou v prvních dvou letech omezuje plnění na 50 % denní částky, nejvýše 300 Kč denně."],
    ],
    productSource: "ČPP · Pojištění NEON", termsSource: "Podmínky NEON RISK 01/2026 · čl. IX, 4c", meetingCta: "Probrat úrazové pojištění",
  },
  en: {
    title: "Daily accident benefit", kicker: "Financial help during recovery", close: "Close daily accident benefit details", detail: "How benefits and progression work",
    badge: "Time to recover", intro: "An injury can disrupt everyday life. Daily accident benefit provides financial help while you recover from its effects — for example, with expenses that cannot wait.",
    calculationTitle: "The insurer’s assessment table matters", calculation: "The starting point is your insured daily amount and the number of days recognised by the insurer. Assessment tables assign a number of days or a maximum to each injury. Your actual treatment period may therefore differ from the number of days paid.",
    formula: "Daily amount × recognised days", formulaNote: "Basic calculation without progression; conditions and limits vary by product.",
    timingTitle: "When can cover start?",
    modernTitle: "Cover can start from day 1", modernText: "Some products with table-based benefits can settle a claim before treatment ends. ČPP describes NEON claims being assessed using the initial medical examination records. You still need to report and document the claim; “from day 1” does not mean receiving money on the day of the injury.",
    olderTitle: "Older policies may specify day 8, 10 or 15", olderText: "An older policy may require a longer minimum treatment period. We will check when entitlement starts and whether payment then applies retrospectively from day one or only from the specified day. A shorter treatment period may not qualify.",
    recommendationKicker: "My view · ČPP NEON", recommendationTitle: "Why I recommend ČPP for accident cover", recommendation: "In my view, ČPP is one of the strongest options for accident insurance. I value its broader injury definition, cover from day one and optional progressive benefits.",
    advantages: [
      ["ÚRAZ PLUS", "Can also cover certain non-accidental causes, such as damage associated with excessive strain or a previous illness, where the extended policy definition is met. It does not cover every illness."],
      ["From day 1", "Cover can be selected from the first day. Table-based assessment allows a claim to be settled before treatment ends."],
      ["Progression up to 500%", "With the progressive option, the daily amount increases in bands according to the number of recognised days, reaching five times the amount in the highest band."],
    ],
    progressionTitle: "How progressive benefits work", progression: "The longer the recognised treatment period, the higher the daily amount can become. Under ČPP NEON RISK, each band is calculated separately:",
    daysHeading: "Recognised treatment days", rateHeading: "Daily amount paid", periods: ["Days 1–80", "Days 81–120", "Days 121–160", "Days 161–240", "Days 241–365"],
    progressionNote: "The higher multiplier applies only to days within its band. The 500% rate does not apply retrospectively to the whole treatment period. This table reflects the progressive option in NEON RISK terms dated 01/2026; other policies may differ.",
    exampleTitle: "Example: CZK 300 a day, 100 recognised days", withoutProgression: "Without progression", withProgression: "With ČPP progression", exampleCalculation: "80 × CZK 300 + 20 × CZK 600 = CZK 36,000", exampleNote: "Illustrative calculation assuming policy conditions are met and no reductions apply. All 100 days must be recognised under the assessment table; being treated for that long alone is not enough.",
    checkTitle: "What we will also check", checks: [
      ["Your specific policy", "The injury definition, assessment table, exclusions, sports and insured daily amount. Cover differs between insurers and policy versions."],
      ["Limits for certain injuries", "For selected injuries that cannot be confirmed by imaging in the first two years, NEON RISK limits payment to 50% of the daily amount, capped at CZK 300 per day."],
    ],
    productSource: "ČPP · NEON insurance", termsSource: "NEON RISK terms 01/2026 · IX, 4c", meetingCta: "Discuss accident cover",
  },
  uk: {
    title: "Щоденна виплата за травму", kicker: "Фінансова допомога під час лікування", close: "Закрити опис щоденної виплати", detail: "Як працюють виплати та прогресія",
    badge: "Час на відновлення", intro: "Травма може тимчасово змінити звичне життя. Щоденна виплата допомагає фінансово під час лікування її наслідків — наприклад, покрити витрати, які не можна відкласти.",
    calculationTitle: "Важлива й таблиця страховика", calculation: "Основою є застрахована денна сума та кількість днів, визнаних страховиком. Оцінювальні таблиці визначають для кожної травми кількість днів або їхню максимальну кількість. Фактичне лікування може тривати довше, ніж оплачуваний період.",
    formula: "Денна сума × визнані дні", formulaNote: "Базовий розрахунок без прогресії; умови та ліміти залежать від продукту.",
    timingTitle: "Від якого дня можливе покриття?",
    modernTitle: "Можна обрати вже з 1-го дня", modernText: "У деяких продуктах із табличними виплатами не потрібно чекати завершення лікування. ČPP для NEON описує розгляд за документами первинного огляду. Про випадок потрібно повідомити й надати документи; «з 1-го дня» не означає переказ грошей у день травми.",
    olderTitle: "У старому договорі — 8-й, 10-й чи 15-й день", olderText: "Старі договори можуть передбачати довший мінімальний строк лікування. Перевіримо, коли виникає право на виплату та чи охоплює вона попередні дні від першого дня, чи лише дні після встановленої межі. Коротше лікування може не давати права на виплату.",
    recommendationKicker: "Моя думка · ČPP NEON", recommendationTitle: "Чому я рекомендую ČPP для страхування від травм", recommendation: "На мою думку, ČPP є одним із найкращих варіантів страхування від травм. Ціную ширше визначення травми, можливість покриття з першого дня та прогресивних виплат.",
    advantages: [
      ["ÚRAZ PLUS", "Може охоплювати й окремі нетравматичні причини, зокрема ушкодження, пов’язані з надмірним навантаженням або перенесеною хворобою, якщо вони відповідають розширеному визначенню в договорі. Це не страхування всіх хвороб."],
      ["З 1-го дня", "Можна обрати покриття вже з першого дня. Таблична оцінка дає змогу врегулювати виплату до завершення лікування."],
      ["Прогресія до 500 %", "За прогресивним варіантом денна сума поступово збільшується залежно від кількості визнаних днів — до п’ятикратної суми у найвищому діапазоні."],
    ],
    progressionTitle: "Як працює прогресивна виплата", progression: "Що довший визнаний період лікування, то вищою може бути денна сума. У ČPP NEON RISK кожен діапазон розраховується окремо:",
    daysHeading: "Визнані дні лікування", rateHeading: "Розмір денної суми", periods: ["1–80-й день", "81–120-й день", "121–160-й день", "161–240-й день", "241–365-й день"],
    progressionNote: "Вищий множник діє лише для днів у відповідному діапазоні. Ставка 500 % не застосовується до всього лікування заднім числом. Таблиця відображає прогресивний варіант NEON RISK за умовами 01/2026; інші договори можуть мати інші правила.",
    exampleTitle: "Приклад: 300 Kč на день і 100 визнаних днів", withoutProgression: "Без прогресії", withProgression: "З прогресією ČPP", exampleCalculation: "80 × 300 Kč + 20 × 600 Kč = 36 000 Kč", exampleNote: "Умовний розрахунок за виконання умов договору, без можливого зменшення виплати. Усі 100 днів мають бути визнані за таблицею; самої тривалості лікування недостатньо.",
    checkTitle: "Що ще перевіримо разом", checks: [
      ["Ваш конкретний договір", "Визначення травми, оцінювальну таблицю, винятки, спорт і денну суму. Покриття залежить від страховика та версії договору."],
      ["Обмеження для окремих травм", "Для окремих травм, які неможливо підтвердити методами візуалізації, у перші два роки NEON RISK обмежує виплату до 50 % денної суми, максимум 300 Kč на день."],
    ],
    productSource: "ČPP · Страхування NEON", termsSource: "Умови NEON RISK 01/2026 · IX, 4c", meetingCta: "Обговорити страхування від травм",
  },
} satisfies Record<OnlineCardLocale, unknown>;
