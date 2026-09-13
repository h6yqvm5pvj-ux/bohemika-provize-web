# Cashflow — omezený pilot a měření, 12. 9. 2026

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
