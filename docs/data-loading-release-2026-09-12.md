# Úpravy načítání a test regionů — 12. 9. 2026

Na `https://bohemka.app` je nasazena verze `dpl_98QKyaT7qDVQxXNk8nahXtm2arRW`. Přímý záznam domény i následné HTTP kontroly potvrzují nové nasazení. Serverové funkce stále běží v `iad1`. Dočasné regionální sondy byly odstraněny a odstranění ověřeno.

## Co se změnilo v produkci

- **Cashflow:** odstraněno dodatečné čekání 760 ms po připravení dat. Zobrazení se řídí dosavadní podmínkou připravenosti; výpočty, autorizace, chybové stavy, vstupní animace a minimum 250 ms v datovém hooku zůstávají zachované. Dva nové regresní testy před opravou selhaly a po opravě prošly.
- **Pošta:** při otevření nebo stránkování historie rozhovoru se již nepočítají nepřečtené zprávy celé schránky, protože historie tento údaj nepoužívá. Ostatní volání jej nadále dostávají. Výpočet počtu načítá jen potřebná stavová pole a tam, kde je počet vyžadován společně se seznamem, se oba dotazy provádějí současně. Legacy časy, připnuté zprávy, kurzory a chyby zachovávají původní chování.
- **Hledání smluv:** záložní osobní vyhledávání načítá jen pět polí nutných pro dosavadní filtr a řazení. Plné dokumenty načte pouze pro výslednou stránku včetně jednoho dalšího záznamu pro stránkování. Hydratace používá přesný `QuerySnapshot.readTime` v read-only transakci, takže souběžná změna nemíchá dvě verze dat. Při chybě se použije původní úplné čtení. Složitější filtry ponechávají dosavadní cestu.

### Hranice třetí úpravy

Hledání stále prochází metadata celého osobního portfolia. Šetří přenos plných dokumentů, nikoli počet skenovaných metadat; hydratace navíc přidává až `pageSize + 1` čtení a další databázovou fázi. Čistý časový nebo cenový přínos na skutečných účtech zatím nebyl změřen. Historie rozhovoru stále může projít až 1 200 zpráv. Úplné odstranění těchto průchodů vyžaduje prokázanou úplnost vyhledávacích a konverzačních indexů i pro staré záznamy. Tato verze nepřidává migraci, nový index ani změnu klientských dat.

## Porovnání USA a Evropy

Dvě dočasné preview kopie stejného základu měřily stejné čtení ve `iad1` a `fra1`. V každém regionu proběhlo 30 prázdných dotazů, střídavě po pěti. Dotaz používal náhodné neexistující ID v diagnostické kolekci a projekci pouze na ID; žádná smlouva ani zpráva se nečetla a nic se nezapisovalo. Sonda vyžadovala preview prostředí, nový tajný header a časovou platnost. Zamítnutí požadavku bez headeru bylo ověřeno. Aktuální metadata databáze potvrdila `eur3`.

| Měření | USA `iad1` | Frankfurt `fra1` |
| --- | ---: | ---: |
| První čtení včetně inicializace | 718,04 ms | 260,60 ms |
| Medián dalších 29 čtení | 108,84 ms | 39,45 ms |
| P95 dalších 29 čtení | 407,11 ms | 77,92 ms |

Medián byl v evropské kopii nižší o **63,8 %**. Jde o krátké syntetické měření databázové latence, nikoli o změřené zrychlení celého webu nebo přihlášeného uživatelského toku. U následných požadavků se samostatně nesledovalo opětovné použití procesu. Produkční region se tímto testem neměnil. [Úplné agregované výsledky](region-latency-test-2026-09-12.json).

[Vercel dokumentuje nastavení regionů poblíž datového zdroje](https://vercel.com/docs/functions/configuring-functions/region). [Firestore dokumentuje umístění databází](https://cloud.google.com/firestore/native/docs/locations).

## Ověření a nasazení

- Izolovaný balík: **1 455 úspěšných testů ve 168 souborech**, žádný neúspěšný test; TypeScript a ESLint prošly.
- Lokální Firestore emulátor a skutečný SDK: **2 úspěšné testy**, včetně změny smlouvy mezi projekcí a hydratací při zachování původního readTime. Pouze syntetická data v projektu `demo-bohemika-rules`.
- Po přenosu cílených změn do rozpracovaného hlavního workspace prošlo **19 testů cashflow/pošty a 40 testů hledání**, také TypeScript. Ostatní rozpracované změny nebyly přepsány ani zahrnuty do tohoto nasazení.
- Vercel sestavení `READY`; **10 HTTP kontrol před přepnutím a 10 přímo na bohemka.app po přepnutí**. Kontroly ověřily přihlášení, odmítnutí nepřihlášeného přístupu k poště a hledání, přesměrování cashflow, vypnutý shadow režim a nepřítomnost dočasné sondy. Nezahrnovaly ruční průchod přihlášeným účtem ani porovnání jeho finančních dat.
- Serverové cashflow porovnávání, sledování zápisů a kandidátní cache zůstávají vypnuté; výpočet zobrazených částek se neměnil. Sonda není součástí vydaného kódu. Produkční data nebyla migrována ani měněna.

Zdroj je přesně původní git commit `f96e3c0606028f9eee48c32b70c7e7225b2fc5d0` + dříve nasazený `cashflow-shadow-only-release-2026-09-12.patch` + nový [patch této verze](data-loading-release-2026-09-12.patch). Nový patch obsahuje 11 souborů a lze jej aplikovat na přesný dosavadní produkční základ. [Manifest a kontrolní součty](data-loading-release-2026-09-12.json), [doklad nasazení a HTTP kontrol](data-loading-deployment-2026-09-12.json).

Předchozí produkční verze pro návrat: `dpl_35btPGYkeGXnNLyMDfKvjzzSMgQA`. Návrat je možné provést jejím opětovným povýšením na produkční domény; tato úprava nemá datovou migraci, kterou by bylo nutné vracet.
