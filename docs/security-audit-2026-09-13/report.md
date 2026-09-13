**Lokální kontrola zabezpečení a funkčnosti — 13. 9. 2026**

**Aktualizace po auditu:** všechny tři bezpečnostní nálezy jsou opraveny v místním projektu. Samostatné e-mailové vydání s opravou ověřování adresy, Resendem a českými šablonami bylo se souhlasem uživatele nasazeno na `bohemka.app`; další dvě opravy zůstávají místní. E-mailové vydání prošlo 1 767 testy a osmi kontrolami nasazené verze. V 12:41 CEST aplikace přijala jednu autorizovanou žádost o reset hesla a uživatel následně výslovně potvrdil doručení zprávy. [Záznam vydání](./resend-release.json), [oprava ověření e-mailu](./email-verification-fix.md), [oprava návratové adresy](./login-redirect-fix.md), [oprava předvyplnění](./termination-prefill-fix.md), [nastavení a aktuální stav](../auth-email-setup.md). Následující audit a původní důkazové soubory zachycují stav před opravami.

Základní ochrany v testovaném pracovním kódu fungují, ale kontrola potvrdila tři slabiny, které doporučuji opravit. Úspěšné běžné testy samy o sobě tyto slabiny nevylučují. Výsledky platí pro současný místní projekt, nikoli automaticky pro nasazený web.

Kontrola proběhla na výslovně zvoleném místním projektu. Produkční databáze ani úložiště se nečetly a neměnily, žádné e-maily ani oznámení se neposílaly. Provozní přístupové údaje se do testů nepředávaly. Použily se paměťové náhrady služeb a samostatný Firestore emulátor s projektem `demo-bohemika-rules` na `127.0.0.1:8180`. Testovací Node procesy měly dodatečnou ochranu blokující externí spojení přes sockety a `fetch`; blokovala i automatické pokusy SDK o dotaz na cloudová metadata. Emulátor byl po kontrole ukončen.

| Ověření | Výsledek | Co výsledek znamená |
| --- | --- | --- |
| Stávající aplikační testy | 1 958 / 1 958, 197 souborů | Prošly testované funkční scénáře, relace, oprávnění, přílohy, šifrování, soukromé karty a další logika. |
| Firestore testy | 249 / 249, 6 souborů | Skutečný lokální emulátor; z toho 214 testů bezpečnostních pravidel. Zahrnují přidání, změnu a odebrání chráněných rolí, cizí účty a oddělení interních dat. |
| Doplňková kontrola vstupů API | 266 / 266 | 133 kombinací cesty a HTTP metody z 90 souborů, každá bez tokenu a s neplatným tokenem. Odpověď musí přístup odmítnout a nesmí sáhnout na aplikační databázi ani Storage. Ověřovač tokenů a externí služby byly nahrazeny testovacími objekty; skutečné aplikační vstupní kontroly zůstaly aktivní. |
| Doplňkové důkazové scénáře | 14 / 14 | Zachycují tři níže popsané slabiny i správné chování okolních kontrol. Čtyři zelené důkazové testy záměrně potvrzují nežádoucí chování; nejsou potvrzením bezpečnosti. |
| TypeScript | Prošel `tsc --noEmit --incremental false` | Aktuální projekt nemá chybu zachycenou touto kontrolou typů. |
| Místní kontrola obrazových knihoven | Prošla | Next 16.3.4, sharp 0.35.4, libheif 1.23.2 odpovídají minimům ve stávajícím skriptu projektu. Nejde o ověření aktuální databáze zranitelností ani produkčního runtime. |
| Cílený sken tajných hodnot | Bez nálezu v 1 110 sledovaných textových souborech | Vzory soukromých klíčů a vybraných servisních tokenů; bez nalezených sledovaných souborů `.env`, privátních klíčů a vybraných exportů v `public`. Nejde o úplný sken historie či všech binárních souborů. |

**1. Střední závažnost: e-mail lze označit jako ověřený bez potvrzení ze schránky.**

`POST /api/auth/confirm-email-for-mfa` přijme platný token nedávno přihlášeného uživatele, ověří shodu e-mailu s účtem a následně volá `updateUser(uid, { emailVerified: true })`. Nevyžaduje potvrzení odkazu či kódu doručeného do schránky ani roli správce. Přístup k přihlášenému účtu tím zaměňuje za ověření vlastnictví e-mailu.

Důkaz: syntetický účet měl v tokenu i záznamu neověřený e-mail a aktuální čas přihlášení. Požadavek bez ověřovacího kódu vrátil HTTP 200, `emailVerified: true` a vyvolal právě jednu požadovanou změnu v náhradě Firebase Auth. Chybějící a neplatný token, staré přihlášení, deaktivace i neshoda e-mailu byly správně odmítnuty. Žádný skutečný účet se neměnil. Nález byl zmíněn už v dřívějším místním protokolu a je nyní znovu potvrzen v aktuálním kódu.

Dopad: příznaku ověřeného e-mailu nelze v této cestě přisuzovat důkaz přístupu do schránky. Nebylo prokázáno převzetí cizího účtu; další dopad závisí na správě a registraci účtů.

Náprava: využít ověřovací e-mail a pokračovat v aktivaci MFA teprve po skutečném potvrzení. Případné ruční ověření oddělit do existující administrátorské operace s oprávněními a auditním záznamem.

Podklady: [endpoint](../../src/app/api/auth/confirm-email-for-mfa/route.ts), řádky 73–104; [důkazové testy](./email-verification.test.ts.txt).

**2. Střední závažnost: parametr návratu po přihlášení připouští cizí doménu.**

`resolveSafeLoginNextPath` kontroluje pouze počáteční `/` a odmítá `//`. Přijme ale kombinaci lomítka se zpětným lomítkem nebo lomítka, tabulátoru a dalšího lomítka. Následné standardní zpracování URL takový řetězec převede na adresu cizího serveru. Přihlašovací stránka výsledek předává do `router.replace`.

Důkaz: dva syntetické vstupy s doménou `outside.example.test` prošly kontrolou a po `new URL(accepted, applicationOrigin)` měly cizí `origin`. Kontrola instalovaného Next routeru potvrdila použití právě této normalizace. Obyčejné interní cesty fungují a běžné absolutní či `//` adresy jsou odmítány. Navigace na externí web se neprováděla.

Dopad: podvržený odkaz na legitimní přihlašovací stránku může po dokončení přihlášení odvést uživatele na phishingový web. Test neprokazuje automatické předání hesla, cookie nebo tokenu cizímu serveru.

Náprava: cíl nejprve zpracovat přes `new URL` vůči skutečnému originu aplikace, vyžadovat totožný origin a vracet pouze normalizovanou cestu, dotaz a fragment. Odmítnout také řídicí znaky a zpětná lomítka. Pokrýt testy zakódovaných variant.

Podklady: [kontrola návratové cesty](../../src/app/lib/authSession.ts), řádky 3–14; [použití při přihlášení](../../src/app/login/page.tsx), řádek 271; [důkazové testy](./browser-privacy.test.ts.txt).

**3. Střední závažnost: nevyužité předvyplnění výpovědi ponechává klientské údaje po odhlášení.**

Přenos do formuláře výpovědi ukládá do `sessionStorage` údaje smlouvy včetně jména, osobního identifikátoru, adresy a kontaktů. Záznam nemá vlastníka podle přihlášeného účtu. Odhlášení uklízí staré klientské karty s jiným prefixem, nikoli tyto záznamy. Pokud předvyplnění ještě nebylo spotřebováno, zůstává v dané záložce dostupné.

Důkaz: syntetické předvyplnění zůstalo v náhradě `sessionStorage` i po úspěšném provedení skutečné funkce `clearServerSession` s náhradou HTTP odpovědi odhlášení. Následně je bylo možné spotřebovat bez předání či ověření identity uživatele. Běžné jednorázové vyzvednutí a odmítnutí po třiceti minutách fungují. Časový limit se však uplatní až při vyzvednutí; sám o sobě fyzicky nemaže nevyzvednuté záznamy.

Dopad je omezen na stejnou záložku/profil prohlížeče, zejména sdílené zařízení nebo přepnutí účtu. Samotné zjištění neznamená veřejnou dostupnost údajů přes internet. Plné přepnutí skutečných Firebase účtů v prohlížeči nebylo prováděno.

Náprava: odstranit tento přesný prefix při odhlášení a změně účtu, ověřovat vlastníka při spotřebování a průběžně mazat prošlé záznamy. Pro citlivé údaje zvážit přenos v paměti nebo jednorázově přes autorizované API.

Podklady: [uložení a vyzvednutí předvyplnění](../../src/app/pomucky/vypoved-smlouvy/contractTerminationPrefill.ts), řádky 194–239; [odhlášení](../../src/app/lib/authSession.ts), řádky 47–54; [rozsah současného úklidu](../../src/app/lib/clientCardPrivacy.ts); [důkazové testy](./browser-privacy.test.ts.txt).

**Rozsah a omezení výsledku.** Kontrolována byla rozpracovaná místní verze. Produkční zdroj, proměnné prostředí, aktivní Firebase pravidla, staré tokenové odkazy příloh, historické role, logy případných útoků a zálohy nebyly prověřovány. Starší produkční zjištění se nepovažují za znovu ověřená. Neprováděl se zátěžový test, online sken závislostí, úplné sestavení ani úplný průchod webu s reálným přihlášením. Test vstupů API nepokrývá všechny kombinace oprávnění již přihlášených uživatelů ani všechny veřejné endpointy. U diagnostických cashflow API se použily zapnuté funkce a platný syntetický požadavek, aby test skutečně došel až k přihlášení.

První běh emulátoru selhal kvůli nedostupné české lokalizaci v jeho knihovně. Po nastavení jazyka JVM na angličtinu prošlo všech 249 testů; nešlo o změnu pravidel aplikace. První obecná kontrola API správně zaznamenala HTTP 200 u vypnutých cashflow diagnostik; kontrola jejich kódu potvrdila pouze odpověď `skipped/disabled` bez práce s daty. Následný běh se zapnutými diagnostikami ověřil skutečné odmítnutí neplatného přihlášení.

Aplikační zdroje, databázová pravidla ani rozpracované změny se při této kontrole neupravovaly. Přibyl pouze tento protokol a jeho podklady. Nic se nenasazovalo. Strojový přehled a otisky relevantních souborů jsou v [evidence.json](./evidence.json); rozsah API zachycuje [api-entry-matrix.json](./api-entry-matrix.json). Textové kopie důkazových testů nejsou přidány do běžné sady, která by tím mohla začít vyžadovat zachování chybného chování.
