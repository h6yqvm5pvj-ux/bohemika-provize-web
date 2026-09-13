# Načítání dat — audit a optimalizace, 11. 9. 2026

V pracovní verzi jsou hotové úpravy společného startu aplikace, profilu, pošty, cashflow a týmového přehledu. Přihlašovací stránka v izolovaném Chromu stahuje o **24 % méně komprimovaných dat JavaScriptu**. Změny neprodlužují platnost cache, nemění provizní vzorce ani přístupová oprávnění. Na produkci nebyly nasazené.

## Rozsah

Inventura zahrnuje **88 zdrojových souborů stránek a 105 API rout**. Byly prohledány datové požadavky napříč `src`, cíleně revidovány společné loadery a níže uvedené datové cesty, spuštěny automatické testy a ověřeno sestavení i místní HTTP. [Úplná inventura](./data-loading-audit-2026-09-11/inventory.json) zahrnuje také soukromé pomocné adresáře `_klienti` a `_provizni-vypisy`, které samy nejsou webovými routami.

Interní načítání bylo ověřováno kódem, izolovanými testy a lokálním Firestore emulátorem se smyšlenými záznamy. Neproběhl manuální průchod všech formulářů pod skutečnými účty ani měření produkčních dat a latencí. Dříve rozpracované změny v pracovním adresáři byly zachovány; nejsou výsledkem tohoto auditu.

## Provedené úpravy

| Oblast | Původní zátěž | Změna a zachované chování |
| --- | --- | --- |
| Start aplikace a přihlášení | Společný modul Firebase inicializoval klientský Firestore, přestože žádný aplikační soubor jeho `db` nepoužíval. | Odstraněn nepoužívaný import a inicializace v `src/app/firebase.ts`. Přihlášení, jeho persistence, serverová databáze a dynamické push notifikace používají své dosavadní moduly. |
| Profil napříč webem | Přímý dokument, varianty e-mailu a UID se četly postupně. | Nezávislá čtení běží souběžně, jejich výsledky se zpracují v původním pořadí. Zachováno upřednostnění kanonického profilu a slučování soukromých údajů. Ověření existence týmu čte pouze ID; ověření tipařů pouze dvě pole s rolí. |
| Cache profilu | Odpověď zahájená před uložením mohla obnovit zneplatněnou cache nebo odstranit evidenci novějšího načítání. | Výsledek může uložit a dokončit pouze stále aktuální požadavek. Platnost 60 sekund, vynucené obnovení a oddělení zastupovaného profilu zůstávají zachovány. |
| Domovská očekávaná výplata a cashflow | Seznam výpisů zahrnoval také řádky historie pojistného a rozsáhlý výsledek zpracování. | Nový režim `shape=cashflow` vrací všech 18 polí používaných cashflow. Server tato nepotřebná pole nečte a neodvozuje historii pojistného. Zůstává párování zaplacených smluv i kódů provizí, výběr nejnovějšího duplikátu, filtry a celý náhled výpisu po otevření. |
| Pošta a počet nepřečtených na úvodu | Počet nepřečtených četl celé zprávy; seznam čekal na dokončení počítání. | Počítání čte pouze čtyři pole archivace a odložení. Seznam nebo konverzace včetně avatarů se načítá souběžně s počtem. Zachovány starší časové formáty, archivace a návrat odložených zpráv. Chyba některé části nadále vrací chybu požadavku. |
| Můj tým | Tři jednotlivé databázové požadavky na každého poradce pro předpočítané souhrny. | Čtení pomocí `getAll` v dávkách do 200 dokumentů, tři skupiny souběžně. Například 100 poradců znamená 3 požadavky místo 300. Pořadí, chybějící dokumenty, aktualizace souhrnů a výpočty se nemění. |

Zmenšení projekce omezuje objem přenesených polí; dávky omezují počet síťových volání. **Nejde o stejnou redukci počtu účtovaných čtení dokumentů.** Projekce včetně prázdného výběru polí odpovídá [dokumentaci Firestore Query](https://googleapis.dev/nodejs/firestore/latest/Query.html#select). Pořadí `getAll` bylo ověřeno v instalovaném SDK i v emulátoru.

U starších provizních výpisů server nadále musí číst HTML: z něj se odvozují identifikátory již vyplacených provizí a případně výplatní součet. Jeho odstranění bez migrace by mohlo změnit cashflow. Úprava proto neslibuje odstranění celého nákladu na výpisy.

## Měření a ověření

| Kontrola | Výsledek |
| --- | --- |
| Výchozí aplikační testy | 1 223 / 1 223 prošlo. |
| Aplikační testy po úpravě | **1 246 / 1 246 prošlo**, 162 testovacích souborů; 23 nových regresních případů. |
| Firestore emulátor a pravidla | **222 / 222 prošlo**, včetně 3 nových testů skutečného SDK: dávky přes hranici 200 dokumentů, chybějící/duplicitní dokumenty a projekce polí. Projekt výhradně `demo-bohemika-rules`, adresa `127.0.0.1:8180`. |
| TypeScript | `npx tsc --noEmit --incremental false` prošlo včetně nových testů. |
| ESLint | 0 chyb; 4 upozornění na dřívější použití `window.location.href` mimo tuto úpravu. Dodatečná kontrola nového emulátorového testu prošla. |
| Produkční sestavení | `next build --webpack` prošlo. Samostatně prošly kontroly obrazového runtime a registrace autentizačního proxy. |
| Místní HTTP | 79 cest stránek + 8 chráněných API: 5× 200, 72× přesměrování 307, 8× správné odmítnutí 401; dvě očekávané 404 patří vypnuté sekci `/klienti`. |
| Chrome | Šířky 1440 a 390 px, nová izolovaná relace: přihlašovací formulář viditelný, žádné chyby JavaScriptu ani horizontální přetékání, chráněná stránka vrací přihlášení a API 401. Přihlášení skutečným účtem se neprovádělo. |

Při obou sestaveních sandbox nedokázal přeložit `firestore.googleapis.com` pro sestavení sitemap; finální sestavení použilo existující záložní chování. Toto není ověření obsahu produkční sitemap. Byl použit webpack; běžný skript projektu volí Turbopack. Závislosti ani konfigurace sestavení nebyly změněny.

Měření prvního načtení `/login` v Chromu:

| Přenesený JavaScript | Před | Po | Pokles |
| --- | ---: | ---: | ---: |
| Komprimovaný přenos | 243 111 B | 184 695 B | **24,03 %** |
| Rozbalený kód | 794 838 B | 612 104 B | **22,99 %** |

Obě šířky stáhly stejný objem skriptů. Jde o měření objemu dat na lokálním sestavení, nikoli tvrzení, že celý web reaguje o 24 % rychleji. Jednorázové lokální časy události DOMContentLoaded nejsou průkazným měřením uživatelské latence; nebyly použity jako důkaz zrychlení.

Důkazy: [Chrome před](./data-loading-audit-2026-09-11/browser-before.json), [Chrome po](./data-loading-audit-2026-09-11/browser-after.json), [HTTP výsledky](./data-loading-audit-2026-09-11/http-after.json), [velikost všech vytvořených JS částí](./data-loading-audit-2026-09-11/bundle.json), [opakovatelná kontrola prohlížeče](./data-loading-audit-2026-09-11/browser-check.cjs). Poslední součet všech částí sestavení není velikostí jedné načítané stránky.

## Další zjištění napříč webem

| Datová cesta | Stav a další možnost |
| --- | --- |
| Domovská produkce | Má lehčí `shape=home`, časové omezení dotazů, postupné zobrazení a souběžnou osobní/týmovou produkci. Historie může znovu načíst překryv již přečtených období. Přesné zkrácení stránkování by vyžadovalo testy shodných časů a historicky doplněných smluv. |
| Cashflow a očekávaná výplata | Sdílejí načtený snapshot a probíhající požadavek, osobní a týmová část se překrývají. Stále mohou číst celé portfolio pro výpočet budoucích splátek; omezení jen na novější smlouvy by vynechalo platné starší smlouvy. Další větší krok je samostatný předpočítaný přehled se spolehlivou aktualizací při změně smluv a výpisů. |
| Seznam a detail smluv | Existují stránkování, vyhledávací cache a indexované dotazy. Při selhání dotazu se používá úplné čtení jako záloha. Na produkci je vhodné změřit četnost těchto záložních větví a skutečné indexy; bez toho je nelze bezpečně odstranit. Detail a jeho historie se načítají samostatně. |
| Tým, struktura, žebříčky, export | Předpočítané souhrny snižují běžnou práci, ale jejich přestavba stále prochází smlouvy. Dávkové čtení je provedeno; dlouhodobou další možností jsou průběžné aktualizace souhrnů. Přestavba zahrnuje zápisy, proto nebyla přesouvána do neřízeného běhu na pozadí. |
| Radar výročí | Portfolio a stavy výročí se nyní načítají souběžně. Zachováno stránkování a kontrola úplnosti: výsledek se použije až po úspěšném dokončení obou částí. Chyba zruší zbývající načítání a umožní opakování; opuštění stránky zruší obě části. |
| Intranet | Stránkuje příspěvky, stav čte dávkově, komentáře souběžně, PDF a emoji načítá dynamicky. Počet čtení komentářů roste s počtem příspěvků. Další krok může odložit komentáře do rozbalení; vyžaduje zachování hledání, přijatých odpovědí a navigace na komentář. |
| Pošta a živá aktivita | Kontroly aktivity otevřeného rozhovoru po 4 sekundách se nyní ve skryté kartě pozastaví a probíhající kontrola se zruší. Po návratu se aktivita načte okamžitě. Pomalé kontroly se nepřekrývají a opožděné odpovědi předchozího rozhovoru se ignorují. Úprava se týká čtení aktivity; doručování zpráv a odesílání stavu psaní používají dosavadní mechanismy. |
| Kalkulačka, projekce, export a tvorba | Některé stránky načítají profil samostatně vedle společného obalu. Serverové paralelní čtení jim již pomůže. Další sjednocení klientské cache musí pokrýt jejich ukládání, změny pozic a zastupování účtu; samotné prodloužení cache by nebylo bezpečné. |
| Pomůcky, dokumenty, kontakty, tipy a statistika | Převážně se načítají data konkrétního otevřeného nástroje; část požadavků je vyvolána až akcí uživatele. Adresář a vyhledávání již mají dílčí cache. U větších seznamů lze dále řešit stránkování a sdílení načtených jmen. |
| ARES, ČÚZK, vozidla, zlato | Hlavní proměnnou je odezva externích služeb. Existují timeouty, záložní zdroje a u části služeb časově omezená cache. Delší cache nebo odebírání záložních zdrojů nebyly zavedeny; měnily by aktuálnost či dostupnost výsledků. |
| Veřejné vizitky a vložené stránky | Hlavní vizitka sdílí databázové čtení mezi metadaty a stránkou pomocí React cache. Ostatní veřejné načítání a SEO zůstaly zachovány. Živá databázová vizitka nebyla v HTTP kontrole nahrazována smyšlenou odpovědí. |
| Nastavení, zabezpečení, administrace | Autentizace, kontrola relace a oprávnění zůstávají aktuální. Administrátorský adresář čte rozsáhlejší kolekce; cílené stránkování je vhodná následná práce. Bezpečnostní kontroly nebyly přeskočeny ani prodlouženě cachovány. |
| PWA a statické soubory | Service worker již vyřazuje stránky/RSC a soukromá API z trvalé cache. PDF prohlížeč se načítá dynamicky. Tato pravidla se neměnila. |

## Ověření navazujících úprav pošty a radaru

Po pozastavení kontrol aktivity ve skryté kartě a souběžném načítání radaru prošlo **1 261 / 1 261 aplikačních testů** ve 164 souborech. Přibylo 15 případů pokrývajících skrytí a návrat do karty, pomalé požadavky, změnu rozhovoru, opožděné odpovědi, souběžné načítání včetně stránkování, zrušení a opakování po chybě. Prošel TypeScript i ESLint všech šesti dotčených zdrojových a testovacích souborů. Sestavení, prohlížeč a emulátor popsané výše byly ověřeny před těmito dvěma navazujícími úpravami; v tomto kroku se neopakovaly.

## Následné ověření při případném nasazení

Před širším provozem porovnat v testovacím nasazení stejné účty a stejné portfolio: součty cashflow a výpisy, archivaci/odložení pošty, změnu profilu a týmové souhrny. Změřit medián a 95. percentil odezvy hlavních API, velikost odpovědí a četnost záložních úplných čtení. Teprve tato čísla umožní stanovit skutečné zrychlení při produkční zátěži.

Úpravy nevyžadují migraci dat, nové indexy ani změny Firestore pravidel. Případný návrat se týká pouze zde popsaných změn kódu; hromadné vrácení celého pracovního adresáře by odstranilo i dřívější rozpracovanou práci.

## Posouzení serverového cashflow, 12. 9. 2026

**Navazující stav:** první serverová cesta pro porovnávání je implementovaná a automaticky otestovaná; podrobnosti jsou v [dokumentaci ověřovací etapy](./cashflow-server-shadow-2026-09-12.md). Navazující [ukládání diagnostických výsledků](./cashflow-server-candidates-2026-09-12.md) již zahrnuje sledování změn, kontrolu revize a ověření obnovených částek. [Lokální pilot a měření](./cashflow-pilot-2026-09-12.md) ověřily konzistenci, ale zatím neprokázaly rychlejší načítání. Automatická obnova a přepnutí běžného zobrazení zatím hotové nejsou. Následující posouzení zachycuje stav před implementací těchto etap.

Předpočítávání je technicky proveditelné, ale zatím není implementováno ani ověřeno proti živým portfoliím. Tato kontrola změnila pouze dokumentaci. Prošlo 114 vybraných současných testů v 15 souborech (`cashflow`, provizní výpisy, `calculateCommission`, `commissionPayoutRules`, `commissionTotals`); jde o ověření výchozího stavu, nikoli nové serverové implementace.

Konkrétní závislosti nalezené v kódu:

| Závislost | Důsledek pro spolehlivé předpočítávání |
| --- | --- |
| `src/app/cashflow/useCashflowData.ts`: vlastní a týmové smlouvy, manažerské rozdílové provize, aktuální pozice a provizní režim, TIP výplaty, u oprávněného účtu platby předplatného. | Obnovení jen po zápisu smlouvy nebo výpisu nestačí. Musí zahrnout příslušné profily, příjemce provizí a změny vlastnictví/oprávnění; změna smlouvy může ovlivnit více uživatelů. |
| `src/app/cashflow/page.tsx`: součty skutečných výplat a posuny nevyplacených položek se zapínají podle filtrů; následuje volitelná inteligentní predikce. | Jeden předpočítaný měsíční součet nenahradí vyhledávání smlouvy, vlastní/týmový rozsah a produktové filtry. Porovnání musí zahrnout položky i výsledné měsíce a jejich stav skutečné/předpokládané výplaty. |
| `src/app/cashflow/generator.ts`, `helpers.ts`, `subscriptionCashflow.ts`: aktuální datum, kalendářní operace a lokální časové pásmo. | Výsledek se může změnit i bez zápisu do databáze. Výpočet potřebuje určené rozhodné datum, ověřenou práci s časovým pásmem a obnovu při změně období či pravidel. Serverové UTC nelze bez porovnání zaměnit za datum v prohlížeči. |
| `src/app/api/commission-statements/route.ts`: uložení výpisu předchází zpracování, zápisy smluv a navazujících záznamů probíhají v několika dávkách. | Souhrn nesmí označit mezistav importu za dokončený. Je potřeba evidence probíhajícího zpracování, verzování vstupů a bezpečné dokončení nebo opakování po chybě. Samotný opakovaný výpočet tuto závadu nemusí odhalit, pokud oba výpočty použijí stejné neúplné podklady. |
| `src/app/api/cron/contract-lifecycle/route.ts` a servisní skripty: automatické konce a převody smluv, přímé opravy záznamů. | Obnovování musí pokrýt i změny mimo běžné formuláře; asynchronní oznámení o změně samo o sobě nezaručuje okamžitou aktuálnost. |
| `src/app/cashflow/useCashflowData.ts`: pětiminutová paměťová cache podkladů, limity stránkování a pokračování bez TIP/předplatného při chybě jejich načtení. | Přínos měřit proti současné cache, zejména při prvním načtení a na jiném zařízení. Předpočítaný výsledek se nesmí publikovat jako úplný při nedokončeném stránkování nebo chybě některého vstupu. |

První implementační etapa má používat stejné výpočetní funkce a běžet pouze pro porovnávání. Shoda vyžaduje stejného oprávněného uživatele, stejnou úplnou verzi podkladů, rozhodné datum a nastavení filtrů. Porovnání dvou odlišných verzí dat není důkazem chyby vzorce ani shody. Účty a jejich oprávnění se musí ověřovat i při čtení hotového výsledku.

Přepnutí zobrazení lze posoudit až po testech změn všech uvedených vstupů, souběžných úprav během výpočtu, chyb importu, opakovaného zpracování, úplnosti velkého portfolia a oddělení účtů. Neaktuální, neúplný nebo chybějící souhrn musí vést k dosavadní cestě načítání, nikoli k důvěře ve starou částku. Dále je nutné změřit odezvu i celkovou serverovou práci: souběžné porovnávání dočasně přidává zátěž a samo o sobě nezrychluje stránku.
