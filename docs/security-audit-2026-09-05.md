**Bezpečnostní kontrola Bohemika SmartApp — 5. 9. 2026**

**Aktualizace po opravách, 5. 9. 2026:** oprava databázových pravidel z bodů 2 a 3 byla v 18:39 CEST nasazena do projektu `bohemikasmlouvy`. Aktivní zdroj byl zpětně načten a jeho SHA-256 odpovídá otestované verzi. Následně bylo na `bohemka.app` nasazeno také opravené zpracování obrázků z bodu 1, sjednocení ochrany rolí v aplikaci a odstranění místního ukládání klientské karty z bodu 5. Staré údaje klientské karty se z konkrétního prohlížeče odstraní po načtení nové verze aplikace; automaticky se nepřenášejí na server. Ostatní nálezy tím nejsou vyřešeny. Níže uvedené původní nálezy popisují stav při kontrole před opravou. [Záznam ověření webového nasazení](./image-security-release-2026-09-05.json).

**Výsledek:** nelze potvrdit, že jsou všechna data bezpečně chráněna. Kontrola našla kriticky zranitelnou knihovnu v projektu, nedostatečná pravidla oprávnění v nasazeném Firestore a osm starších odkazů na přílohy, které fungují bez přihlášení při znalosti jejich tokenu. Kontrola neměnila aplikaci, pravidla, účty ani uložená data. Nešlo o vyšetřování dřívějšího zneužití.

Kontrola zahrnovala společné autentizační a autorizační vrstvy, inventuru 105 API rout, vybrané cesty ke smlouvám a přílohám, nasazená databázová a Storage pravidla, konfiguraci obnovy, metadata všech 1 328 aktuálních objektů v nakonfigurovaném bucketu a projekci bezpečnostních metadat 990 záznamů pošty. Obsah smluv, příloh a texty zpráv se nestahovaly. Přístupové klíče a tokeny nejsou součástí tohoto dokumentu.

**1. Kritická priorita: zpracování obrázků používá známou zranitelnou knihovnu.**

Lockfile obsahuje Next.js 16.2.11. Nainstalované `sharp` 0.35.3 při kontrole hlásilo `libheif` 1.23.1. Projekt navíc připíná `sharp` 0.35.3 pomocí `overrides`. Oficiální upozornění GHSA-g89c-p67h-r497 označuje libheif 1.22.0 až 1.23.1 za zranitelné; oprava je v 1.23.2. Zpracování připraveného obrázku může poškodit paměť procesu, s možným spuštěním cizího kódu. [Upozornění libheif](https://github.com/strukturag/libheif/security/advisories/GHSA-g89c-p67h-r497)

AVIF přijímá vlastní upload profilové fotografie a předává jej do `sharp`. Next.js optimalizátor navíc dovoluje obrázky z libovolného bucketu pod `firebasestorage.googleapis.com/v0/b/**`. Next.js zveřejnil pro tuto cestu opravu v 16.3.3. [Upozornění Next.js](https://nextjs.org/blog/august-2026-security-release)

Podklady: [package.json](../package.json), [upload fotografie](../src/lib/server/profileAvatarUpload.ts), [nastavení obrázků](../next.config.ts).

**Náprava:** aktualizovat Next.js a sladit související balíčky; odstranit připnutí zranitelného `sharp` a ověřit skutečnou verzi `libheif` také v produkčním artefaktu. Oprava samotného Next.js nenahrazuje opravu vlastních volání `sharp`. Do dokončení opravy odmítat AVIF/HEIF před dekódováním a chránit i optimalizátor. Zúžit povolené vzdálené obrázky na vlastní bucket.

Stav ověření: konkrétní verze a vstupní cesty potvrzeny v pracovním projektu. Verze běžícího produkčního serveru ani provedení exploitu nebyly ověřeny. Samostatný `npm audit` tuto kritickou nativní závislost ve svém výsledku neuvedl, proto byl doplněn kontrolou oficiálních upozornění.

**Následná náprava — nasazeno a ověřeno:** Next.js byl aktualizován na 16.3.4 a `sharp` na 0.35.4. Kontrola při produkčním sestavení na Linuxu ověřila skutečně načtený libheif 1.23.2 a libvips 8.18.6 pro vlastní upload i závislost dostupnou Next.js. AVIF/HEIF se u profilových fotografií odmítají před nativním dekódováním; povoleny jsou JPG, PNG a WEBP. Optimalizátor přijímá vzdálené obrázky jen z nakonfigurovaných úložišť aplikace. Nový příkaz `npm run check:image-runtime` je povinnou součástí `npm run build`.

Prošlo 672 aplikačních testů, kontrola typů, místní sestavení i produkční sestavení na Vercelu. Doména `bohemka.app` byla po přepnutí nezávisle vyhledána a odpovídá nasazení `dpl_3JXbsTmt8uz6MxbWoBSwNefacBus`. Na této doméně prošlo načtení přihlašovací stránky (200), zmenšení neškodného obrázku na 64 × 64 pixelů (200), odmítnutí obrázku z cizího úložiště (400) a odmítnutí nepřihlášeného přístupu ke klientské kartě i uploadu fotografie (401). Kontroly použily oprávněný přístup Vercel CLI přes ochranu nasazení, bez přihlášení do aplikace; běžné automatické požadavky zachycuje stávající ochrana proti robotům (429). Nebyl spuštěn exploit ani zkoumán případný dřívější útok. [Verze, otisky zdrojů a výsledky kontrol](./image-security-release-2026-09-05.json).

**2. Vysoká priorita: nasazená databázová pravidla přehlížejí přidání a odstranění chráněných polí.**

Funkce chránící `adminFunction`, `subscriptionStatus`, identitu a další údaje používají `diff(...).changedKeys()`. Tato metoda zahrnuje pouze klíče přítomné v obou verzích dokumentu se změněnou hodnotou. Přidaná a odstraněná pole do výsledku nepatří. Firebase pro omezení aktualizací doporučuje `affectedKeys()`. [Dokumentace MapDiff](https://firebase.google.com/docs/reference/rules/rules.MapDiff), [omezení zapisovaných polí](https://firebase.google.com/docs/firestore/security/rules-fields#restricting_fields_on_update)

U existujícího vlastního dokumentu `usersPrivate` tak pravidla připouštějí přidání dosud nepřítomného chráněného pole. Odstranění pole a jeho následné přidání může obejít i zákaz přímé změny existující hodnoty. Týká se to databázových příznaků, nikoli automatického získání Firebase custom claimu `admin`. Dopadem je obcházení interních oprávnění a pravidel předplatného; u veřejných profilů i narušení údajů používaných k určení identity a hierarchie.

Podklady: [firestore.rules](../firestore.rules), zejména `isChangingSensitivePublicUserFields`, `isChangingIdentityPublicUserFields`, `isChangingRestrictedPrivateUserFields`, `isOwnerPrivateWriteAllowed` a `isPrivilegedSubordinatePositionUpdate`.

**Náprava:** pro autorizační kontrolu používat `affectedKeys()`, povolit uživateli výslovně jen neprivilegovaná pole a omezit správu identit a hierarchie na server. Otestovat zvlášť vytvoření, změnu, přidání, odstranění a odstranění s následným přidáním chráněného pole.

Stav ověření: chyba nalezena v lokálních i skutečně nasazených pravidlech. Oficiální simulátor odmítl devět připravených syntetických scénářů kvůli chybějícímu IAM oprávnění `firebaserules.rulesets.test` (HTTP 403). Testovací zápis do skutečných uživatelských dokumentů se neprováděl; závěr vychází ze statické analýzy pravidel a dokumentované sémantiky.

**Následná náprava — nasazeno:** zápisy do vlastního veřejného profilu mají výslovný seznam běžných editovatelných polí, soukromý profil dovoluje pouze tokeny pro oznámení. `affectedKeys()` zahrnuje přidání, změnu i odebrání. Ostatní pole včetně současných i budoucích oprávnění, identity, hierarchie, kariérních a bezpečnostních příznaků nesmí běžný klient zapisovat. Založení a smazání veřejného profilu vyžaduje správu přes server nebo ověřeného vlastníka administrace. Odstraněna byla i přímá klientská výjimka pro změny pozice podřízených; stávající aplikace tyto operace provádí přes serverová API. Jejich vlastní autorizaci databázová pravidla nenahrazují.

Podařilo se doplnit lokální Java runtime a spustit skutečný Firestore emulátor. Šest cílených testů proti záloze původních nasazených pravidel prokázalo nežádoucí povolení přidání `adminFunction` a `specialist` a odebrání chráněného příznaku v obou profilech. Opravená verze prošla všemi 213 testy pravidel; testuje i běžné úpravy, tokeny oznámení, přístup k vlastním smlouvám, roli správce a oddělení účtů. Produkční dokumenty se při těchto testech nečetly ani nezapisovaly. [Testy pravidel](../tests/firestore/security.rules.test.ts)

**3. Vysoká priorita: některé role nemají odpovídající ochranu přímo v databázi.**

Veřejný profil dovoluje vlastníkovi měnit pole, která nejsou na seznamu chráněných polí. Mezi nechráněnými jsou `specialist`, `documentsSpecialist`, `roles`, `role`, `appRole`, `userRole` a `accountType`. Backend přitom z těchto polí vyhodnocuje oprávnění specialisty ke správě společných dokumentů. Tento problém by zůstal i po pouhé záměně `changedKeys()` za `affectedKeys()`.

Další nesoulad: skript pro přidělení role `support` nastavuje `admin: true`. Databázová funkce `isAdmin()` ale nerozlišuje `support` od plného správce a dovoluje takovému tokenu přímé zápisy a mazání smluv. Existence účtu s touto rolí v produkci nebyla prověřena.

Podklady: [vyhodnocení specialisty](../src/lib/specialistAccess.ts), [oprávnění ke správě dokumentů](../src/lib/server/toolDocuments.ts), [přidělování administrátorské role](../scripts/set-admin-claim.mjs), [databázová pravidla](../firestore.rules).

**Náprava:** všechny role a příznaky oprávnění spravovat výhradně serverem. Sjednotit význam rolí v API a Firestore; pro `support` otestovat přímý zákaz vytvoření, změny a smazání smluv. Stav ověření: potvrzený nesoulad v kódu a nasazených pravidlech, bez zneužití účtu.

**Následná náprava — nasazeno v pravidlech:** všechny varianty rolí používané aplikací jsou mimo povolená pole vlastního profilu. Plný databázový přístup vyžaduje `admin: true` a roli `admin` nebo `owner`; pro kompatibilitu zůstává podporován starší admin token bez pole role. `support`, neznámá a neplatná role plný přístup nedostanou. Platí také dříve lokálně přidané omezení účtu určeného pouze k zakládání uživatelů. Změny uložených rolí a custom claims se neprováděly; jejich historický původ tím není ověřen. Aplikační rozlišení `support` už existovalo. Dodatečné odmítnutí explicitně neplatné role v `adminAccess.ts` je připraveno a ověřeno 11 jednotkovými testy, ale vyžaduje samostatné nasazení webu.

**4. Vysoká priorita: starší přílohy pošty mají stále funkční odkazy mimo přihlášené API.**

Kontrola všech 1 328 objektů nenalezla veřejné objektové ACL. U osmi objektů pod `mailbox/` ale existuje `firebaseStorageDownloadTokens`. Všech osm odkazů vrátilo na požadavek HEAD bez uživatelského přihlášení HTTP 200: šest JPEG a dva PNG. Tyto objekty nemají metadata označující nové aplikační šifrování.

To neznamená veřejný seznam příloh: k přístupu je potřeba znát úplný odkaz s tokenem. Znamená to však, že odhlášení, odebrání přístupu k poště ani současná Storage pravidla sama takový odkaz nezneplatní. Tato cesta obchází kontrolu příjemce v API pro přílohy.

Z 990 záznamů pošty bylo 36 typu `direct_message`: 10 má šifrovací obálku verze 1, 15 ji nemá a 11 jsou oznámení tipů, která migrační skript záměrně vynechává. Jde o počty uložených dokumentů, nikoli nutně unikátních konverzací nebo zpráv. Texty nebyly čteny ani dešifrovány. Chybějící aplikační obálka také neznamená absenci základního šifrování úložiště poskytovatelem.

**Náprava:** dokončit existující migraci staré pošty a příloh, ověřit čitelnost pro oprávněné příjemce a potom odstranit původní kopie a zneplatnit původní tokeny. Pouhé zašifrování nové kopie neodstraní starou dostupnou kopii. Následně ověřit, že původní odkazy přístup odmítají. [Existující migrační skript](../scripts/migrate-mailbox-encryption.mjs)

Stav ověření: metadata a funkčnost osmi odkazů potvrzeny na živém úložišti. Odkazy, tokeny a názvy souborů se nevypisovaly; těla odpovědí se nestahovala. Metadata čtyř veřejných obrázků online vizitek rovněž obsahují tokeny, což odpovídá jejich veřejnému účelu a nebylo zařazeno mezi soukromé přílohy.

**5. Střední priorita: klientská karta uchovává osobní údaje v prohlížeči.**

Testovací klientská karta ukládá rodné číslo, kontakty, adresy a údaje dokladů do `localStorage`. Klíč obsahuje pouze slug klienta a verzi, bez identity přihlášeného účtu. Odhlášení tyto záznamy nemaže. Údaje tak zůstávají na zařízení i po odhlášení a nejsou oddělené pro více účtů používajících stejný prohlížeč.

**Náprava:** ukládat údaje přes API s kontrolou vlastníka a oprávnění, odstranit staré místní kopie a ověřit přepnutí účtů. Případné koncepty musí mít omezenou životnost a jasné oddělení účtů. Není ověřeno, zda už byly do testovací karty vloženy skutečné osobní údaje nebo zda je tato sekce povolena v produkci. [Karta klienta](../src/app/_klienti/[slug]/page.tsx), [odhlášení](../src/components/AppLayout.tsx)

**Následná oprava v pracovním kódu (nenasazena):** ruční údaje karty se čtou a ukládají přes `GET/PUT /api/client-cards/[slug]`. API používá společnou kontrolu přihlášeného poradce a omezení počtu požadavků, odmítá zastoupení jiného uživatele a zachovává pilot pouze pro úplný e-mail oprávněného účtu a existující testovací kartu. Data ukládá do `clientCardsPrivate/{uid}/cards/{slug}`; tato cesta je pro přímý přístup Firebase klienta zakázaná výchozími pravidly. Vlastníka určuje server podle ověřeného tokenu. Validace omezuje pole i velikost požadavku a transakce s revizí brání přepsání souběžných změn. Odpovědi mají `private, no-store`.

Uživatel výslovně zvolil odstranění starých místních karet bez převodu. Aplikace proto odstraňuje pouze klíče `bohemika.client-card.*` z místních a relačních úložišť při otevření libovolné stránky včetně přihlášení, při obnovení z historie a před odhlášením. Sleduje také zápisy ze starých otevřených oken. Hodnoty starých karet nečte. Nový formulář drží rozpracované údaje jen v paměti, při změně účtu se znovu vytvoří a před uložením stránky do historie se vyprázdní. Smlouvy a PDF tato oprava nemění.

Ověření opravy: 49 nových testů API, validace a úklidu; celkem 647 testů prošlo. Kontrola formuláře v izolovaném Chrome se smyšlenými daty a náhradním API ověřila načtení, uložení a opětovné otevření, přepnutí účtů, opožděnou odpověď předchozího účtu, chybu načtení i zápisu, konflikt revizí, odhlášení a vyprázdnění při události `pagehide`. Nešlo o test produkční databáze ani skutečné přihlášení Firebase. Samostatné `tsc --noEmit` prošlo; lint bez chyb s jedním dřívějším upozorněním. `next build --webpack` změny zkompiloval, ale úplné sestavení zastavila již existující chyba nepovoleného exportu `buildRows` ve stránce srovnání cestovního pojištění. Produkční data se neměnila. Staré kopie na jednotlivých zařízeních budou odstraněny až po nasazení a spuštění nové verze aplikace v příslušném prohlížeči.

**6. Střední priorita: ověření e-mailu lze potvrdit bez důkazu přístupu do schránky.**

`POST /api/auth/confirm-email-for-mfa` po kontrole platného tokenu a nedávného přihlášení nastavuje `emailVerified: true`. Nevyžaduje ověřovací odkaz nebo kód doručený do schránky ani oprávnění správce. Nedávné přihlášení dokazuje přístup k účtu, nikoli vlastnictví uvedené e-mailové schránky.

**Náprava:** využít standardní ověřovací e-mail. Ruční potvrzení případně ponechat jen jako výslovnou, auditovanou administrátorskou operaci. Dopad na převzetí jiného účtu závisí na registraci a životním cyklu identit a nebyl testován. Žádné ověřovací zprávy se neposílaly a žádný účet se neměnil. [Endpoint](../src/app/api/auth/confirm-email-for-mfa/route.ts)

**7. Nesoulad nasazení: Firestore nepoužívá aktuální pravidla z repozitáře.**

Aktivní Firestore release byl aktualizován 12. 6. 2026. Od souboru v projektu se liší mimo jiné omezením jednoho účtu na zakládání uživatelů místo plné administrace. Přítomnost případného starého administrátorského claimu tohoto účtu nebyla ověřena. Starší seznam produktů není sám o sobě bezpečnostní nález.

**Náprava:** zahrnout pravidla do kontrolovaného nasazení, po opravě porovnat nasazený obsah s verzí v repozitáři a ověřit skutečné custom claims dotčených rolí. Samotný deploy webu změnu Firestore pravidel nezaručuje.

**Následná náprava — zdroj sjednocen:** samostatné nasazení pravidel dne 5. 9. 2026 v 18:39 CEST bylo ověřeno načtením aktivního zdroje. Nová verze je `084793b7-5428-4b8d-82e1-2833798b9b23`, SHA-256 `b5731166f822c1c10c78a987a9e387df2948ce87fb479e6f48cfdf3236b8862b`. Předchozí pravidla byla zálohována včetně původního rulesetu pro případný návrat. [Záznam nasazení](./firestore-rules-release-2026-09-05.json), [skript přípravy a ověření](../scripts/firestore-rules-release.mjs). Nasazení nezměnilo Storage pravidla, uživatelské dokumenty ani web.

**Co se podařilo pozitivně ověřit**

| Oblast | Výsledek a rozsah |
| --- | --- |
| Obnova databáze | Firestore `eur3`, PITR zapnuto; nejstarší dostupný okamžik při kontrole 29. 8. 2026. |
| Ochrana databáze | `DELETE_PROTECTION_ENABLED`. |
| Storage pravidla | Nasazené pravidlo zakazuje přímé čtení i zápis klientům pro všechny cesty. |
| Veřejná oprávnění | Žádný `allUsers` ani `allAuthenticatedUsers` v IAM bucketu a žádné veřejné ACL mezi všemi 1 328 aktuálními objekty. Tokenové odkazy jsou samostatná výjimka popsaná výše. |
| PDF smluv | Všech 1 303 objektů pod `contract-pdfs/` bez veřejného ACL a bez Firebase download tokenu. API před vydáním souboru kontroluje přístup ke smlouvě. |
| Obnova souborů | Soft delete bucketu nastaven na 30 dní. Nebyla provedena zkušební obnova. |
| Firebase Auth | MFA povoleno a ochrana proti zjišťování existence e-mailových účtů zapnuta. Nejde o potvrzení, že všichni uživatelé skutečně používají druhý faktor. |
| Ověřování tokenů | Nalezená serverová volání `verifyIdToken` používají i kontrolu revokace (`true`). |
| Nové šifrování pošty | Kód používá AES-256-GCM, náhodné klíče/IV a kontextová autentizovaná data. Stav migrace je neúplný. |
| Tajné hodnoty v Gitu | Cílený vzorový sken aktuálně sledovaných textových souborů nenašel soukromé klíče a vybrané typy servisních tokenů. Kontrola historie názvů `.env`, `.env.local`, PEM a běžných servisních JSON nevrátila nález. Nešlo o úplný sken všech historických blobů. |

`npm audit --omit=dev` dále uvedl dva nálezy s dostupnou opravou: nízkou závažnost u `@simplewebauthn/server` a střední u `fflate`. Jejich skutečná dosažitelnost v aplikaci nebyla prokázána. Úspěch předchozích 598 aplikačních testů nenahrazuje testy databázových pravidel, produkční konfigurace nebo všech útočných scénářů.

**Meze kontroly a ověření potřebná po opravách**

Čtení plánů záloh skončilo HTTP 403; nelze z toho dovodit, že zálohy nejsou nastavené. Dostupnost PITR byla ověřena odděleně. Simulace pravidel skončila HTTP 403 a lokální Firestore emulátor nebyl dostupný bez Java runtime. Pět běžných nepřihlášených HTTP požadavků na web a vybraná API skončilo HTTP 429 před ověřením chování aplikace; nevypovídají o správnosti autorizace jednotlivých endpointů. Nebylo prověřeno kompletní projektové IAM, všechny účty a jejich MFA/claims, produkční proměnné Vercelu, auditní logy, historie případného úniku ani záloha a obnova šifrovacích klíčů.

Doporučené zbývající kroky: opravit dekódování obrázků; dokončit migraci starých příloh a zneplatnit jejich odkazy; ověřit historický původ existujících rolí; nasadit opravu místního ukládání osobních údajů a opravit ověřování e-mailu; provést zkušební obnovu dat a klíčů. Samotná kontrola opravy neprováděla. Následná oprava Firestore pravidel je nasazena; změny webu zůstávají lokální. Aplikační testy po doplnění kontroly rolí: 658 prošlo, lint bez chyb s jedním dřívějším upozorněním. Kompletní kontrolu typů a sestavení webu stále blokuje dřívější nepovolený export `buildRows` ve stránce srovnání cestovního pojištění; nasazení databázových pravidel je na sestavení webu nezávislé.
