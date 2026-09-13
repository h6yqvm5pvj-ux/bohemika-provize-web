# První měření Web Workeru pro cashflow — 12. 9. 2026

**První fáze je hotová: původní výpočet byl změřen a porovnán se skutečným Web Workerem. Tento jednoduchý prototyp zatím nedoporučujeme nasadit.** U velkého syntetického portfolia zmírnil blokování hlavního vlákna, ale prodloužil čekání na kompletní výsledek. Další návrh má omezit přepočítávání a množství předávaných výsledků.

Produkční web se v této fázi neměnil. Základem experimentu je přesná naposledy nasazená verze `dpl_98QKyaT7qDVQxXNk8nahXtm2arRW`. Výpočty ani načítání uživatelů nebyly na webu přepnuty na Worker.

## Co bylo skutečně měřeno

- Chrome v novém dočasném profilu, místní server na `127.0.0.1`, syntetická portfolia **30 / 300 / 1 000 smluv**. Žádné přihlášení, skutečná klientská data, databáze, nasazení ani externí aplikační požadavky. Worker i stránka měly síťová spojení zakázaná CSP; profil a server byly po testu uklizeny.
- Reference je automatický AST výtah výpočetních částí současného hooku a stránky. Dodaný `asOf` pouze sjednocuje čas; neprodukční debug log je odstraněn. Referenční kompozice nevolá kandidátní `computeCashflow` ani `buildCashflowView`; společné obchodní helpery zůstávají sdílené.
- Skutečný Worker používá připravené čisté výpočetní funkce a předává celá vstupní data a celé výsledky přes `postMessage`. Měření tedy zahrnuje toto předávání. U měřených běhů je fallback zakázán — selhání Workeru ukončí měření chybou, aby se synchronní náhradní výpočet nemohl vydávat za Worker.
- **74 jednotkových testů**, **27 kontrol shody v prohlížeči** (tři velikosti × devět filtrů), **šest kontrol rušení a chyb**, **240 časových měření**. TypeScript, ESLint a kontrola regenerace reference prošly. Nezávislá kontrola znovu spočítala všech **48 agregací** a potvrdila výsledky.

## Výsledky bez umělého zpomalení CPU

Medián pěti opakování úplné výpočetní cesty pro vlastní i týmové smlouvy:

| Smlouvy | Současný synchronní výpočet | Worker včetně předání výsledku |
| --- | ---: | ---: |
| 30 | 6,1 ms | 12,9 ms |
| 300 | 26,7 ms | 50,1 ms |
| 1 000 | 163,0 ms | 249,0 ms |

U 1 000 smluv měl synchronní výpočet dlouhou úlohu nad 50 ms ve všech pěti opakováních. Worker ji měl v jednom z pěti, nejdelší 71 ms. Medián největší mezery mezi `requestAnimationFrame` callbacky klesl ze **148,9 na 33,3 ms**. To ukazuje potenciál pro lepší odezvu během výpočtu, ale nedokazuje zrychlení reálné stránky nebo odstranění všech záseků. Příčina zbývající dlouhé úlohy nebyla ověřena trasováním.

Vyhledání konkrétní smlouvy s připravenými položkami mělo při 1 000 smlouvách v izolované referenční cestě medián **2,3 ms**, zatímco Worker, který vše znovu počítá, potřeboval **97,9 ms**. Stávající rychlou cestu tedy nelze bez dalšího nahrazovat tímto prototypem.

Pro ilustraci objemu má úplný výsledek pro 1 000 smluv 26 653 položek a 128 měsíců; jeho JSON reprezentace má přibližně 57,9 MB. **To není změřená velikost přenosu ani spotřeba paměti.** Benchmark používá structured clone, který zachovává `Date` i sdílené reference. [Dokumentace structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

## Důležitá omezení

- Jde o izolovanou výpočetní cestu v jednom desktopovém Chrome, nikoli o přihlášenou aplikaci, její React vykreslení, skutečný telefon, INP, paměťovou zátěž nebo spotřebu baterie. Pět opakování je první orientační měření.
- View-only reference používá již vygenerované položky, ale neobnovuje všechny cache `useMemo` skutečné stránky. Worker v těchto scénářích stále počítá kompletní výsledek. Časy proto nelze prezentovat jako změřené zrychlení konkrétních UI přepínačů.
- Kalibrace odhalila, že nastavení CPU 4× zpomalilo hlavní vlákno (34,2 → 154,45 ms), ale Worker podobně nezpomalilo (34,25 → 36,4 ms). **Pro rozhodnutí jsou výše použita pouze měření bez throttlingu.** Varianta 4× je diagnostika tlaku na hlavní vlákno, nikoli důkaz výkonu na telefonu.
- Odmítnutí staršího požadavku zabrání použití jeho výsledku, ale samo nezastaví běžící či zařazený výpočet Workeru. Rychlé série přepínání filtrů nebyly výkonnostně měřeny. Pro integraci je nutné omezit frontu na nejnovější potřebnou práci.
- Úplná shoda výsledků se ověřovala samostatně ve 27 scénářích, nikoli novým plným otiskem v každém z 240 časovaných běhů. Sdílené business helpery znamenají, že shoda neodhalí chybu společnou oběma implementacím.
- Všechny identity ve fixtures jsou `example.test`; nejsou zde předplatné vyžadující pevnou produkční identitu. Testy rušení modelují `dispose()`, nikoli skutečné odhlášení v aplikaci.
- Zpoždění úvodního časovače ukazuje první blokování; nezahrnuje samo o sobě případné pozdější blokování při přijetí výsledku. Proto report obsahuje i dlouhé úlohy a mezery mezi callbacky. Žádná z těchto metrik není měřením INP.

## Další konkrétní krok

Navrhnout Worker tak, aby držel jednou načtená data a opakovaně používal mezivýsledky, přijímal jen změněné filtry a vracel jen data potřebná pro aktuální zobrazení. Zachovat rychlé hledání a omezit čekající práci na nejnovější požadavek. Data i pracovní proces se musí zneplatnit při změně účtu nebo odhlášení. Poté znovu ověřit úplnou shodu výpočtů a změřit skutečnou stránku včetně vykreslení. Pro aktivaci potřebujeme prokázané zlepšení odezvy bez nepřiměřeného prodloužení čekání na výsledek.

## Reprodukce a zdroj

[Kompletní výsledky](cashflow-worker-pilot-results-2026-09-12.json), [manifest a kontrolní součty](cashflow-worker-pilot-2026-09-12.json), [zdroj prototypu a testů jako patch](cashflow-worker-pilot-2026-09-12.patch).

V hlavním repozitáři spusťte:

```sh
node scripts/prepare-cashflow-worker-pilot.mjs
```

Příkaz ověří patche a sestaví oddělené `base` a `work` v dočasném adresáři ze správného git commitu a obou dříve nasazených patchů. Zachová tak rozdíl oproti rozpracovanému hlavnímu workspace. Nic neinstaluje, nic nenasazuje a nečte `.env`. Vypíše pracovní adresář; v něm lze spustit:

```sh
node scripts/cashflow-worker/run.mjs
node node_modules/vitest/vitest.mjs run scripts/cashflow-worker
node node_modules/typescript/bin/tsc --project scripts/cashflow-worker/tsconfig.json --noEmit
```

Runner potřebuje místní Chrome a esbuild. Na tomto stroji používá existující Chrome a esbuild z cache Vercel CLI; cesty lze nastavit přes `CASHFLOW_CHROME_PATH` a `CASHFLOW_ESBUILD_PATH`. Výstup lze zvolit přes `CASHFLOW_WORKER_OUTPUT`. `--quick` slouží k rychlé kontrole harnessu, `--build-only` pouze sestaví browserové soubory. Ukázkové objemy JSON nejsou odesílány do sítě; report obsahuje jen agregáty a otisky syntetických výsledků.
