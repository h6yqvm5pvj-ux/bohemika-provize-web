# Kontrola chyb webu — 15. 9. 2026

Původní audit místního projektu na commitu `0229c2b546112c9c17b9147da5a08028f1154432` označil **pět funkčních chyb a jedno omezení přístupnosti**. Po upřesnění rozsahu uživatelem je bod 1 vyřazen; body 2 a 5 byly následně opraveny. K řešení zbývají body 3, 4 a 6. Aplikační zdroje se při původní kontrole neupravovaly. Výsledek není ověřením nasazené produkční verze.

## Upřesnění rozsahu — klienti od 18 let

Uživatel stanovil, že klientem v této agendě může být pouze osoba od 18 let. Scénář dítěte v bodě 1 proto nesplňuje vstupní podmínky agendy a byl chybně zařazen mezi relevantní funkční chyby. Původní reprodukce zůstává historickým pozorováním; doporučení podporovat dětské klienty se ruší. Toto upřesnění samo neověřuje, zda aplikace věkovou hranici 18 let vynucuje.

## Následné opravy — 15. 9. 2026

Na žádost uživatele byly v místních zdrojích opraveny **body 2 a 5**:

- **Síň slávy:** kategorie „Majetek a odpovědnost“ nyní zahrnuje také `business`. Regresní test skutečného GET handleru s náhradou Firestore ověřuje všechny čtyři podnikatelské produkty, roční přepočet pojistného, změnu pořadí mezi obdobími a vyloučení převzatých či budoucích smluv.
- **Záznam z jednání:** životní koncept a oba druhy výsledků používají `sessionStorage` s vlastníkem (Firebase UID a případné zastupování účtu) a kontrolou stáří 20 minut. Běžný návrat z výsledků i obnovení stránky pod stejným účtem zachovají platný životní koncept. Při zablokovaném úložišti funguje přenos v paměti během navigace.
- Při odhlášení se vstupy odstraní ještě před serverovým požadavkem, i když následně selže připojení. Změna účtu či zastupování resetuje také zobrazené formuláře a výsledky a odmítne opožděný zápis ze staré relace. Před uložením stránky do historie se formuláře skryjí; obnovení z historie vyžádá nové ověření účtu. Původní tři společné klíče bez vlastníka se mažou, nepřebírají se pod nově přihlášený účet.

**Ověření:** 30 nových regresních scénářů; kompletní sada **2 599 / 2 599 testů v 255 souborech** a TypeScript prošly. ESLint: 0 chyb, 4 původní varování o interní navigaci. Testy skutečných React formulářů a výsledkových stránek běžely v happy-dom s náhradou Firebase událostí. Přepnutí skutečných produkčních účtů ani nasazení se neprovádělo.

Následující nálezy a důkazové přílohy popisují původní stav před opravami. Důkazové scénáře zachování chyb 2 a 5 již nejsou očekávaným výsledkem aktuálního kódu.

## Výsledky kontrol

| Kontrola | Výsledek |
| --- | --- |
| Stávající testy aplikace | 2 562 / 2 562, 253 souborů |
| TypeScript | `npx tsc --noEmit --incremental false` prošel |
| ESLint | 0 chyb, 4 varování o interní navigaci pomocí `window.location.href` |
| Doplňkové reprodukce | 3 / 3 potvrzují níže uvedené nežádoucí chování; nejde o testy správnosti |
| Chrome | Ověřeny tři skutečné obsluhy kliknutí vyjmuté z aktuálních zdrojů; služby a okolní stav nahrazeny syntetickými daty |
| Místní HTTP | Chybějící BYTEX PDF: 404; kontrolní existující obrázek: 200; přihlášení: 200 |

## 1. Vyřazeno — scénář dítěte mimo rozsah klientské agendy

**Postup:** v klientské kartě zapnout úpravy a zadat rodné číslo dítěte s prefixem `140515` (15. května 2014). Pole Datum narození se automaticky změní na `1914-05-15`. Stejně dopadne ženská varianta s prefixem `145515`.

**Příčina:** [clientCardHelpers.ts](../../src/app/_klienti/clientCardHelpers.ts), řádky 174–177, přesune každý vypočtený rok s věkem pod 15 let do minulého století. [Obsluha formuláře](../../src/app/_klienti/[slug]/page.tsx), řádky 915–920, výsledek bez dalšího potvrzení zapíše do data narození. Tento údaj se pak může uložit společně s kartou.

**Důkaz:** při testovacím datu 15. 9. 2026 skutečná funkce vrací `1914-05-15`. Kontrolní prefix `850101` správně vrací `1985-01-01`. Jde o syntetické prefixy, nikoli skutečné klientské údaje.

**Závěr po upřesnění uživatelem:** klientská agenda je určena pouze osobám od 18 let. Tento scénář se vyřazuje z chyb určených k opravě.

## 2. P2 — Síň slávy vynechává podnikatelské smlouvy

**Postup:** poradce má za aktuální období smlouvu DOMEX a podnikatelskou smlouvu SIMPLEX, obě s ročním pojistným 12 000 Kč. Síň slávy vykáže pouze jednu smlouvu za 12 000 Kč. SIMPLEX se neobjeví v žádné kategorii.

**Příčina:** [API týmu](../../src/app/api/team-overview/route.ts), řádky 95–100 a 296–299, zařazuje `cppsimplex`, `kooppmop`, `cppPPRs` a `cppPPRbez` do `business`. [Mapování kategorií síně slávy](../../src/lib/server/hallOfFame.ts), řádky 46–47, `business` neobsahuje.

**Dopad:** žebříček a součty nezahrnují celou příslušnou produkci. Poradce s výhradně podnikatelskými smlouvami může ze síně slávy úplně vypadnout.

**Důkaz:** skutečný GET handler s náhradou Firestore dostal oba testovací kontrakty, vrátil HTTP 200 a jen jednu položku se součtem 12 000 Kč. Kontrolní DOMEX se započetl.

**Náprava:** zahrnout `business` do odpovídající kategorie nebo vytvořit samostatnou kategorii podnikatelského pojištění; přidat pokrytí všech kategorií vstupní produkce.

## 3. P2 — Otevření nové karty se chybně vyhodnocuje jako blokované

Jde o společnou příčinu se třemi uživatelskými projevy:

- **Kalkulačka / NEON:** otevření podmínek PDF založí prázdnou kartu a původní stránka hlásí „Prohlížeč zablokoval otevření nové karty s PDF.“ PDF se vůbec nezačne načítat. [Zdroj](../../src/app/kalkulacka/page.tsx), řádky 1722–1727.
- **Výpověď smlouvy / nahrání dokumentu:** otevře se nová karta a zároveň se na stejný cíl přesměruje původní stránka. Uživatel tak opustí rozpracovaný formulář. [Zdroj](../../src/app/pomucky/vypoved-smlouvy/page.tsx), řádky 3333–3341.
- **Plán produkce / náhled:** náhled v nové kartě funguje, ale původní stránka současně zobrazuje chybu blokování. [Zdroj](../../src/app/pomucky/plan-produkce/page.tsx), řádky 824–832.

**Příčina:** podmínky testují návratovou hodnotu `window.open(..., "noopener,noreferrer")`. V testovaném Chrome toto volání vrátí `null` i při úspěšném vytvoření karty.

**Důkaz:** skutečné kliknutí v Chrome spustilo každou aktuální obsluhu. NEON vytvořil `about:blank`, nahlásil blokování a provedl 0 požadavků na dokument. Plán zobrazil syntetický náhled i falešnou chybu. Výpověď převedla obě karty na stejnou místní testovací adresu. Žádná stránka pojišťovny se neotevírala.

**Náprava:** hotové adresy otevírat odkazem s `target="_blank"` a bezpečným `rel`; u asynchronně načítaného PDF použít existující náhled nebo zachovat ovladatelnou referenci na prázdné okno a odstranit jeho `opener` před navigací. Samotné `null` z varianty s `noopener` nesmí vyvolávat přesměrování původní stránky.

## 4. P2 — Provizní podmínky BYTEX odkazují na chybějící dokument

**Postup:** v kalkulačce vybrat BYTEX a otevřít provizní podmínky. Dokument se nenačte.

**Příčina:** [mapování dokumentů](../../src/app/kalkulacka/page.tsx), řádek 430, používá `/provize/bytexprovize.pdf`, ale soubor v `public/provize` chybí.

**Důkaz:** kontrola odkazů na místní obrázky a PDF našla tuto chybějící cestu. Skutečný GET na místní Next server vrací 404; kontrolní `/provize/csobauto.jpg` vrací 200.

**Náprava:** doplnit správné schválené PDF nebo upravit mapování na existující odpovídající dokument.

## 5. P2 — Vstupy záznamu z jednání přetrvají odhlášení a přejdou mezi účty

**Postup:** účet A vytvoří podklady v pomůcce Záznam z jednání a odhlásí se. Účet B ve stejném profilu prohlížeče otevře výsledky vozidel; načte předchozí vstupy účtu A. U životního formuláře je dostupnost omezena stávající dvacetiminutovou lhůtou.

**Příčina:** vstupy používají společné klíče `carRecord.resultsInput`, `lifeRecordFormDraft` a `lifeRecordResultInput` bez vlastníka. [Odhlášení](../../src/app/lib/authSession.ts), řádky 76–87, je neodstraňuje. [Výsledky vozidel](../../src/app/pomucky/zaznam/vysledky-auto/page.tsx), řádky 339–348, načítají záznam bez kontroly účtu či stáří. Uložení je v [CarRecordForm.tsx](../../src/app/pomucky/zaznam/CarRecordForm.tsx), řádky 221–225.

**Důkaz:** všechny tři syntetické záznamy zůstaly v náhradě browser storage po skutečném `clearServerSession()` s úspěšnou náhradou serverového odhlášení. Čtení výsledků a zápis vstupů byly ověřeny ve zdrojích; plné přepnutí skutečných Firebase účtů se neprovádělo.

**Dopad:** podklady či doporučení mohou vycházet z předchozího jednání jiného účtu. Reprodukce neprokazuje únik jména nebo rodného čísla přes tyto konkrétní klíče.

**Náprava:** oddělit záznamy podle účtu, kontrolovat vlastníka při čtení a uklízet je při odhlášení; sjednotit životnost vstupů.

## 6. P3 — Globální nastavení omezuje přiblížení na telefonu

**Příčina:** [layout.tsx](../../src/app/layout.tsx), řádky 32–36, nastavuje `maximumScale: 1` a `userScalable: false`.

**Důkaz:** skutečné HTML místní přihlašovací stránky obsahuje `maximum-scale=1, user-scalable=no`. V prohlížečích, které nastavení respektují, to omezuje zvětšení textu a formulářů. Dotykové chování na fyzickém telefonu nebylo měřeno; některé prohlížeče zákaz ignorují. Stránka `/ucet/akce` má vlastní povolené přiblížení.

**Náprava:** odstranit globální zákaz přiblížení a prověřit důležité formuláře při zvětšení.

## Podklady a rozsah

- [Výsledek Chrome a místního HTTP](browser.json), včetně otisků souborů použitých při reprodukci.
- [Doplňkové důkazové testy](repro.test.ts.txt) a [jejich výstup](repro-results.txt).
- [Skript prohlížeče](browser.cjs.txt).
- [Souhrn kontrol](checks.json).

Pro opakování důkazových scénářů z kořene projektu zkopíruj textové soubory do `.tmp/bug-audit-2026-09-15/repro.test.ts` a `.tmp/bug-audit-2026-09-15/browser.cjs`. Spusť `npx vitest run .tmp/bug-audit-2026-09-15/repro.test.ts` a `node .tmp/bug-audit-2026-09-15/browser.cjs`. Browser skript používá místní instalaci Playwright v `.tmp/contract-filter-check/tools/node_modules/playwright`, Chrome v `/Applications` a server na portu 3000. Po ověření odstraň příponu `.test.ts` z důkazového souboru, aby se netestovalo zachování chyb v běžné sadě.

Kontrola zahrnovala dostupné testy, typy, lint, odkazy na místní soubory a cílenou revizi klientských karet, týmu, síně slávy, projekce, struktury, dokumentů a záznamů z jednání. Nálezy 3–6 navazují na starší audit a byly nyní znovu ověřeny v aktuálním kódu. Dříve opravené problémy s návratovou adresou přihlášení, logem ČSOB a ověřováním e-mailu se nepřebíraly jako současné chyby.

Interní chování se reprodukovalo se syntetickými daty, nikoli s přihlášeným produkčním účtem. Čtecí HTTP kontrola využila již běžící místní server na portu 3000; zůstal běžet. Nebyly provedeny zápisy obchodních dat, odesílání zpráv, nasazení, úplný produkční build ani nový běh Firestore emulátoru. Nejde o úplný audit všech obrazovek, rolí či výpočtů pojistných produktů.
