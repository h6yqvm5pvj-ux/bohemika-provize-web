# Cashflow Web Worker — 12. 9. 2026

Stav: **nasazeno na https://bohemka.app** jako `dpl_CDRYn8XZqSMkvY1ZqhGfPAK9TWUa`. Přepnutí potvrdilo přímé alias API; všech 11 kontrol před přepnutím i 11 kontrol živého webu prošlo. Přesný stav a kontrolní součty jsou v [manifestu](cashflow-worker-release-2026-09-12.json), výsledky nasazení v [záznamu](cashflow-worker-deployment-2026-09-12.json).

Cashflow u alespoň 200 vlastních a týmových smluv počítá v samostatném vlákně prohlížeče. Menší portfolia používají původní synchronní cestu. Cílem této úpravy je plynulost stránky při výpočtu; nemění rychlost přenosu dat z databáze.

## Chování

- Worker dostane zdrojové portfolio, výpisy a datum výpočtu jednou. Další požadavky obsahují pouze filtry nebo klíč měsíce.
- Přehled vrací součty, metadata měsíců, počty provizí a souhrn hledané smlouvy. Kompletní položky se přenesou až při otevření konkrétního měsíce.
- Mezivýsledky odpovídají původnímu řetězci výpočtů. Hledání, historie a predikce využívají již vygenerované provize. Paměť drží jen poslední výsledek každého stupně.
- Jeden výpočet může běžet a nejvýše jeden nejnovější čeká. Opožděný výsledek nemůže přepsat nový filtr nebo účet. Změna zdrojových dat, identity či dne vytvoří nový model a ukončí starý worker.
- Během výpočtu se zobrazí stav načítání, nikoli nula nebo nepravdivé „smlouva nenalezena“. Detail je navázán na konkrétní dokončený přehled.
- Chyba vytvoření workeru, CSP, přenosu nebo timeout 8 sekund spustí stejný výpočet v hlavním vlákně. Selhání obou cest zobrazí chybu bez falešné částky.
- Přepnutí účtu odstraní starý náhled HTML výpisu a přeruší jeho požadavek. Pozdní chyba načítání předchozího portfolia již nevymaže nově načtený účet. Obě dříve existující chyby mají regresní testy.

Výpočet nepřidává síťové požadavky, úložiště ani databázové zápisy. Worker, model a jeho výpočtové závislosti neobsahují fetch ani logování portfolia. Autentizace, 2FA a oprávnění API se nemění.

## Měření finální verze

Skutečná React stránka, filtry, graf, měsíční přehled, modal a CSS běžely v Chrome 152 s nativní rychlostí CPU. Autentizace, profil a datový hook byly nahrazeny explicitními syntetickými adaptéry; worker, klient, hook výpočtu a komponenty byly skutečné. Všechna data a identity jsou umělé. Externí požadavky byly blokovány; žádné nebyly požadovány.

Celkem 150 pokusů: 30/300/1000 smluv × 5 scénářů × původní/nová verze × 5 opakování. Pořadí verzí se střídalo. Pro každé měření nová verze u 300/1000 smluv prokazatelně používala worker, žádný skrytý fallback. U 30 smluv se worker nevytvořil.

Výsledky pro 1000 smluv (mediány z pěti pokusů):

| Scénář / metrika | Původní | Nová |
| --- | ---: | ---: |
| Úvodní přehled: největší mezera mezi snímky v pokusu | 183,4 ms | 16,8 ms |
| Úvodní přehled: dokončení UI v testu | 250,1 ms | 266,8 ms |
| Filtr Auto: dokončení UI v testu | 82,6 ms | 100,1 ms |
| Hledání smlouvy: dokončení UI v testu | 34,3 ms | 33,9 ms |
| Série pěti změn filtrů: dokončení UI v testu | 266,6 ms | 200,0 ms |
| Detail měsíce: dokončení UI v testu | 66,7 ms | 66,7 ms |

Úvodní výpočet měl v původní verzi dlouhý úkol přes 50 ms ve všech pěti pokusech, nová verze v žádném. Přínosem je plynulejší hlavní vlákno a rychlejší dokončení série změn. Jednotlivý výsledek úvodního výpočtu/filtru přišel asi o jeden snímek později.

Časy dokončení zahrnují čekání testovacího harnessu na vykreslení. Nejsou časem kompletního načtení webu, skutečným INP ani měřením přihlášeného účtu či telefonu. Načítání dat, síť a okolní AppLayout jsou mimo měření. Nebyla měřena spotřeba paměti ani baterie. Podrobnosti a všechny pokusy: [výsledky](cashflow-worker-release-results-2026-09-12.json).

## Přesnost a ověření

- 1662/1662 testů izolované verze; 1920/1920 testů po sloučení do hlavního pracovního projektu. TypeScript a cílený ESLint prošly v obou.
- Model porovnává všechny údaje všech výsledných měsíců i jejich kompletní položky s nezávisle extrahovaným původním výpočtem v 27 kombinacích velikosti/filtrů. Výpočtové business helpers jsou totožné s produkčním základem.
- 37 kontrol v Chromu: 36 porovnání přehledu/filtrů/historie/predikce/rychlých změn/účtů/logoutu a samostatně skutečný fallback při odmítnutí Worker konstruktoru. Detail měsíce se také porovnává s původním úplným textem.
- Testy skutečného datového hooku ověřují hranici 199/200, stránkování, původní synchronní cestu, vypnutí, odhlášení a pozdní success/failure. Hook výpočtu má testy změn A→B→A, StrictMode, cleanup i detailu během změny scope.
- Skutečný produkční build Next 16.3.4/Turbopack a runtime přes next start prošly. Samostatná pouze lokální testovací stránka použila skutečnou výchozí Worker factory a tvrdě by selhala při fallbacku. Worker načetl zkompilované chunky, detail zachoval Date. [Záznam runtime](cashflow-worker-next-runtime-2026-09-12.json).
- Testovací stránka /worker-build-probe nebyla zahrnuta do nasazení. Kontrola uploadu vyloučila .env, soukromé klíče, cache, auditní výstupy a dočasné testovací stránky.

Syntetické portfolio pokrývá vlastní a týmové smlouvy, Auto/Život/TIP, platební frekvence, hledání, minulost, predikci a výpisy. Nevytváří přímé portfolio předplatného vázané na produkční identitu; související existující výpočtové testy a nové souhrnné testy zůstávají zelené. Reálný přihlášený účet nebyl procházen. Samostatný pokus načíst dvě známé lokální hashované cesty workeru ze vzdáleného sestavení vrátil 404; tato kontrola tedy neověřila skutečné produkční URL ani spuštění workeru po přihlášení. Nevypovídá sama o funkčnosti jinak pojmenovaných vzdálených chunků. Skutečný worker runtime byl ověřen lokálně v produkčním sestavení Next; vzdálené sestavení READY, odeslané worker zdroje a přihlašovací ochrany byly ověřeny odděleně.

## Zapnutí, návrat a reprodukce

Přepínač je NEXT_PUBLIC_CASHFLOW_WORKER_ENABLED=1 při sestavení. Hodnota 0 nebo chybějící hodnota ponechá původní výpočet. Pro produkci je hodnota 1 také uložena v nastavení projektu Vercel, aby platila pro další sestavení. Jde o build-time přepínač; změna vyžaduje nové sestavení. Při problému lze okamžitě vrátit doménu na dpl_98QKyaT7qDVQxXNk8nahXtm2arRW. Serverové cashflow shadow, candidate cache a sledování zápisů zůstávají vypnuté; region zůstává iad1.

U portfolií zpracovaných workerem se původní shadow report neposílá, protože se již na hlavním vlákně nevytváří kompletní seznam provizí. Zapnutí serverového shadow později vyžaduje tuto větev vědomě zohlednit.

Nasazený základ tvoří commit f96e3c0606028f9eee48c32b70c7e7225b2fc5d0 a dva předchozí release patche. Nový patch obsahuje jen cashflow implementaci, její testy a izolovaný testovací harness. Do nasazení nevstupují ostatní rozpracované změny hlavního projektu. V hlavním stromu zůstala zachována dřívější extrakce computeCashflow a další rozpracované změny.

Lokální reprodukce: `node scripts/prepare-cashflow-worker-release.mjs`. Skript ověří hashe tří patchů, sestaví samostatné base/work bez .env a ověří všech 41 změněných souborů. Ve vypsaném work lze spustit `node scripts/cashflow-worker-ui/run.mjs`. Potřebné lokální závislosti jsou uvedeny v harness build/runneru; nic se samo neinstaluje ani nenasazuje.
