## Měsíční kontrola odmítnutá kvůli zastaralému kontextu, 11. 10. 2026

[Textový výpis měsíčního detailu](./cashflow-server-pilot-live-group-reads-month-stale-context-2026-10-11.json) obsahuje **`kind: month`, `status: unavailable`, `reason: stale_context`**, trvání **0,3 ms**, klientskou referenci **22,5 ms**, prázdné serverové časy a žádný HTTP status. Podle ověřeného klienta tato kombinace znamená odmítnutí zastaralého kontextu před odesláním HTTP požadavku; není to neshoda částek ani úspěšná kontrola měsíce. Přesný měsíc, datum kontextu a stav časové zóny nejsou zachycené, takže konkrétní překročení stáří není samostatně změřené.

Kontext má nejvýše **5 minut**, musí patřit stejnému kalendářnímu dni a stejné časové zóně prohlížeče. Detail patří k předchozímu přehledu; klient jej zachová s původním datem a při odmítnutí zruší možnost dalších měsíčních porovnání, dokud neprojde nový přehled. Pouhá výměna timestampu nebo prodloužení limitu by nesprávně spojovalo různá referenční data. Nové volání přehledu přepnutím filtru obnoví potřebný model i datum požadavku.

V izolovaném ověřeném exportu prošlo **5 relevantních existujících testů**; 66 ostatních testů souboru se kvůli cílenému filtru nespouštělo. Testy potvrzují odmítnutí starého detailu bez dalšího HTTP požadavku, zachování původního detailu, obnovení modelu i požadavku po změně času a následnou shodu přehledu i měsíce. Klient a test odpovídají manifestu; sdílený protokol odpovídá nezměněnému základnímu commitu v pracovním stromu i izolovaném exportu. Runtime, ochranný limit, obchodní data a produkční secrets se nemění.

**Měsíční scénář zůstává otevřený.** Opravený postup zavře detail, přepne z Vlastních na jinou volbu a zpět při vypnuté predikci, počká na čerstvé `view/match` a ihned otevře měsíc bez dalšího reloadu nebo čekání na odpověď v chatu. Předchozí pokyn tento čerstvý přehled před detailem výslovně nevyžadoval. Ukládají se pouze diagnostické časy a výsledky kontrol; přesný čas pozorování není domýšlený a nejsou ukládány identity, finanční částky, portfolio ani tokeny. Poslední hostingové ověření zůstává datované; kvůli tomuto klientskému odmítnutí nebyla metadata znovu načítána.

Níže zůstává historie předchozích měření a ověření.

## Živá shoda Vlastních bez predikce, 11. 10. 2026

[Textový výpis navazující na pokyn přepnout na Vlastní bez predikce](./cashflow-server-pilot-live-group-reads-own-match-2026-10-11.json) obsahuje **`kind: view`, `status: match`**. Podle ověřeného klienta shoda zahrnuje úplné podklady, otisk všech měsíčních položek a všechna pole přehledu. Volba je doložená odpovědí na konkrétní postup; ovládací prvky, vymazání diagnostiky, parametry a deployment ID samotného požadavku nejsou nezávisle zachycené. Přesný čas pozorování nebyl dodán a není doplněn odhadem.

Požadavek trval **10 984,2 ms**, server celkem **10 759,2 ms**, podklady **9 004,1 ms**, výpočet **849,05 ms** a hashování **208,02 ms**. Podklady představují **83,69 %** serverového času. Klientská reference **107,3 ms** není celá doba načtení stránky. Smluvní zdroje se podle hranic měření překrývají; přesná časová osa není zachycená a jejich součet není samostatnou úsporou proti původnímu výpočtu. Odlišný filtr proti Týmovým také není kontrolované výkonové srovnání.

Hostingová metadata z **15:47:04 Europe/Prague** potvrdila očekávaný produkční alias, READY a oba ověřované otisky patchů. Sedm relevantních lokálních souborů odpovídá manifestu; neměnný patch, záznam nasazení a předchozí důkazy zůstávají zachované. **Z kontrolovaných živých scénářů této verze už čeká pouze samostatný měsíční detail.** Je třeba zachovat současné ověřené Vlastní bez predikce, neobnovovat stránku, vymazat diagnostiku a otevřít měsíc; očekává se `kind: month` a `status: match`. Výkonová jistota a migrace pouze na server zůstávají otevřené. Runtime a obchodní data se nemění, ukládají se jen diagnostické časy a stav kontrol bez identity, finančních částek, portfolia či tokenů.

Níže zůstává historie předchozích měření a ověření.

## Živá shoda Týmových s predikcí a obnovený přístup k metadatům, 11. 10. 2026

[Snímek z 13:06:54](./cashflow-server-pilot-live-group-reads-team-prediction-match-2026-10-11.json) obsahuje **`kind: view`, `status: match`** při viditelných **Týmových smlouvách, všech produktech, zapnuté predikci a prázdném hledání**. Navazuje na pokyn zapnout predikci, počkat bez reloadu a vypsat výsledek. Diagnostika se liší od předchozího průchodu bez predikce; parametry a deployment ID konkrétního požadavku nejsou nezávisle zachycené. Shoda podle ověřeného klienta zahrnuje úplné podklady, otisk všech měsíčních položek a všechna pole přehledu této volby.

Požadavek trval **10 740 ms**, server celkem **9 201,15 ms**, podklady **6 157,23 ms**, výpočet **1 172,14 ms** a hashování **312,42 ms**. Podklady tvoří **66.92 %** serverového času. Klientská reference **150,7 ms** nevyjadřuje celé načtení stránky. Proti včerejšímu stejnému viditelnému nastavení je požadavek o **1 503,1 ms / 12,28 % kratší**. Jde o druhý vzorek napříč dvěma dny; portfolio a podmínky infrastruktury nejsou samostatně zachycené, takže **stabilní ani kauzální zrychlení není doložené**.

Příčina dnešního odmítnutí hostingových metadat je nyní doložená: uložený přístupový token překročil vlastní expiraci a všechny tři čtecí endpointy vracely HTTP 403. **Existující Vercel CLI přihlášení token automaticky obnovilo, bez nového interaktivního loginu.** Následná metadata v **13:22:00 Europe/Prague** potvrdila původní produkční alias `dpl_DMwDdPq4h2X2TyJk59xBZ1jHgTzF`, READY a otisky obou ověřovaných patchů. Sedm relevantních lokálních souborů odpovídá manifestu. Předchozí záznam odmítnuté kontroly zůstává historicky zachovaný.

Týmový přehled má čerstvou shodu s predikcí i bez ní. **Na této verzi ještě čeká Vlastní přehled bez predikce a samostatný měsíční detail.** Další opakování Týmového výpisu samo nevyřeší výkonovou nejistotu. Zobrazení stále používá původní klientský výsledek a server porovnává na pozadí; migrace pouze na server není dokončená. Záznam uchovává časy a stav ověření bez identity, finančních částek, portfolia, tokenů či zdrojového obrázku. Runtime, obchodní data a produkční secrets se nemění; obnoveno bylo pouze existující lokální CLI přihlášení.

Níže zůstává historie předchozích měření a ověření.

## Živá shoda Týmových bez predikce; dnešní hostingová metadata nejsou dostupná, 11. 10. 2026

[Snímek z 12:52:10](./cashflow-server-pilot-live-group-reads-team-match-2026-10-11.json) obsahuje **`kind: view`, `status: match`** při viditelných **Týmových smlouvách, všech produktech, vypnuté predikci a prázdném hledání**. Odstranění diagnostiky a následný opožděný výpis jsou viditelné. Předchozí snímek stejné volby zachycuje jen ID časovače `72`, nikoli výsledek porovnání. Parametry ani deployment ID konkrétního požadavku nejsou samostatně zachycené. Podle ověřeného klienta `match` zahrnuje úplné vstupní podklady, otisk všech měsíčních položek a všechna pole přehledu dané volby.

Požadavek trval **8 206,2 ms**, server celkem **7 885,86 ms**, podklady **5 525,33 ms**, profil **549,2 ms**, výpočet **749,39 ms** a hashování **289,62 ms**. Klientská reference **108,5 ms** není doba načtení celé stránky. Podklady tvoří **70,07 %** serverového času. Vlastní a týmové smluvní trvání jsou **2 864,83 ms** a **3 776,55 ms**; jejich součet převyšuje podklady po profilu o **1 665,25 ms**, což podle hranic měření ukazuje překrytí. Nejde o změřenou úsporu; přesná časová osa ani počet týmových skupin nejsou zachycené.

Předchozí snímek z 10. 10. měl zapnutou predikci. Dnešní odlišná volba a jiný den tedy nejsou opakovaným vzorkem tohoto scénáře ani kontrolovaným důkazem zrychlení. Pro výkonové srovnání stále čeká čerstvý Týmový přehled se zapnutou predikcí a opakování stejné volby.

**Dnešní kontrola hostingových metadat vrací HTTP 403.** Aktuální deployment se proto nezávisle nepotvrdil; příčina odmítnutí není zjištěná a nelze z něj vyvozovat změnu produkce ani expiraci přihlášení. Poslední úspěšná kontrola je z 10. 10. v 14:58:54 Europe/Prague. Sedm relevantních lokálních souborů stále odpovídá manifestu, patch a neměnný záznam nasazení zachovávají původní otisky. To nepotvrzuje aktuální serverový artifact. Výpis se ukládá s tímto omezením; nejsou uloženy identity, finanční částky, portfolio, tokeny ani zdrojový obrázek. Runtime, obchodní data a produkční secrets se nemění. Pilotní migrace pouze na server není dokončená.

Níže zůstává historie předchozích ověření a nasazení.

## První živá shoda týmového přehledu po souběžném čtení skupin, 10. 10. 2026

[Snímek z 14:54:04](./cashflow-server-pilot-live-group-reads-team-prediction-match-2026-10-10.json) obsahuje **`kind: view`, `status: match`** a viditelné **Týmové smlouvy, všechny produkty, zapnutou predikci a prázdné hledání**. Navazuje na pokyn odstranit starou diagnostiku, obnovit nejprve stránku a pak nastavit volbu bez dalšího reloadu. Samotné vymazání, reload, parametry požadavku a jeho deployment ID snímek nezachycuje. Podle ověřeného klienta shoda zahrnuje úplné vstupní podklady, otisk všech měsíčních položek a všechna pole přehledu pro tuto volbu.

V **14:58:54 Europe/Prague** hostingová metadata potvrdila `dpl_DMwDdPq4h2X2TyJk59xBZ1jHgTzF`, READY a otisky aktuálního i předchozího patche. Sedm relevantních runtime a testovacích souborů odpovídá manifestu. Kontrola nečetla portfolio, neměnila obchodní data ani produkční secrets. Konkrétní request není nezávisle spojený s deployment ID; potvrzuje se současný produkční alias.

| Metrika | Předchozí týmový vzorek 10:58:42, ms | Nový týmový vzorek, ms |
| --- | ---: | ---: |
| Porovnávací požadavek | 9 258,4 | 12 243,1 |
| Klientská reference | 104,7 | 104,8 |
| Server celkem | 9 092,37 | 11 995,21 |
| Podklady celkem | 6 890 | 9 624,66 |
| Profil | 1 195,43 | 2 778,11 |
| Vlastní smlouvy | 4 130,36 | 3 958,1 |
| Týmové smlouvy | 4 298,81 | 4 816,67 |
| Vlastní načtení a zpracování položek | 2 754,7 | 1 943,5 |
| Týmové načtení a zpracování položek | 1 305,51 | 2 796,7 |
| Hashování | 284,53 | 273,72 |
| Výpočet | 1 116,86 | 1 040,5 |

Požadavek je v tomto páru o **2 984,7 ms / 32,24 % delší**. Stejná viditelná volba není kontrolovaný experiment: portfolio a podmínky infrastruktury nebyly nezávisle zachycené a na nové verzi je zatím jeden vzorek. Největší blok nadále představují podklady, **80,24 %** serverového času. Profil sám se prodloužil o **1 582,68 ms**; současně kolísají identita, týmový kontext a fáze `entries`. Není doložená samostatná příčina, kauzální regrese ani stabilní zrychlení.

Vlastní a týmové smluvní trvání dohromady činí **8 774,77 ms**, zatímco celý blok podkladů po profilu činí **6 846,55 ms**. Rozdíl **1 928,22 ms** podle hranic měření ukazuje překrytí; není změřenou úsporou. Počet týmových vlastníků ani aktivace souběžného čtení více skupin nejsou samostatně zachycené. Nová optimalizace může pomoci až u více než deseti vlastníků; z tohoto výpisu nelze potvrdit, že se větev použila. `referenceMs` zachycuje výpočet přehledu, nikoli celé načtení původní stránky.

**První živý týmový přehled nové verze prošel shodou.** Před další výkonovou úpravou je třeba získat opakované vzorky stejné volby. Samostatný Vlastní přehled bez predikce a měsíční detail na této verzi dosud nejsou živě doložené. Pilot dál zobrazuje původní klientský výpočet; přechod pouze na server není dokončený. Ukládají se jen diagnostické časy a rozbor, bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Zaslaný výpis nemění runtime, patch ani neměnný záznam nasazení.

Níže zůstává historie nasazení a předchozích živých měření.

## Omezené souběžné čtení týmových skupin je nasazené, 10. 10. 2026

[Patch](./cashflow-server-pilot-group-reads-2026-10-10.patch) dovoluje při důvěryhodném čerstvém serverovém cashflow načíst jednu další skupinu oprávněných poradců dopředu. Skupiny mají nejvýše deset vlastníků; současně jsou připravené nejvýše dvě skupiny se čtyřmi počátečními dotazy na jeden handler. Výsledky a navazující stránkování se spotřebují v původním pořadí. Běžné požadavky, filtrované dotazy a `includeTeam` zůstávají sériové. Klientské hlavičky ani parametry tuto optimalizaci nezapnou.

Čerstvá autorizace každé HTTP stránky a výběr oprávněných vlastníků zůstávají zachované. Pokud dotaz selže, může být navíc již spuštěná jedna oprávněná skupina, nejvýše dva počáteční databázové dotazy. Její dokončení nebo odmítnutí se ošetří před fallbackem; nemůže později změnit jeho výsledky. Úspěšné dotazy, deduplikace, mez kurzoru, všechna pole odpovědi, obchodní výpočet, sdílené limity a bezpečnostní kontroly zůstávají zachované. Nevzniká cache oprávnění, nová dependency, secret ani citlivý log.

V izolovaném exportu prošlo **5 960 testů ve 399 souborech**, TypeScript, cílený ESLint a produkční Webpack sestavení se syntetickou konfigurací. [Porovnání skutečných starých a nových handlerů](../scripts/check-cashflow-group-reads.mjs) prošlo pro **428 scénářů, 408 úplných stránek a 9 scénářů plánování**. Ověřuje všechny odpovědi, počty, kurzory, hlavičky, úspěšné sady dotazů, hranice pořadí autorizace, fallbacky, odmítnuté přístupy i manipulaci identity a role. Z odpovědí skutečných handlerů se shoduje také **18 úplných cashflow přehledů se všemi měsíčními položkami**, včetně neprázdného svědka první prosincové provize životního pojištění. Pozastavené syntetické dotazy doložily současné zahájení dvou oprávněných skupin.

[Manifest](./cashflow-server-pilot-group-reads-2026-10-10.json) pokrývá 53 zdrojů; [izolovaná příprava](../scripts/prepare-cashflow-group-reads-release.mjs) přidává pouze tři soubory nad předchozí ověřenou verzi. Nesouvisející rozpracované kontakty, pomůcky a změny závislostí nejsou v balíčku. Potenciální přínos je omezený na týmy s více než deseti poradci. Naměřené trvání `entries` zahrnuje více kroků a neprokazuje samostatný pomalý dotaz. Syntetický svědek dokládá souběh, nikoli velikost nebo stabilitu zrychlení v produkci.

**Omezené souběžné čtení skupin je nasazené na bohemka.app pro jediný autorizovaný pilotní účet.** Před přepnutím i po něm prošlo 20 hostingových kontrol. Shoduje se 62 nahraných kontrolních součtů a tři soubory hostovaného workeru ověřeného v nativním Chromu. Přísná CSP, ochrana stránek a API, odmítnutí neplatného tokenu a cizího Originu, šifrovací konfigurace, ostatní proměnné aplikace, pět plánovaných úloh a region zůstaly zachované. [Neměnný záznam nasazení](./cashflow-server-pilot-group-reads-deployment-2026-10-10.json) uchovává skutečné kontroly. Aktuální deployment je `dpl_DMwDdPq4h2X2TyJk59xBZ1jHgTzF`; předchozí ověřený deployment `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap` je dostupný pro návrat. Živá shoda a stabilní zrychlení této nové verze ještě čekají na čerstvé měření v přihlášeném prohlížeči. Pilot dál zobrazuje původní klientský výsledek a server porovnává na pozadí; přechod pouze na server není dokončený.

Níže zůstává historie předchozích ověřených verzí a živých měření.

## Živá shoda měsíčního detailu uzavírá první sadu kontrol souběhu, 10. 10. 2026

[Snímek z 11:07:40](./cashflow-server-pilot-live-concurrency-month-match-2026-10-10.json) obsahuje **`kind: month`, `status: match`** a viditelný detail **prosince 2026**. Navazuje na úspěšný přehled Vlastních bez predikce a pokyn otevřít měsíc bez reloadu a změny filtrů. Filtry jsou v aktuálním snímku překryté modalem; konkrétní parametry požadavku nejsou nezávisle zachycené. Klient spouští měsíční porovnání pouze pro předchozí ověřenou aktuální volbu. Diagnostika potvrzuje shodu úplných podkladů, otisku všech měsíčních položek a všech polí tohoto měsíce.

V **11:08:12 Europe/Prague** ověřila hostingová metadata aktivní deployment `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap`, READY a správný otisk patche. Relevantní runtime soubory souhlasí s auditovaným manifestem. Portfolio ani obchodní záznamy se při ověření nečetly nebo neměnily.

| Metrika | ms |
| --- | ---: |
| Porovnávací požadavek | 6 488,9 |
| Klientská reference | 19,6 |
| Server celkem | 6 329,15 |
| Podklady celkem | 4 829,05 |
| Profil | 788,7 |
| Vlastní smlouvy | 2 439,83 |
| Týmové smlouvy | 3 227,07 |
| Hashování | 194,99 |
| Výpočet | 812,78 |

Podklady tvoří **76.3 %** serverového času. Smluvní trvání dohromady **5 666,9 ms** převyšují celkový blok podkladů po profilu **4 040,35 ms** o **1 626,55 ms**, což podle hranic měření ukazuje překrytí. Přesná časová osa není zachycená a rozdíl není změřenou úsporou proti původní verzi. Čas měsíčního detailu nelze přímo srovnávat s přehledem jako důkaz zrychlení.

**První sada čtyř živých scénářů na této verzi je dokončená:** Všechny bez predikce, Týmové s predikcí, Vlastní bez predikce a samostatný měsíční detail mají `match`. Opakované vzorky stejné volby, stabilní zrychlení a přechod pouze na server zatím nejsou prokázané. Další výkonové úpravy mají vycházet z opakovaného stejného scénáře. Pilot dál zobrazuje původní klientský výpočet.

Aktualizovaný manifest odstraňuje čekající měsíční scénář; neměnný patch i záznam nasazení zachovávají původní obsah. Záznam ukládá pouze diagnostické časy, běžný kalendářní měsíc a rozbor bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Runtime ani obchodní data se nemění.

Níže zůstává historie předchozích měření a nasazení.

## Živá shoda Vlastních bez predikce po souběžném načítání, 10. 10. 2026

[Snímek z 11:03:28](./cashflow-server-pilot-live-concurrency-own-match-2026-10-10.json) obsahuje **`kind: view`, `status: match`** při viditelných **Vlastních smlouvách, všech produktech, vypnuté predikci a prázdném hledání**. Výpis navazuje na pokyn odstranit starou diagnostiku a změnit filtry bez reloadu. Podle klientské diagnostiky se shodují úplné podklady, otisk všech měsíčních položek a všechna pole přehledu. Samostatné odstranění diagnostiky, Resource Timing a deployment ID konkrétního požadavku na snímku nejsou zachycené.

Hostingová metadata v **11:05:01 Europe/Prague** potvrzují současný deployment `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap`, READY a správný otisk patche. Čtyři relevantní runtime soubory souhlasí s manifestem. Tato kontrola nečte portfolio ani nemění produkci.

| Metrika | ms |
| --- | ---: |
| Porovnávací požadavek | 9 470,1 |
| Klientská reference | 107,7 |
| Server celkem | 9 197,41 |
| Podklady celkem | 7 715,92 |
| Profil | 832,38 |
| Vlastní smlouvy | 5 482,4 |
| Týmové smlouvy | 5 256,11 |
| Vlastní načtení a zpracování položek | 3 884,55 |
| Týmové načtení a zpracování položek | 3 802,87 |
| Hashování | 232,59 |
| Výpočet | 782,08 |

Podklady tvoří **83.89 %** serverového času. Součet smluvních trvání **10 738,51 ms** převyšuje celý blok podkladů po profilu **6 883,54 ms** o **3 854,97 ms**; z hranic měření to ukazuje překrytí, nikoli změřenou úsporu proti předchozí verzi. Přesná časová osa ani kontrolované srovnání před/po nejsou zachycené. `entries` zahrnuje dotazy, fallbacky, dešifrování a přípravu položek; konkrétní pomalý dotaz není určený.

**Na této verzi prošly Všechny bez predikce, Týmové s predikcí i Vlastní bez predikce. Samostatný detail měsíce ještě čeká na živé ověření.** Stabilní zrychlení není prokázané. Pilot nadále zobrazuje původní klientský výpočet; přechod pouze na server není dokončený. Záznam ukládá pouze diagnostické časy a rozbor bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Runtime, patch, neměnný záznam nasazení a obchodní data se nemění.

Níže zůstává historie předchozích měření a nasazení.

## Živá shoda Týmových s predikcí po souběžném načítání, 10. 10. 2026

[Snímek z 10:58:42](./cashflow-server-pilot-live-concurrency-team-prediction-match-2026-10-10.json) obsahuje **`kind: view`, `status: match`** při viditelných **Týmových smlouvách, všech produktech, zapnuté inteligentní predikci a prázdném hledání**. Podle klientské diagnostiky se shodují úplné podklady, otisk všech měsíčních položek a všechna pole tohoto přehledu. Výpis navazuje na opravený postup bez obnovení stránky po nastavení filtrů. Vymazání diagnostiky a Resource Timing nejsou na snímku samostatně zachycené.

Původní pokyn nastavit filtry před reloadem nebyl správný: stránka inicializuje `scopeFilter` na `combined` a predikci na `false`. Je to ověřené v kódu; reload tedy vrací Všechny a vypíná predikci. Opravený postup nejprve dokončí obnovení, odstraní starou diagnostiku, nastaví požadované filtry a vyčká na nové porovnání bez dalšího reloadu. Runtime se kvůli tomuto postupu nemění.

Kontrola hostingových metadat v **10:59:53 Europe/Prague** potvrdila deployment `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap`, stav READY a otisk souběžného loaderu. Čtyři relevantní runtime soubory souhlasí s manifestem. Konkrétní deployment ID zaslaného aplikačního požadavku snímek neobsahuje; nezávisle se potvrzuje současný alias. Portfolio ani produkční data se nečetly a neměnily.

| Metrika | ms |
| --- | ---: |
| Porovnávací požadavek | 9 258,4 |
| Klientská reference | 104,7 |
| Server celkem | 9 092,37 |
| Podklady celkem | 6 890 |
| Profil | 1 195,43 |
| Vlastní smlouvy | 4 130,36 |
| Týmové smlouvy | 4 298,81 |
| Vlastní identita včetně rate limitu | 1 077,62 |
| Týmová identita včetně rate limitu | 2 923,62 |
| Vlastní načtení a zpracování položek | 2 754,7 |
| Týmové načtení a zpracování položek | 1 305,51 |
| Hashování | 284,53 |
| Výpočet | 1 116,86 |

Součet vlastních a týmových smluvních trvání je **8 429,17 ms**. Celý blok podkladů po profilu trvá **5 694,57 ms**, rozdíl **2 734,6 ms** odpovídá překrytí. Přesná časová osa nebyla zachycená; jde o závěr z trvání a ověřených hranic měření. Podklady tvoří přibližně **75,78 %** serverového času. Delší týmová identita zahrnuje i rate limit a případnou impersonaci; vlastní `entries` zahrnuje databázi, fallbacky, dešifrování a přípravu položek. Není určený samostatný problém v ověřování tokenu, konkrétní pomalý dotaz ani příčina kolísání.

**Na nové verzi prošel kombinovaný přehled bez predikce i týmový přehled s predikcí.** Tento týmový vzorek se nesrovnává jako před/po s předchozím kombinovaným vzorkem, protože se liší filtr a predikce. Opakované kontrolované průchody stejné volby zatím nejsou zachycené; stabilní zrychlení a přechod pouze na server nejsou potvrzené. Čerstvý vlastní přehled bez predikce a samostatný měsíční detail ještě čekají na živé ověření. Pilot nadále zobrazuje původní klientský výpočet.

Záznam obsahuje jen diagnostické časy a rozbor, bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Neměnný patch a záznam nasazení zůstávají zachované.

Níže zůstává historie předchozích měření a nasazení.

## První živá shoda souběžného načítání, 10. 10. 2026

[Snímek z 10:51:01](./cashflow-server-pilot-live-concurrency-combined-match-2026-10-10.json) obsahuje **`kind: view`, `status: match`**. Viditelné jsou **Všechny smlouvy, všechny produkty, vypnutá predikce a prázdné hledání**. Podle klientské diagnostiky se shodují úplné podklady, otisk všech měsíčních položek a všechna pole přehledu. Vymazání předchozí diagnostiky, obnovení, parametry požadavku, Resource Timing ani ID deploymentu konkrétního požadavku snímek neobsahuje; návaznost vychází z předchozího pokynu a viditelných voleb.

Nezávislá kontrola hostingových metadat v **10:52:22 Europe/Prague** potvrdila aktivní deployment `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap`, stav READY a otisk patche souběžného načítání. Čtyři relevantní lokální runtime soubory souhlasí s auditovaným manifestem. Kontrola nečetla portfolio ani nezměnila produkci. Neměnný záznam nasazení zachovává skutečný stav při publikování.

| Metrika | Předchozí vzorek, ms | Nový vzorek, ms |
| --- | ---: | ---: |
| Porovnávací požadavek | 7 492,5 | 7 317,1 |
| Klientská reference | 61,3 | 71,4 |
| Server celkem | 7 198,1 | 7 098,48 |
| Podklady celkem | 4 758,54 | 4 663,49 |
| Profil | 514,14 | 473,28 |
| Vlastní smlouvy | 1 943,06 | 2 265,65 |
| Týmové smlouvy | 2 297,01 | 3 073,52 |
| Týmová identita včetně rate limitu | 683,7 | 1 447,11 |
| Hashování | 490,32 | 429,13 |
| Výpočet | 1 508,37 | 1 485,58 |

Vlastní a týmové smluvní časy dávají **5 339,17 ms**, zatímco celý blok podkladů po profilu trvá **4 190,21 ms**. Rozdíl **1 148,96 ms** ukazuje překrytí načítání. Jde o závěr z souhrnných trvání a ověřených hranic měření; přesná časová osa začátků a konců není zachycená. Samostatné smluvní časy jsou proti minulému vzorku dohromady o **1 099,1 ms delší**, především se prodloužila týmová identita a vlastní týmový kontext. Není prokázané, že příčinou těchto delších kroků je nový souběh. Identita zahrnuje i rate limit a případnou impersonaci; `entries` zahrnuje databázi, fallbacky, dešifrování i přípravu položek. Z těchto metrik nelze zvolit konkrétní pomalý dotaz nebo bezpečně odůvodnit cache oprávnění.

Celý porovnávací požadavek je v tomto páru vzorků kratší o **175,4 ms / 2,34 %**, podklady o **95,05 ms / 2,00 %**. Nejde o kontrolovaný experiment: stejné portfolio, stav infrastruktury a ostatní provozní podmínky nebyly nezávisle zachycené a hosting při novém sestavení přidal technický flag popsaný níže. Stabilní ani kauzální zrychlení proto není potvrzené. Klientská reference 71,4 ms není celá doba načtení stránky.

**Nový kombinovaný přehled bez predikce prošel živou shodou; časy odpovídají souběžnému načítání.** Vlastní přehled, týmový přehled s predikcí a samostatný detail měsíce ještě vyžadují čerstvé živé ověření na této verzi. Před další změnou výkonu je vhodné také opakovat stejný kombinovaný scénář. Pilot dál zobrazuje původní klientský výsledek; přechod pouze na server není dokončený. Tento krok ukládá pouze časy a rozbor, bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Runtime ani obchodní data se nemění.

Níže zůstává zachovaná historie nasazení a předchozích měření.

## Souběžné načítání smluv je nasazené, 10. 10. 2026

[Patch](./cashflow-server-pilot-concurrency-2026-10-10.patch) překrývá načítání vlastních a týmových smluv. Tým začne teprve po čerstvých kontrolách první vlastní stránky a po zjištění jejího celkového počtu. Před spuštěním se rezervuje celý vlastní deklarovaný počet pro společnou mez 5 000 smluv. Týmové požadavky dále samostatně ověřují identitu, aktuální oprávnění, předplatné a rate limit; žádná identita nebo autorizace se nesdílí. Klientské hlavičky ani profilové `hasTeam` tuto větev nezapnou. Není-li důvěryhodný callback dostupný, zůstává původní sériová návaznost.

Limit 50 požadavků, 20 sekund a 5 000 zdrojových řádků včetně duplicit zůstává společný. Při souběhu se kontroluje i součet deklarovaných počtů. Odvolání přístupu na kterékoli stránce, neúplná data, rušení a timeout odmítnou celý výsledek. Rychlé týmové odmítnutí je ihned ošetřené proti nezachycené promise, následně se propaguje; původní priorita vlastní chyby zůstává zachovaná. Pořadí mezi oběma zdroji se mění, ale jejich vlastní stránky, parametry, kurzory a výsledky jsou stejné. Obchodní výpočet a těla API jsou beze změny.

V izolovaném exportu prošlo **5 954 testů ve 398 souborech**, TypeScript, cílený ESLint a produkční Webpack build se syntetickou konfigurací. [Srovnání skutečných handlerů](../scripts/check-cashflow-concurrency-handlers.mjs) prošlo pro **26 scénářů, 9 úplných stránek a 9 samostatných scénářů plánování**. Ověřilo shodu odpovědí, dotazů a autorizace, pořadí count/entries, důvěryhodný callback, chybu callbacku, abort a odmítnuté či manipulované přístupy.

[Srovnání loaderů a modelů](../scripts/check-cashflow-concurrency-models.mjs) prošlo pro **42 syntetických portfolií a 378 úplných přehledů se všemi měsíci a položkami**, v UTC, Europe/Prague a America/New_York. Před i po proběhlo 102 smluvních požadavků se stejnými parametry a pořadím uvnitř každého zdroje; shodují se všechny podklady a výsledky. Syntetický Chrome ověřil nativní worker, otisky, Date hodnoty, filtry a první prosincovou provizi při sjednání 8. 10. s počátkem 1. 12.

[Manifest](./cashflow-server-pilot-concurrency-2026-10-10.json) pokrývá 51 auditovaných zdrojů. [Izolovaná příprava](../scripts/prepare-cashflow-concurrency-release.mjs) aplikuje pouze pět souborů této změny nad předchozí ověřenou řadou patchů. Ostatní rozpracované kontakty, pomůcky a závislosti nejsou součástí balíčku. Bezpečnostní kontrola potvrdila zachované čerstvé autorizace, úplnost a meze bez přidaných citlivých logů, secrets nebo dependencies.

Hosting při sestavení přidal název `USE_RUST_LAYER_LATEST`, který předchozí deployment neměl. První kontrola tuto odchylku odmítla před přepnutím domény. Následné ověření doložilo, že jej nenastavují zmrazené zdroje, použité CLI, proměnné projektu ani odeslané overrides; původ v hostingu je odvozený z těchto kontrol. Jeho interní účinek není samostatně potvrzený. Výjimka v porovnání názvů povoluje pouze tento konkrétní název, všechny aplikační proměnné musí dál souhlasit přesně. Důkaz a skutečné HTTP kontroly jsou součástí záznamu nasazení. Hodnoty se nečetly ani neměnily.

**Souběžné načítání je nasazené na bohemka.app pro jediný autorizovaný pilotní účet.** Před přepnutím i po něm prošlo 20 hostingových kontrol. Shoduje se 60 nahraných kontrolních součtů a tři soubory hostovaného workeru ověřeného v nativním Chromu. Přísná CSP, ochrana stránek a API, odmítnutí neplatného tokenu a cizího Originu, šifrovací konfigurace, názvy ostatních proměnných aplikace, pět plánovaných úloh a region zůstaly zachované. [Neměnný záznam nasazení](./cashflow-server-pilot-concurrency-deployment-2026-10-10.json) uchovává skutečné kontroly. Aktuální deployment je `dpl_3xSrYtV5w7cWGPLLkd6tkpLL6cap`; předchozí ověřený deployment `dpl_2JrBgt4hjWjbFHG4PwiQA8tpN1iF` je dostupný pro návrat. Živá shoda a stabilní zrychlení této nové verze ještě čekají na čerstvé měření v přihlášeném prohlížeči. Pilot dál zobrazuje původní klientský výsledek a server porovnává na pozadí; přechod pouze na server není dokončený.

Níže zůstávají zachované podklady předchozích nasazení a živých průchodů.

## První živá shoda s vnitřními časy smluv, 10. 10. 2026

[Snímek z 10:03:57](./cashflow-server-pilot-live-contract-timing-combined-match-2026-10-10.json) obsahuje **`kind: view`, `status: match`** a všech dvanáct nových vnitřních metrik smluv. Viditelné jsou **Všechny smlouvy, všechny produkty, vypnutá predikce a prázdné hledání**. Podle klientské diagnostiky prošla shoda úplných podkladů, otisku všech měsíčních položek a všech polí přehledu. Odstranění staré diagnostiky, obnovení, parametry požadavku, Resource Timing ani ID deploymentu konkrétního požadavku snímek samostatně nezachycuje. Hodnoty nových metrik odpovídají nově nasazenému měření.

Nezávislá kontrola hostingových metadat v **10:07:17 Europe/Prague** potvrdila aktivní produkční deployment `dpl_2JrBgt4hjWjbFHG4PwiQA8tpN1iF`, stav READY a otisk patche podrobného měření. Kontrola nečetla portfolio ani nezměnila produkci. Pro rozbor se ověřila také shoda čtyř relevantních lokálních runtime souborů s auditovaným manifestem; neměnný záznam nasazení zůstal zachovaný.

| Metrika | ms |
| --- | ---: |
| Celý porovnávací požadavek | 7 492,5 |
| Klientská reference | 61,3 |
| Server celkem | 7 198,1 |
| Autentizace endpointu | 415,17 |
| Podklady celkem | 4 758,54 |
| Profil | 514,14 |
| Vlastní smlouvy | 1 943,06 |
| Týmové smlouvy | 2 297,01 |
| TIP | 1 075,48 |
| Předplatné | 727,91 |
| Provizní výpisy | 1 022,79 |
| Hashování | 490,32 |
| Výpočet | 1 508,37 |

| Krok smluv | Vlastní, ms | Týmové, ms |
| --- | ---: | ---: |
| Identita a rate limit | 646,74 | 683,7 |
| Čerstvý týmový strom | 54,92 | 36,34 |
| Kontrola předplatného | 19,25 | 17,43 |
| Počet na první stránce | 302,21 | 46,07 |
| Načtení a zpracování položek | 1 201,21 | 1 543,59 |
| Příprava odpovědi | 10,87 | 8,7 |

Vlastní a týmové zdroje běží v aktuálním loaderu postupně. Tvoří **4 240,07 ms**, přibližně **89,1 %** načítání podkladů. S profilem vysvětlují 4 754,21 ms z celkových 4 758,54 ms. TIP, předplatné a výpisy běží po profilu souběžně s portfoliem; jejich trvání se proto nesčítá jako další sériová prodleva. Také `count` běží souběžně s `entries`, takže součet všech vnitřních kroků není doba handleru.

Hlavní měřené části smluv jsou **načtení a zpracování položek 2 744,8 ms** a **identita včetně rate limitu 1 330,44 ms**. Čerstvý týmový strom a předplatné dohromady zabraly jen 127,94 ms; jejich cache proto tento vzorek neopodstatňuje. `entries` zahrnuje databázové dotazy, jejich fallbacky, dešifrování, filtry a přípravu položek. `identity` zahrnuje stávající kontrolu identity, případnou impersonaci a rate limit. Z těchto metrik nelze určit konkrétní pomalý databázový dotaz ani zaměnit referenci 61,3 ms za celou dobu načtení klientské stránky.

**Další konkrétní kandidát je překrýt týmové načítání s načítáním vlastních položek až po čerstvém serverovém ověření týmové dostupnosti.** Každý týmový i vlastní požadavek musí dál samostatně projít stávajícími čerstvými kontrolami identity, oprávnění, předplatného a rate limitu. Samotné `hasTeam` z profilu není náhrada za smluvní autorizaci a nemá určovat výsledný scope. Případná úprava musí zachovat stejné vlastníky, úplnost stránkování, souhrnné limity, rušení, chyby a fencing změn podkladů; ověřit všechny vstupy i měsíční položky proti nynějšímu zmrazenému deploymentu. Kandidát ještě není implementovaný ani nasazený, úspora času je hypotéza.

**Tento živý přehled prošel; stabilní zrychlení a přechod pouze na server nejsou potvrzené.** Jde o jeden vzorek. Živý vlastní a týmový přehled s predikcí a samostatný měsíční detail na této verzi nejsou tímto snímkem ověřené. Záznam přidává pouze diagnostické časy a jejich rozbor, bez identity, finančních částek, portfolia, tokenů nebo zdrojového obrázku. Runtime ani obchodní data se tímto krokem nezměnily.

Níže zůstávají zachované podklady nasazení a předchozí živá měření.

## Podrobné měření smluv je nasazené, 10. 10. 2026

Nový [patch](./cashflow-server-pilot-contract-timing-2026-10-10.patch) doplňuje dvanáct pevných číselných metrik do existující diagnostiky pilotu: stejných šest kroků samostatně pro vlastní a týmové smlouvy. Dosavadní souhrnné metriky zůstávají zachované. Callback zapíná pouze důvěryhodný serverový volající; parametry ani hlavičky klienta jej nezapnou. Výpočet, autentizace, čerstvé kontroly každé stránky, rate limit, limity vstupů, databázové dotazy a těla odpovědí jsou zachované.

| Přípona metriky | Měřený krok |
| --- | --- |
| `identity` | Stávající ověření identity, zpracování impersonace a rate limit |
| `team_context` | Čerstvé načtení profilového stromu a jeho sestavení |
| `subscription` | Stávající kontrola platnosti předplatného |
| `count` | Stávající počet smluv na první stránce |
| `entries` | Načtení smluv včetně dotazů, fallbacků, dešifrování, filtrů a přípravy položek |
| `response` | Závěrečné filtrování viditelnosti, vytvoření odpovědi a JSON serializace |

Názvy mají prefix `cashflow_inputs_own_contracts_` nebo `cashflow_inputs_team_contracts_`; hodnoty se sčítají přes stránky. `count` a `entries` běží souběžně, proto se jejich časy nesčítají jako doba celého handleru. `entries` není čistý databázový čas a `team_context` nezahrnuje každý pozdější krok odvození role. Neprovedený krok nemá metriku. Diagnostika přenáší pouze pevné názvy a konečná, omezená čísla; nepřidává účet, tokeny, smlouvy ani obsah výjimek. Chyba callbacku nemůže změnit odpověď nebo zakrýt původní odmítnutí přístupu. Žádné nové dotazy, dependencies, cache, obchodní zápisy nebo změny secrets.

V izolovaném exportu prošlo **5 935 testů ve 398 souborech**, TypeScript, cílený ESLint a produkční Webpack build v čisté syntetické konfiguraci. [Porovnání skutečných starých a nových smluvních handlerů](../scripts/check-cashflow-contract-timing.mjs) ověřilo **26 scénářů a 9 úplných stránek**: shodná všechna pole, počty, kurzory, hlavičky, pořadí dotazů a autorizace při zapnutém i vypnutém měření. Odmítnuté požadavky nečtou smlouvy; manipulace vlastníka a role nedává přístup k cizímu portfoliu. Ověřený je také zachovaný souběh počítání a čtení, včetně větve `includeTeam`.

[Srovnání cashflow](../scripts/check-cashflow-contract-timing-models.mjs) prošlo pro **42 syntetických portfolií a 378 přehledů se všemi měsíci a položkami**, v UTC, Europe/Prague a America/New_York. Před i po je 102 smluvních požadavků se stejnými parametry a pořadím; shodují se úplné vstupy i výsledky. Chrome se syntetickými daty, dočasným nepřihlášeným profilem a vypnutou externí sítí ověřil nativní Web Worker, datumové typy, otisky, filtry a prosincovou první provizi životní smlouvy sjednané 8. 10. s počátkem 1. 12.

[Manifest](./cashflow-server-pilot-contract-timing-2026-10-10.json) pokrývá 51 auditovaných zdrojů. [Příprava izolované verze](../scripts/prepare-cashflow-contract-timing-release.mjs) ověřuje celou předchozí řadu patchů a aplikuje jen uvedených dvanáct souborů, bez ostatních rozpracovaných lokálních úprav. Bezpečnostní kontrola potvrzuje zachované autorizace a limity, nulové přidané citlivé logování, secrets nebo závislosti.

**Podrobné měření je nasazené na bohemka.app pro jediný autorizovaný pilotní účet.** Před přepnutím i po něm prošlo 20 hostingových kontrol: veřejné stránky/CSP, chráněné stránky a API, neplatný token, cizí Origin, brána pilotu a tři nativně ověřené worker assets. Shoduje se 60 nahraných kontrolních součtů; bezpečnostní a šifrovací konfigurace, pět plánovaných úloh, region a ostatní proměnné aplikace zůstaly zachované. [Neměnný záznam nasazení](./cashflow-server-pilot-contract-timing-deployment-2026-10-10.json) uchovává skutečné výsledky kontrol. Aktuální deployment je `dpl_2JrBgt4hjWjbFHG4PwiQA8tpN1iF`; předchozí ověřený deployment je dostupný pro návrat. Živé vnitřní časy a stabilní zrychlení zatím nejsou prokázané. Pilot stále zobrazuje původní klientský výsledek; přechod pouze na server není dokončený.

Níže jsou zachované předchozí živé průchody a záznamy nasazení.

## První živé dílčí časy: Všechny bez predikce, 9. 10. 2026

[Snímek z 19:49:35](./cashflow-server-pilot-live-timing-combined-match-2026-10-09.json) obsahuje `kind: view`, `status: match` a všech šest nových zdrojových metrik. Viditelné jsou **Všechny smlouvy, všechny produkty, vypnutá predikce a prázdné hledání**; nejde o původně požadovaný filtr Vlastní. Podle klientské diagnostiky prošla shoda úplných podkladů, otisku všech měsíčních položek a všech polí přehledu. Vymazání diagnostiky, tvrdé obnovení, parametry požadavku, Resource Timing a ID deploymentu konkrétního požadavku snímek neobsahuje.

Nové metriky odpovídají publikovanému měření, ale nezávislá kontrola aliasu nyní skončila **HTTP 403, forbidden**. Poslední úspěšné potvrzení deploymentu `dpl_AKhELij5YgxNiqKeMPyEcD8ySwEm` je z kontroly po nasazení v 16:40:30 Europe/Prague. Aktuální hostingový stav ani ID deploymentu zaslaného požadavku proto nejsou nově nezávisle potvrzené. Snímek je použitelný jako hlášený živý výsledek a rozbor dílčích časů. Neměnný záznam nasazení zachovává skutečný stav při publikování.

| Metrika | ms |
| --- | ---: |
| Celý porovnávací požadavek | 8 193,5 |
| Klientská reference | 66 |
| Server celkem | 7 921,64 |
| Autentizace endpointu | 483,9 |
| Podklady celkem | 5 261,05 |
| Profil | 666,75 |
| Vlastní smlouvy | 2 385,59 |
| Týmové smlouvy | 2 189,45 |
| TIP | 862,3 |
| Předplatné | 799,24 |
| Provizní výpisy | 1 228,76 |
| Hashování | 467,99 |
| Výpočet | 1 678,16 |

Loader nejprve čeká na profil, poté na všechny vlastní stránky a až následně na všechny týmové stránky. Tato návaznost je ověřená v lokálním kódu. Časy smluv se zde tedy sčítají na **4 575,04 ms**, přibližně **86,96 %** doby podkladů. Profil plus smlouvy tvoří **5 241,79 ms**, což téměř vysvětluje celý blok 5 261,05 ms; rozdíl je 19,26 ms ostatní režie. TIP, předplatné a výpisy běží po profilu souběžně s portfoliem, proto se jejich časy nepřičítají jako další sériová prodleva. Podklady tvoří přibližně 66,41 % serverového průchodu; samotný výpočet není zanedbatelný.

Metriky smluv zahrnují jejich autentizaci, čerstvé ověření týmových a předplatných oprávnění, čtení dat a zpracování JSON. `getAuthContext` při `freshCashflowContext` čte čerstvý týmový strom a potom kontroluje předplatné při každém požadavku; tento postup je v kódu potvrzený, ale jeho samostatné trvání dosud měřené není. Nelze tedy připsat zjištěnou prodlevu konkrétní autorizaci nebo databázovému dotazu. Další vyšetření má rozdělit tyto vnitřní kroky při zachování všech současných kontrol, limitů a úplnosti. Jediný vzorek nepotvrzuje stabilní rychlost ani zrychlení celé stránky. Tento záznam nemění runtime nebo obchodní data a neukládá identitu, finanční částky ani zdrojový snímek.

Níže jsou zachované podklady nasazení a předchozí živé průchody.

## Měření jednotlivých zdrojů podkladů, 9. 10. 2026

Připravený [patch](./cashflow-server-pilot-timing-2026-10-09.patch) doplňuje do již existující soukromé hlavičky `Server-Timing` šest pevných číselných metrik: profil, vlastní smlouvy, týmové smlouvy, TIP, předplatné a provizní výpisy. Měří se čas autorizovaného handleru a zpracování jeho JSON odpovědi; u stránkovaných zdrojů se sčítají všechny zahájené stránky včetně neúspěšných. Nejde o samostatné časy databázových dotazů nebo vnitřní autorizace handlerů. Nečtený zdroj nemá metriku. Samostatné `cashflow_inputs` dál měří celou dobu načítání; některé zdroje běží souběžně, proto jejich časy nelze sčítat jako celkovou dobu požadavku.

Pozorovatel je pouze důvěryhodná serverová volba zapojená v endpointu pilotu po ověření účtu a požadavku. Názvy a numerické hodnoty se znovu kontrolují při tvorbě hlavičky i při čtení v prohlížeči. Diagnostika nepřenáší účet, ID, URL, kurzory, smlouvy, finanční částky ani zprávy výjimek; tělo API odpovědi a verze protokolu zůstávají stejné. Selhání měření nemůže změnit úspěšný výsledek ani zakrýt původní chybu načítání. Auth, čerstvé kontroly každé stránky, úplnost vstupů, rate limit a ostatní limity jsou zachované. Žádné nové dotazy, cache, dependencies, obchodní zápisy nebo změny secrets.

V izolovaném exportu prošlo **5 917 testů ve 397 souborech**, typecheck, cílený ESLint a produkční Webpack build. [Samostatné porovnání](../scripts/check-cashflow-source-timing.mjs) proti zmrazenému nynějšímu deploymentu ověřilo **42 syntetických portfolií a 378 úplných přehledů se všemi měsíci a položkami** ve třech časových pásmech. Shodují se všechny vstupy, výsledky, pořadí i parametry požadavků; před i po je 102 smluvních požadavků. Odvolaný přístup oba loadery odmítají. Nativní Chrome ověřil Web Worker, otisky, datumové typy, filtrovaný přehled a prosincovou první provizi životní smlouvy sjednané s předstihem. [Manifest](./cashflow-server-pilot-timing-2026-10-09.json) pokrývá 46 auditovaných zdrojů; [příprava release](../scripts/prepare-cashflow-timing-release.mjs) aplikuje jen uvedený patch nad předchozí ověřenou řadou, bez nesouvisejících lokálních úprav.

**Měření je nasazené na bohemka.app pro jediný autorizovaný pilotní účet.** Před přepnutím i po něm prošlo 20 hostingových kontrol: veřejné stránky/CSP, chráněné stránky a API, neplatný token, cizí Origin, brána pilotu a tři nativně ověřené worker assets. Shoduje se 55 nahraných kontrolních součtů; bezpečnostní konfigurace, šifrovací konfigurace, pět plánovaných úloh a region zůstaly zachované. [Záznam nasazení](./cashflow-server-pilot-timing-deployment-2026-10-09.json) uchovává skutečné výsledky kontrol. Aktuální deployment je `dpl_AKhELij5YgxNiqKeMPyEcD8ySwEm`. První živý průchod se šesti dílčími metrikami je nově zaznamenaný výše; přesná příčina uvnitř smluvních handlerů a stabilní zrychlení zatím nejsou prokázané. Pilot nadále zobrazuje původní klientský výpočet; přechod pouze na server ani stabilní produkční zrychlení nejsou dokončené. Níže je zachovaná historie předchozích měření a nasazení.

## Tři plánované živé scénáře prošly; rychlost zůstává proměnlivá, 9. 10. 2026

[Snímek Vlastních z 13:32:08](./cashflow-server-pilot-live-inputs-own-match-2026-10-09.json) zachycuje odstranění předchozího detailového výsledku, následné `null` a nový **`kind: view`, `status: match`**. Viditelné jsou **Vlastní, všechny produkty, vypnutá predikce a prázdné hledání**. Tím podle návazného postupu prošla shoda úplných podkladů, všech polí přehledu a otisku všech měsíčních položek. Parametry, Resource Timing ani ID deploymentu daného požadavku snímek neobsahuje; vazba na scénář vychází z viditelných voleb, odstranění diagnostiky a nového výsledku. Kontrola aliasu v 13:33:53 Europe/Prague potvrdila deployment `dpl_4Gr5EFeGA65BwwXat2hGRgm9HJ4z` bez čtení portfolia či změn produkce.

Porovnání trvalo **15 591,8 ms**, klientská reference **107,1 ms**. Server: autentizace **2 226,88 ms**, podklady **11 999,47 ms**, hashování 234,1 ms, výpočet 907,73 ms, celkem 15 391,06 ms. Předchozí úspěšný [vlastní průchod bez predikce z 11:50:31](./cashflow-server-pilot-live-scope-own-match-2026-10-09.json) trval 9 738,3 ms, z toho autentizace 468,89 ms a podklady 7 896,57 ms. Tento nový vzorek je pomalejší. Dřívější rychlejší týmový a detailový vzorek proto neprokazují stabilní produkční zrychlení. Podmínky běhu, shoda celého portfolia mezi oběma časovými okamžiky a příčina kolísání nebyly samostatně zachycené.

**Na aktuálním deploymentu prošly všechny tři plánované živé kontroly:** vlastní přehled bez predikce, týmový přehled s predikcí a samostatný detail dubna. [Manifest](./cashflow-server-pilot-inputs-2026-10-09.json) odkazuje na jejich oddělené důkazy; jde o dokončení těchto tří scénářů, nikoli živé ověření všech kombinací. Izolovaných 5 907 testů, 378 úplných syntetických srovnání a kontroly nasazení jsou uvedené níže. Neměnný patch a záznam nasazení zachovávají stav při nasazení. Evidence neukládá identitu, finanční částky, portfolio, tokeny ani zdrojové obrázky.

**Pilot nadále zobrazuje původní klientský výpočet; přechod pouze na server není dokončený.** Správnost prošlých scénářů je potvrzená, stabilní rychlost není. Současné `cashflow_inputs` měří pouze celý blok načítání; nerozlišuje profil, vlastní a týmové stránky, TIP a výpisy. Další práce má nejprve určit dobu jednotlivých zdrojů a čerstvých kontrol přístupu, bez obchodních dat v diagnostice. Z dnešních souhrnných časů nelze určit konkrétní pomalý dotaz ani bezpečně odůvodnit cache nebo změnu autorizace.

Níže jsou zachované dřívější průchody a podklady nasazení.

## Živá shoda detailu dubna po úpravě načítání, 9. 10. 2026

[Snímek z 13:26:24](./cashflow-server-pilot-live-inputs-month-match-2026-10-09.json) zachycuje odstranění předchozí diagnostiky a nový **`kind: month`, `status: match`** při otevřeném detailu **dubna 2026**. Klient tento stav zapisuje až po shodě celého otisku podkladů, otisku všech měsíčních položek a všech polí skutečně vráceného detailu. Detail tak prošel samostatně; klient současně vyžaduje úspěšně porovnaný přehled stejného modelu. Vazba na Týmové se zapnutou predikcí vychází z návazného pokynu obnovit přehled a z předchozího průchodu, ovládací prvky jsou modalem zakryté. Měsíc je viditelný v titulku modalu; parametry, Resource Timing a konkrétní deployment ID daného požadavku nejsou zachycené.

Porovnání trvalo **7 976,5 ms**, klientská reference **20,8 ms**. Server: autentizace 661,03 ms, podklady **5 767,78 ms**, hashování 336,7 ms, výpočet 1 003,42 ms, celkem 7 808,06 ms. Nejde o srovnání stejného detailového měsíce před a po změně; starší detailový průchod patřil lednu. Z tohoto vzorku se proto neodvozuje procento zrychlení stejného detailu ani čas celé stránky. Kontrola aliasu v 13:27:48 Europe/Prague potvrdila deployment `dpl_4Gr5EFeGA65BwwXat2hGRgm9HJ4z` bez čtení portfolia či změn produkce.

**Na aktuálním deploymentu jsou zaznamenané úspěšné průchody týmového přehledu s predikcí i detailu měsíce. Vlastní přehled bez predikce ještě čeká na samostatné živé ověření.** [Manifest](./cashflow-server-pilot-inputs-2026-10-09.json) odkazuje na oba průchody. Pilot nadále zobrazuje původní klientský výpočet a server porovnává na pozadí; přechod pouze na server a stabilní produkční zrychlení nejsou potvrzené. Neměnný patch a záznam nasazení zachovávají stav při nasazení. Evidence neukládá identitu, finanční částky, obchodní počty, portfolio, tokeny ani zdrojový obrázek.

Níže je zachovaná historie dřívějších měření a nasazení.

## Živá shoda Týmových s predikcí a první měření po sjednocení stránek, 9. 10. 2026

[Snímek z 13:14:43](./cashflow-server-pilot-live-inputs-prediction-match-2026-10-09.json) obsahuje nový **`kind: view`, `status: match`**. Viditelné jsou **Týmové, všechny produkty, zapnutá inteligentní predikce a prázdné hledání**. Podle návazného pokynu k vymazání diagnostiky a obnovení stránky prošla shoda celých podkladů, otisku všech měsíčních položek a všech polí přehledu. Samotné vymazání, tělo požadavku a Resource Timing snímek nezachycuje; vazba na scénář vychází z viditelných voleb a postupu. Časy se liší od předchozí verze. Kontrola aliasu v 13:17:01 Europe/Prague potvrdila deployment `dpl_4Gr5EFeGA65BwwXat2hGRgm9HJ4z`; konkrétní ID deploymentu daného požadavku snímek neobsahuje.

Porovnání trvalo **9 110 ms**, klientská reference **103,6 ms**. Server: autentizace 569,73 ms, podklady **6 577,42 ms**, hashování 329,23 ms, výpočet 1 201,09 ms, celkem 8 739,1 ms. Předchozí úspěšný [týmový průchod s predikcí z 11:55:58](./cashflow-server-pilot-live-scope-prediction-match-2026-10-09.json) trval 14 799,7 ms, z toho podklady 12 682,08 ms. V tomto porovnání dvou vzorků jsou podklady o **48,14 %** a celý porovnávací požadavek o **38,44 %** kratší. Nejde o opakované kontrolované měření; shoda portfolia mezi oběma časovými okamžiky, provozní podmínky a přímá příčina rozdílu nejsou samostatně ověřené. Čas celé stránky nebyl měřen.

**Týmový přehled s predikcí na aktuální verzi prošel; rychlejší vzorek je první pozorování, nikoli potvrzená stabilní rychlost.** Vlastní přehled a samostatná detailová odpověď měsíce na tomto deploymentu ještě čekají na živé ověření. Pilot dál zobrazuje původní klientský výpočet a server porovnává na pozadí. Přechod pouze na server není dokončený. [Manifest](./cashflow-server-pilot-inputs-2026-10-09.json) nově odkazuje na tento průchod; neměnný patch a záznam nasazení zachovávají stav při nasazení. Evidence neukládá identitu, finanční částky, portfolio, tokeny ani zdrojový obrázek.

Níže jsou zachované podklady nasazení a historie předchozích ověření.

## Nasazené sjednocení serverového stránkování podkladů, 9. 10. 2026

Živé průchody předchozí verze ukázaly, že načítání podkladů tvoří přibližně 80–87 % serverového času. Prohlížeč a cashflow API již používají společnou stránku 500 smluv, ale nezávislé serverové načítání žádalo pouze 100. Oprava mění pouze tento loader a jeho testy: používá existující `CASHFLOW_CONTRACTS_PAGE_SIZE`, aby nepotřeboval tolik opakovaných čerstvých autorizací a stránek nad stejným portfoliem. Autentizace, autorizace každého požadavku, úplnost kurzorů/počtů, pořadí, deduplikace podle vlastníka, celý otisk podkladů a výpočet zůstávají zachované. Žádná cache ani paralelní čtení navíc nejsou přidané.

Limit 50 požadavků a 20 sekund se nemění. Společná mez 5 000 načtených řádků smluv odpovídá dřívější horní mezi 50 × 100; započítávají se vlastní i týmové smlouvy a také duplicitní zdrojové řádky. Příliš velký deklarovaný počet se odmítá hned, neúplná data a odvolaný přístup na další stránce odmítají celý výsledek. Nevrací se částečné součty. Jde o zachování dřívější horní meze vstupů, nikoli o shodu všech dřívějších odmítnutí při nedostatku požadavků; menší počet stránek může nově dokončit některé úplné podklady v mezích.

[Samostatné srovnání skutečného původního a nového loaderu](../scripts/check-cashflow-input-pagination.mjs) používá výhradně syntetické autorizované handlery se zakázaným síťovým přístupem. Ve třech časových pásmech prošlo **42 portfolií a 378 úplných přehledů i všech jejich měsíčních položek**, včetně duplicit na hranicích stránek. Stejné jsou všechny vstupní hodnoty, pořadí, deduplikace, přehledy i detaily. Obě verze odmítly odvolaný přístup. Za celé srovnání se počet smluvních požadavků snížil z 270 na 102; syntetický příklad s 1 001 vlastními a 501 týmovými smlouvami potřebuje 5 stránek místo 17. **Skutečné zrychlení produkce z těchto syntetických počtů nelze určit.**

Prošlo **130 cílených testů**, **5 907 testů / 397 souborů izolovaného balíčku**, TypeScript a cílený ESLint pracovního i izolovaného projektu, produkční Webpack sestavení se syntetickou konfigurací a samostatný worker ve skutečném Chromu. Ověřený worker zachoval úplné otisky a Date hodnoty, filtr i první životní výplatu v prosinci 2026. Sestavení nečetlo `.env` ani produkční credentials. Bezpečnostní kontrola potvrdila zachování autorizace, odmítnutí cizího účtu a manipulovaných vstupů, odmítnutí odvolaného přístupu na dalších vlastních i týmových stránkách, limity a nulové přidané citlivé logování.

[Manifest](./cashflow-server-pilot-inputs-2026-10-09.json) a [neměnný patch](./cashflow-server-pilot-inputs-2026-10-09.patch), SHA-256 `e33856021372f1da90516923a39fbd00a88872a59e4533e49239cccfa727222a`, obsahují jednu runtime změnu a jeden testovací soubor. Příprava [izolovaného balíčku](../scripts/prepare-cashflow-inputs-release.mjs) ověřuje všech osm dřívějších patchů a 42 zdrojových otisků; všech 39 dříve sledovaných zdrojů je beze změny, nově jsou navíc sledované oba loaderové soubory a již existující společná konstanta stránky. Rozpracované kontakty a pomůcky jsou mimo balíček.

V **13:07 Europe/Prague** byl na `bohemka.app` přepnut ověřený deployment `dpl_4Gr5EFeGA65BwwXat2hGRgm9HJ4z`; [záznam nasazení](./cashflow-server-pilot-inputs-deployment-2026-10-09.json). Před přepnutím prošlo všech **51 otisků nahraných zdrojů a kontrol**, worker z nového hostingu ve skutečném Chromu a **20 HTTP/asset kontrol**. Po přepnutí prošlo dalších **20 kontrol přímo na bohemka.app**. Potvrzují přísnou CSP, ochranu stránek/API, odmítnutí neplatného tokenu a cizího Originu, zapnutou pilotní bránu a shodu tří souborů workeru. Aplikační runtime/build proměnné, šifrovací otisky, globální nastavení projektu, region a plánované úlohy zůstaly zachované. Produkční data a secrets se nezměnily.

**Čerstvá živá shoda a rychlost tohoto deploymentu ještě čekají na měření v přihlášeném prohlížeči.** Tři dříve úspěšné živé průchody patří předchozí ověřené verzi. Pilot zůstává omezený na jediný schválený účet, zobrazuje původní klientský výpočet a porovnává úplné výsledky na pozadí. Skutečné produkční zrychlení a přechod pouze na server nejsou potvrzené. Pro návrat zůstává předchozí ověřený deployment `dpl_C9KG2YyLHLyMa6FzFyu7Y1iHVomh` po kontrole živého aliasu, bez zásahu do databáze.

```sh
node scripts/prepare-cashflow-inputs-release.mjs
node scripts/check-cashflow-input-pagination.mjs /cesta/k/nemennym-zdrojum-predchozi-scope-verze
```

Níže je zachovaná historie předchozích živých ověření a nasazení.

# Cashflow — omezený pilot a měření, 12. 9. 2026

## Potvrzená živá shoda detailu měsíce, 9. 10. 2026

[Snímek z 12:02:25](./cashflow-server-pilot-live-scope-month-match-2026-10-09.json) zachycuje odstranění předchozí diagnostiky a nový **`kind: month`, `status: match`** při otevřeném detailu ledna 2026. Klient tento stav zapisuje až po shodě otisku podkladů, otisku všech měsíců i kanonické podoby skutečně vráceného detailu a všech jeho položek. Samostatná detailová odpověď tedy v tomto živém průchodu prošla. Měsíční klíč je viditelný v titulku modalu, samotná diagnostika jej neobsahuje. Filtr/predikce jsou modalem zakryté; vazba na týmový pohled se zapnutou predikcí vychází z předchozího úspěšného přehledu a návazného měřicího postupu, nikoli ze samostatně zachyceného těla požadavku.

Porovnání trvalo 10 273,5 ms, lokální reference 21,4 ms. Server: autentizace 459,43 ms, podklady 8 027,6 ms, hashování 320,63 ms, výpočet 1 243,01 ms, celkem 10 086,62 ms. Načítání podkladů zde tvoří přibližně 79,6 % serverového času. Toto měření nepotvrzuje zrychlení celé stránky; hlavní prostor ke zlepšení tohoto serverového průchodu je načítání podkladů.

Kontrola produkčního aliasu v 12:04:46 Europe/Prague potvrdila deployment `dpl_C9KG2YyLHLyMa6FzFyu7Y1iHVomh`. ID deploymentu konkrétního požadavku ve snímku není. [Aktuální manifest](./cashflow-server-pilot-scope-2026-10-09.json) odkazuje na tři dokončené živé průchody: vlastní přehled bez predikce, týmový přehled s predikcí a samostatný detail měsíce. Nejde o živé ověření všech kombinací filtrů. Široké syntetické regresní kontroly a úplná srovnání jsou uvedené v sekci nasazení.

**Tyto tři živé průchody prošly; přechod pouze na server a zrychlení stránky ještě nejsou dokončené.** Pilot dál zobrazuje původní klientský výpočet a server porovnává na pozadí. Při dalších úpravách načítání musí zůstat zachované autorizace, úplnost vstupů, čerstvost podkladů a úplná shoda výsledků. Produkční data ani runtime se tímto záznamem nemění. Evidence neobsahuje identitu, finanční částky, obchodní počty položek, portfolio, tokeny ani zdrojový obrázek. Neměnný patch a záznam nasazení zachovávají stav v okamžiku nasazení.

Níže uvedené sekce zachovávají předchozí stav živého ověřování.


## Potvrzená živá shoda Týmových se zapnutou predikcí, 9. 10. 2026

[Snímek z 11:55:58](./cashflow-server-pilot-live-scope-prediction-match-2026-10-09.json) zachycuje odstranění předchozí diagnostiky a nový **`kind: view`, `status: match`**. Viditelně jsou vybrané **Týmové, všechny produkty, prázdné hledání a zapnutá inteligentní predikce**. Nové časy se liší od předchozího vlastního pohledu. Podle návazného měřicího postupu tím prošel scénář, který dříve vracel `503 / resource_limit / output_estimate`. Shoda zahrnuje úplný otisk podkladů, otisk všech měsíčních položek a všechna pole přehledu. Parametry konkrétního požadavku a jeho Resource Timing nejsou ve snímku samostatně zachycené; vazba na filtr/predikci vychází z viditelných voleb, smazání diagnostiky a postupu.

Porovnání trvalo 14 799,7 ms, lokální reference 106,1 ms. Server: autentizace 529,98 ms, podklady 12 682,08 ms, hashování 325,78 ms, výpočet 1 028,39 ms, celkem 14 605,5 ms. Načítání podkladů tvoří přibližně 86,8 % serverového času; samotný výpočet přibližně jednu sekundu. Tento vzorek prokazuje správnost dokončeného porovnání, nikoli zrychlení celé stránky.

Kontrola aliasu v 11:58:00 Europe/Prague potvrdila deployment `dpl_C9KG2YyLHLyMa6FzFyu7Y1iHVomh`. ID deploymentu daného požadavku snímek neobsahuje. [Manifest](./cashflow-server-pilot-scope-2026-10-09.json) nově odkazuje na potvrzenou živou shodu vlastní verze bez predikce a týmové verze s predikcí. Neměnný patch ani nasazovací záznam se nepřepisují; jejich údaj o tehdy čekajícím živém ověření popisuje stav při nasazení. Identita, částky, portfolio, tokeny a zdrojový obrázek se do evidence neukládají.

**Samostatný detail měsíce na aktuálním deploymentu ještě čeká na živé ověření.** Plný přehledový hash zahrnuje všechny jeho položky, ale samotná detailová odpověď endpointu musí projít zvlášť. Detail patří čerstvému úspěšně porovnanému přehledu: při více než pěti minutách bez nového přehledu se jeho porovnání bezpečně odmítne. Před měřením staré karty je proto potřeba vytvořit nový týmový přehled přepnutím Vlastní → Týmové a počkat na nový `kind: view`, `status: match`. Pilot dál zobrazuje původní klientský výpočet. Přechod pouze na server ani zvýšení rychlosti nejsou dokončené.

Níže uvedené sekce zachovávají stav před tímto živým průchodem.


## Živá shoda Vlastních bez predikce po úpravě výběru, 9. 10. 2026

[Snímek z 11:50:31](./cashflow-server-pilot-live-scope-own-match-2026-10-09.json) obsahuje **`kind: view`, `status: match`**. Klient tento stav zveřejní po shodě úplného otisku podkladů, otisku všech měsíčních položek a všech polí přehledu. Na snímku jsou vybrané **Vlastní, všechny produkty, prázdné hledání a vypnutá predikce**. Následuje po pokynu vymazat diagnostiku a obnovit kartu. Přesné parametry požadavku ani nový Resource Timing ve snímku nejsou; vazba na filtr vychází z viditelných ovládacích prvků a návazného postupu. Tento vzorek neověřuje týmový pohled se zapnutou predikcí ani samostatný detail měsíce.

Porovnání trvalo 9 738,3 ms, lokální reference 106 ms. Server: autentizace 468,89 ms, podklady 7 896,57 ms, hashování 214,47 ms, výpočet 876,8 ms, celkem 9 480,87 ms. Tyto časy neprokazují zrychlení celé stránky. Následná kontrola aliasu v 11:52:55 Europe/Prague potvrdila aktuální deployment `dpl_C9KG2YyLHLyMa6FzFyu7Y1iHVomh`; ID deploymentu konkrétního požadavku snímek neobsahuje. Identita, finanční částky, portfolio, tokeny a zdrojový obrázek se do evidence neukládají.

**Týmová predikce a detail měsíce na aktuálním deploymentu stále čekají na živé ověření.** Pilot nadále zobrazuje původní klientský výpočet; úspěšný vzorek nepotvrzuje dokončení přechodu pouze na server. Neměnný patch a záznam nasazení zůstávají beze změny.


## Nasazené zpřesnění odhadu podle vybraného filtru, 9. 10. 2026

[Živý pokus z 11:04:57](./cashflow-server-pilot-live-after-reviews-output-estimate-2026-10-09.json) na poslední verzi opět skončil **HTTP 503, `resource_limit`, `output_estimate`** ještě před hashováním a výpočtem. Viditelně jsou vybrané Týmové, všechny produkty a zapnutá predikce. Následná kontrola aliasu v 11:12:43 Europe/Prague potvrdila deployment `dpl_GfQopwSRQEfweTAczSYXKySCpchN`; přesné ID deploymentu konkrétního požadavku ve snímku není. Předchozí oprava horní meze životních revizí sama živý problém nevyřešila. Klient dál zobrazuje původní přehled.

Kontrola zdrojů ukázala další příčinu zbytečných odmítnutí: odhad pro všechny pohledy zahrnoval celé vlastní portfolio, týmové řádky dvakrát a všechna předplatná/TIP výplaty. Skutečný `computeCashflow` však vybírá scope a produkty před generováním. Nasazený odhad proto počítá jen možné generované vlastní a manažerské cesty aktuálního výběru a odpovídající TIP/předplatné. Týmový řádek vlastněný prohlížejícím uživatelem se započítává i do vlastního pohledu; v kombinovaném pohledu se mohou započítat obě cesty. Odhad nadále počítá i neaktivní/duplicitní kandidáty a všechny části override jako horní mez. Bez výběru zůstává původní konzervativní chování pro starší volající.

**Všechny podklady se dál načítají, ověřují a hashují celé.** I smlouva vyřazená z generování musí projít kontrolou dat, doby trvání a vnořených polí. Dodatečný celkový limit zdrojových řádků brání nadměrnému hashování i při prázdném výběru. Vyhledávání a skrývání minulých let neovlivňují odhad před generováním. Limity 25 000 položek, 2 000 000 operací párování a vnořených struktur se nezvyšují, obchodní pravidla a výstup API se nemění a nic se nezkracuje.

Prošlo **169 cílených testů / 3 soubory**, TypeScript pracovního projektu a cílený ESLint. Izolovaná verze prošla **5 899 testy / 397 soubory**, TypeScriptem, ESLintem a produkčním Webpack sestavením pouze se syntetickou konfigurací. Nativní Chrome worker zachoval datum prosincové výplaty, všechny položky měsíců a jejich otisky. Test endpointu porovnává přehled i detail pro 300 týmových životních smluv se zapnutou predikcí a 1 000 vyřazenými vlastními smlouvami proti nezávislé původní referenci. Změna částky vyřazené smlouvy nadále vrací `different_inputs`; neplatná vyřazená smlouva, nadměrné vstupy a skutečně nadlimitní zvolený pohled jsou odmítnuté. Autentizace, autorizace, omezení pilotního účtu, rate limiting a minimalizace odpovědí mají zachované testy.

[Úplné srovnání](../scripts/check-cashflow-scope-budget.mjs) s neměnnou nasazenou verzí ověřilo **432 přehledů a všech měsíčních položek** ve třech časových pásmech a třech datech. Výsledky jsou beze změny; 72 dříve odmítnutých syntetických scénářů nově prošlo a 63 zůstalo odmítnutých. Zahrnuto je 36 životních predikcí se skutečně velkým vyřazeným vlastním portfoliem. Starší výchozí chování odhadu a vstupní data zůstala stejná.

[Manifest](./cashflow-server-pilot-scope-2026-10-09.json) a [neměnný patch](./cashflow-server-pilot-scope-2026-10-09.patch), SHA-256 `11941044ae7a352d72b48608c0567c1eea9bc440ab82de7f00ad2bbc0da26700`, zahrnují dva serverové runtime soubory a dva testovací soubory. Ostatních 35 povolených zdrojů a všechny obchodní výpočty jsou beze změny. [Místní příprava](../scripts/prepare-cashflow-scope-release.mjs) kontroluje celý řetězec předchozích patchů i všech 39 zdrojových otisků. Rozpracované kontakty a pomůcky jsou mimo izolovaný balíček.

V **11:44 Europe/Prague** byl přepnut ověřený deployment `dpl_C9KG2YyLHLyMa6FzFyu7Y1iHVomh`; [záznam nasazení](./cashflow-server-pilot-scope-deployment-2026-10-09.json). Před přepnutím prošlo **48 otisků nahraných zdrojů**, ověření skutečného hostingového workeru v Chromu a **20 HTTP/asset kontrol**. Po přepnutí prošlo dalších **20 kontrol přímo na bohemka.app**. Chrání přístup ke stránkám a API, odmítají neplatný token i cizí Origin, kontrolují přísnou CSP, zapnutou pilotní bránu a shodu tří souborů workeru. Šifrovací otisky, názvy aplikačních runtime/build proměnných, globální nastavení projektu, region a plánované úlohy jsou zachované. Neproběhl zápis do produkčních dat, změna secrets ani rozšíření pilotu. Návrat je možný na předchozí ověřený deployment `dpl_GfQopwSRQEfweTAczSYXKySCpchN` po kontrole živého aliasu.

**Živá shoda predikce ani detailu na nové verzi není potvrzená.** Skutečný vybraný pohled může být dál nad limitem. Není tím prokázané zrychlení stránky ani dokončený přechod pouze na server.


## Nasazená oprava odhadu životních revizí při predikci, 9. 10. 2026

[Čerstvý živý pokus z 09:36:51](./cashflow-server-pilot-live-prediction-output-estimate-2026-10-09.json) zachycuje zapnutou predikci, přepnutí Vlastní → Týmové a jeden nový požadavek. Server vrací **HTTP 503, `resource_limit`, `output_estimate`** ještě před výpočtem modelu. Původní klientský přehled se nadále zobrazuje; tento vzorek neprokazuje chybnou částku ani shodu predikce. Porovnání trvalo 11 207,5 ms, klientská reference 52 ms, serverové podklady 8 373,43 ms. Identita, částky, portfolio a zdrojový snímek nejsou v záznamu uložené.

Předchozí odhad přidával paušálně 100 predikovaných položek na každého životního kandidáta. Nasazená oprava odvozuje konzervativní horní mez z existujících vzorců a desetiletého horizontu: NEON 42, FLEXI 25, MAXIMA 27, Pillow 22. U starých záznamů bez společného klíče se mez násobí počtem možných jednotlivých kandidátů. Pillow nadále používá původní chování s ponechaným souhrnným řádkem; obchodní výpočet se nemění. Test při vývoji právě tento řádek odhalil a odhad byl opraven před finálním ověřením.

Mění se **jeden serverový runtime soubor**, tři testovací soubory a místní ověřovací pomůcky. Limity 25 000 výstupních položek, 2 000 000 operací párování, vnořených řádků, částí provizí a historických výplat zůstávají stejné. Žádné podklady se nezkracují. Autentizace, autorizace k vlastním/týmovým podkladům, rate limit, ověřování úplné shody a návrat na původní klientský přehled zůstávají zachované. Pilot se nerozšiřuje na další účty.

Ověření prošlo: **5 914 testů / 402 souborů** pracovního projektu; **5 886 testů / 397 souborů** izolovaného balíčku; TypeScript a cílený ESLint obou verzí; **27 200 scénářů horní meze revizí** přes všechny kariérní pozice a oba provizní režimy. Endpoint nad syntetickými 200 týmovými životními smlouvami s predikcí vrací kompletní výsledek shodný s nezávislou původní referencí. Příliš velké portfolio dál vrací omezenou chybu bez částečných součtů. Existující testy odmítnutí nepřihlášeného/cizího účtu a manipulovaných vstupů prošly.

[Samostatné porovnání](../scripts/check-cashflow-reviews-budget.mjs) proti neměnným zdrojům posledního nasazení ověřilo **432 úplných přehledů a všech jejich měsíčních položek** ve třech pásmech, na hranici roku a změně letního času. Výsledky jsou totožné. Nově prošlo 63 syntetických scénářů; 99 zůstalo nad limitem. Odhad bez predikce a všechny podklady zůstaly stejné. Produkční Webpack sestavení izolované verze prošlo včetně kontrol obrazového runtime, bezpečnostní konfigurace a autentizačního proxy; použilo pouze syntetickou konfiguraci, žádné produkční credentials ani `.env` soubory.

[Manifest](./cashflow-server-pilot-reviews-2026-10-09.json) a [neměnný patch](./cashflow-server-pilot-reviews-2026-10-09.patch), SHA-256 `1fee315f5704456db0e37da8025ef5ec845ebba17a31519b2a420239a2fb76c3`, obsahují pouze čtyři povolené změněné zdroje proti předchozí verzi; všech dalších 35 zdrojů je beze změny. [Příprava izolovaného balíčku](../scripts/prepare-cashflow-reviews-release.mjs) kontroluje celý řetězec šesti předchozích patchů, tento patch, povolené cesty a všech 39 otisků. Rozpracované kontakty a pomůcky nejsou součástí balíčku.

Vercel nejprve odmítal přístup odpovědí `403 forbidden`; po obnovení přihlášení uživatelem prošlo ověření účtu, projektového týmu i aktuálního aliasu. Tento původní problém nebyl odmítnutím automatické schvalovací kontroly. V **10:58 Europe/Prague** byl přepnut ověřený deployment `dpl_GfQopwSRQEfweTAczSYXKySCpchN`; [záznam nasazení](./cashflow-server-pilot-reviews-deployment-2026-10-09.json).

Před přepnutím prošlo všech **48 otisků nahraných zdrojů**, Worker stažený z nového hostingu ve skutečném Chromu na syntetických datech a **20 HTTP/asset kontrol**. Po přepnutí prošlo dalších **20 kontrol přímo na bohemka.app**. Zahrnují přísnou CSP, chráněné stránky/API, odmítnutí neplatného tokenu a cizího Originu, zapnutou pilotní bránu i přesnou shodu tří souborů Workeru. Šifrovací otisky, globální nastavení projektu, region a plánované úlohy zůstaly zachované. Kontrola před přepnutím odhalila chybějící `USE_RUST_LAYER_LATEST` v metadatech runtime i buildu. Tato proměnná není v konfiguraci projektu a nemá odkaz v aplikaci ani nainstalovaném CLI; její hostingový původ je závěr z těchto kontrol. Tento přesný rozdíl je v záznamu evidovaný zvlášť, nebyl ručně nastavován a kontrola všech ostatních aplikačních proměnných zůstala přísná. Není tím potvrzená shoda interního runtime Vercelu; všechny kontrolované běžící stránky a chráněné endpointy na novém runtime prošly. Produkční data a secrets se nezměnily. První místní pokus o nahrání se zastavil před odesláním kvůli chybějícímu propojení izolovaného adresáře s projektem; následná příprava doplnila pouze identifikátory projektu a běžné nahrání prošlo.

**Živá shoda zapnuté predikce a detailu měsíce na této nové verzi ještě čeká na běžný přihlášený prohlížeč.** Předchozí 503 patří předchozímu deploymentu. Nadlimitní skutečné portfolio může být nadále odmítnuté; žádná data se nekrátí. Pilot dál zobrazuje původní klientský výpočet a server porovnává na pozadí. Tato oprava sama neprokazuje zrychlení stránky ani dokončení přechodu pouze na server. Pro návrat je připraven předchozí ověřený deployment `dpl_HFViReVeKpL9p84M1Ztb8AxS8va7` po kontrole živého aliasu, bez zásahu do databáze.

```sh
node scripts/prepare-cashflow-reviews-release.mjs
node scripts/check-cashflow-reviews-budget.mjs /cesta/k/nemennym-zdrojum-predchozi-context-verze
```

Níže uvedené sekce zachovávají historický stav jednotlivých ověření a nasazení.

## Čerstvá živá porovnání filtrů a průchod po čekání, 9. 10. 2026

[Minimalizovaný vzorek z 09:01:46](./cashflow-server-pilot-live-team-match-2026-10-09.json) po odstranění starého diagnostického výsledku a obnovení compare režimu na `bohemka.app` obsahuje **`kind: view`, `status: match`**. Na snímku je vybraný filtr **Týmové** a všechny produkty. Shoda zahrnuje otisk podkladů, úplný otisk měsíců/položek a všechna pole přehledu. Přesné parametry požadavku ve výpisu nejsou; vazba na filtr vychází z viditelné volby a postupu měření.

[Následný snímek Vlastní z 09:02:34](./cashflow-server-pilot-live-own-unconfirmed-2026-10-09.json) opakuje totožné diagnostické časy týmového vzorku a sám neprokazuje nové porovnání Vlastních smluv. Na dalším snímku z 09:05:45 už je původní diagnostika odstraněná a její přečtení vrací `null`.

[Navazující textový výpis pro Vlastní](./cashflow-server-pilot-live-own-match-2026-10-09.json) obsahuje nové **`kind: view`, `status: match`**, režim `compare` a šest záznamů požadavků na přehled. Nové časy se liší od týmového vzorku a výsledek vznikl po odstranění původního záznamu. Vlastní filtr je tím ověřený podle návazného postupu měření; samostatné parametry konkrétního požadavku ve výpisu opět nejsou. Porovnání trvalo 12 570,4 ms, klientská reference 34,8 ms, poslední požadavek v Resource Timing 12 525 ms. Server: autentizace 2 248,03 ms, podklady 9 018,69 ms, hashování 259,97 ms, výpočet 803,59 ms, celkem 12 374,94 ms. Diagnostika připravené stránky v tomto výpisu chybí; nelze z něj určit celkový čas načtení stránky ani přesnou příčinu předchozího `null`.

Porovnání trvalo 9 629,3 ms, samotná klientská reference 26,5 ms. Serverové fáze: autentizace 540,57 ms, podklady 7 900,73 ms, hashování 215,2 ms, výpočet 682,23 ms, celkem 9 366,09 ms. Načítání podkladů tvoří přibližně 84,35 % serverového času. Referenční čas nezahrnuje prvotní načtení podkladů ani ověřování na pozadí; vzorek neprokazuje zrychlení celé stránky.

Jde o tři dokončená živá porovnání včetně níže uvedeného průchodu po čekání. **Predikce a měsíční detail ještě čekají na živé ověření.** Dosavadní nečistý výpis po ponechání karty přes noc neprokazoval nové měření opravy. Z nových vzorků nelze samostatně určit přesnou nasazenou verzi: očekávaná verze je `dpl_HFViReVeKpL9p84M1Ztb8AxS8va7`, poslední ověřený alias pochází z 8. 10. v 20:08:36 Europe/Prague. Aktuální hostingová metadata se při ranní kontrole nepodařilo znovu získat. Manifest a neměnný záznam nasazení proto zůstávají beze změny.

[Snímek navazujícího pokusu z 09:25:26](./cashflow-server-pilot-live-idle-unconfirmed-2026-10-09.json) ukazuje Týmové, odstranění diagnostiky a následné `null`. Samotné pořadí změny filtru ani nové požadavky po smazání ve snímku zachycené nejsou. Tento snímek sám nepotvrzuje obnovu starého kontextu; příčina `null` z něj není určená.

[Následný snímek z 09:32:36](./cashflow-server-pilot-live-idle-match-2026-10-09.json) už zachycuje dokončený konzolový průchod: předtím Týmové, požadovaný a aktuální filtr Vlastní, **jeden nový požadavek po začátku skriptu a `kind: view`, `status: match`**. Skript nejprve odstranil předchozí diagnostiku. Čekání trvalo 12 818 ms, nové porovnání 12 649,8 ms, klientská reference 76,3 ms a délka nového požadavku 12 604 ms. Server: autentizace 1 594,14 ms, podklady 8 992,93 ms, hashování 303,33 ms, výpočet 897,45 ms, celkem 11 858,08 ms. Shoda opět zahrnuje podklady, všechny měsíce/položky a celý přehled.

Tento průchod po čekání podle zadaného postupu prošel. Časy snímků jsou od sebe vzdálené 7 minut 10 sekund, po odečtení čekání skriptu přibližně 6 minut 57 sekund. Výpis nezachycuje přesné referenční `asOf`, celou dobu nečinnosti ani identifikátor instance stránky; samostatně tedy nedokazuje přepsání konkrétního starého času nebo absenci mezilehlého obnovení stránky. Jeho přímým důkazem je nové úspěšné porovnání při zachyceném přepnutí Týmové → Vlastní, vazba na čekání vychází z návazného postupu. Zrychlení stránky tento vzorek nepotvrzuje.

Pro další pokus je připravený [jeden konzolový příkaz](../scripts/cashflow-pilot-scope-console.js). Spouští se ručním vložením celého obsahu do konzole připravené cashflow stránky v režimu `compare`. Smaže pouze diagnostický záznam, klikne na opačný vlastní/týmový filtr a čeká na nové dokončení nejvýše 30 sekund. Vypisuje volbu před/po přepnutí, bezpečnou diagnostiku a pouze délky nových požadavků na přehled. Neobnovuje stránku, nemění režim, nezískává token a neobchází autentizaci. Po dobu čekání se filtry ručně nepřepínají. Samotný skript neprokazuje délku nečinnosti před spuštěním; při měření obnovy kontextu musí předcházet šest minut bez změny filtrů a obnovení stránky.

Přibyl [integrační test skutečných tlačítek stránky](../src/app/cashflow/page.pilot-filter.test.tsx), který používá skutečný hook, pilotní adaptér a model nad syntetickými daty. Ověřuje nové porovnání po odstranění diagnostiky při opakovaném přepnutí Týmové/Vlastní, odeslaný filtr a zastavení porovnávání po výslovném přepnutí karty do režimu `baseline`. Načítání podkladů, přihlášení a síť jsou nahrazené syntetickými testovacími implementacemi; tento test sám neověřuje živou autorizaci endpointu.

Při prvním rozšíření testů prošlo **203 testů / 5 souborů**: nový průchod stránkou, hook, klientský adaptér, diagnostika a endpoint přehledu. Prošel také TypeScript projektu, cílený ESLint, kontrola whitespace a parsování/minimalizace tří tehdejších diagnostických záznamů. Testy následně rozšířil přímo celý konzolový skript: oba směry přepnutí, zachování diagnostiky při odmítnutí režimu `baseline` a absence identity/portfolia/tokenů ve výpisu. Tyto kontroly doplňují ověření posledního nasazení; nejsou novým produkčním sestavením.

Finální navazující běh po přidání konzolového skriptu prošel: **205 testů / 5 souborů**, TypeScript projektu, ESLint obou nových souborů, whitespace a parsování/minimalizace všech čtyř dnešních diagnostických záznamů. První pokus o načtení skriptu přes `import.meta.url` selhal v testovacím prostředí s HTTP schématem; harness nyní čte výslovnou cestu od kořene projektu. Tento neúspěšný pokus se nezapočítává mezi úspěšné kontroly. Produkční zdroje a neměnná nasazovací evidence se nezměnily.

Záznamy neobsahují identitu, finanční částky, portfolio ani tokeny. Zdrojové obrázky se do repozitáře neukládají. Nebyl změněn runtime aplikace, konfigurace ani databáze. Níže uvedené sekce zachovávají stav v čase jednotlivých nasazení.

## Obnova kontextu po přepnutí filtru, 8. 10. 2026

V 20:08 Europe/Prague byla nasazena oprava `stale_context`, `dpl_HFViReVeKpL9p84M1Ztb8AxS8va7`; [záznam nasazení](./cashflow-server-pilot-context-deployment-2026-10-08.json), [manifest](./cashflow-server-pilot-context-2026-10-08.json) a [neměnný patch](./cashflow-server-pilot-context-2026-10-08.patch).

[Minimalizovaný živý vzorek z 19:41:45](./cashflow-server-pilot-live-stale-context-2026-10-08.json) ukázal HTTP 409 při volbě Vlastní. Server odmítl starý čas ještě před načtením smluv; vzorek neprokazuje rozdíl částek. Přehled dříve uchovával jeden čas po celou životnost datové sady. Po více než pěti minutách posílal další filtr stále tento starý čas.

Nově se při dalším výpočtu starý worker zruší a vytvoří nový model s aktuálním časem. Přehled, úplný hash a serverový požadavek používají stejný kontext. Čerstvé filtry dál sdílejí worker a cache; rezerva 35 sekund zahrnuje lokální výpočet a původní 25sekundový limit porovnání. Změna dne, posun hodin nebo časového pásma vyvolá nový model. Po návratu z uspání se před odesláním znovu kontroluje čerstvost. Staré odpovědi po změně filtru či identity nemohou zveřejnit výsledek. Pětiminutová kontrola na serveru se nezměnila.

Detail náleží zobrazenému přehledu. Pokud se otevře až po vypršení jeho kontextu, zůstane původní detail a jeho porovnání je označeno jako nedostupné. Nový filtr nebo obnovení stránky vytvoří čerstvý přehled. Čas starého výsledku se nepřepisuje bez přepočtu.

Prošlo **233 cílených testů / 6 souborů**, **5 904 testů / 401 souborů** pracovního projektu a **5 880 testů / 397 souborů** izolované verze, TypeScript obou verzí, ESLint, kontrola patchů, produkční Webpack build a skutečný Chrome worker. [Srovnávací skript](../scripts/check-cashflow-context-refresh.mjs) ověřil všechny přehledové atributy a všechny měsíce/položky ve **324 scénářích**, třech pásmech a třech datech. Dalších **54 scénářů** reprodukovalo odmítnutí původního klienta po šesti minutách a potvrdilo shodu nové verze s čerstvým referenčním výpočtem, včetně půlnoci a přechodu roku. Integrace skutečného endpointu pokrývá všech devět kombinací filtrů po nečinnosti. Podklady ani pravidla provizí se nezměnily.

Změna obsahuje dva runtime a tři testovací soubory; 34 ostatních souborů předchozí verze je beze změny. Nasazena je izolovaná verze 39 povolených souborů. Před přepnutím prošlo 48 otisků nahraných zdrojů, nový hosting worker ve skutečném Chromu a 20 kontrol HTTP/assetů. Po přepnutí prošlo dalších 20 kontrol. Autentizace, serverový seznam jednoho pilotního účtu, MFA, rate limiting, ochrana dat a limity zdrojů jsou zachovány. Produkční portfolio nebylo načteno pro testování; nevznikl databázový zápis ani změna secrets nebo plánovaných úloh.

**Živá shoda na této nové verzi zatím čeká na běžný přihlášený prohlížeč.** Předchozí potvrzená shoda jedné kombinace patří předchozímu nasazení; nezahrnuje tento opravený scénář. Pilot dál zobrazuje původní klientský výpočet a server porovnává na pozadí. Přechod pouze na server a zrychlení nejsou dokončené.

## První potvrzená živá shoda, 8. 10. 2026

[Minimalizovaný vzorek z 19:36:48](./cashflow-server-pilot-live-match-2026-10-08.json) z běžného přihlášeného prohlížeče na `bohemka.app` obsahuje **`kind: view`, `status: match`**. Server dokončil výpočet. Klient tento stav zapisuje až po ověření stejného otisku podkladů, otisku všech měsíců/položek a shody všech polí přehledu. Jde o potvrzení jednoho skutečného zobrazení; jiné kombinace filtrů, predikce, historie a samostatný detailový endpoint ještě nebyly živě ověřené. Parametry požadavku ani čas připraveného snímku stránky nebyly součástí výpisu.

Kontrola hostingových metadat v 19:38:29 Europe/Prague potvrdila, že doména stále míří na `dpl_8AjqjnDAF9stkqm5v3GBrtzXWLzb` s otiskem posledního schedule patche. Samotný diagnostický výpis identifikátor deploymentu neobsahuje; propojení vychází z domény, časového sledu a následné kontroly aliasu. Neměnný patch a záznam nasazení se nezměnily. Níže uvedené historické sekce popisují stav v době jednotlivých nasazení, kdy živá shoda ještě potvrzená nebyla.

| Měření | Čas |
| --- | ---: |
| Celé klientské porovnání na pozadí | 12 089,7 ms |
| Původní klientská reference | 63,4 ms |
| Serverová autentizace | 512,08 ms |
| Načtení podkladů | 9 089,47 ms |
| Serverové hashování | 412,97 ms |
| Serverový výpočet | 1 619,85 ms |
| Server celkem | 11 666,38 ms |

Načtení podkladů tvořilo přibližně **78 % serverového času**. Čas reference nezahrnuje původní načtení podkladů ani následné porovnání; nelze jej zaměňovat za čas celé stránky nebo z těchto hodnot odvozovat zrychlení. Pilot stále zobrazuje původní cashflow a porovnává server na pozadí. Tento vzorek potvrzuje správnost aktuálního výsledku, nikoli dokončení migrace nebo výkon při opakovaných/souběžných požadavcích.

Pro dokončení živé části pilotu zbývá ověřit vlastní/týmové a produktové filtry, predikci, historii a měsíční detail. Další technické měření má rozlišit náklady jednotlivých autorizovaných zdrojů při načítání; případná optimalizace musí zachovat úplné podklady, oprávnění, omezení zátěže a shodu výsledků. Záznam obsahuje výhradně stav a agregované časy, bez identity, částek, portfolia, tokenů a obrázku. Tato aktualizace mění pouze dokumentaci a stav evidence; nepřidává runtime změnu ani nové nasazení.

## Odhad podle skutečných výplatních kalendářů, 8. 10. 2026

V 19:27 Europe/Prague byl na `bohemka.app` nasazen `dpl_8AjqjnDAF9stkqm5v3GBrtzXWLzb`; [záznam nasazení](./cashflow-server-pilot-schedule-deployment-2026-10-08.json), [manifest](./cashflow-server-pilot-schedule-2026-10-08.json) a [neměnný patch](./cashflow-server-pilot-schedule-2026-10-08.patch). Změna zahrnuje dva runtime soubory a tři testovací soubory. Izolovaná verze obsahuje 39 povolených zdrojů; 34 souborů předchozí verze včetně provizního výpočtu a jeho helperů se nezměnilo.

[Minimalizovaný živý vzorek z 18:59:03](./cashflow-server-pilot-live-output-estimate-2026-10-08.json) potvrdil `resourceLimit: output_estimate`, HTTP 503. Požadavek trval 8 921,4 ms; serverové fáze: autentizace 470,61 ms, podklady 7 885,1 ms, celkem 8 364,65 ms. Výpočet ani hashování nezačaly. Záznam neobsahuje identitu, částky ani portfolio.

Původní odhad násobil každou provizní složku měsíci celého historického a budoucího období. Nový odhad používá horní hranice konkrétních generátorů: roční platby, skutečnou frekvenci plateb a pevné životní kalendáře. U agregovaných auto/majetkových provizí se složky zbytečně nenásobí počtem plateb. Neprověřené produkty zachovávají původní konzervativní odhad. Dodatečné životní revize se započítávají při zapnuté predikci podle stejné validované volby, kterou používá model. Týmové smlouvy mají nadále rezervu pro vlastní i manažerskou cestu. Všechny skutečné výplaty se započítávají samostatně. Uložená přiřazení výplat mají nově omezenou délku a započítává se jejich kvadratická práce.

**Limity 25 000 odhadovaných položek, 2 000 000 jednotek párování a 10 000 vnořených řádků se nezvýšily. Výsledky se nekrátí.** Pravidla provizí, data výplat, autorizace, MFA a rate limiting se nezměnily. Zobrazené cashflow stále poskytuje původní klientský výpočet a server se porovnává na pozadí; pilot zůstává na jednom uživatelem určeném účtu. Databáze, secrets, plánované úlohy a globální nastavení zůstaly stejné.

Prošlo **169 cílených testů / 4 soubory**, **5 884 testů / 401 souborů** pracovního projektu a **5 860 testů / 397 souborů** izolované verze, TypeScript obou verzí, ESLint, whitespace, produkční Webpack build a skutečný lokální Chrome worker. Horní hranice ověřuje **3 780 scénářů skutečného generátoru všech 35 produktů**, včetně historických dat, frekvencí, 128 provizních složek, storna a převodů. Další případy pokrývají přestupný rok, konce horizontu a 500 samostatných skutečných výplat. **272 scénářů životních revizí** ověřuje všechny kariérní pozice, režimy a vlastní/manažerskou cestu. [Srovnávací skript](../scripts/check-cashflow-schedule-budget.mjs) porovnal všechny přehledové atributy a všechny měsíce/položky s neměnnou nasazenou verzí v **324 scénářích**, třech pásmech a třech datech; 153 scénářů odhad nově povolil, 90 nadále odmítl. Původní a nové výsledky i vstupy se shodovaly.

Před přepnutím bylo z nahraného archivu bez extrakce ověřeno **48 otisků zdrojů** (39 povolených zdrojů a 9 původních ochranných/nesouvisejících souborů). Hosting worker prošel skutečným Chromem v novém profilu. Před i po přepnutí prošlo **20 kontrol HTTP/assetů**, ochranné proxy, CSP a shoda šifrovací konfigurace. Produkční podklady nebyly pro tyto kontroly načteny.

**Shoda na skutečném portfoliu zatím není potvrzená.** Je potřeba čerstvý výsledek z běžné přihlášené karty. Správně má skončit `status: match`; při dalším odmítnutí se postup řídí konkrétním pevným kódem. Toto nasazení samo neprokazuje zrychlení a nedokončuje přechod na výpočet pouze na serveru. Návrat umožňuje předchozí ověřené nasazení bez změn databáze.

## Přesnější diagnostika limitu, 8. 10. 2026

V 18:55 Europe/Prague byl na `bohemka.app` nasazen `dpl_F54a6Nhm9L5ykEAxcH4WGTEyGCis`; [záznam nasazení](./cashflow-server-pilot-resource-deployment-2026-10-08.json), [manifest](./cashflow-server-pilot-resource-2026-10-08.json) a [neměnný patch](./cashflow-server-pilot-resource-2026-10-08.patch). Jde o čtyři runtime soubory a tři testy nad předchozí ověřenou verzí. Izolovaná verze obsahuje 38 povolených zdrojů, ostatních 31 z předchozího manifestu se nezměnilo.

[Minimalizovaný živý vzorek](./cashflow-server-pilot-live-resource-2026-10-08.json) z 18:27:49 ukazuje stránku `ready` v 7 003,2 ms, porovnání `unavailable`, HTTP 503 a `reason: resource_limit`. Požadavek trval 10 217,6 ms; serverové fáze: autentizace 507,84 ms, podklady 9 448,79 ms, celkem 9 992,01 ms. Neobsahuje fázi hashování ani výpočtu. Loader i předvýpočtové ochrany vracely stejný obecný kód, takže nelze určit konkrétní ochranu z času či tohoto snímku. Ze sledu endpointu lze usuzovat na průchod úvodním kalendářovým a přístupovým ověřením; není to potvrzení shody výpočtu ani měření zrychlení.

Nové pole **`resourceLimit`** rozlišuje pouze pevné kódy `input_requests`, `source_rows`, `output_estimate`, `payout_matching`, `nested_rows`, `entry_shape`, `date_range`, `duration`, `reference_time`. `entry_shape` zahrnuje neplatný tvar i překročení velikosti jednotlivého vnořeného pole. Server neposílá konkrétní smlouvu, datum, odmítnutou hodnotu, identitu ani částku. Klient přijímá výhradně povolený kód u chyby `resource_limit`; jiné zprávy a hodnoty zahazuje. Pole vzniká až za stávající serverovou autentizací a povoleným účtem. Bez přihlášení ani pro nepovolený účet není diagnostika dostupná.

**Tato změna doplňuje diagnostiku; neodstraňuje dosud nevysvětlené odmítnutí skutečného portfolia.** Rozpočty, jejich pořadí, autorizace, rate limiting i plné ověření vstupů/všech měsíců zůstávají zachované. Původní klientský výpočet se nadále zobrazuje ihned a server se porovnává na pozadí. Nejde o přechod na výpočet pouze na serveru. Nebyla použita produkční data, měněna databáze, secrets, globální nastavení časového pásma ani plánované úlohy.

Prošlo **235 cílených testů / 6 souborů**, **5 829 testů / 400 souborů** pracovního projektu a **5 805 testů / 396 souborů** izolované verze. Samostatný [srovnávací skript](../scripts/check-cashflow-resource-budget.mjs) ověřil **1 404 identických původních/nových rozhodnutí rozpočtu** nad syntetickými běžnými, hraničními a neplatnými daty ve třech pásmech a třech datech; ověřuje původní soubor pomocí SHA-256. Všechny vstupy zůstaly nezměněné. Prošel TypeScript obou verzí, ESLint, whitespace, izolovaný Webpack build, kontrola ochranného proxy a lokální skutečný Chrome worker. Před přepnutím byly z nahraného archivu bez extrakce ověřeny **47 otisky zdrojů**, žádný soubor credentials, skutečný hosting worker v novém profilu Chromu, produkční ochrany a shoda šifrovací konfigurace. Před i po přepnutí prošlo **20 kontrol HTTP/assetů**. Runtime povolení zůstává omezené na jeden již určený účet; jeho hodnota nebyla dešifrována ani čtena zpět z hostingu.

Další krok vyžaduje čerstvý diagnostický výsledek z běžného přihlášeného prohlížeče s novým `resourceLimit`. Konkrétní příčina a shoda serverového výpočtu na skutečném portfoliu zůstávají neověřené. Limity se nemají zvyšovat bez znalosti příčiny a ověření výpočetní zátěže.

## Porovnání na pozadí po živém timeoutu, 8. 10. 2026

V 18:03 Europe/Prague byl `bohemka.app` přepnut na ověřený deployment `dpl_AUvCUemis7RaTdd5eG7ew4frQaYx`; [záznam nasazení](./cashflow-server-pilot-background-deployment-2026-10-08.json), [manifest](./cashflow-server-pilot-background-2026-10-08.json) a [neměnný patch](./cashflow-server-pilot-background-2026-10-08.patch). Změnil se jediný runtime soubor klientského adaptéru a tři související testy. Balíček nadále obsahuje 37 povolených zdrojů; výpočet provizí, časový kalendář, serverové načítání a ochrany API se nezměnily. Následující historické sekce popisují stav při jejich nasazení.

[Nový minimalizovaný živý vzorek](./cashflow-server-pilot-live-timeout-2026-10-08.json) z 17:15:40 ukázal `unavailable`, `reason: timeout`, klientský požadavek 8 060,6 ms a referenci 70,6 ms. Smlouvy byly připravené v 7 350,9 ms, přehled v 15 505,1 ms a snímek stránky v 15 515,6 ms od společného počátku. Předchozí adaptér po dokončení reference čekal na porovnání. Limit klienta byl 8 sekund, zatímco existující loader má na podklady 20 sekund. Živý vzorek neobsahoval HTTP status ani serverové fáze, takže nelze určit čekání na token oproti serveru, dokončení serverového modelu ani výsledek jeho kontroly pásma. Není potvrzením shody ani produkčního zrychlení.

**Aktuální režim `compare` zobrazí původní výpočet ihned po jeho dokončení; celý serverový výsledek ověřuje na pozadí.** Serverové hodnoty se do stránky z tohoto pilotu nepřepínají. Porovnání začíná v dalším úkolu až po vyřízení původní reference, včetně hashování a získání tokenu. Má celkový limit 25 sekund od tohoto začátku, včetně ověření, tokenu, požadavku a čtení odpovědi. Serverový limit 20 sekund a ostatní bezpečnostní rozpočty se nezvýšily. Nové `timeoutPhase` obsahuje pouze jedno z `verification | token | request | response`; při dostupných hlavičkách zůstávají zachované jen povolené časy serverových fází a HTTP status. Diagnostika neobsahuje token, účet, částky, portfolio ani upstream chyby.

Přehled musí odpovídat úplným podkladům, otisku všech měsíců/položek a všem polím reference. Detail se porovnává až po úspěšně ověřeném přehledu a opět vyžaduje úplnou shodu. Změna filtrů, dat nebo účtu, další detail a dispose ruší předchozí úlohu; opožděný token, hash či odpověď nemohou zapsat starou diagnostiku ani zrušit novou ověřenou volbu. Chyba původního výpočtu zůstává chybou. Žádný serverový požadavek se automaticky neopakuje. Pilot stále vyžaduje původní referenci a načtení jejích podkladů; tato etapa není úplným přechodem na serverové cashflow.

Prošlo **155 cílených testů ve čtyřech souborech**, **5 810 testů / 400 souborů** celého pracovního stromu a **5 786 testů / 396 souborů** izolované verze, TypeScript, cílený ESLint a whitespace. Testy prokazují okamžité vrácení reference před hashováním/autentizací, úspěšnou odpověď po 9 sekundách, omezení všech čtyř zaseknutých fází, zachování původního přehledu i detailu při zaseknuté autentizaci v reálném React hooku, ignorování opožděné odpovědi při změně filtrů a potlačení zrušených detailů. Integrační test reálného klienta, modelu a endpointu nadále odhaluje změnu podkladů. Jeho čekání na diagnostiku bylo upraveno na asynchronní dokončení; dřívější neúspěšný/přerušený běh se nepočítá mezi úspěšné kontroly. Dříve doložených 1 296 porovnání pásem a 320 kontrol kalendáře se tato změna nedotkla; jsou doložené manifestem předchozí opravy a shodou nezměněných zdrojů.

Izolované produkční sestavení přes Webpack s čistě syntetickou konfigurací prošlo včetně obrazového runtime, bezpečnostní konfigurace a autentizačního proxy. Nativní Chrome ověřil sestavený Worker i Worker stažený z hostingu na syntetických datech, oba otisky, všech pět měsíčních detailů, `Date`, filtr a první prosincovou výplatu. První místní běh dokončil funkční kontroly, ale úklid vlastního profilu Chrome narazil na přechodné `ENOTEMPTY`; kontrolní helper dostal omezené opakování úklidu a následující úplný běh prošel. Nahraný archiv byl ověřen proudově bez extrakce: **46 kontrolních součtů** souhlasilo a nebyly nalezené credential soubory. **20 kontrol před přepnutím a 20 přímo na produkci** prošlo včetně CSP, chráněných stránek/API, neplatného tokenu, cizího Originu a přesné shody tří souborů Workeru.

Zůstává jediný výslovně určený účet, výchozí vypnutý režim a opt-in `compare` v kartě. Konfigurace aplikace, globální `TZ`, šifrovací otisky, produkční secrets, plánované úlohy i obchodní data zůstaly zachované. Přesná adresa byla odeslaná runtime konfigurací a není v záznamech; nebyla dešifrovaná ani získaná zpětným čtením. Kontroly nasazení nečetly živé portfolio. Před reloadem se vymažou obě předchozí diagnostiky a na nový souhrn se počká **30 sekund po načtení cashflow**. Teprve `match` z běžné přihlášené relace potvrdí shodu skutečného portfolia. Další neshoda nebo překročení rozpočtu mohou pilot znovu odmítnout. Pro návrat je dostupná předchozí ověřená verze `dpl_51QAhxPtrtHzXzximaqK2vM87z2v` po kontrole aktuálního aliasu, bez databázového zásahu.

```sh
node scripts/prepare-cashflow-background-release.mjs
# V adresáři work vypsaném skriptem:
node node_modules/vitest/vitest.mjs run --maxWorkers=4
```

## Oprava časového pásma serverového pilotu, 8. 10. 2026

V 17:10 Europe/Prague byl na `bohemka.app` přepnut ověřený deployment `dpl_51QAhxPtrtHzXzximaqK2vM87z2v`; [záznam nasazení](./cashflow-server-pilot-timezone-deployment-2026-10-08.json). Nahrazuje aktivovaný pilot `dpl_HS5LZ1LzRHAwZruGwxMubPqe779w`. [Manifest](./cashflow-server-pilot-timezone-2026-10-08.json) a [neměnný patch](./cashflow-server-pilot-timezone-2026-10-08.patch) obsahují 17 změněných/přidaných souborů proti předchozímu pilotu, celkem 37 povolených zdrojů proti původnímu produkčnímu commitu. Rozpracované kontakty a pomůcky nebyly nasazeny. Historické záznamy dalších etap níže popisují jejich tehdejší stav.

Serverový model nyní používá ověřené IANA pásmo prohlížeče pouze pro daný výpočet. Kontext se váže na jeho data přes `WeakMap`; nemění globální `TZ`, nativní `Date`, zdrojový snapshot ani kontext souběžného uživatele. Kalendářní konstrukce a lokální settery respektují tento kontext. Skutečné časové okamžiky a UTC serializace zůstávají zachovány. Pětiminutová čerstvost i hranice místního dne se kontrolují ve stejném pásmu. Neplatné/nepodporované pásmo se nadále odmítá; rozdíl proti pásmu serveru sám o sobě již není důvodem `time_zone`.

Přibyla jediná přesně připnutá závislost `@date-fns/tz@1.5.0`, bez dalších tranzitivních balíčků; její implementace se nenachází v klientských chunkech. Porovnání odhalilo odlišnou volbu okamžiku při opakované hodině po konci letního času. Adaptér nyní zachovává volbu dřívějšího výskytu stejně jako původní nativní `Date`, včetně lokálních setterů; skutečný vstup s explicitním pozdějším offsetem se neposouvá. Nejednoznačné nepodporované starší textové datum se nepřevádí odhadem podle serveru: pilot bezpečně použije původní výpočet.

Ve finálních bězích prošlo **5 799 testů / 400 souborů** pracovního stromu a **5 775 testů / 396 souborů** izolované verze, TypeScript, cílený ESLint, whitespace a produkční Webpack sestavení včetně kontrol obrazového runtime, bezpečnostní konfigurace a autentizačního proxy. Samostatné procesy původního modelu v `Europe/Prague`, `UTC`, `America/New_York` a `Pacific/Kiritimati` poskytly reference pro **1 296 úplných porovnání** a **320 kontrol kalendáře**. Porovnávaly se shodné podklady, celé přehledy i všechny měsíční položky, včetně ISO/CZ dat, půlnoci, přestupného roku, přechodů měsíců/let a změn letního času. Testovací loader zachovává jednu instanci modulu jako skutečná aplikace; první běh s opakovaným vytvářením modulu byl opraven v harnessu a nepočítá se jako úspěšné ověření.

V každém ze tří nativních pásem `UTC`, `Europe/Prague`, `America/New_York` znovu prošlo původních **1 120 scénářů generátoru** a **45 úplných porovnání portfolia**. V každém pásmu zůstalo jen 64 dříve povolených rozdílů první životní provize. Sjednání 8. 10. s počátkem 1. 12. nadále očekává první výplatu 25. 12.; sjednání 28. 11. s týmž počátkem 25. 1. Ostatní produkty, následné provize a skutečně uhrazené okamžiky chrání původní porovnání.

Hostingový archiv byl stažen a kontrolován proudově bez extrakce: všech **46 otisků** (37 zdrojů a 9 nezměněných kontrol základu) souhlasilo a nebyly nalezeny credential soubory. Worker se svými dvěma skutečnými hostingovými chunky prošel v izolovaném nativním Chrome na syntetických datech: oba otisky, všech pět měsíčních detailů, obnovené `Date`, filtr a prosincová první výplata. **20 kontrol před přepnutím a 20 přímo na produkci** prošlo, včetně CSP, odmítnutí nepřihlášeného přístupu, neplatného tokenu, cizího Originu a přesné shody všech tří souborů Workeru.

Pilot zůstává omezený na jediný dříve určený účet a výslovný `compare` v kartě. Autentizace, MFA, oprávnění zdrojů, rate limit, bezpečnostní rozpočty, ověření úplných výsledků i návrat na původní výpočet zůstávají zachovány. Kontroly cizího účtu a manipulovaných vstupů prošly v testech; nasazovací kontroly nečetly živé portfolio. Globální nastavení projektu, plánované úlohy, šifrovací otisky ani produkční secrets se nezměnily. Přesná adresa byla odeslána v autorizovaném runtime požadavku a neukládá se do záznamů; její hodnotu hosting zpětně neposkytuje a nebyla dešifrována.

**Shoda na skutečném portfoliu a zrychlení stránky stále čekají na nový běžný přihlášený pokus.** Před reloadem se odstraní oba `cashflow_*_last_result` klíče uvedené níže, aby výsledek nebyl zaměněn za starý pokus s 409. Při překročení rozpočtu, neúplných podkladech nebo rozdílných výsledcích zůstává původní cashflow. Pro návrat lze po kontrole aktuální domény přepnout na předchozí ověřený deployment `dpl_HS5LZ1LzRHAwZruGwxMubPqe779w`; nevyžaduje databázový zásah.

```sh
node scripts/prepare-cashflow-timezone-release.mjs
# V adresáři work vypsaném skriptem, po instalaci uzamčených závislostí:
node scripts/check-cashflow-timezones.mjs ../pre-timezone
node scripts/check-cashflow-server-pilot.mjs ../base
```

## Navazující serverový přehled a detail měsíce, 8. 10. 2026

Nasazená verze nově obsahuje read-only `POST /api/cashflow/view`. Serverový pilot je nyní povolený pro jeden uživatelem určený účet a nadále vyžaduje zapnutí režimu `compare` v jeho kartě. Po ověření přihlášení a serverového seznamu účtů znovu načte podklady přes existující autorizované handlery s čerstvým kontextem oprávnění. Požadavek `kind: view` vrací měsíční součty, počty položek a souhrn hledané smlouvy; `kind: month` vrací pouze jeden vybraný měsíc. Citlivé podklady, číslo hledané smlouvy ani otisky se nevkládají do URL nebo logů. Odpovědi mají `private, no-store` a `Server-Timing`.

Pilot vyžaduje všechny tři volby: `NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED=1` při sestavení, `CASHFLOW_SERVER_PILOT_ENABLED=1` na serveru a neprázdný seznam účtů v `CASHFLOW_SERVER_PILOT_EMAILS`. Navíc musí konkrétní karta výslovně aktivovat režim `compare` podle postupu níže; samotný veřejný přepínač cestu ostatních účtů nezmění. Výchozí stav je vypnuto. Seznam skutečných účtů patří do nastavení prostředí, nikoli do repozitáře. Pilot nevyžaduje zapnutí ukládání kandidátů ani sledování obchodních zápisů a žádné obchodní záznamy nemění. Zastupování jiného účtu je odmítnuto; dosavadní výpočet zůstává použitelný.

Prohlížeč v této etapě nadále načítá původní podklady a počítá referenci ve Workeru, i u malého portfolia. Worker má samostatný požadavek `verify`, který vrací pouze SHA-256 otisky zdrojů a všech výsledných měsíců včetně jednotlivých položek. Serverový přehled se použije pouze při shodě podkladů, všech měsíčních položek a celého přehledu. Detail se znovu autorizuje a přepočítá se stejným datem a filtry; nesmí se lišit od přehledu ani od původního detailu. Neshoda, chyba, odmítnutí, timeout nebo neplatná odpověď vrátí původní výsledek. Chyba původního výpočtu zůstává chybou, nevytváří nulové cashflow. Změna účtu, dat, filtrů nebo vypnutí klienta ruší platnost opožděných odpovědí.

`sessionStorage.cashflow_server_pilot_last_result` obsahuje pouze druh požadavku, stav `match | mismatch | unavailable`, dobu referenčního výpočtu, dobu následného ověření a serverové časové fáze. Při návratu na původní výpočet navíc obsahuje známý diagnostický důvod a případně HTTP status. Neobsahuje identitu, otisky, filtry, částky ani portfolio; neznámé texty serveru se neukládají. `requestMs` zahrnuje také přípravu otisků/porovnání; není to čas samotné sítě ani celé načtené stránky. Pilot přidává práci a sám zatím nezkracuje načítání podkladů.

Současné bezpečnostní meze načítání a odhadu práce se zachovávají. Neúplná historie výpisů, nedokončený import, příliš velké portfolio, nepodporované pásmo/datum nebo kontext starší pěti minut způsobí návrat na dosavadní výpočet. Serverový přehled nyní používá explicitní kalendář prohlížeče podle opravy výše. Změnu globálního časového pásma produkce pilot neprovádí. Nedochází k perzistenci ani sdílení výsledků mezi návštěvami; přímé zápisy mimo aplikační sledování a použitelnost dlouhodobé cache zůstávají předmětem další etapy.

Regresní porovnání používá zmrazené původní callbacky stránky a syntetická data pro vlastní/týmové provize, Auto/Život/TIP, historii, hledání, predikci a výpisy. Porovnává všechna pole přehledu a všech měsíčních detailů, včetně obnovy `Date` po přenosu. Samostatné testy ověřují autentizaci, cizí účet, manipulaci rolí/vstupů, neúplné podklady, změny dat, timeout, zrušení a fallback. Skutečná pojišťovna, živá data a produkční zrychlení tím nejsou ověřené; nasazení má samostatné kontroly níže.

Závěrečné ověření této etapy: `npm test` **5 742 / 5 742 testů ve 398 souborech**, `tsc --noEmit --incremental false`, cílený ESLint a `git diff --check` prošly. Izolované produkční sestavení Next 16.3.6 přes Webpack, kontrola obrazového runtime a kontrola registrace autentizačního proxy prošly se syntetickou konfigurací, bez `.env` a Firebase Admin přístupů. Headless Chrome skutečně spustil sestavený Worker, ověřil shodu obou otisků a všech pěti měsíčních detailů syntetického NEONu, zachování `Date`, filtr a prosincovou první výplatu při sjednání 8. 10. a počátku 1. 12. Kontrolní součty jedenácti aplikačních zdrojů odpovídaly sestavené verzi; kontrola vzorů privátních klíčů a skutečných API credentials nic nenašla.

## Příprava izolovaného pilotu a měření stránky, 8. 10. 2026

Read-only kontrola hostingu před nasazením potvrdila deployment `dpl_5BeURqXKuQqRXXyW4FF4vca8cdTg` s GitHub zdrojem `bc49666275a0262be284f0007bdbc3886be3822d`, shodným s místním výchozím commitem. [Manifest](./cashflow-server-pilot-release-2026-10-08.json) a [patch](./cashflow-server-pilot-release-2026-10-08.patch) zahrnují pouze 24 cashflow zdrojů/testů a související kontrolu autentizace. Rozpracované kontakty, dokumenty a ostatní pomůcky nejsou jejich součástí. Konfigurace plánovače, oprávnění a šifrování pochází beze změny z produkčního základu. Nová produkční verze pochází z CLI archivu tohoto commitu s přesným patchem; nelze ji identifikovat jako nový Git commit ani jako nasazení celého pracovního stromu. Před dalším nasazením je nutné aktuální deployment a tento záznam znovu ověřit.

První autorizované nasazení 8. 10. 2026 v 14:05 Europe/Prague přepnulo `bohemka.app` na deployment `dpl_B38yvf39Uj5WVANGTc5RsUqVyrWQ`; [záznam nasazení](./cashflow-server-pilot-deployment-2026-10-08.json). Nová verze byla nejprve sestavena bez přepnutí domény. V děleném zdrojovém archivu odpovídalo všech 24 souborů patche a 11 kontrolních souborů původního základu. Produkční bezpečnostní konfigurace, otisky šifrovacích klíčů, region Frankfurt, plánované úlohy a globální nastavení sestavení se nezměnily. Pro tuto verzi byl použit stejný Webpack build jako při lokálním ověření.

Všech 20 HTTP kontrol před přepnutím domény i 20 přímo na produkci prošlo: veřejné stránky se striktní CSP, odmítnutí nepřihlášeného přístupu na chráněné stránky/API, neplatného tokenu a cizího Originu, vypnutý nový endpoint a shoda tří souborů skutečného Workeru s verzí ověřenou v Chrome. Hosting přiřadil jiné identifikátory chunků než lokální build; samotný lokální URL proto vracel 404. Skutečný hostingový Worker byl ověřen se svými dvěma načítanými chunky na syntetických datech, včetně otisků všech pěti měsíců, obnovených `Date`, filtru a prosincové výplaty. První samostatný pokus bez těchto chunků nebyl úspěšný a není započtený mezi prošlé kontroly.

První nasazení obsahovalo `NEXT_PUBLIC_CASHFLOW_SERVER_PILOT_ENABLED=1` a explicitně `CASHFLOW_SERVER_PILOT_ENABLED=0`. Bez volby v kartě zůstala původní klientská cesta. Běžné cashflow již obsahovalo změnu predikce první životní provize, serverový pilot tehdy ještě neběžel. V této etapě nebyl nastaven nový pilotní účet, změněny produkční secrets ani zapisována obchodní data. Tato ověřená vypnutá verze je dostupná pro případný návrat; následná aktivace je popsaná níže.

### Aktivace pro jeden účet, 8. 10. 2026

Na výslovnou žádost uživatele byl připraven a v 15:46 Europe/Prague nasazen deployment `dpl_HS5LZ1LzRHAwZruGwxMubPqe779w`; [záznam aktivace](./cashflow-server-pilot-activation-2026-10-08.json). Runtime konfigurace byla odeslána se zapnutým přepínačem a jedinou přesnou adresou určenou uživatelem. Adresa zůstává v serverové konfiguraci a není součástí repozitáře ani tohoto záznamu. Klientský build obsahuje stejný veřejný přepínač jako předchozí verze; aktuální karta musí výslovně nastavit `compare`. Samotné přihlášení na povoleném účtu nezapíná porovnání.

Zdrojový archiv má stejné identifikátory obou neměnných částí jako předchozí archiv, v němž bylo ověřeno 35 kontrolních součtů. Žádný aplikační zdroj se nezměnil. Všechny tři soubory Workeru přímo na nové verzi i na produkční doméně mají shodné otisky s předchozí verzí otestovanou v nativním Chrome. Před aktivací prošlo 122 cílených unit testů ve třech souborech, včetně cizího účtu, manipulovaných rolí/vstupů a fallbacku. Všech 20 HTTP kontrol před přepnutím i všech 20 na produkci prošlo; nový zapnutý endpoint vrací nepřihlášenému uživateli a neplatnému tokenu generickou 401. Přihlášení, MFA, zdrojová oprávnění ani rate limit se nevypínají.

Kopie prvního sestavení nepřevzala explicitní Webpack příkaz, a proto nebyla přepnuta na produkci. Použitá verze dostala stejný příkaz explicitně. API pro CLI stažení hodnot prostředí vyžaduje stav `INITIALIZING`; u již sestavované/hotové verze neposkytlo zpětné čtení. Hodnota povolené adresy nebyla dešifrována ani získávána jinou cestou. Podkladem je přesný autorizovaný konfigurační požadavek, dostupná metadata a skutečné ověření zapnutého endpointu. Vynucené sestavení přidalo dva automatické klíče hostingu `TURBO_FORCE` a `NX_SKIP_NX_CACHE`; ostatní aplikační konfigurační klíče, globální nastavení sestavení, region a plánované úlohy se nezměnily. Produkční bezpečnostní konfigurace a otisky šifrovacích klíčů odpovídají předchozí ověřené verzi.

Při aktivaci přihlášené porovnání na živých datech ani přínos pro výkon ještě nebyly ověřené. Vyžadují běžnou prohlížečovou relaci povoleného účtu. Při jiné časové zóně, překročení bezpečnostního rozpočtu nebo neshodě podkladů zůstává použitý původní výpočet. Globální `TZ` se neměnil. Vrácení domény na předchozí ověřený deployment `dpl_B38yvf39Uj5WVANGTc5RsUqVyrWQ` pilot opět vypne bez databázových změn.

### První živý pokus o porovnání, 8. 10. 2026 v 16:23 Europe/Prague

Uživatel poskytl snímek dobrovolné diagnostiky z `bohemka.app/cashflow` v běžné přihlášené relaci. [Minimalizovaný záznam](./cashflow-server-pilot-live-check-2026-10-08.json) obsahuje pouze stavy, známý důvod odmítnutí a doby jednotlivých fází; neobsahuje účet, částky, portfolio ani obrázek. Stránka dosáhla `ready` v režimu `compare`, ale serverové porovnání skončilo `unavailable`, HTTP 409, `reason: time_zone`. Endpoint tento důvod vrací po ověření povoleného účtu a vstupu, před načtením portfolia. Serverový model v tomto pokusu neběžel a stránka použila původní klientský výsledek. Nejde o potvrzení shody ani správnosti částek; konkrétní názvy pásma serveru a prohlížeče nejsou součástí diagnostiky.

Do připravenosti smluv uběhlo 7 626,5 ms a do připraveného snímku stránky 8 342,9 ms od společného počátku měření komponenty. Referenční výpočet trval přibližně 61,4 ms; odmítnutý serverový požadavek včetně ověření 618,2 ms. Časy fází stránky jsou kumulativní milníky, ne samostatné síťové doby. Jde o jediný vzorek v `compare`, bez spárovaného `baseline`; neprokazuje zrychlení, cenu ani reprezentativní výkon.

Následná kontrola zopakovala 122 cílených testů ve třech souborech v procesu `TZ=UTC`; všechny prošly včetně odmítnutí cizího pásma a návratu na původní výsledek. Samostatné procesy `Europe/Prague` a `UTC` dostaly úplně stejné serializované syntetické podklady 12 smluv a stejné `asOf`. Otisky podkladů byly shodné. Ve všech devíti filtrech se shodoval přehled, ale celé měsíční položky se shodovaly jen v jednom filtru (TIP). U ostatních osmi se lišily. Kontrolu pásma proto nelze jednoduše odstranit; shodné součty nestačí. Pokus s `worker_threads` navíc v rodiči `UTC` a prostředí Workeru `TZ=Europe/Prague` stále vracel nativní pásmo `UTC`; samotná změna prostředí threadu není doložené řešení.

Další serverový pokus vyžaduje výpočet s explicitním časovým pásmem platným pouze pro daný model, ověřený proti původnímu prohlížeči včetně přechodů měsíců, let a letního času. V této diagnostické etapě se aplikační kód, nasazení, konfigurace prostředí ani obchodní data nezměnily. Serverová shoda na živém portfoliu a přínos pro výkon zůstávají neověřené.

```sh
node scripts/prepare-cashflow-server-pilot-release.mjs
# V adresáři work, který skript vypíše:
node scripts/check-cashflow-server-pilot.mjs ../base
node node_modules/vitest/vitest.mjs run --maxWorkers=4
```

Příprava kontroluje otisky patche a všech souborů, archivuje přesný commit a přidá jen uvedený patch. Nečte `.env`, nepřipojuje databázi, nenasazuje web a neinstaluje balíčky. Opakovaná příprava nevytváří checkout ani změny Git indexu. Porovnávací skript používá syntetická data a původní generátor ze skutečného produkčního commitu. Kontroluje 1 120 scénářů napříč produkty, frekvencemi, daty sjednání a skutečnými výplatami; povoluje pouze změnu první životní provize a jejího souvisejícího původního data/ID. Uhrazené datum, částka, následující provize i ostatní produkty se musí shodovat. Dále porovnává všechny měsíční položky pro pět velikostí portfolia a devět filtrů se zmrazenými původními callbacky stránky. Tyto callbacky nadále sdílejí obchodní pomocné funkce; nejde o nezávislou implementaci pojistných pravidel.

Pro měření dosavadní stránky se v příslušné kartě nastaví:

```js
sessionStorage.setItem("cashflow_server_pilot_mode", "baseline");
location.reload();
```

Pro zapnutí porovnání na povoleném vlastním účtu:

```js
sessionStorage.setItem("cashflow_server_pilot_mode", "compare");
location.reload();
```

`baseline` zachovává současný synchronní/Worker režim podle původního přepínače a velikosti portfolia; nový serverový endpoint nevolá. `compare` vyžaduje Worker referenci i u malých portfolií. Aktivace v kartě nikdy nenahrazuje serverový seznam účtů, přihlášení, MFA ani kontrolu oprávnění. Vypnutí: odstranit `cashflow_server_pilot_mode` a znovu otevřít stránku. Nedostupné úložiště znamená výchozí vypnutý režim. Pro změnu bez reloadu existuje událost `cashflow:pilot-mode`, ale první srovnávací vzorky mají používat reload.

```js
JSON.parse(sessionStorage.getItem("cashflow_page_last_result") || "null");
JSON.parse(sessionStorage.getItem("cashflow_server_pilot_last_result") || "null");
```

Nový souhrn stránky obsahuje režim, `ready | error`, `frameReadyMs` a dostupné milníky `profileReadyMs`, `contractsReadyMs`, `statementsReadyMs`, `overviewReadyMs`. Všechny časy jsou od prvního commitu komponenty v daném účtu/režimu, zahrnují čekání na přihlášení/profil a mají společný monotónní počátek. Nesmí se sčítat jako délky fází. `frameReadyMs` čeká na vyřízení výpisů, aktuální přehled a dva animační snímky po jeho commitu; nejde o navigation timing, LCP, INP ani důkaz fyzického vykreslení. Každý účet/režim poskytne jeden počáteční vzorek; filtry nejsou dalšími page-load vzorky. Skrytá karta vzorek zneplatní. Změna účtu/režimu, nové čekání a unmount ruší opožděné animační callbacky už při commitu. Žádné identity, filtry, částky ani chybové texty se do souhrnu nevkládají.

Oba režimy je potřeba porovnávat se stejnými daty, filtry, prohlížečem, časem a stavem cache; střídání pořadí a více vzorků omezuje vliv zahřáté cache. Souhrn zatím nerozlišuje její zásah. Úspěšný lokální výpočet ani `match` neprokazují zrychlení produkce. Známý `time_zone`, `resource_limit`, `incomplete_inputs`, `different_inputs` nebo `verification` znamená použití původního výpočtu, nikoli úspěšný serverový pilot. Samostatné načtení každého detailu stále načítá a přepočítá celé portfolio.

Výpočet s 1 000 syntetickými smlouvami vytváří přes 25 tisíc zobrazených položek a přibližně 30 MB kanonického JSON. Překračuje současný limit 16 MiB pro otisk. Měsíční položky stále odpovídají původnímu výpočtu, ale serverové ověření není dostupné; limity se proto nezvyšují. Také některá menší portfolia mohou přesáhnout konzervativní odhad serverové práce. Rozšíření musí vycházet z měření skutečného povoleného portfolia a odděleného návrhu ochrany výpočtu. Region Frankfurt sám není důkazem časového pásma Node procesu; jeho shodu je potřeba ověřit při živém požadavku. Globální `TZ` produkce se nemění.

Závěrečné kontroly: izolovaný balíček **5 753 testů / 395 souborů**, pracovní strom **5 777 testů / 399 souborů**, TypeScript, ESLint všech 24 uvedených souborů a přípravného skriptu, kontrola whitespace a shoda všech 24 zdrojových otisků prošly. Ve všech třech pásmech `UTC`, `Europe/Prague`, `America/New_York` prošlo 1 120 porovnání generátoru a 45 úplných porovnání portfolia/měsíčních položek. Přípustných rozdílů první životní provize bylo v každém pásmu 64; nejde o 64 různých obchodních pravidel. Samostatné route testy pokrývají přechody letního času, přestupný rok, půlnoc, validní cizí pásmo a odmítnutí 300/1 000 smluv bez částečných součtů. Úspěšné běhy původní limity testů ani očekávání neupravovaly.

Izolované produkční sestavení přes Webpack prošlo včetně obrazového runtime, produkční bezpečnostní konfigurace a registrace autentizačního proxy. Použilo jen syntetické klíče a veřejnou Firebase konfiguraci, bez `.env` a Firebase Admin přístupů. Headless Chrome následně spustil právě tento sestavený Worker a ověřil oba otisky, obnovené `Date`, pět úplných měsíčních detailů, filtr a prosincovou výplatu NEONu. Kontrola přidaných řádků nezachytila vzory soukromých klíčů nebo skutečných API credentials. Krátká bezpečnostní kontrola zahrnula vlastní/cizí účet, manipulaci rolí a vstupů, MFA, minimalizaci odpovědí a absenci citlivých hodnot v nové diagnostice. Živý pilot a přínos pro produkční výkon zatím ověřené nejsou; povolený účet byl určen při následné aktivaci výše.

První izolovaný testovací balíček vynechal existující `web-scheduler.json`; přípravný skript jej následně doplnil ze stejného produkčního základu. Při souběžných plných sadách a později přerušeném místním běhu nastaly timeouty testu/vytvoření workerů. Finální oddělené běhy prošly bez změny časových limitů nebo očekávání. Tyto první běhy nejsou započtené jako úspěšné ověření.

## Původní pilot z 12. 9. 2026

Navazuje na [ukládání diagnostických výsledků](./cashflow-server-candidates-2026-09-12.md). Přibyl samostatný kontrolní požadavek, měření jednotlivých částí a opakovatelný lokální pilot se smyšlenými daty. **Uživatelské cashflow nadále používá současný výpočet. Nasazení ani změna prostředí skutečného webu v této etapě neproběhly.**

## Samostatné kontrolní čtení

Pětiminutová platnost kandidáta, přesný `asOfMs` a limit jednoho porovnání za pět minut prakticky znemožňovaly ověřit opakované použití při dalším běžném pokusu. Prohlížeč proto po úspěšném `match` a `candidate: verified` provede právě jeden další `POST /api/cashflow/candidate-check`. Použije totožné serializované tělo, čas, filtry a otisky; znovu získá autentizační token.

Kontrolní endpoint vyžaduje stejné aktivované přepínače a seznam účtů jako ukládání. Má vlastní limit jednoho pokusu za pět minut. Ověří vlastní přihlášený účet, zachytí revizi před čtením oprávnění a čerstvě ověří profil, typ účtu, nastavení/MFA, předplatné a smluvní přístup. Vlastník cashflow předplatného potřebuje také aktuální administrátorskou roli `owner`. Revize načteného kandidáta musí odpovídat revizi před kontrolou oprávnění. Pro čtení se nepoužije lokální cache týmu ani předplatného.

Výsledek obsahuje pouze `match`, `mismatch`, `miss` nebo `skipped`, případné booleovské shody a známý důvod přeskočení. Neobsahuje částky, klienty ani samotné otisky. Při nenalezení, neúplnosti nebo chybě se na této diagnostické cestě nespouští náhradní přepočet. Prohlížeč chybu kontrolního požadavku izoluje, neopakuje jej a zachová výsledek původního porovnání. Opuštění stránky, skrytí karty, změna účtu či zastarání kontextu zabraňují následné práci a uložení opožděné diagnostiky.

## Co znamenají naměřené časy

Oba endpointy vracejí hlavičku `Server-Timing` s časy založenými na monotónních hodinách: `cashflow_total`, `cashflow_auth`, `cashflow_inputs`, `cashflow_compute`, `cashflow_hash`, `cashflow_storage` podle skutečně provedených fází. Opakované úseky stejné fáze se sčítají.

Fáze `inputs` původního porovnání zahrnuje také autorizaci vnitřních handlerů. Kontrolní endpoint naproti tomu čerstvá oprávnění započítává do `auth`. Celkový první požadavek navíc obsahuje publikování a ověřovací načtení. **Rozdíl celkových časů těchto dvou požadavků není přímo zrychlením stránky.**

V aktivní pilotní relaci se poslední souhrn uloží do `sessionStorage.cashflow_shadow_last_result`. Obsahuje jen verzi, povolené stavy/důvody a číselné doby požadavků a serverových fází. Chybí účty, otisky, filtry, částky i původní odpověď. Zápis je dobrovolný a selhání úložiště prohlížeče se ignoruje. Klientský `requestMs` zahrnuje získání tokenu, přenos a zpracování JSON; u původního porovnání také případné jedno obnovení tokenu po 401. Nezahrnuje klientské hashování, čekání 1,5 sekundy před diagnostikou ani vykreslení stránky.

```js
JSON.parse(sessionStorage.getItem("cashflow_shadow_last_result") || "null")
```

## Opakovatelný lokální pilot

```sh
npm run cashflow:pilot
```

Vyžaduje Java 21+ a Firebase CLI stejně jako databázové testy. Spustí pouze Firestore emulátor na `127.0.0.1:8180` s odděleným projektem `demo-bohemika-cashflow-pilot`. Výsledný JSON je v `/tmp/bohemika-cashflow-pilot.json`. Samotný skript odmítne běh bez přesného lokálního endpointu, nečte `.env`, neimportuje aplikační `firebaseAdmin` a nepřijímá jiný projekt.

Scénáře obsahují 12, 60 a 132 smyšlených smluv, vlastní a týmové provize, TIP výplaty a skutečně formátované souhrny výpisů. Všechny vyhovují současnému konzervativnímu limitu diagnostiky; „velký“ zde označuje větší testovací scénář, nikoli ověření největších skutečných portfolií. Revize se zachytává před čtením podkladů. Pilot porovnává nejméně pětkrát všechna výstupní pole pomocí otisků, testuje změnu částky i data, rozpracovaný import se dvěma dávkami, opravu a ruční obnovu. Každý běh má výhradní zámek a uklidí své zdroje, výsledky i evidenci změn v demo projektu.

Měření srovnává čtení syntetické kolekce plus sdílený výpočet a sestavení měsíců s načtením a rekonstrukcí kandidáta. **Nezahrnuje produkční stránkování/API, autentizaci, vzdálenou síť ani prohlížeč.** První výpočet běží po vložení dat v tomtéž procesu; není to start studeného serveru. Otisky se kontrolují mimo časované vzorky. Při pěti vzorcích odpovídá nejbližší pořadová hodnota p95 nejpomalejšímu vzorku; nejde o statistický odhad produkční p95.

Pilot odhalil dvě opravené hraniční situace: měsíční klíče mohou být `2026-9` i `2026-09` a obě podoby se musí zachovat; dávka osmi částí po 512 KiB přesáhla limit zprávy místního emulátoru po přidání metadat. Nyní dávka obsahuje nejvýše sedm částí, tedy 3,5 MiB dat s rezervou na celou zprávu. Regrese měří skutečně zakódovanou protobuf zprávu z Firestore SDK a emulátor ověřuje výsledek větší než 4 MiB.

## Naměřený výsledek

Úspěšný běh 12. 9. 2026 v 10:11 Europe/Prague, pět opakování na scénář; [úplný souhrnný JSON](./cashflow-pilot-results-2026-09-12.json). Následují mediány:

| Smlouvy | Podklady + výpočet + měsíce | Čtení a obnova kandidáta | JSON vstupů | JSON výsledku |
| ---: | ---: | ---: | ---: | ---: |
| 12 | 8,76 ms | 32,20 ms | 7 429 B | 593 583 B |
| 60 | 12,17 ms | 85,21 ms | 30 761 B | 2 936 437 B |
| 132 | 19,73 ms | 164,32 ms | 65 815 B | 6 456 915 B |

Všech 15 opakovaných porovnání souhlasilo. Ve všech třech scénářích prošla kontrola probíhající změny, zneplatnění po dokončení, změny částky/data, přepočtu, částečného selhání dvou dávek, opravy před obnovou a shody po obnově.

**Tento lokální experiment zrychlení neprokázal.** Rozvinutý výsledek s predikcemi a měsíčními položkami je výrazně větší než původní podklady; u většího scénáře přibližně 98krát. Jeho přenos a opakovaná validace mají měřitelné náklady. Nejde ovšem o důkaz stejného poměru na produkci: skutečné API provádí další autorizaci, větvení a stránkování a síť má jinou latenci. Z výsledku nevyplývá oprávnění zapnout uložené částky pro uživatele.

Samostatný experiment bez databáze ukázal, že gzip úrovně 1 zmenšil stejné syntetické výsledky přibližně na 5 % původních bajtů; u 132 smluv na 320 828 B při mediánu komprese/dekomprese 4,78/2,19 ms. Parsování a validace však zůstaly významným nákladem. Komprese v úložišti není v této etapě implementovaná; uvedená čísla nejsou časy aktuálního kontrolního endpointu ani odhad produkčního zrychlení.

## Závěrečné kontroly

- `npm test`: **1 760 / 1 760 testů ve 186 souborech**.
- `npm run test:rules`: **245 / 245 testů ve 4 souborech**, včetně vícečástového výsledku většího než 4 MiB na lokálním emulátoru.
- `npm run cashflow:pilot`: všechny tři scénáře, 15 porovnání výsledků a ověření změn/obnovy prošly. První běh před opravou dávky byl ukončen po opakovaném překročení velikosti zprávy; tabulka pochází z úplného následného úspěšného běhu.
- TypeScript, ESLint dotčených souborů, syntax checks skriptů a `git diff --check`: prošly.
- Produkční `next build --webpack`, kontrola obrazového runtime a registrace autentizačního proxy: prošly. Generování sitemap použilo dosavadní záložní větev kvůli nedostupnému DNS Firestore v místním prostředí.

Pro lokální emulátor bylo povoleno otevření místního portu mimo sandbox. Žádný test ani pilot nepoužil živé dokumenty a žádná verze aplikace nebyla nasazená.

## Pilot na skutečném webu

Následná kontrola hostingu ověřila jako původní produkční základ commit `f96e3c0606028f9eee48c32b70c7e7225b2fc5d0`, který tuto diagnostiku ještě neobsahoval. Z tohoto základu byla připravena a samostatně ověřena [menší verze pouze pro porovnání výpočtu](./cashflow-shadow-only-release-2026-09-12.md), bez ukládání kandidátů a sledování obchodních zápisů. Má vlastní patch a manifest; nelze ji zaměňovat za nasazení celého současného pracovního stromu. Prošla 1 413 testy a produkčním sestavením a po výslovném schválení byla 12. 9. 2026 nasazena s měřením vypnutým. Sedm kontrol před přepnutím domény i sedm přímo na produkci prošlo; [záznam nasazení](./cashflow-shadow-deployment-2026-09-12.json). Původní širší pilot s ukládáním kandidátů zůstává nenasazený.

Uživatel určil web `https://bohemka.app/` a konkrétní vlastní účet. Doménu podle existujících záznamů nasazení považujeme za produkční. E-mail účtu patří do serverového seznamu povolených účtů; není potřeba jej přidávat do repozitáře. Poskytnutí adresy a e-mailu samo neuděluje přístup přes přihlášení ani MFA a neověřuje aktuálně nasazenou verzi aplikace.

Pro samostatný staging ani Auth emulátor nejsou konfigurace; běžný `next dev` nebo Vercel preview proto nelze automaticky považovat za oddělené od živých dat. Klient i server také musí mít stejné IANA časové pásmo; změna globálního pásma produkce pouze kvůli pilotu není součástí této úpravy. Při neshodě se měření přeskočí.

Před aktivací je nutné ověřit nasazenou verzi s podporou diagnostiky a běžná oprávnění účtu. Pro podklady cashflow předplatného vyžaduje stávající zdrojový endpoint roli `owner`; samotný seznam povolených účtů tuto kontrolu nenahrazuje.

První skutečný pilot je omezen na samotné porovnání výpočtu. Připravená konfigurace (dosud nenastavená v hostingu):

```dotenv
# Klientský příznak musí být nastavený už při sestavení aplikace.
NEXT_PUBLIC_CASHFLOW_SHADOW_ENABLED=1
CASHFLOW_SHADOW_ENABLED=1
# Nahradit pouze účtem, který uživatel určil v této relaci.
CASHFLOW_SHADOW_EMAILS=<schvaleny-email>
CASHFLOW_CACHE_TRACK_WRITES=0
CASHFLOW_CANDIDATES_ENABLED=0
```

Po nasazení a ověření konfigurace se uživatel přihlásí v prohlížeči běžným způsobem včetně MFA. Heslo, jednorázový kód, přihlašovací token ani export prohlížečové relace se nepředávají. Měření se navíc aktivuje pouze v jeho kartě pomocí `sessionStorage.setItem("cashflow_shadow_opt_in", "1")` a opětovného otevření cashflow. Ke sdílení výsledku slouží výhradně výše uvedený souhrn `cashflow_shadow_last_result`, nikoli export síťových požadavků nebo celé konzole. Serverový přepínač `CASHFLOW_SHADOW_ENABLED=0` odmítne další porovnání, jakmile se změna prostředí uplatní v běžících instancích; místní aktivaci lze odstranit pomocí `sessionStorage.removeItem("cashflow_shadow_opt_in")` a znovu otevřít stránku.

Nová diagnostika posílá požadavky na vlastní API aplikace. Tělo zahrnuje otisky, čas, pásmo a volby výpočtu; filtr `contractNumberQuery` může obsahovat číslo smlouvy. Samotný souhrn výsledků tyto údaje neobsahuje. Toto omezení nového souhrnu není zárukou, že všechny existující aplikační či infrastrukturní logy jsou bez osobních údajů. Ochrana uživatelského přihlášení pomocí MFA také nenahrazuje ochranu serverových Firebase Admin přístupů.

Vypnuté ukládání kandidátů zabraňuje vytváření dalších kopií vypočtených částek a klientských údajů touto funkcí. Pokud by se později zapnulo, kandidáti obsahují skutečné osobní a finanční údaje v existujícím Firestore. Jejich pětiminutová platnost znamená odmítnutí zastaralého výsledku, nikoli jeho fyzické smazání. Klientská pravidla přístup odmítají, ale oprávněný serverový Admin SDK a správci projektu k datům přístup mít mohou.

Nejprve lze ověřovat samotný serverový výpočet s vypnutým sledováním a ukládáním. To nemění cestu obchodních zápisů, ale přidává autorizované čtení, výpočet a rate-limit metadata. Ukládání vyžaduje provozní podmínky druhé etapy: pokrytí všech zapisovačů, dokončení starých procesů, kontrolu otevřených operací a skutečně spouštěný úklid expirovaných výsledků. Žádná lokální naměřená hodnota sama tyto podmínky ani produkční přínos nedokládá.
