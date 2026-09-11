# Kontrola srovnání cestovního pojištění – 11. 9. 2026

Rozsah: `/pomucky/cestovni-pojisteni-cpp-vs-kooperativa`, všech 40 situací, ČPP MINI/OPTI/MAXI, Kooperativa KOLUMBUS KLASIK/PLUS a AXA REFERENCE/KOMFORT/EXCELENT. Stránka již před úpravou zahrnovala také AXA; byla proto součástí kontroly. Jde o jednorázové cestovní pojištění, s výslovným oddělením informací o opakovaných výjezdech.

Kontrola zahrnula limity, přiřazení k pojišťovně a variantě, dostupnost připojištění, výluky a podmínky nároku. Úplné podmínky mají při výkladu přednost před stručným IPID a marketingovým přehledem. Výše limitu sama o sobě nedokládá vhodnější krytí.

## Zdroje a ověření verzí

- [ČPP: oficiální přehled a dokumenty](https://www.cpp.cz/cestovni-pojisteni/zaklad-na-cesty): staženo všech 16 relevantních PDF (VPPCP, 14 DPP, IPID). Dvanáct souborů je binárně shodných s uloženými dokumenty. U zbylých čtyř bylo porovnáno znění, viz níže.
- [Kooperativa: KOLUMBUS, vydání 11/2025, M-750/23](https://www.koop.cz/cestovni-pojisteni/attachments/koop-cestovni-pojisteni-kolumbus-012-11-2025.pdf): veřejný soubor je binárně shodný s uloženými úplnými podmínkami, 63 stran.
- [AXA: úplné podmínky z 15. 6. 2026](https://www.axa-assistance.cz/documents-to-download/Pojistne-podminky/Vseobecne-pojistne-podminky-cp?disposition=inline): binární soubory se liší, text všech 31 stran je po sjednocení mezer shodný. Údaje tematických přehledů se kontrolovaly proti úplným podmínkám; všech devět tematických přehledů ani IPID AXA nebylo samostatně znovu staženo z internetu.
- Všech 29 uložených PDF lze otevřít a číst. Jejich identifikátory pro chráněné stažení zůstaly zachovány. IPID Kooperativy 07/2023 slouží jako souhrn, nikoli náhrada úplných podmínek 11/2025.

Kontrolní součty uložených i veřejných dokumentů a přesné adresy jsou v [JSON záznamu](travel-comparison-source-audit-2026-09-11.json). Neměnily se původní PDF ani pravidla autentizace jejich stahování.

## Nalezené chyby a opravy

| Oblast | Původní problém | Oprava a doklad |
| --- | --- | --- |
| Kooperativa, zmeškaný návrat | 5 000 Kč bylo uvedeno i pro PLUS. | KLASIK 5 000 Kč, PLUS 10 000 Kč, tabulka str. 10. LVZ čl. 7 odst. 2d na str. 27 vymezuje návrat ze zahraničí do ČR. AXA EXCELENT 20 000 Kč naopak řeší odjezd do zahraničí. Zrušeno společné pořadí podle nesrovnatelných směrů cesty. |
| Kooperativa, konzultace lékaře | Služba na dálku byla prezentována jako zvláštnost AXA; u Kooperativy nebyla uvedena. | LVZ čl. 7 odst. 1a, str. 26–27 výslovně uvádí telefonickou nebo video konzultaci s česky komunikujícím lékařem při pojistné události, v obou variantách. |
| Kooperativa, alkohol | Úraz byl nesprávně zahrnut do plošné výluky s LVZ a odpovědností. | Běžné úrazové plnění lze podle čl. 6 odst. 4, str. 30 snížit až na polovinu, s výjimkami pro léky a smrt. Dopravní úraz má další výluky (čl. 7 odst. 4c, str. 32). LVZ str. 28 a odpovědnost str. 39 mají vlastní výluky. Opravena také souhrnná tabulka rozdílů. |
| Kooperativa, storno | Chybělo omezení při sjednání krátce před cestou; lhůta po úhradě byla zjednodušená. | STORNO čl. 3–4, str. 43: do 3 pracovních dnů od zálohy, po doplatku jen částka doplatku. Při sjednání méně než 14 dní před čerpáním může dojít ke snížení plnění o 50 %. Výjimka pro sjednání v den objednání a zaplacení ceny či zálohy. |
| ČPP, storno | Nebylo rozlišeno celkové uhrazení; nadpis zdůrazňoval 100 % i při možné 50% spoluúčasti. | DPPSTP 1/23 čl. 3 odst. 3: třetí den od celkového uhrazení; u souvisejících služeb od celkového uhrazení první služby. Čl. 6: 50% spoluúčast při sjednání méně než 14 dní před cestou. |
| Dřívější onemocnění | Souhrn odkazoval jen na IPID; chyběly výjimky stabilizovaného chronického stavu. | ČPP DPPLV čl. 6 odst. 1p a Kooperativa LVZ čl. 8 odst. 1a, str. 27. U Kooperativy akutní zhoršení musí ohrožovat zdraví či život a nesmí jít o zanedbání předepsané léčby. |
| Covid, obecný popis | Text naznačoval, že všechny pojišťovny mají nižší zvláštní limit. | ČPP a Kooperativa mají zvláštní limit, AXA v běžné destinaci používá limit LVZ; výjimka pro varovanou destinaci související s covidem u EXCELENT má vlastní sublimit. |
| Sporty | U ČPP a Kooperativy příliš obecná informace bez praktického rozsahu. | Doplněny konkrétní hranice ČPP: 4 000 m, UIAA II, ferraty B, ponory do 40 m s certifikací; Kooperativa: základ do 3 000 m, aktivní sport do 5 000 m / UIAA II, ferraty C, ponory do 40 m s certifikací. Uvedeny výluky freeridu, skialpinismu a soutěží v běžném rozsahu; u Kooperativy doplněna možnost sjednat organizovaný a extrémní sport podle konkrétní smlouvy. VPPCP ČPP čl. 16; Kooperativa LVZ čl. 2 a 8, str. 24 a 28–29. |
| ČPP, půjčené vozidlo | Nadpis prezentoval limit 500 000 Kč bez rozlišení varianty a podkladu pro zahrnutí auta. | DPPODC čl. 2 odst. 2b stanoví 10 % limitu, max. 500 000 Kč, na zapůjčenou věc: MINI 250 000 Kč, OPTI/MAXI 500 000 Kč. Správce následně sdělil, že zahrnutí auta z půjčovny má potvrzené od ČPP. Stránka toto potvrzení přijímá a uvádí jeho původ; již nepožaduje jeho opětovné získání. Krytí širšího okruhu zapůjčených movitých věcí je odděleno od explicitní spoluúčasti Kooperativy PLUS a AXA. |
| Srovnávací značky a závěry | „Vyšší limit“ se zobrazoval i u rozdílných principů náhrady, součtů sublimitů nebo pouze dvou známých hodnot; závěr o odpovědnosti nerozlišoval shodu limitů. | Automatické značky omezeny na srovnání stejné hlavní veličiny (léčba, zuby, zavazadla, úrazové částky, denní dávka). U ostatních situací rozhodují popsané podmínky. Odpovědnost má neutrální vysvětlení celkových a dílčích limitů. |
| ČPP Guard PLUS | Souhrn označoval všechna plnění za pevné kompenzace. | DPPGUP čl. 1 a 3: obnosová plnění se kombinují s náhradou skutečných nákladů na ubytování a opuštění oblasti. |

## Rozpory a výklady, které nelze vydávat za potvrzený nárok

1. **ČPP Covid PLUS:** soubor z veřejné adresy pojmenované `pp12020utp_nzp_v7_p14_dppcov-1_23.pdf` obsahuje **DPPCOV 1/21**, účinné od 1. 6. 2021. MAXI má 20 000 Kč za pobyt a 20 000 Kč za dopravu. Uložené **DPPCOV 1/23** mají MAXI 25 000 + 25 000 Kč. Stránka výslovně uvádí, že její částky vycházejí z uložené 1/23; rozpor je vidět přímo u krytí, u veřejného odkazu i v podkladech. Nelze potvrdit, která verze bude připojena k nové individuální smlouvě.
2. **ČPP Auto PLUS:** znění se liší pouze datem účinnosti (uložená verze 1. 5. 2018, veřejná 1. 9. 2018). Limity a popsané služby jsou shodné.
3. **ČPP Zvíře PLUS:** veřejná 1/18 účinná od 1. 9. 2018 zahrnuje veterinární náklady ze závodů a soutěží v čl. 2 odst. 3. Uložená 1/18 účinná od 1. 5. 2018 je podmiňuje ujednáním ve smlouvě. Druhy zvířat, vstupní věk, finanční limity a spoluúčast uvedené ve srovnání se shodují. Krytí závodů se na stránce neslibuje.
4. **ČPP Guard PLUS:** po sjednocení mezer a dělení slov je jediným textovým rozdílem datum účinnosti: uložená verze 1. 6. 2020, veřejná 1. 11. 2020. Rozsah i limity jsou shodné.
5. **AXA:** čtyřhodinový odklad pro počátek ve stejný den není výslovným potvrzením možnosti sjednání na již nastoupené cestě. U rizikových sportů část II čl. 9 písm. q) zmiňuje výjimku pro LVZ a úraz, zatímco tabulka a část III oddíl K uvádějí také odpovědnost. Obě nejasnosti jsou uvedené a vyžadují potvrzení pojistitele.
6. **Kooperativa, náhradní sportovní vybavení:** článek o události jmenuje poškození, zničení a odcizení; navazující podmínka zmiňuje i ztrátu. Zachováno upozornění, že samotnou ztrátu je potřeba potvrdit.

## Dodatečné potvrzení ČPP od správce srovnání

Dne 11. 9. 2026 správce sdělil, že má od ČPP potvrzené zahrnutí auta z půjčovny do odpovědnosti za škodu na zapůjčené věci. Jde o potvrzení zprostředkované správcem, nikoli o větu výslovně uvádějící auto v přezkoumaném PDF. Stránka tento původ uvádí u auta i v podkladech a původní požadavek na potvrzení odstranila.

Zvýrazněno, že krytí zahrnuje širší okruh zapůjčených movitých věcí, například sportovní vybavení. Definice v DPPODC čl. 8 bodu 37 vyžaduje oprávněné užívání věci od podnikatele, jehož činností je půjčování věcí. Zůstává rozdíl mezi zákonnou odpovědností za škodu a samostatným pojištěním spoluúčasti; smluvní sankce a odpovědnost převzatá nad rámec práva se tímto potvrzením nemění.

U pronajaté lodi není z těchto ustanovení dovozována plošná výluka. Samostatně jsou popsány škoda na samotné pronajaté věci a škoda související s vlastnictvím či provozem plavidla. Pro druhou oblast DPPODC čl. 3 odst. 2 stanoví vnitrozemské vody u malého plavidla a čl. 7 odst. 2 a 3d obsahuje zvláštní výluky. Potvrzení auta není rozšířeno na námořní charter ani proplacení kauce.

## Pokrytí jednotlivých situací

Čísla stran Kooperativy a AXA odpovídají číslování PDF. ČPP používá čísla článků samostatných DPP. Není-li uvedena změna, zůstala ověřovaná fakta v rozsahu uvedených zdrojů zachována; neznamená to krytí mimo popsané podmínky.

| ID situace | ČPP | Kooperativa | AXA |
| --- | --- | --- | --- |
| territorial-scope | IPID, VPPCP čl. 3 | IPID, str. 51–52 | část II čl. 7, str. 7 |
| insurance-duration | IPID, VPPCP čl. 16 | str. 7–8, 51 | část II čl. 1, 5 |
| payment-and-cover-start | IPID str. 2 | IPID str. 2, dálkové sjednání str. 5 | část II čl. 3, 5 |
| general-exclusions-and-duties | VPPCP, DPPLV čl. 5–6; doplněna chronická výjimka | str. 27–32, 39–40; opraven alkohol a výjimky | část II čl. 8–10 |
| own-sports-equipment | DPPLP čl. 2, 4–6 | str. 33–36 | oddíl G, str. 16–17 |
| replacement-sports-equipment | DPPLP čl. 2, 4 | str. 12, 35–36; upozornění na ztrátu | tabulka a oddíl G/K; bez náhradního pronájmu |
| rented-sports-equipment | DPPODC čl. 2, 8 | str. 11–12, 35, 37–40 | oddíl G |
| unused-summer-holiday | DPPLP čl. 2, 4–5 | str. 11, 41–42 | oddíl I; jen v návaznosti na předčasný návrat |
| sports-scope | VPPCP čl. 8, 16; DPPLP čl. 5 | LVZ čl. 2, 8; str. 24, 28–29 | oddíl K a seznamy sportů |
| winter-equipment | DPPZP čl. 2, 4–6 | str. 12, 33–36, 41–42 | oddíl G a přílohy sportů |
| golf | DPPGP čl. 2–6 | str. 12, 33–36 | oddíl G a přílohy sportů |
| treatment | DPPLV čl. 2, 5 | str. 10, 23–29 | tabulka str. 2, oddíl A |
| covid-treatment | DPPLV čl. 2, 5 | str. 11, 23–24 | část II čl. 9 a oddíl A |
| rescue | DPPLV čl. 2, 4–6 | str. 10, 23–29 | oddíl A; omezení samostatného pátrání |
| teeth | DPPLV čl. 2, 5 | str. 10, 24–25 | oddíl A |
| companion | DPPLV čl. 2, 5 | str. 10, 25–26 | oddíl A; EUR/noc a podmínky hospitalizace |
| pregnancy | DPPLV čl. 2, 6 | LVZ čl. 5, 8 | oddíl A čl. 2; str. 11 |
| doctor-on-phone | VPPCP, DPPLV; asistence | LVZ čl. 7 odst. 1a; opraveno | oddíl B; jen EXCELENT |
| alcohol | DPPLV čl. 5 odst. 6 | str. 28, 30–32, 39; opraveno | část II čl. 9, oddíl O |
| accident | DPPURC čl. 8, 10 | str. 11, 29–33 | oddíl F |
| accident-death | DPPURC čl. 8–9 | str. 11, 29–33 | oddíl F |
| accident-hospitalization | DPPURC; bez samostatné dávky | str. 11, 30–31 | oddíl F; bez samostatné dávky |
| liability | DPPODC čl. 2–8 | str. 11, 37–41 | tabulka, oddíl C; oddělené zdraví/věc/ušlý zisk |
| rental-car-liability | DPPODC čl. 2, 7, 8; zahrnutí auta potvrzeno ČPP podle sdělení správce, původ informace výslovně uveden | str. 11, 37–38; pouze PLUS | oddíl P; samostatné připojištění |
| baggage | DPPZAV čl. 2–7 | str. 11, 33–35 | oddíl G |
| baggage-delay | DPPLETP čl. 2–5 | str. 11, 36 | oddíl M; obnosové plnění |
| flight-delay | DPPLETP čl. 2–5 | str. 11, 36–37 | oddíl M; zpožděný přílet |
| missed-departure | DPPCP; bez samostatného protějšku | str. 10, 27; opraven limit PLUS | oddíl H; odjezd z ČR |
| quarantine | uložené DPPCOV 1/23; veřejný rozpor 1/21 | str. 8, 12, 46–47 | oddíl A; oddělené pobyt/návrat |
| after-departure | VPPCP čl. 7 odst. 8 | str. 3, 54 | část II čl. 5; potvrdit přijetí návrhu |
| unused | DPPCP čl. 2–4 | str. 11, 41–42 | oddíl I |
| cancellation | DPPSTP čl. 3–7; zpřesněno | str. 42–44; doplněno omezení | oddíl J |
| vehicle-assistance | DPPAP čl. 4–6; datum verze se liší | str. 12, 47–50 | oddíl Q |
| manual-work | VPPCP, DPPODC čl. 2 | výluky LVZ a odpovědnosti | oddíl L; pouze LVZ a úraz |
| security | DPPLV a DPPGUP; odlišen škodový princip | str. 23–32, 55 | část II čl. 5, 9 |
| animal | DPPZVP čl. 2–6; rozdíl závodů mezi verzemi | str. 7–12; bez veterinární péče | oddíl N; pouze pes/kočka |

## Doplnění plaveb a jachtingu po kontrole původních podmínek

Uživatel upozornil na chybějící rozhodování podle námořních mil. Doplněny čtyři situace, samostatná kategorie a rychlý přehled s pěti volbami: cestující na výletní lodi, rekreační jachting do 3 mil, nad 3 do 12 mil, nad 12 do 200 mil a oceánská plavba / nad 200 mil. Přehled zohledňuje zvolenou variantu AXA a nepředstavuje automatické potvrzení krytí konkrétní smlouvy.

| Situace | ČPP | Kooperativa | AXA |
| --- | --- | --- | --- |
| marine-sailing | VPPCP 1/18 čl. 12 odst. 2g a čl. 16 odst. 3, 15, 17a: rekreační jachting do 3 námořních mil; sportovní cesta do 200 mil od pevniny nebo pobřežních ostrovů; oceánské plavby a jachting na otevřeném moři nad 200 mil patří mezi extrémní sporty. Výluka připouští odchylné smluvní ujednání. | M-750/23 LVZ čl. 2 odst. 2h, str. 24: jachting (plachetnice, jachta) vyžaduje aktivní sport, u položky není hranice mil. Obecná ustanovení čl. 2 odst. 2–4, str. 51–52 pracují s územím států. Absence mil není potvrzením mezinárodních vod nebo libovolné oceánské trasy. | VPPCP 15. 6. 2026, příloha č. 1, str. 22–24: běžný jachting do 12 mil; rizikový od 12 do 200 mil; oceánská plavba je nepojistitelný sport. Tabulka str. 3: REFERENCE nemá připojištění rizikových sportů. Na 12 mílích se seznamy slovně překrývají, což je ve stránce uvedeno. |
| marine-cruise | VPPCP čl. 16 odst. 15 výslovně zahrnuje výlety s profesionální posádkou, trajekt, parník, zaoceánské lodě i cruise ship. Nepřenášet na ně automaticky limit 3 mil pro jachting. | V prověřeném textu není samostatná hranice mil pro pasivního cestujícího na cruise ship. Jachting jako aktivní sport není totéž co přeprava cestujícího. Konkrétní území zůstává nutné potvrdit. | Seznamy sportů upravují jachtu/katamarán. Nepřenášet automaticky hranice 12/200 mil na pasivního cestujícího na výletní lodi a neprohlašovat absenci zvláštního ustanovení za potvrzení každé plavby. |
| marine-rescue | DPPLV čl. 2 odst. 2, čl. 4 odst. 2, čl. 5 a čl. 8 odst. 5: pátrání, vysvobození a vymezená přeprava v tísni; obecné vymezení bez výslovného pojmenování námořní služby. Uveden limit záchrany v LVZ, nikoli nově vymyšlený námořní limit. | Tabulka str. 10 a LVZ čl. 3 str. 24–25: námořní záchranná služba výslovně uvedena. KLASIK 500 000 Kč, PLUS 1 000 000 Kč uvnitř LVZ. Ohrožení života/zdraví, nutné náklady a právní povinnost je uhradit. Výluky zneužití a vymezené hrubé nedbalosti. | Oddíl A čl. 1 odst. 5–6f–g a čl. 2 odst. 1f, str. 10–11: zdravotně nutná přeprava z místa úrazu/nemoci, včetně vrtulníku. Výluka pátrání bez ohrožení života/zdraví souvisejícího s úrazem/nemocí. Limit LVZ nevydáván za neomezené námořní pátrání. |
| marine-liability | DPPODC čl. 3 odst. 2: malé plavidlo jen na vnitrozemských vodách; čl. 7 odst. 1c, 2 a 3d: výdělečná činnost, povinné pojištění, ostatní plavidla a škody plavidlem na jiné lodi. Obecný sublimit zapůjčených věcí nepřebíjí tyto výluky. | Odpovědnost čl. 1 odst. 1c–d str. 38 a čl. 5 odst. 1h, k–m str. 40: výluky pronajaté motorové lodi/plachetnice, provozu plavidla vyžadujícího průkaz a výdělečné činnosti. Úzká výjimka pro vybavení obytného plavidla při ubytování, bez technických součástí a škod z dopravy. | Oddíl C čl. 2 odst. 1a, e, h str. 12: výluky povolání, používání plavidel a pronajatých věcí. Rizikové sporty z těchto výluk nedělají pojištění skippera nebo charterové kauce. REFERENCE odpovědnost neobsahuje. |

**Posouzení domněnky, že Kooperativa je nejlepší:** doložit lze výslovnou námořní záchranu a absenci číselné hranice mil u jachtingu. Nelze z toho samotného stanovit celkového vítěze: aktivní sport je nutný už u pobřeží, záchrana má samostatný sublimit a územní rozsah oceánské trasy vyžaduje potvrzení. U AXA je rekreační jachting do 12 mil v běžných sportech; u ČPP do 3 mil. Výhodnost se tedy mění podle trasy a potřeb klienta.

Písemné potvrzení konkrétní oceánské trasy od pojišťoven nebylo získáno; nikdo nebyl kontaktován. Stránka tuto nejistotu označuje a nevydává ji za výluku ani za zaručené krytí.

## Technické ověření

- 23 testů v `comparisonData.test.ts`: všech 18 kombinací variant a 40 situací, dostupnost připojištění, přiřazení oficiálních zdrojů ke správné pojišťovně, zásadní opravy ověřené textem konkrétních stran PDF, viditelná nejistota u sporných tvrzení. Ověřen i správný sublimit půjčeného auta pro všechny varianty ČPP a původ potvrzení, bez automatického přenesení na námořní charter.
- Zdrojový TypeScript prošel kontrolou. Standardní `tsc --noEmit` je blokován starými vygenerovanými `.next/types` odkazy na odstraněné stránky a API nesouvisející s touto změnou; proto byla dodatečně spuštěna kontrola všech zdrojů v `src` s dočasnou konfigurací bez těchto artefaktů.
- Vizuální a funkční kontrola v Chromu používá izolovaný náhled skutečné komponenty se stejnými styly; aplikační obal a přihlášení jsou pro náhled nahrazeny. Nejde o test celé přihlášené aplikace ani o nasazení.

- Izolovaný náhled prošel v Chromu v šířkách 320, 390, 640, 768, 1024, 1280 a 1440 px bez vodorovného přetékání a bez JavaScriptových chyb. Ověřeny varianty, hledání bez diakritiky, filtry, rozbalení všech 40 situací, správné zdroje, dialog výluk i dokumentů a chybové hlášení stažení bez přihlášení. U nového průvodce ověřeno všech pět typů plavby, omezení AXA REFERENCE, dynamické limity námořní záchrany Kooperativy, domény odkazovaných podmínek a hledání „namorni mile“. Přehled má pojmenovaný přístupný region a ovládání tlačítky s vyznačeným stavem.
