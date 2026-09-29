# Audit webu — 29. 9. 2026

> Následná oprava: všech 11 níže popsaných nálezů bylo opraveno v pracovní kopii. Podrobnosti a nové ověření jsou v [přehledu oprav](fixes.md). Zbytek tohoto dokumentu zachycuje původní stav před opravami.

Kontrola místního projektu na commitu `268e8ebf287088c5ada2a53b4a12c78b985f80b5` našla **10 nedostatků funkčnosti, konfigurace a použitelnosti a jeden nález v závislostech**. Nejprve doporučuji opravit otevírání dokumentů a vložené náhledy. Dva nálezy se týkají nastavení plánovače v repozitáři; jejich dopad na produkci závisí také na případných externích plánovačích, které tento audit neověřoval.

Aplikační kód se neměnil. Nebylo provedeno nasazení, odesílání zpráv ani úpravy obchodních dat.

## Rozsah a ověření

| Kontrola | Výsledek |
| --- | --- |
| Inventura | 91 souborů stránek mimo soukromé adresáře, 123 API handlerů; mapování cest a odkazů. Inventura není ruční otestování každého formuláře. |
| Testy aplikace | **5 366 / 5 366**, 377 souborů. Zahrnují výpočty provizí, cashflow, importy, klientská data, práci s účty i odmítání neoprávněných API požadavků. |
| Firestore a Auth emulátory | **328 úspěšných**, 15 souborů. Jeden volitelný výkonnostní benchmark přeskočen podle konfigurace. Pouze lokální projekt `demo-bohemika-rules`. |
| TypeScript | Prošel, bez zápisu výstupu či inkrementální cache. |
| ESLint | 0 chyb, 4 varování přímé interní navigace pomocí `window.location.href`. |
| Produkční sestavení | Prošlo v izolované kopii s testovací konfigurací, včetně kontroly obrazových knihoven a registrace autentizačního proxy. Při prvním pokusu chyběly v kopii testovací pomocné soubory; po jejich doplnění proběhl celý build. |
| Místní HTTP | 84 požadavků bez přihlášení: 8 odpovědí 200, 75 přesměrování 307, jedna 404 na chybějící BYTEX PDF. |
| Vizuální kontrola | 12 veřejných cest/stavů při šířkách 1440 a 390 px, celkem 24 kontrol. Bez vodorovného přetékání dokumentu a rozbitých obrázků v zachyceném stavu. |
| Cílené browserové reprodukce | Skutečné funkce vyjmuté z aktuálních zdrojů, produkční CSP vygenerovaná skutečným proxy a syntetická data. Ověřeno rozbalování výpisů, změna velikosti PDF náhledu, týdenní report a tři obsluhy otevírání nového okna. |
| Statické soubory a navigace | 427 odkazů na soubory ve zdrojových literálech; jedno potvrzené chybějící PDF. `/favicon.ico` je správně poskytován konvencí `src/app/favicon.ico`. U kontrolovaných doslovných interních odkazů žádná další chybějící cesta. |
| Formulář v produkčním sestavení | Mobilní poptávka pojištění vozidel: zablokované prázdné odeslání, zachování jména a telefonu po simulovaném HTTP 503, úspěšné opakování a zavření klávesou Escape. Bez JavaScript chyb. Obě odpovědi odeslání byly nahrazené; skutečná poptávka neodešla. |
| Aktuální databáze zranitelností npm | Po výslovném souhlasu provedeno `npm audit`: **1 moderate**, 0 high, 0 critical. Podrobnosti v bodě 11. |

P2 označuje funkční chybu; P3 menší nedostatek přístupnosti či použitelnosti. Pořadí níže zohledňuje dopad na uživatele.

## 1. P2 — Otevření dokumentu může opustit rozpracovaný formulář; NEON PDF se neotevře

**Projev a reprodukce:**

- V pomůcce Výpověď smlouvy otevřít stránku pro nahrání výpovědi: cílová stránka se otevře v nové kartě a současně nahradí původní formulář.
- V kalkulačce NEON zvolit otevření provizních podmínek: vznikne prázdná karta, zobrazí se chyba blokování a načítání PDF se vůbec nespustí.
- V Plánu produkce otevřít náhled v nové kartě: náhled se otevře, ale původní stránka přesto hlásí zablokování.

**Příčina:** návratová hodnota `window.open(..., "noopener,noreferrer")` se používá jako důkaz blokování. Chrome vrací `null` i po úspěšném otevření. Ve výpovědi se pak spustí záložní přesměrování původní stránky.

**Místa:** `src/app/pomucky/vypoved-smlouvy/page.tsx:3333`, `src/app/kalkulacka/page.tsx:1692`, `src/app/pomucky/plan-produkce/page.tsx:824`.

**Důkaz:** v Chromu původní i nová karta výpovědi skončily na stejném místním testovacím cíli; NEON provedl 0 požadavků na PDF a otevřel `about:blank`. Náhled plánu otevřel platnou `blob:` adresu s falešnou chybou v původní kartě. Žádná stránka pojišťovny se při reprodukci neotevírala.

**Náprava:** pro hotové adresy použít odkaz s `target="_blank"` a bezpečným `rel`. Pro asynchronně načítané PDF zachovat ovladatelnou referenci na nové okno a bezpečně odstranit `opener`, případně použít existující náhled dokumentu. Nevynucovat navigaci původního formuláře podle této návratové hodnoty.

## 2. P2 — CSP blokuje ovládání výpisů a zmenšení náhledu PDF

**Projev:** v náhledu provizního výpisu v Cashflow a detailu smlouvy se nerozbalí skryté položky. Ve srovnávači trvalých následků se náhled PDF na úzké obrazovce nepřizpůsobí šířce.

**Příčina:** obě funkce `buildInteractiveStatementHtml` vkládají inline `<script>` bez povolení pro aktuální CSP. Totéž platí pro skript `fit()` v `scenarioPreviewSrcDoc`. Vložený dokument `srcDoc` dědí bezpečnostní politiku rodiče; samotné `sandbox="allow-scripts"` nezruší omezení CSP.

**Místa:** `src/app/cashflow/page.tsx:111`, `src/app/smlouvy/[id]/page.tsx:362`, `src/app/pomucky/srovnavac-trvalych-nasledku/page.tsx:4167`, `src/proxy.ts:99`.

**Důkaz:** s aktuální produkční CSP zůstal detail po kliknutí `display:none`; v kontrolním scénáři bez CSP se změnil na `block`. U PDF měl rám šířku 350 px, obsah 806 px a `transform:none`; kontrolní scénář správně aplikoval měřítko přibližně 0,411 a obsah měl šířku 350 px. Chrome výslovně zaznamenal blokování inline skriptů.

**Náprava:** přesunout ovládání do důvěryhodného externího skriptu nebo Reactu, případně povolit přesný vlastní skript pomocí nonce či hashe. Nepovolovat plošně všechny inline skripty v importovaných výpisech.

[Chybný náhled na mobilu](probe-scenario-blocked.png) · [kontrolní správné zmenšení](probe-scenario-control.png).

## 3. P2 — Týdenní report v poště blokuje vlastní ochrana proti vložení

**Reprodukce:** v Poště otevřít zprávu typu `weekly_team_report`. Aplikace vytváří iframe na `/muj-tym/tydenni-report?source=weekly-report&embed=mailbox`, ale tato cesta není mezi povolenými vloženými stránkami.

**Důkaz:** skutečný proxy i při náhradě úspěšného přihlášení vrací `frame-ancestors 'none'` a `X-Frame-Options: DENY`. Chrome následně zobrazí chybový rám a oznámí blokování. Stejný kontrolní test správně povolil vloženou kalkulačku a detail smlouvy.

**Místa:** `src/proxy.ts:254`, `src/app/posta/page.tsx:3415`.

**Náprava:** doplnit přesný režim vloženého týdenního reportu mezi povolené cesty ze stejného původu, se zachováním autentizace a zákazu vkládání ostatních interních stránek.

## 4. P2 — Chybí provizní podmínky BYTEX

**Reprodukce:** v kalkulačce vybrat BYTEX a otevřít provizní podmínky.

**Důkaz:** mapování v `src/app/kalkulacka/page.tsx:431` používá `/provize/bytexprovize.pdf`. Soubor v `public/provize` chybí a skutečný místní HTTP požadavek vrací 404. Kontrolní `/provize/csobauto.jpg` vrací 200.

**Náprava:** doplnit schválený dokument nebo opravit odkaz na jeho existující umístění.

## 5. P2 — Náhled AutoKelly je blokován ještě před načtením externí stránky

**Projev:** v Nacenění čelního skla je vyhrazen prostor pro detail nabídky AutoKelly, který současná politika aplikace nemůže povolit.

**Důkaz ve zdrojích:** `src/app/pomucky/naceneni-celniho-skla/page.tsx:1159` vkládá externí `selectedAutoKellyPreviewUrl` do iframe. `FRAME_SRC` v `src/proxy.ts:36` povoluje pouze vlastní původ a Firebase domény; výjimka pro AutoKelly neexistuje. Vygenerovaná produkční hlavička pro tuto stránku omezení potvrzuje. Nejde o doložené odmítnutí ze strany AutoKelly; požadavek zastaví už vlastní CSP aplikace.

**Náprava:** buď zobrazovat vlastní náhled získaných údajů a odkaz na externí detail, nebo cíleně povolit potřebný původ a následně ověřit, zda vložení dovoluje i cílový web. Stávající odkaz „Otevřít v AutoKelly“ je dostupná náhradní cesta.

## 6. P2 — Naplánované administrátorské notifikace nemají v repozitáři spouštěč

**Projev podle konfigurace:** administrace dovoluje naplánování a API odpoví úspěchem po uložení do fronty, ale běžné nasazení podle `vercel.json` nemá úlohu, která by tuto frontu zpracovávala.

**Důkaz:** `src/app/api/admin/broadcast-notification/route.ts:54` volá `scheduleAdminBroadcast`. Zpracování `runDueScheduledAdminBroadcasts` volá pouze `/api/cron/admin-broadcasts`. Tento endpoint chybí mezi šesti cron úlohami ve `vercel.json:5`; další volající nebyl nalezen ani ve skriptech a dostupných Cloud Functions.

**Náprava:** doplnit pravidelné spuštění chráněného endpointu a kontrolu opožděných položek fronty.

**Mez ověření:** existenci samostatného produkčního plánovače mimo tento repozitář nelze z této kontroly potvrdit ani vyloučit. Nález potvrzuje neúplnou konfiguraci v repozitáři, nikoliv konkrétní neodeslanou produkční zprávu.

## 7. P2 — „Připomenout zítra“ může odeslat push až pozítří

**Příčina:** Pošta nastaví termín na aktuální čas + 24 hodin (`src/app/posta/page.tsx:469`). Připomínky nezodpovězených zpráv používají stejný princip (`src/app/posta/MailboxChatThread.tsx:979`). Server vybírá pouze již splatné termíny, ale podle `vercel.json:19` běží jen jednou denně, v 07:30 UTC.

**Konkrétní scénář podle nastaveného rozvrhu:** 29. září v 10:00 českého času uživatel zvolí „zítra“. Termín je 30. září v 10:00; ranní běh v 09:30 ho ještě nezpracuje. Nejbližší další běh je 1. října v 09:30, tedy o **23,5 hodiny později** než uložený termín.

**Dopad:** návrat zprávy do seznamu a doručení push připomínky se rozcházejí. Klientský časovač návrat zprávy v otevřené Poště řeší; tento nález se týká serverové notifikace.

**Náprava:** spouštět zpracování častěji nebo sjednotit nabízený termín s denním rozvrhem a jasně ho uživateli zobrazit. Nezaměňovat s poznámkami u smluv a klientů, které již vysvětlují denní doručovací čas.

**Mez ověření:** platí pro rozvrh v repozitáři; další externí spouštění nebylo prověřeno.

## 8. P3 — Vybraný jazyk se nepřenáší mezi vizitkou a jejími službami

**Scénář:** návštěvník přepne vizitku do angličtiny nebo ukrajinštiny a otevře pojištění vozidel, životní pojištění či zlato. Cílová stránka opět začíná v češtině. Také odkaz zpět na vizitku jazyk zahodí.

**Důkaz ve zdrojích:** `src/app/vizitka/[slug]/OnlineCardPublicClient.tsx:470` vytváří odkazy bez `lang`. Komponenty `VehicleInsuranceShellClient`, `LifeInsuranceShellClient` a `GoldInvestmentShellClient` inicializují jazyk pevně na `cs`; odkazy zpět rovněž nepřenášejí jazyk.

**Náprava:** sjednotit parametr jazyka v odkazech, inicializaci podstránek a návratu na vizitku. Nejde o chybějící překlad konkrétního uživatelského životopisu.

## 9. P3 — Globální nastavení omezuje přiblížení na telefonu

`src/app/layout.tsx:34` nastavuje `maximumScale: 1` a `userScalable: false`. Odpovídající meta tag byl potvrzen ve skutečném HTML veřejných stránek. V prohlížečích respektujících toto nastavení uživatel nemůže formuláře a drobný text libovolně zvětšit. Stránka `/ucet/akce` již vlastní výjimku pro přiblížení má.

**Náprava:** odstranit globální zákaz a ověřit hlavní formuláře se zvětšeným textem. Chování fyzického telefonu se neměřilo; některé prohlížeče zákaz ignorují.

## 10. P3 — Chybová stránka 404 je anglická a nenabízí návrat

**Důkaz:** skutečná neexistující cesta vrací výchozí „This page could not be found.“ bez odkazu na domovskou stránku či přihlášení. V `src/app` chybí vlastní `not-found.tsx`. Potvrzeno při obou šířkách.

**Náprava:** přidat českou 404 s cestou zpět do aplikace. [Mobilní podoba](390-_stranka-ktera-neexistuje-audit.png).

## 11. P2 — Nodemailer 9.1.1 má hlášenou zranitelnost střední závažnosti

**Důkaz:** `npm audit` hlásí GHSA-6vj9-mwq6-2f5v u přímé produkční závislosti `nodemailer`; místně i v lockfilu je verze 9.1.1. Autor knihovny uvádí opravu od 10.0.2. Chyba může při specifickém sdílení SMTP hostitele mezi transporty zaměnit identitu ověřovanou TLS a vystavit přihlašovací údaje. [Oznámení autora knihovny](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-6vj9-mwq6-2f5v).

**Dopad v tomto projektu:** prohledání `src`, `scripts` a dostupných `functions` nenašlo aktivní import ani vytváření transportu Nodemailer; nalezena byla deklarace typů a závislost. Zneužitelnost v aplikaci ani únik přihlašovacích údajů tím nejsou prokázány.

**Místa:** `package.json:38`, `package-lock.json:8513`.

**Náprava:** pokud je knihovna skutečně nepoužívaná, odstranit ji; jinak aktualizovat na opravenou verzi a ověřit kompatibilitu, protože oprava překračuje hlavní verzi. V rámci auditu se balíčky neaktualizovaly.

## Co nebylo označeno za současnou chybu

- Dřívější blokování veřejné stránky pojištění vozidel: aktuální stránka obsah vykresluje přímo, bez původního problematického iframe.
- Vložení kalkulačky do provizních výpisů: příslušná výjimka v proxy nyní existuje.
- Dříve opravené přesměrování po přihlášení, oddělování záznamů podle účtu a započítání podnikatelských smluv: staré nálezy nebyly automaticky převzaty; současné regresní testy prošly.
- Chyby HMR WebSocketu při automatizaci vývojového serveru a chyba injektovaného Playwright skriptu při zákazu service workerů v sandboxovaném 3D rámečku nejsou vykázány jako chyby produkční aplikace.
- Čtyři upozornění lintu sama o sobě nepředstavují potvrzenou poruchu navigace.

## Podklady a meze

[Souhrn kontrol](checks.json) · [inventář](inventory.json) · [HTTP a veřejné stránky](browser.json) · [browserové reprodukce](probes.json) · [test formuláře](form.json) · [rozvrhy připomínek](scheduling.json) · [npm audit](npm-audit.json).

Reprodukční skripty jsou přiložené jako text: [inventář](scan.cjs.txt), [veřejné stránky](browser.cjs.txt), [izolované chyby](probes.cjs.txt), [produkční formulář](production-browser.cjs.txt). Browserové skripty lze uložit do `.tmp/web-audit-20260929` a spustit z kořene projektu; používají instalaci Playwright z `.tmp/contract-filter-check/tools/node_modules/playwright`. Veřejné stránky potřebují server na portu 3000; formulář testovací produkční sestavení na portu 3109. Pozitivní kontrola bez CSP slouží pouze k prokázání příčiny, není doporučením vypnout bezpečnostní politiku.

Pokus o interaktivní test proti vývojovému serveru skončil časovým limitem a není započten jako úspěšné ověření. Závěrečný formulářový test výše proto běžel proti izolovanému produkčnímu sestavení a prošel. Neúspěch vývojové automatizace sám o sobě nebyl klasifikován jako chyba produkce.

Audit kombinuje zdroje, celou dostupnou běžnou testovací sadu, emulátory, sestavení, HTTP a vybrané browserové scénáře. **Není potvrzením všech obrazovek a rolí po přihlášení do produkce ani úplným penetračním testem.** Přihlášený testovací účet pro průchod celé aplikace nebyl použit. Nebyly prováděny změny skutečných smluv, importy do produkce, odesílání zpráv, externí penetrační testy, kontrola všech nasazených služeb ani porovnání všech sazeb s aktuálními dokumenty pojišťoven. Nasazená verze se může od pracovního projektu lišit.
