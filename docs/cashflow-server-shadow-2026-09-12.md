# Serverové cashflow — ověřovací etapa, 12. 9. 2026

První ověřovací etapa je implementovaná a otestovaná v pracovní verzi. Navazuje na [audit načítání dat](./data-loading-audit-2026-09-11.md). **Není nasazená ani zapnutá na živých účtech.** Navazující [druhá etapa](./cashflow-server-candidates-2026-09-12.md) již přidává sledování změn, ukládání a ověření obnovených diagnostických výsledků. Níže je popsaná původní první etapa; použití uložených částek pro běžné zobrazení stále není implementované.

## Účel první etapy

Dosavadní prohlížečový výpočet dále vytváří zobrazené cashflow. Výpočet ze snapshotu je vyčleněný do `src/app/cashflow/computeCashflow.ts`; používá jej původní hook i nová cesta `POST /api/cashflow/shadow`. Server znovu načte podklady přes existující autorizované API handlery. `buildCashflowView.ts` sestaví měsíce stejnými pomocnými funkcemi jako stránka; původní skládání na stránce zůstává referencí pro porovnání. Výsledek slouží pouze pro porovnání. Nevzniká persistentní cache, nepoužívá se serverová částka pro zobrazení a nemění se zápisy smluv ani import výpisů.

Tato etapa sama nezrychluje načítání. Při zapnutí přidává čtení a výpočet; jejím výstupem jsou podklady pro ověření přenositelnosti výpočtu a evidence rozdílů. Aktivace je ve výchozím stavu vypnutá, vyžaduje serverový přepínač, výslovný seznam účtů a samostatný souhlas s diagnostikou v konkrétní relaci prohlížeče. Před širokým zapnutím je nutné změřit dodatečnou zátěž.

## Aktivace a provozní meze pilotu

Pro testovací nasazení jsou potřeba všechny následující kroky; tato práce žádný z nich na produkci neprovedla:

- Při sestavení nastavit `NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED=1`.
- Serveru nastavit `CASHFLOW_SHADOW_ENABLED=1` a `CASHFLOW_SHADOW_EMAILS` na konkrétní e-maily testovaných účtů, oddělené čárkou. Hvězdička nepovoluje všechny účty.
- V relaci vlastního přihlášeného účtu nastavit `sessionStorage.setItem("cashflow_shadow_opt_in", "1")` a znovu otevřít cashflow. Ukončení této relace nebo odstranění klíče a znovuotevření stránky vypne místní aktivaci. Serverový přepínač umožňuje okamžitě odmítnout další porovnání bez nového sestavení.

Pilot prohlížeče vynechává zastupované účty. Při odlišném IANA časovém pásmu prohlížeče a serveru se porovnání přeskočí; časové pásmo serverového procesu se za běhu nemění. Rozhodné datum musí patřit do stejného místního dne a být nejvýše pět minut vzdálené od aktuálního času. Práce s datem při běžném zobrazení zachovává původní chování.

Diagnostika se načítá dynamicky až po běžném cashflow a po 1,5 sekundě bez změny výběru. Prohlížeč ji nespouští ve skryté kartě, po změně účtu ani po zrušení požadavku. Nanejvýš jeden pokus za pět minut na účet omezuje prohlížeč i server. Nevybrané relace neprovádějí výpočet otisků. Tělo POST má nejvýše 4 KiB a přenáší SHA-256 otisky a nastavení zobrazení včetně případného hledaného čísla smlouvy; nepřenáší portfolio, klientská jména, výpisy ani částky.

Serverové načítání má strop 50 vnitřních volání a 20 sekund. Timeout ukončí čekání a další stránkování; již spuštěný Firestore požadavek ve stávajících handlerech nelze tímto signálem přerušit. Před výpočtem se kontroluje konzervativní odhad nejvýše 25 000 výstupních položek, náročnost párování, velikost vnořených seznamů a meze dat/délek smluv (`cashflowShadowBudget.ts`). Příliš náročné portfolio se přeskočí celé. Tyto meze omezují pilot, nikoli běžné cashflow; neprokazují funkčnost budoucí cache pro největší portfolia. I výpočet otisků má limit 16 MiB na serializovanou hodnotu.

Výsledek je `match`, `mismatch` nebo `skipped` s důvodem; nikdy neobsahuje vypočtené částky. Server loguje dokončenou shodu/neshodu položek a měsíců s verzí protokolu, bez otisků a osobních údajů. Přeskočené pokusy lze rozlišit v odpovědi požadavku, nejde o úspěšné ověření. Výsledek diagnostiky se neukládá do uživatelských dat a neopravňuje k automatickému přepnutí na cache.

## Bezpečné podmínky porovnání

1. **Identita a oprávnění.** Server určuje účet z ověřeného tokenu a existujících pravidel zastupování. E-mail v těle požadavku není oprávnění k načtení cizích dat. Vnitřní načítání má pevně zvolené vlastní handlery a předává potřebný autentizační kontext; klient nemůže zadat libovolnou URL nebo seznam vlastníků. Platí dosavadní omezení smluv, TIP výplat a předplatného. Porovnání při nepodporovaném zastupování lze raději vynechat.
2. **Omezená práce.** Přepínač a seznam účtů se ověří před čtením portfolia. Požadavek potřebuje limit četnosti, omezené tělo, omezené stránkování a ukončení při chybě. Prohlížeč má počkat na dokončení běžného načítání; selhání porovnání nesmí přepsat výsledky nebo blokovat stránku.
3. **Stejný čas.** Do porovnání patří rozhodný okamžik i časové pásmo. `generator.ts`, `helpers.ts` a `subscriptionCashflow.ts` používají lokální kalendářní operace. Shodný okamžitý posun UTC nedokládá stejné historické a budoucí přechody letního času. Konzervativní první krok porovnává pouze kompatibilní IANA pásma a jinak vrací přeskočení; globální změna `process.env.TZ` pro jednotlivý požadavek by ovlivňovala souběžné požadavky. Pravidla výpočtu se při tomto kroku nepřepisují na UTC.
4. **Stejné vstupy před výstupy.** Nejprve se porovná deterministický otisk skutečně použitých normalizovaných podkladů, verze výpočtu, účtu, režimu a filtrů. Rozdílné podklady jsou neprůkazný výsledek, nikoli chyba vzorce nebo úspěšná shoda. Patří sem i změna smlouvy během načítání nebo starší pětiminutový snapshot prohlížeče.
5. **Položky a měsíce.** Teprve při shodných vstupech se porovnávají jednotlivé výplaty, datum, částka, vlastní/týmový zdroj, jejich stav a výsledné měsíce. Pouhý celkový součet může skrýt přesunutou či chybně spárovanou provizi. Způsob porovnání musí zachovat duplicity a jednoznačně zacházet s neplatnými čísly a daty.
6. **Minimální diagnostika.** Diagnostika potřebuje stav shoda/neshoda/neprůkazné/přeskočeno, verzi a agregované počty. Do běžných logů nepatří tokeny, klientská jména, čísla smluv ani celé podklady. Klientský otisk je pomocná diagnostika od nedůvěryhodného klienta, nikoli důkaz autorizace nebo oprávnění aktivovat cache.

Sdílení současných funkcí snižuje riziko odlišného přepisu. Shoda obou cest ale nedokazuje správnost původních provizních pravidel; obě mohou sdílet stejnou chybu. Proto zůstávají potřebné regresní příklady s nezávisle očekávanými částkami.

## Zjištěné hranice úplnosti a konzistence

| Současná cesta | Omezení pro interpretaci shody |
| --- | --- |
| `useCashflowData.ts`: smlouvy po 100 položkách, nejvýše 400 stran; TIP výplaty nejvýše 200 stran. | Dosavadní načítání může skončit po opakovaném/chybějícím kurzoru, prázdné straně nebo limitu. Serverové porovnání takový stav nesmí označit jako úplné portfolio. Kontrola musí rozlišovat skutečný konec a bezpečnostní zastavení. |
| `useCashflowData.ts`: chyby TIP výplat a předplatného se nahrazují prázdným seznamem; odmítnutí týmové větve 403 může odstranit tým. | Shoda dvou prázdných seznamů nemusí znamenat úspěšně načtený vstup. Ověřovací cesta má tyto situace rozlišit a vrátit neprůkazné porovnání. |
| `/api/commission-statements?shape=cashflow&limit=240`. | Současná stránka používá omezené okno výpisů bez pokračovacího kurzoru, duplikáty se vybírají až po omezení dotazu. Navazující implementace přidává konzervativní `hasMore` podle počtu původních dokumentů před deduplikací; při dosažení limitu serverové porovnání odmítne tvrdit úplnost. Pro autoritativní cache zůstává nutné úplné stránkování historie. |
| `/api/subscription-payments/list?limit=5000`. | API vrací `hasMore`, dosavadní klient jej nepoužívá. Při dosažení limitu nelze publikovat souhrn jako úplný. |
| `contractsApi.ts`: existující cache stromu uživatelů a stavu předplatného. | Použití stejného handleru zachovává dosavadní kontrolu oprávnění; není nezávislým důkazem okamžité aktuálnosti oprávnění. Persistentní souhrn nesmí prodlužovat její platnost. |
| `commission-statements/route.ts`: uložení výpisu, následné dávky zápisů, až závěrečný `processedAtMs`. | Oba výpočty mohou přečíst shodný mezistav importu. Navazující kontrola `processingComplete` podle `processedAtMs >= updatedAtMs` pomáhá vyloučit běžné nedokončené nahrání. Není atomickým zámkem: samostatné přezpracování nebo přestavba smlouvy nemusí předem posunout `updatedAtMs` a mohou stále nést předchozí údaj o dokončení. |

## Co musí předcházet autoritativní persistentní cache

| Skupina změn | Nalezené cesty a potřebné pokrytí |
| --- | --- |
| Vytvoření, editace, odstranění a zaplacení smlouvy | `src/app/api/contracts/_lib/contractsApi.ts` a obsluhy `update-fields`, `set-paid`, `bulk-delete`, `sync-cpp-status`. Změna ovlivňuje vlastníka, manažerské provize a případné TIP výplaty. Hromadné operace mohou mít více dávek. |
| Převody a životní cyklus | Stejný modul smluv, `/api/cron/contract-lifecycle`, `src/lib/server/contractLifecycleMaintenance.ts`. Zneplatnění zahrnuje původního i nového příjemce a související manažery; je potřeba pokrýt i plánované převody a automatické dožití. |
| Výpisy a odvozené opravy smluv | `src/app/api/commission-statements/route.ts`: import, opakované zpracování uloženého výpisu, přestavba smlouvy z výpisů a manuální převod NEON. Import zapisuje výpis před zpracováním smluv, průběžně potvrzuje dávky kolem 400 operací a poslední dávka označí dokončení. Potřebuje stav zpracování a spolehlivou hranici dokončení pro všechny ovlivněné uživatele, obnovu po částečné chybě a idempotentní opakování. |
| Profily, manažerský strom a provizní režim | `/api/user/profile` a příslušné administrátorské změny uživatelů. Výsledek závisí na aktuální pozici, časové ose pozic, provizním režimu, vztazích v týmu, uložených manažerských rozdílech a historických vlastnících. Úprava jednoho profilu může změnit více portfolií. |
| Předplatné a TIP výplaty | `/api/admin/subscriptions`, smluvní zápisy TIP výplat a případné administrátorské opravy. Předplatné zahrnuje vytvoření, úpravu i odstranění platby a předpověď navazujícího období; oprávnění k těmto údajům zůstává oddělené. |
| Datum, filtry a verze pravidel | Horizont výpočtu a zařazení do měsíců se mění bez zápisu dat. Klíč/verze souhrnu musí zohlednit datum, pásmo, režim, rozsah, produkty, historická období, hledání smlouvy, posuny podle výpisů a inteligentní predikci, případně ponechat příslušné filtrování nad úplnými položkami. |
| Přímé opravné skripty | Například `scripts/backfill-manager-chain-timeline.ts`, `fix-legacy-manager-overrides-frequency.mjs`, opravy produktových provizí a skripty životního cyklu. Zápisy mimo API musí aktualizovat stejnou evidenci změn nebo vynutit přestavbu; pouhé napojení na formuláře nestačí. |

Pro další etapu je nutné navrhnout společnou revizi vstupů a důvěryhodné označení probíhajících vícefázových změn. Výpočet smí publikovat souhrn pouze pro dokončenou revizi, která se během práce nezměnila. Pokud vznikne nová revize, neúplný vstup nebo chyba, následuje dosavadní načtení. Řešení potřebuje také obnovu po přerušení, přechod období, změně pravidel a výpadku zpracovatele. Tyto mechanismy nejsou nahrazeny první porovnávací etapou.

## Ověření první etapy

- Výchozí vypnutí, účet mimo seznam, neplatný token, nepovolené zastupování, překročená četnost, neplatné nebo příliš velké tělo: bez čtení portfolia a bez úniku podkladů.
- Rozdílný klientský/serverový snapshot, stará verze výpočtu, hranice dne a nekompatibilní časové pásmo: neprůkazné nebo přeskočené porovnání.
- Úplné stránkování přes více stran, opakovaný/chybějící kurzor, dosažený limit, chyba libovolné datové větve, změna účtu nebo filtrů během práce: žádná falešná shoda a žádné ovlivnění zobrazeného cashflow.
- Shodný součet, ale jiná smlouva, měsíc, stav nebo počet duplicit: neshoda. Klíče objektů nesmí způsobovat náhodné rozdíly otisků; zaokrouhlení nesmí skrýt rozdíl částek.
- Vlastní a týmové provize, TIP/předplatné, převzaté smlouvy, produktové filtry, skutečné výpisy a inteligentní predikce: zachování současných výsledků v regresních příkladech.

Celá aplikační sada prošla: **1 411 / 1 411 testů ve 171 souborech**. Přibylo 150 případů: společný výpočet 15, sestavení měsíců 14, protokol 23, reportér 26, serverová routa 20, načítání vstupů 30, výpočetní meze 20 a metadata výpisů 2. Přímé dočasné porovnání s původním tělem hooku i generátorem potvrdilo shodu všech výstupních polí v devíti scénářích; v repozitáři zůstávají jejich referenční otisky a samostatné příklady s očekávanými částkami. Nové testy společného výpočtu prošly v UTC i Europe/Prague.

ESLint všech dotčených oblastí prošel bez chyb a upozornění. Produkční `next build --webpack` prošel včetně své kontroly TypeScriptu; prošly také kontroly obrazového runtime a registrace autentizačního proxy. Generování sitemap použilo dosavadní záložní větev kvůli nedostupnému DNS Firestore v místním prostředí. Nebyla prováděna migrace ani zápis do produkčních dat. Živé porovnávání pod skutečným účtem, měření přínosu a aktivace předpočítaných výsledků zůstávají následnou prací.
