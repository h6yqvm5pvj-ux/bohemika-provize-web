**Ověření evropského regionu — 12. 9. 2026**

Aktualizace po tomto měření: dne 12. 9. 2026 v 18:39:30 UTC byla na pokyn uživatele produkce přepnuta do Frankfurtu. Podrobnosti a rozsah následného ověření jsou v [samostatném záznamu přesunu](./frankfurt-release-2026-09-12.md). Níže je zachovaný stav a rozsah původního měření.

Rozšířený test podporuje umístění funkcí ve Frankfurtu (`fra1`): databázová fáze byla kratší ve všech 40 porovnávaných dvojicích. Produkční region se při tomto ověření neměnil a zůstává `iad1`. Test neprokazuje dobu načtení celé přihlášené aplikace.

Dvě dočasné preview kopie vycházely z přesného produkčního zdroje `dpl_CDRYn8XZqSMkvY1ZqhGfPAK9TWUa`. Lišily se regionem, žádná nesloužila produkční doméně. Pro test byl přidán jediný dočasný endpoint, vypnuty preview crony a výslovně ponechány vypnuté serverové experimenty cashflow. Optimalizace domovského přehledu do těchto kopií nepatřila, takže se vliv regionu nemíchal se změnou aplikačního kódu. [Kontrola balíku a kompatibility](./region-verification-checks-2026-09-12.json).

Sonda fungovala pouze v preview, vyžadovala tajný hlavičkový údaj uložený mimo zdroj a měla pevnou expiraci. Nepřijímala název kolekce ani ID od volajícího. Četla pouze náhodná neexistující ID v pevné diagnostické kolekci, s projekcí na ID; dávka pěti referencí používala prázdnou masku polí. Všechny výsledky byly prázdné, žádný klientský dokument se nečetl a nic se nezapisovalo. Odmítnutí bez tajné hlavičky i s nesprávnou hlavičkou bylo ověřeno v obou regionech.

Proběhlo 110 úspěšných měřených HTTP požadavků: zahřívací kolo a deset střídavých dvojic pro každý z pěti režimů. Celkem se použilo 352 diagnostických referencí. Pořadí regionů a režimů se střídalo. Sonda vracela anonymní identifikátor instance a pořadí požadavku; warm souhrny vyžadovaly předchozí úspěšné použití stejné instance a vyloučily její první použití SDK. To samo o sobě neprokazuje cold start celé platformy.

| Režim | Databázová fáze USA, medián | Databázová fáze Frankfurt, medián | HTTP TTFB USA, medián | HTTP TTFB Frankfurt, medián |
| --- | ---: | ---: | ---: | ---: |
| Bez databáze | 0 ms | 0 ms | 393,19 ms | 171,43 ms |
| Jeden dotaz | 104,16 ms | 33,42 ms | 463,70 ms | 213,90 ms |
| Pět postupných dotazů | 540,55 ms | 151,14 ms | 1 066,25 ms | 333,67 ms |
| Pět souběžných dotazů | 193,38 ms | 43,37 ms | 647,28 ms | 217,15 ms |
| Jedna dávka pěti referencí | 110,84 ms | 31,00 ms | 487,88 ms | 215,22 ms |

Každá buňka vychází z deseti warm vzorků daného regionu a režimu. U jednoho dotazu byl rozdíl mediánů databázové fáze přibližně 68 %. **Toto procento není odhadem zrychlení stránky.** [Úplné výsledky](./region-verification-results-2026-09-12.json) a [nezávislý přepočet](./region-verification-audit-2026-09-12.json).

Během části běhu probíhaly i HTTP kontroly kompatibility. Úplné výsledky jsou zachované a tento souběh omezuje interpretaci HTTP časů. Doplňková analýza používá výhradně čtyři kompletní dvojice každého režimu z kol 6–9 po dokončení těchto kontrol. Frankfurt měl kratší databázovou fázi také ve všech 16 těchto dvojicích. Jeden dotaz měl v této podmnožině medián 109,00 ms versus 30,91 ms. USA přitom výrazně kolísaly, zejména u více dotazů; malý vzorek neopravňuje ke slibu konkrétního násobku nebo produkčního P95. [Analýza po skončení kontrol](./region-verification-sensitivity-2026-09-12.json).

HTTP měřil přímo curl (`time_starttransfer` a `time_total`), nikoli čas spuštění Vercel CLI. Tyto časy obsahují síť, TLS, Vercel ingress a ochranu preview. Zeměpisná poloha klienta nebyla ověřena; každý curl navíc otevíral nové spojení, zatímco prohlížeč běžně spojení opakovaně používá. Oba serverové regiony v testu hlásily UTC a nulový časový posun. Dřívější samostatné čtení metadat určilo databázi jako `eur3`; v časovaných handlerech se metadata znovu nestahovala.

Obě kopie prošly 15 kontrolami dostupnosti a odmítnutí nepřihlášeného přístupu. Ověřeny byly login HTML, přesměrování neveřejných stránek, odmítnutí API smluv, pošty, výpisů a TIPů bez tokenu, vypnutý shadow režim a nepřítomnost předchozích testovacích stránek. Kontrola pojmenovaná `region_check_absent` u preview potvrzuje odpověď 404 bez tajné hlavičky, nikoli fyzickou nepřítomnost této chráněné sondy. Samotná sonda má 24 lokálních testů; guardy, parser a nezávislý audit mají 10 Python testů. TypeScript a ESLint prošly.

Přihlášený průchod přes 2FA, revokaci tokenu, skutečné portfolio, zápisy, poštovní stream ani externí integrace se tímto testem neověřovaly. Před plošným přesunem zůstává vhodné ověřit tyto uživatelské toky na evropské kopii s určeným testovacím účtem. Ověření zde podporuje rozhodnutí o regionu; není potvrzením všech funkcí přihlášené aplikace.

Vercel doporučuje umístit funkce poblíž datového zdroje; statická aktiva přitom obsluhuje CDN. [Oficiální dokumentace nastavení regionu](https://vercel.com/docs/functions/configuring-functions/region).

Obě dočasné preview kopie byly po měření odstraněny; následné API kontroly potvrdily jejich nepřítomnost. Odstraněn byl také místní tajný údaj sondy. Produkční doména nebyla na tyto kopie nikdy přepnuta. Doklad úklidu je součástí [kontrolního záznamu](./region-verification-checks-2026-09-12.json).
