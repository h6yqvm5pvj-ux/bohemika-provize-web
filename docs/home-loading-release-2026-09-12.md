**Zrychlení domovského přehledu — vydání 12. 9. 2026**

Následující vydání dne 12. 9. 2026 přesunulo stejný aplikační kód do Frankfurtu jako `dpl_BJsEiRgSqD2HBFhbeeZw2FLW7xMe`. [Záznam přesunu](./frankfurt-release-2026-09-12.md). Níže je zachovaný záznam původního vydání domovského přehledu v USA.

Stav: nasazeno na [bohemka.app](https://bohemka.app) jako `dpl_G8ZJ4eutmWx6gf1wVzFoGu422V6W`. Přímý záznam domény potvrdil přepnutí a všech 15 následných HTTP kontrol na produkční doméně prošlo. Před přepnutím prošlo také 15 kontrol připraveného nasazení a kontrolní součty všech devíti nahraných souborů. [Doklad nasazení a ověření](./home-loading-deployment-2026-09-12.json).

Výchozí produkční nasazení je `dpl_CDRYn8XZqSMkvY1ZqhGfPAK9TWUa`. Vydání vzniklo odděleně v `/private/tmp/bohemika-home-region-20260912-h52tpv9r` a obsahuje pouze devět souborů uvedených níže. Jeho přesnou návaznost na commit `f96e3c0606028f9eee48c32b70c7e7225b2fc5d0`, předchozí tři patche a kontrolní součty zachycuje [manifest](./home-loading-release-2026-09-12.json); samotné změny jsou v [release patchi](./home-loading-release-2026-09-12.patch). Nesouvisející rozpracované změny hlavního workspace nejsou součástí tohoto vydání.

Vlastní a týmová produkce se nově zobrazí ihned po dokončení svých požadavků. Graf a týmová historie mohou také pokračovat bez čekání na TIP. TIP má samostatný stav načítání a chyby. Celková provize a plnění měsíčního cíle, pokud TIP zahrnují, během čekání nebo chyby nezobrazují neúplnou částku jako hotový výsledek. Samostatné hotové vlastní a týmové údaje zůstávají dostupné. Obnovovací tlačítko zohledňuje i probíhající načítání TIP.

Domovský přehled používá `GET /api/tip-payouts/list` s `shape=home`, původním `payoutFrom` a hranicemi `productionFrom`/`productionTo`. Server čte jen čtyři potřebná uložená pole a vrací pět polí položky: `id`, `payoutDate`, `amount`, `sourceToken`, `sourceContractSignedDate`. Vynechává dohledávání jmen klientů a poradců. Nové období je ověřené, nejvýše 93 dnů a používá interval `[productionFrom, productionTo)`. Filtr období se aplikuje až na původní výběr výplat.

Původní dotaz podle `payoutFrom`, jeho záložní postup při chybě, řazení a stránkovací kurzor zůstávají zachovány. Běžná odpověď bez `shape=home`, kterou používají další části aplikace, se nemění. **Tato úprava nesnižuje počet načtených dokumentů TIP výplat.** Šetří přenášená pole a dodatečná čtení potřebná k dohledání jmen. Nepřidává plošné načítání historie do běžné větve, změnu schématu, index ani doplňování skutečných dat.

Výpočet aktuálního a předchozího měsíce zachovává kladné částky, pořadí jejich sčítání, deduplikaci zdrojových smluv i původní `sourceToken`. Datum produkce je nadále platné `sourceContractSignedDate`, případně `payoutDate`. Existující rozdíl mezi tímto pravidlem a předvýběrem podle `payoutFrom` se zde neopravuje: změna takového výběru by mohla změnit dosavadní částky. Serverový filtr neznamená nový úplný dotaz podle data produkce napříč celou historií.

Stránka s nulou vyhovujících položek může mít `hasMore=true`; klient pokračuje podle kurzoru posledního skutečně prohlédnutého dokumentu. Chybějící nebo opakovaný kurzor a vyčerpání původního limitu 60 stránek po 100 položkách znamenají nedostupný TIP souhrn, nikoli uložený částečný výsledek. Sdílená a uložená cache přijímá pouze úplné výsledky. Verze cache byla zvýšena, aby se nepoužily starší zdánlivé nulové souhrny vzniklé při chybě.

Ochrany asynchronních požadavků zahrnují účet a UID, odhlášení, změnu období, zrušení požadavku a opožděné odpovědi. Hotový výsledek z cache se při obnovování nesmíchá s novou TIP částkou a starou vlastní či týmovou částkou, ani obráceně. Ověřen je také souběh, kdy TIP dokončí načítání jako první a následně selže načítání smluv; načítání se řádně ukončí a nezablokuje další obnovení.

Syntetická kontrola jedné stránky se 100 výplatami porovnala běžnou a zkrácenou odpověď. Fixture obsahovala dlouhé nepoužívané poznámky a chybějící jména, tedy případ, kdy běžná odpověď musí provést dodatečná čtení.

| Metrika | Běžná odpověď | `shape=home` |
| --- | ---: | ---: |
| Velikost JSON odpovědi | 122 980 B | 14 380 B |
| Dotazy na stránku TIP výplat | 1 | 1 |
| Dodatečná čtení dokumentů pro dohledání jmen | 101 | 0 |
| Vrácené výplaty ve fixture | 100 | 100 |

Součty a počty zdrojových smluv v této kontrole byly shodné. Úspora přenosu přibližně 88,3 % platí pro uvedenou fixture, nikoli jako odhad produkčního zrychlení. U záznamů s již uloženými jmény bude úspora dodatečných čtení menší. Kontrola neměřila produkční síťovou latenci ani rychlost skutečných účtů.

| Ověření | Výsledek a rozsah |
| --- | --- |
| Izolované release testy | [1 700 / 1 700 prošlo](./home-loading-unit-results-2026-09-12.json). |
| Firestore Admin SDK a lokální emulátor | [2 / 2 prošlo](./home-loading-sdk-results-2026-09-12.json): projekce, pořadí, kurzory, prázdná filtrovaná stránka a starší reprezentace data podpisu. |
| Lokální Next a Chrome | [18 / 18 případů prošlo](./home-loading-browser-results-2026-09-12.json): šířky 1 440, 390 a 320 px × tým/poradce bez týmu × načítání/chyba/hotovo. Skutečné produkční komponenty, syntetické stavy, bez přihlášení do aplikace a bez skutečných dat. |
| Cílené ověření v hlavním workspace | 45 testů prošlo, ESLint a TypeScript prošly. |
| Izolovaný produkční build | Prošel za 25,47 s. |
| Reprodukční příprava | Ověřeny kontrolní součty všech devíti implementačních souborů. |

Dva referenční testy v prvním běhu narazily na nesprávnou zmrazenou podobu prostředí `../base`, kterou potřebují starší referenční testy cashflow. Po opravě sestavení tohoto prostředí kontroly prošly. Šlo o chybu přípravy testovací fixture, nikoli o regresi aplikačního kódu; reprodukční skript nyní správnou původní referenci sestavuje odděleně od produkčního výchozího stavu.

Reprodukce z hlavního repozitáře:

```sh
node scripts/prepare-home-loading-release.mjs
```

[Skript](../scripts/prepare-home-loading-release.mjs) ověří patche, vytvoří samostatné složky `base`, `production-base` a `work`, aplikuje přesnou návaznost změn a zkontroluje všech devět hashů. Vypíše pracovní adresář pro následné `node node_modules/vitest/vitest.mjs run`. Používá již dostupné závislosti; nenasazuje aplikaci ani nepřistupuje k databázi. SDK testy se spouštějí zvlášť přes `vitest.rules.config.ts` a vyžadují lokální Firestore emulátor.

Součástí patche jsou tyto soubory:

- `src/app/api/tip-payouts/list/route.ts`
- `src/app/api/tip-payouts/list/homeResponse.test.ts`
- `src/app/home/useHomeData.ts`
- `src/app/home/useHomeData.test.tsx`
- `src/app/home/components/ProductionSummarySection.tsx`
- `src/app/home/components/MonthlyGoalSection.tsx`
- `src/app/home/components/ProductionLoading.test.tsx`
- `src/app/page.tsx`
- `tests/firestore/tipPayoutHome.test.ts`

Region vydání zůstává `iad1`. Samostatné [ověření evropského regionu](./region-verification-2026-09-12.md) dokončilo rozšířené syntetické měření i nepřihlášené kontroly kompatibility; přihlášené uživatelské toky se v Evropě zatím neověřovaly. Toto vydání produkci do EU nepřesouvá.

Předchozí produkční verze pro návrat je `dpl_CDRYn8XZqSMkvY1ZqhGfPAK9TWUa`. Úprava nemá datovou migraci; případný návrat může použít tuto verzi. Skutečná portfolia nebyla během ověřování čtena ani měněna.
