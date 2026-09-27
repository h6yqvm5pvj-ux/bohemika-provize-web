# Měsíční produkce na domovské stránce

Domovská stránka používá uložené součty vlastní a týmové produkce za aktuální a předchozí měsíc. Odpověď obsahuje počet smluv, okamžité provize, pojistné a malé řádky aktuálního žebříčku. Historie jednotlivých smluv pro žebříček se nadále načítá podle zvoleného období. Předchozí měsíc slouží ke srovnání výkonu.

## Uložení a správnost

- Smlouvy zůstávají v `users/{email}/entries`. Není nutná migrace ani změna odkazů na smlouvy.
- Součty jsou v `hallOfFameOwners/{hashEmail}/homeProduction/{hashObdobí}`. Dokument uchovává přesné časové hranice, verzi výpočtu, revizi zdroje a dvojici měsíčních souhrnů. Po prvním načtení se vytvoří automaticky.
- Revize již existuje pro produkci síně slávy a mění se ve stejné transakci/dávce jako smlouva. Rozšířeno i na změnu `items` a `managerOverrides`. Pokryto vytvoření, změna částky/data, převody a smazání. Přímé servisní zápisy mimo aplikační zapisovače musí také změnit tuto revizi.
- Cache se čte společně s revizí v transakci. Při přepočtu se revize ověřuje znovu před uložením; pokud se mezitím změnila, výpočet se zopakuje, nejvýše třikrát. Selhání se nezobrazuje jako nulová produkce.
- Čtení podkladů má dolní i horní časovou hranici. Spojuje a deduplikuje dotazy podle data sjednání a vytvoření. Datum sjednání má přednost; datum vytvoření je náhradou pouze při chybějícím sjednání. Nedávný import staré smlouvy nezvyšuje aktuální výkon. Převzaté smlouvy se z produkce vylučují jako dosud.
- Platnost souhrnu je nejvýše šest hodin a současně musí souhlasit revize. Ruční obnovení domovské stránky přes její tlačítko cache obchází. Přechod kalendářního měsíce se kontroluje po 30 sekundách a při návratu do okna, včetně hranice roku a změny času.
- API před čtením kontroluje aktuální přístup k vlastnímu/týmovému portfoliu. Odpovědi mají `private, no-store`. Klientská pravidla zakazují přímé čtení i úpravu souhrnů, včetně klientského administrátora. Odpověď týmové produkce obsahuje pouze provizi přihlášeného manažera.

## Očekávaná výplata

Podklady cashflow stále zahrnují starší smlouvy, TIP výplaty a případné předplatné. Mohou z nich vznikat splátky splatné nyní; ořezání podle měsíce sjednání by výsledek poškodilo.

Domovská stránka nyní načte podklady bez původního synchronního výpočtu a po načtení provizních výpisů provede výpočet jednou ve Web Workeru. Zpět přenáší jen hrubou částku, storno fond a čistou výplatu. Používá stejný generátor, přesuny nevyplacených položek a skutečné součty výpisů. Při nedostupném workeru použije stejný výpočet v prohlížeči. Odchod ze stránky ukončí worker a zruší požadavek na výpisy. Neúplné nebo právě zpracovávané výpisy vedou k hlášení chyby.

Tato změna omezuje blokování hlavního vlákna; sama nezkracuje načítání historie cashflow ze serveru a nepřidává serverovou cache výplaty.

## Ověření

- Celá aplikační sada: **5 100 / 5 100 testů ve 349 souborech** (`npm test -- --maxWorkers=4`). Běh je bez souběžného sestavování aplikace; při souběhu jeden existující test predikce 1 000 smluv překročil časový limit pěti sekund. Limit ani jeho ověřované výsledky se neměnily.
- Celá databázová sada: **308 prošlo, 1 volitelný benchmark se přeskočil**. Po přidání samostatné kontroly přístupu k novým souhrnům prošlo všech **244 cílených testů** bezpečnostních pravidel a měsíční produkce.
- Testy porovnávají částky, období, manažerské snapshoty, pojistné, zděděné smlouvy, přesun data mezi měsíci, starší importy, souběžné změny, selhání čtení, ruční obnovu, neplatné podklady, změnu účtu a načítání historie až po výběru období.
- Skutečný lokální Firestore emulátor ověřuje vytvoření, úpravu provize a meziprovize, změnu měsíce, převod, smazání a klientská přístupová pravidla. Opakované načtení nezměněného souhrnu provede **nula dotazů na smlouvy**; načítá jen revizi a uložený souhrn.
- Chrome v časovém pásmu Europe/Prague: 12, 200 a 1 000 syntetických smluv, shoda všech tří částek s výpočtem vytaženým z původního widgetu v Git HEAD. Ověřeno skutečné spuštění workeru, odezva hlavního vlákna během práce, nezměněné vstupy a zrušení výpočtu. Bez JavaScriptových chyb.
- V jednom lokálním vzorku trval původní výpočet pro 1 000 smluv přibližně 188 ms a worker včetně spuštění a přenosu 208 ms. Během workeru dál běžel kontrolní časovač prohlížeče. To dokládá uvolnění hlavního vlákna, nikoli kratší celkové čekání nebo produkční síťovou latenci.
- Produkční sestavení Next.js/Turbopack, TypeScript a ESLint dotčených souborů prošly. Lokální záznamy kontrol jsou v ignorovaném `.tmp/home-production-20260927/`.

Výše uvedené ověření proběhlo lokálně. Změna nevyžaduje migraci ani přepis skutečných smluv; souhrny se vytvoří při načtení.

## Doplnění: stáří dat, odložená výplata a měření

- Produkce a žebříček ukazují datum a čas posledního úspěšného načtení. Klientská cache uchovává tento původní čas; pouhé zobrazení cache ani neúspěšné obnovení jej neposouvá. Načtený serverový měsíční souhrn má ověřenou aktuální revizi zdroje, proto úspěšné ověření aktualizuje čas na stránce.
- Při obnovení zůstávají poslední hodnoty viditelné. Chyba přidá upozornění „Poslední známé údaje“. Bez předchozího úspěšného výsledku se místo částek zobrazí chyba. Chyba historie nevrací čerstvou měsíční produkci zpět na starší souhrn. Jiný účet, nový měsíc ani jiné období žebříčku nedostanou čas aktualizace předchozího výběru.
- Výplata zachová poslední úspěšný výpočet pouze pro stejný účet a kalendářní měsíc. Její čas odpovídá staršímu ze dvou načtených podkladů: snapshotu cashflow a provizním výpisům. Výpadek kterékoli části nevede k výpočtu z neúplných podkladů. Ruční obnovení widget nepřipojuje znovu, takže může ukázat poslední výsledek během čekání.
- Widget výplaty se připojí jednou při přiblížení do 240 px od obrazovky. Nad přehybem začne ihned; bez podpory IntersectionObserver se načte také. Posun zpět jej neodpojuje ani nespouští duplicitní načítání.

### Měření po nasazení

`home.performance` jsou události v existujících serverových logách, nikoli nové dokumenty databáze. Obsahují pouze etapu, celé milisekundy, výsledek a rozlišení mobil/desktop podle šířky 768 px:

- `production`: vlastní a týmový měsíční souhrn od spuštění načítání.
- `productionTip`: samostatná TIP produkce.
- `leaderboard`: připravenost aktuálního nebo vybraného historického období, včetně rychlého použití klientské cache.
- `payoutInputs`: úplné podklady cashflow a provizní výpisy od připojení widgetu.
- `payoutCalculation`: výpočet včetně spuštění/přenosu workeru nebo stejného náhradního výpočtu.
- `payout`: připravenost výsledku od připojení widgetu; nezahrnuje dobu, kdy karta čekala mimo obrazovku.

Klient odešle dávku nejvýše 20 měření po dvou sekundách. Pouze produkční sestavení odesílá data; posledních 60 měření je také lokálně v `sessionStorage["home.performance.v1"]`. Neodesílají se čísla smluv, jména, e-maily, částky, adresy stránek ani texty chyb. Endpoint `/api/home/performance` vyžaduje přihlášení a standardní aplikační kontroly, dovoluje nejvýše 20 požadavků za minutu a 8 KiB těla; pole měření mají pevně povolené hodnoty. Odeslání po změně účtu se zahodí, po chybě se neopakuje a neovlivňuje zobrazení stránky.

Pro vyhodnocení v logách filtrovat `event = home.performance`, rozbalit `samples` a rozdělit podle `stage` a `device`. Latenci (např. medián a p95) počítat pouze pro `outcome = success`; chyby a zrušení vyhodnotit samostatně. Měření přerušená skrytím záložky a běhy přes tři minuty se nezaznamenávají, takže jde o odezvu při aktivním používání, nikoli dostupnost služby nebo dobu vykreslení/LCP. Reálné hodnoty se začnou sbírat po nasazení při běžném používání aplikace; lokální scénáře je nenahrazují.

### Dodatečné ověření

- **5 143 / 5 143 testů ve 352 souborech**, produkční sestavení Next.js včetně bezpečnostních kontrol, TypeScript, ESLint a kontrola diffu prošly.
- Nové testy zahrnují původní čas cache při chybě/obnově, přepínání účtů a historických období, chybu podkladů výplaty, opožděné odpovědi, jednorázové připojení widgetu, neúplné první načtení, omezení a autorizaci telemetrie a výpadek jejího úložiště/odeslání.
- Skutečný Chrome v pásmu Europe/Prague, šířky 390 a 1280 px, skutečný IntersectionObserver a worker, pouze syntetická data: mimo obrazovku nula požadavků na podklady výplaty; po přiblížení čtyři požadavky; zachování částky a času při chybě výpisů i smluv; úspěšné následné obnovení; karta nahoře načtená bez posunu; žádné JavaScriptové chyby ani vodorovné přetékání. Dávky měření obsahovaly očekávané úspěchy/chyby a pouze povolená pole.
- Prohlížečový test používá izolovaný sestavený komponentový scénář se syntetickými odpověďmi, nikoli přihlášení k reálnému portfoliu. Záznamy a snímky jsou lokálně v ignorovaném `.tmp/home-freshness-20260927/`.
