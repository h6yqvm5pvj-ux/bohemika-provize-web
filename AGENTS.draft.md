# AGENTS.md — Bohemika SmartApp (návrh)

Tento dokument je návrh kořenového `AGENTS.md`, vytvořený podle pracovního stromu k 2026-10-02. Zahrnuje i aktuální necommitnuté soubory. Popisuje ověřenou implementaci a pravidla pro další práci; nepotvrzuje stav nasazené produkce. Při přijetí návrhu zachovej také blok Next.js na konci dokumentu.

## 1. Zásady práce

- Jednej jako seniorní full-stack vývojář se zaměřením na bezpečnost, soukromí a stabilitu. Nejdřív přečti související implementaci, testy a konfiguraci; neodvozuj chování jen z názvu souboru nebo staršího auditu.
- Před změnou zkontroluj `git status --short`. Zachovej cizí rozpracované změny. Neměň nesouvisející kód a nezaváděj nové vrstvy nebo závislosti bez konkrétního důvodu.
- Rozlišuj současný stav, doporučenou změnu a neověřenou domněnku. Nejasnosti popiš výslovně. Dokumenty v `docs/` a `evidence/` jsou podklady z určitého data, nikoli důkaz aktuálního nasazení.
- Používej existující doménové funkce a bezpečnostní helpery. Zachovej místní TypeScript/React konvence, alias `@/*`, české texty UI a styl okolního kódu.
- Bez výslovného souhlasu nemaž produkční data, neresetuj databázi, neprováděj destruktivní migrace, neměň produkční secrets, nevypínej autentizaci ani autorizaci a nedělej force push na chráněnou větev.
- Nikdy nekopíruj skutečné secrets, osobní údaje ani obsah `.env` do dokumentace, testů, commitů či odpovědí. Používej syntetická data. Objevený zveřejněný secret nepiš do výstupu; upozorni na něj bez hodnoty a doporuč rotaci.
- Neukládej hesla v plaintextu a nevytvářej vlastní kryptografické algoritmy. Používej zavedené auth/kryptografické knihovny a stávající helpery; secrets patří do serverového environmentu nebo secret manageru. Dodržuj nejmenší potřebná oprávnění.

## 2. Stack a hranice aplikace

Web je Next.js App Router aplikace pro pojišťovací poradce: smlouvy, provize, cashflow, tým, klientské karty, tipy, interní pošta, pomůcky a veřejné online vizitky. Backend tvoří Route Handlers ve stejném projektu a samostatný balíček Firebase Functions.

| Oblast | Ověřený stav |
| --- | --- |
| Web | Next.js 16.3.6, React/React DOM 19.2.3, TypeScript 5.9.3 podle kořenového lockfile. |
| UI | Tailwind CSS 4, CSS Modules, globální CSS, Lucide; existuje konfigurace `components.json`. |
| Data | Cloud Firestore přes Firebase Admin SDK; Firebase Storage pro soubory. Relační databáze ani ORM nebyly v aplikaci nalezeny. |
| Firebase | Klientský SDK 12.6.0, Admin SDK 13.10.0 podle lockfile; klient používá Auth a Messaging. V aktuálním `src/` nebylo nalezeno přímé čtení Firestore klientským SDK. |
| Přihlášení | Firebase Auth, TOTP MFA, passkeys přes `@simplewebauthn/browser` a `@simplewebauthn/server`, vlastní serverová session pro stránky. NextAuth není zde použitý auth framework; název `NEXTAUTH_SECRET` existuje jako kompatibilní fallback. |
| PDF a obrázky | PDF.js, Tesseract.js s českými/anglickými daty, jsPDF, html2pdf.js, html2canvas-pro, Sharp. |
| Kontroly | Vitest 4, vybrané komponentové testy v happy-dom, ESLint 9, TypeScript strict, Firebase rules-unit-testing. |
| Provoz | Konfigurace Vercel, Firebase Functions, Vercel cron a Google Cloud Scheduler. Skutečné nasazení ověřuj samostatně. |
| Balíčky | `package.json` + `package-lock.json` a samostatné `functions/package.json` + `functions/package-lock.json`; používej npm. |

Verze aktualizuj podle manifestů a lockfile, nikoli zpaměti. Kořenový balíček neudává `engines.node`; Functions požadují Node.js 22. `@types/node` neurčuje runtime.

## 3. Mapa projektu

| Cesta | Význam |
| --- | --- |
| `src/app/layout.tsx` | Kořenový serverový layout, globální CSS, PWA a privacy cleanup; `connection()` zajišťuje vykreslení pro konkrétní request kvůli CSP nonce. |
| `src/app/page.tsx`, `src/app/home/` | Hlavní stránka a její widgety, načítání a výpočty. `home/` není samostatná stránka `/home`. |
| `src/components/AppLayout.tsx` | Sdílený klientský obal pracovních stránek, navigace, stav přihlášení, setup a UI omezení přístupu. |
| `src/app/smlouvy/`, `kalkulacka/`, `cashflow/` | Správa smluv, výpočet provizí a provizní kalendář. |
| `src/app/_klienti/`, `src/app/_provizni-vypisy/` | Implementace pracovních sekcí; skutečné routy jsou v `klienti/` a `provizni-vypisy/`. Podtržítkové adresáře nepovažuj za URL. |
| `src/app/muj-tym/`, `tipy/`, `posta/`, `intranet/`, `admin/` | Tým, tipy, interní komunikace a administrace. |
| `src/app/pomucky/` | Doménové nástroje, srovnávače, PDF exporty a editor dokumentů. |
| `src/app/vizitka/`, `src/app/embed/` | Veřejné vizitky a vložené stránky; mají odlišná pravidla zveřejnění a CSP. |
| `src/app/api/` | HTTP Route Handlers, včetně veřejných, administračních a cron endpointů. |
| `src/app/lib/`, `src/app/types/domain.ts` | Sdílená doménová logika, provizní vzorce, PDF parsery a klientské helpery; ne vše v `app/lib` je pouze klientské. |
| `src/lib/`, `src/lib/server/` | Sdílené politiky a serverové služby: Admin SDK, auth, oprávnění, šifrování, integrace, projekce a rate limiting. |
| `src/components/` | Sdílené UI a feature komponenty; další komponenty a hooky jsou vedle svých stránek. |
| `src/proxy.ts` | Serverové omezení přístupu ke stránkám, CSP, bezpečnostní hlavičky a cache politika. |
| `functions/` | Samostatný JavaScript/CommonJS backend, vlastní závislosti a testy. |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Pravidla přímého přístupu klientů a Firestore indexy. |
| `private/dokumenty/` | Serverově poskytované dokumenty. Přesun do `public/` by změnil jejich přístupnost. |
| `public/` | Veřejné assety, service worker, manifest a PDF/OCR prostředky; sem nepatří soukromé soubory ani secrets. |
| `tests/security/`, `tests/firestore/`, `tests/helpers/` | Bezpečnostní regrese, emulátorové integrační testy a jejich pomocný kód. Většina dalších testů leží vedle implementace. |
| `scripts/`, `docs/`, `evidence/` | Diagnostika, migrace, provozní skripty a historická dokumentace. Obsah může být citlivý. |

`CLIENT_CARDS_ENABLED` a `COMMISSION_STATEMENTS_ENABLED` jsou nyní `true`; další přístupové podmínky existují v UI, proxy a API. Zapnutý feature flag nepřiděluje oprávnění.

## 4. Frontend a doménová logika

- Pracovní stránky často používají `"use client"`, vlastní hooky a `AppLayout`. Změnu server/client hranice posuzuj podle importů; serverové credentials a serverové moduly nesmí skončit v klientském bundlu.
- Pro autorizované požadavky využívej `src/app/lib/authenticatedApi.ts`: Bearer token, obnova tokenu po 401, výchozí `cache: "no-store"`, varianty pro JSON a Blob. Helper nenahrazuje kontrolu oprávnění serveru.
- Provizní logika je v `calculateCommission.ts`, `productFormulas.ts`, `productFormulas/`, `commissionPayoutRules.ts` a souvisejících doménových modulech. Zachovej historické koeficienty, rozhodná data, zaokrouhlení, storna a rozdíl mezi vlastní a manažerskou provizí. Neduplicuj vzorce v UI a API.
- Cashflow má samostatný model a Web Worker (`src/app/cashflow/cashflowModel.ts`, `cashflowWorker.client.ts`, `cashflow.worker.ts`) s fallbackem. Zachovej rušení požadavků, revize dat a likvidaci workeru při změně kontextu.
- Serverové cashflow shadow/candidate endpointy slouží k diagnostickému porovnání. Výsledek `verified` není povolení nahradit zobrazované částky serverovou cache; viz `shadowProtocol.ts`, `candidateCheckProtocol.ts` a `src/lib/server/cashflow*.ts`.
- PDF import kombinuje parsování textové vrstvy a OCR. Sdílej `pdfDocumentText.ts` a `pdfOcr.ts`, respektuj limity, rušení a uvolnění prostředků. Importované údaje zůstávají nedůvěryhodným vstupem.
- PWA není offline úložiště klientských dat: `public/sw.js` ukládá jen povolené statické prostředky, vynechává API, autorizované požadavky, RSC a soukromé odpovědi; navigaci načítá ze serveru.

## 5. Backend, API a validace

API tvoří soubory `src/app/api/**/route.ts` s metodami GET/POST/PUT/PATCH/DELETE podle endpointu. Jde převážně o JSON, ale existují uploady, binární odpovědi a SSE pro poštu (`api/mailbox/stream`). Není zde společné deklarativní schéma všech endpointů ani nalezená vrstva GraphQL/tRPC.

Smlouvy mají delegující routy a sdílenou implementaci `src/app/api/contracts/_lib/contractsApi*`; ostatní oblasti kombinují vlastní handler s helpery v `src/lib/server/`. Hlavní skupiny zahrnují auth, users/profile, contracts, client-cards, commission-statements, mailbox, tips, team-overview, documents, online-card, admin a cron. Nepředpokládej jednotnou obálku odpovědí; zachovej existující kontrakt konkrétního endpointu.

Pro nový nebo upravený endpoint:

1. Urči, zda je soukromý, veřejný, setup/auth nebo cron. Veřejnou výjimku nepřidávej jen proto, aby prošel test.
2. U soukromého API ověř identitu přes existující serverové helpery před přístupem k obchodním datům nebo externí službě. Typicky použij `requireAuthedRateLimited` nebo `requireAdvisorAuthedRateLimited` z `apiEntryGuard.ts`; admin používá také `adminAuth.ts`.
3. Zvlášť ověř oprávnění k cílovému záznamu, požadované operaci a poli. Klientský `userId`, e-mail vlastníka, role, ID z URL ani impersonation hlavička nejsou oprávnění.
4. Validuj `unknown` vstup za běhu: typ, povolená pole, délku, rozsah, konečnost čísel, datum, identifikátory, enumy a související doménové podmínky. TypeScript typ nebo `as` není validace.
5. Používej existující validátory, například `contractsApi.validation.ts`, `contractsApi.createPayload.ts`, `contractsApi.listFilters.ts` a `src/lib/profileFields.ts`. V projektu nebyla nalezena společná runtime validační knihovna typu Zod/Yup/Joi; nepřidávej ji automaticky pro jednotlivou úpravu.
6. Vracej pouze potřebná pole. Zachovej omezené projekce pro seznamy, tipaře a sdílené smlouvy; nevracej přímo celý Firestore dokument nebo dešifrovaný záznam.
7. Zachovej rate limiting, soukromé cache hlavičky a vhodné chybové stavy. Zkontroluj, že chyba ani log neobsahuje token, cookie, celý request, osobní údaje, stack trace nebo detaily infrastruktury. Současné handlery se liší; jednotnou sanitizaci chyb nelze předpokládat.

U uploadů ověř vlastnictví, velikost, skutečný formát a bezpečný název/cestu. Používej helpery `safeUserAttachments.ts`, `contractPdfStorage.ts`, `mailboxAttachmentStorage.ts`, `profileAvatarUpload.ts`, `userRequestScreenshot.ts` a `privateStorage.ts` podle typu dat. U proxy/integrací zachovej omezení cílových adres, cest, redirectů, velikostí a timeoutů; nepřijímej libovolnou URL nebo Storage cestu od klienta.

Firebase Functions mají vlastní HTTP vstupy, Firestore triggery a scheduled funkce v `functions/index.js`. `functions/security.js` vynucuje vlastní auth/MFA/revokaci a rate limiting; Next proxy je nechrání. Integrace zahrnují ČÚZK/RÚIAN, registr vozidel, AI asistenta, notifikace a Fakturoid. `functions/billing.js` ověřuje webhook secret, přiřazení zákazníka a idempotenci faktury a zapisuje předplatné transakčně. Zachovej deduplikační záznamy `billingWebhookInvoices`, kontroly vstupů a samostatné runtime identity z `functions/runtime.js`.

## 6. Autentizace, session a oprávnění

### Přihlášení a serverové kontroly

- Klientskou Firebase aplikaci inicializuje `src/app/firebase-app.ts`, Auth `src/app/firebase.ts`; `firebase-auth.ts` je reexport. Auth má fallback persistence local/session/memory.
- `src/lib/server/firebaseAdmin.ts` exportuje `adminAuth`, `adminDb` a messaging. Bez nakonfigurovaných Admin credentials mohou být exporty `null`; tuto situaci musí handler zvládnout.
- Exportovaný `adminAuth` není neupravené `getAuth()`: používá `withFirestoreTokenRevocation` a `withAccountSecurityPolicy`. Politika kontroluje revokaci, blokaci/disabled účet, ověřený e-mail, TOTP enrollment a odpovídající doklad přihlášení. Neobcházej ji novou přímou instancí SDK.
- Specifické setup/recovery kroky mají omezené výjimky. Nevynucuj hotový setup před jeho dokončením a nerozšiřuj výjimku na obchodní API; čti `accountSecurityPolicy.ts`, `advisorSetupGuard.ts`, `mfaEnrollment.ts` a příslušné auth routy.
- Passkeys jsou implementované v `src/lib/server/passkeys.ts` a `api/auth/passkeys/`; zachovej kontrolu challenge, origin/RP a pravidla pro custom-token přihlášení.
- Ochrana stránek používá podepsanou aplikační cookie a živý registr session: `src/lib/appSession.ts`, `src/lib/server/appSessionRegistry.ts`, `activeAppSession.ts`, `src/proxy.ts`, `api/auth/session`. Cookie pro stránku nenahrazuje Bearer autorizaci API. Zachovej HttpOnly/SameSite/Secure politiku, expiraci a revokaci; u operací s cookie výslovně posuď CSRF a ověření původu. Současné session routy nekontrolují Origin/Sec-Fetch-Site.

### Oddělené dimenze oprávnění

| Dimenze | Význam a zdroj |
| --- | --- |
| Admin role | `support < admin < owner`, definice a aliasy v `src/lib/adminAccess.ts`, serverové vynucení v `src/lib/server/adminAuth.ts`. Správa uživatelů/zabezpečení vyžaduje admina, mazání uživatelů a správa předplatného ownera. Samotná existence role `support` neznamená právo číst klienty nebo provádět admin operace. |
| Zakládání účtů | Samostatná capability `accountCreator`; není totéž co plná administrace. |
| Typ účtu | `advisor` a `tipster`; `advisorSetupGuard.ts` a konkrétní API omezují poradenské operace. |
| Kariérní pozice a tým | Poradce/manažer a hierarchie ovlivňují provize a rozsah dat; viz `src/app/types/domain.ts`, `src/app/lib/teamHierarchy.ts`, `contractsApi.access.ts`. Manažerská pozice není admin role. |
| Specialista dokumentů | `src/lib/specialistAccess.ts` a `src/lib/server/toolDocuments.ts`; speciální oprávnění ke správě dokumentů, nikoli obecné povýšení na admina. |
| Vlastnictví a sdílení | Konkrétní resource policy: vlastník smlouvy, tým, tip, sdílený klient nebo poštovní konverzace. Čtení neimplikuje právo zápisu či smazání. |
| Setup a předplatné | Samostatný stav profilu/účtu. Předplatné se kontroluje při vydání session a ve smluvním `requireContractsEntryGuard` v `contractsApi.ts`. UI `SubscriptionGate.tsx` ani obecný auth guard nejsou důkazem kontroly předplatného na všech API. |

Existují legacy aliasy a výjimky navázané na konkrétní identity. Jejich hodnoty sem nekopíruj, nerozšiřuj je jako obecný vzor. JavaScriptové resolvery a Firestore rules nemají automaticky totožné fallbacky; při změně role prověř oba mechanismy.

Impersonation řeší `src/lib/server/impersonation.ts`, `src/lib/adminImpersonationShared.ts` a klientské `src/app/lib/adminImpersonation.ts`. Je určena adminovi/ownerovi pro existujícího aktivního neadministrátorského uživatele. Rozlišuj skutečného aktéra a efektivního uživatele; rate limiting se váže na aktéra. Endpoint musí tento režim výslovně podporovat; záznam v prohlížeči ani zaslaná hlavička nestačí. U autorových soukromých draftů není impersonation oprávněním k přístupu.

## 7. Firestore, Storage a konzistence

- Firestore nemá ORM schéma ani standardní adresář relačních migrací. Tvar dokumentů určují TypeScript typy, handlery, serverové helpery, pravidla a migrační skripty. Identita se používá jako Firebase UID i normalizovaný e-mail; neprováděj plošnou změnu klíčů bez analýzy odkazů a migrace.
- Základní smlouvy jsou v `users/{ownerEmail}/entries/{entryId}`, pošta v `usersPrivate/{email}/mailbox/{id}`, soukromé karty v `clientCardsPrivate/{uid}/cards/{slug}`. Další oblasti zahrnují profily, provizní výpisy, tipy, historii smluv, session a odvozené indexy/projekce. Konkrétní cestu vždy ověř v příslušném helperu; nejde o úplný datový slovník.
- `firestore.rules` omezuje přímé klientské operace, změny privilegovaných profilových polí a přístup k datům jiných uživatelů; některé kolekce jsou pouze serverové. Firebase Admin pravidla obchází, proto server musí sám vynutit každou autorizaci.
- `storage.rules` nyní zakazuje všechny přímé klientské read/write operace. Pro chráněné soubory zachovej serverové zprostředkování; neotvírej bucket ani nevytvářej veřejné download tokeny jako zkratku.
- Firestore dotazy a nové indexy kontroluj společně s `firestore.indexes.json`, stránkováním, limity a oprávněním k celému výsledku. Pro hromadná čtení existuje `src/lib/server/firestoreReads.ts`.
- Související zápisy musí být konzistentní. Změny smluv integruj s `withContractHistory` v `src/lib/server/contractHistory.ts` ve stejné transakci/batchi. U batchů založených na načteném snapshotu zachovej podmínku `lastUpdateTime`, také při převodu smlouvy.
- Historický helper zároveň udržuje vazby klient–smlouva, invalidaci projekce síně slávy, šifrovaný obsah historie a umístění poznámek při převodu. Samostatný zápis smlouvy může tyto vazby rozbít.
- U zápisů ovlivňujících cashflow zachovej `withCashflowMutation` a `trackCashflowWrite` z `cashflowMutationTracking.ts`. `trackCashflowWrite` přijímá callback, který teprve zahájí SDK zápis. Tracking je řízen `CASHFLOW_CACHE_TRACK_WRITES`; neobcházej ho v migracích ani skriptech.
- Při změně zdrojových dat prověř odvozené projekce (`clientContractIndex`, `teamOverviewProjection`, `hallOfFameProjection`, home/cashflow cache) a jejich invalidaci. Cache nesmí zachovat přístup po změně identity nebo oprávnění.

## 8. Osobní údaje a šifrování

Aplikace pracuje s údaji klientů i poradců: kontakty, adresami, rodnými čísly a identifikačními údaji, smlouvami, finančními částkami, PDF, poznámkami, zprávami, přílohami a bezpečnostními údaji přihlášení. Zdravotní a finanční informace mohou být také ve vložených dokumentech a volném textu. Nepoužívej skutečné soubory ani jejich obsah jako testovací fixtures.

- Šifrování vybraných záznamů a souborů implementují `privateEncryption.ts`, `privateRecords.ts`, `privateStorage.ts` a `mailboxEncryption.ts`. Jde o serverové obálkové AES-256-GCM šifrování s vazbou na kontext záznamu/cesty. Server může data dešifrovat; nejde o end-to-end šifrování.
- Klasifikaci šifrovaných polí hledej v `privateRecords.ts`, `businessDataEncryption.ts` a příslušných helperech karet, tipů a pošty; neodvozuj ji z názvu kolekce. `businessDataFirestore.ts` obaluje `adminDb` pro identitu smluv, výpisy a odvozené kopie. Zachovej tuto vrstvu i v servisních skriptech; neobalené SDK by obešlo šifrování. Dotazovací, vlastnická a výpočetní metadata zůstávají čitelná. Nepiš, že je zašifrována celá databáze.
- Používej existující seal/open helpery; nejprve ověř přístup, poté data dešifruj a vytvoř minimální odpověď. Neměň formát obálky, AAD nebo cestu šifrovaného záznamu bez zohlednění existujících dat.
- Key ring používá `MAILBOX_ENCRYPTION_KEY`, `MAILBOX_ENCRYPTION_KEY_ID` a `MAILBOX_ENCRYPTION_PREVIOUS_KEYS`, také pro další soukromá data. Rotace vyžaduje zachování možnosti číst starší záznamy. Klíče nikdy nevypisuj ani nepředávej přes `NEXT_PUBLIC_*`.
- `PRIVATE_DATA_ENCRYPTION_REQUIRED` ovlivňuje přijímání legacy nešifrovaných soukromých dat. Repo obsahuje migrační dokumentaci; skutečné dokončení migrace a nastavení všech prostředí nelze potvrdit jen čtením kódu.
- Nové hledání rovnosti používá stabilní samostatný `BUSINESS_DATA_INDEX_KEY` a interní HMAC indexy. `BUSINESS_DATA_ENCRYPTION_REQUIRED` řídí přechodné čtení starých smluv, výpisů a poptávek nezávisle na předchozím přepínači. Před zapnutím dokonči migraci podle `docs/business-data-encryption.md`. Indexový klíč neměň běžnou rotací šifrovacího klíče. Chráněné pole zapisuj celé, nikoli vnořeným field-path updatem nebo transformací pole.
- Soukromé cache spravuje `src/app/lib/privateMemory.ts`; při změně účtu, odhlášení a impersonation se musí invalidovat. Do localStorage/sessionStorage nevracej nešifrované klientské údaje.
- Trvalé plánovací drafty používají `src/app/lib/privateBrowserStore.ts` se šifrovaným localStorage; editor dokumentů ukládá šifrované drafty do IndexedDB (`src/app/pomucky/tvorba/documentDraft.ts`, `draftEncryption.ts`). Klíč poskytuje autorovi `api/document-drafts/key`. Zachovej ověřování autora, oddělení účtů, cleanup a bezpečnou migraci starého obsahu.
- Údaje z veřejné vizitky jsou vědomá projekce pro zveřejnění, nikoli důvod vracet celý profil. Rozlišuj soukromé přílohy a veřejné profilové/marketingové obrázky.
- Existující identifikátory a některé URL obsahují e-mailové adresování. Jde o vlastnost současného návrhu, nikoli doporučení: nepřidávej další citlivé údaje do URL, query, analytiky nebo logů.

## 9. Další bezpečnostní mechanismy

- `src/proxy.ts` vytváří CSP nonce, omezuje frame ancestors a chrání soukromé stránky; `next.config.ts` doplňuje HSTS, nosniff, Referrer/Permissions/COOP/CORP hlavičky. Embed stránky a OCR mají cílené výjimky. Neuvolňuj globální CSP kvůli jediné komponentě.
- Root layout nesmí začít sdílet HTML s nonce mezi požadavky. Zachovej `private, no-store` pro soukromé odpovědi a nepřidávej osobní data do veřejných Next/PWA cache.
- `src/lib/server/rateLimit.ts` používá Redis REST/Upstash/Vercel KV, poté Firestore `_rateLimits`, teprve následně povolený paměťový fallback. V produkci je paměťový fallback výchozí zakázaný; bez dostupného sdíleného úložiště se přístup odmítá. Důvěryhodné IP hlavičky jsou součást bezpečnostní konfigurace, nikoli libovolný údaj klienta.
- Login lockout, revokaci a aktivní session řeší specializované serverové moduly. Při změně hesla, MFA nebo zablokování účtu prověř již vydané tokeny, cookies i aktivní session.
- Crony admin broadcast a odložené pošty používají `webCronAuth.ts`: sdílený secret nebo ověření Google OIDC s přesným audience a identitou plánovače. Ostatní webové crony kontrolují `CRON_SECRET` ve vlastních routách. Lokální výjimka není oprávnění zpřístupnit produkční job veřejně.
- Soukromé HTML/texty vykresluj bezpečně. U rich textu a PDF/exportů zachovej sanitizaci a omezení odkazů; samotná CSP nenahrazuje bezpečné zpracování obsahu.

## 10. Environment a externí služby

`.env*` je ignorováno Gitem; `.vercelignore` vylučuje lokální konfiguraci a další citlivé/provozní soubory z CLI uploadu. Nezobrazuj hodnoty environment variables při diagnostice. Mnohé skripty načítají lokální environment přes `@next/env`, takže mohou mířit na skutečný cloud i při lokálním spuštění.

| Skupina | Názvy / místo definice |
| --- | --- |
| Veřejná Firebase konfigurace | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`; `src/app/firebase-app.ts`. Jde o klientskou konfiguraci, nikoli Admin credentials. |
| Firebase Admin | `FIREBASE_ADMIN_CREDENTIALS` nebo trojice `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`; `firebaseAdmin.ts`. |
| Session | `APP_SESSION_SECRET`, kompatibilní fallbacky a doby platnosti v `src/lib/appSession.ts`. Preferuj vyhrazený session secret; názvy fallbacků nepovažuj za zavedení jiné auth knihovny. |
| Šifrování | `MAILBOX_ENCRYPTION_KEY`, `MAILBOX_ENCRYPTION_KEY_ID`, `MAILBOX_ENCRYPTION_PREVIOUS_KEYS`, `PRIVATE_DATA_ENCRYPTION_REQUIRED`, `BUSINESS_DATA_INDEX_KEY`, `BUSINESS_DATA_ENCRYPTION_REQUIRED`. |
| Rate limiting | `RATE_LIMIT_REDIS_REST_URL`, `RATE_LIMIT_REDIS_REST_TOKEN`; alternativy `UPSTASH_REDIS_REST_*`, `KV_REST_API_*`; `RATE_LIMIT_ALLOW_MEMORY_FALLBACK`, `RATE_LIMIT_TRUSTED_IP_HEADERS`, `RATE_LIMIT_TRUST_PROXY_HEADERS`. |
| Passkeys | `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_ALLOWED_ORIGINS`; přesné odvození originu v `passkeys.ts`. |
| Storage / obrazy | `FIREBASE_STORAGE_BUCKET`, veřejná Firebase konfigurace; omezení hostů v `src/lib/firebaseImageSources.ts` a `next.config.ts`. |
| Cron | `CRON_SECRET`; další konfiguraci plánovače ověř v `web-scheduler.json` a `scripts/deploy-web-scheduler.mjs`. |
| Auth e-maily | `RESEND_API_KEY`, `AUTH_EMAIL_FROM`; `src/lib/server/firebaseAuthEmail.ts` a `docs/auth-email-setup.md`. |
| Functions secrets | `OPENAI_API_KEY`, `FAKTUROID_WEBHOOK_TOKEN`, `CUZK_API_KEY`, `DATAOVOZIDLECH_API_KEY` přes Firebase `defineSecret()` v `functions/index.js`. |
| Volitelné funkce | Cashflow přepínače v `src/lib/server/cashflow*.ts`; `ANALYZE` zapíná bundle analyzer. |
| Integrace | Konfiguraci e-mailů, vozidlových služeb a workerů hledej v jejich serverových modulech a konkrétních routách. Nejde o úplný seznam povinných env pro každé prostředí. |

Repo obsahuje napojení na Resend pro auth e-maily, Firebase Messaging, vozidlové/registry služby a externí workery. Před změnou integrace ověř její konkrétní autentizaci, timeouty a předávaná data. Nedokládej dostupnost nebo bezpečnost vzdálené služby jen existencí proxy handleru.

## 11. Příkazy a ověřování

### Kořenové package scripts

| Příkaz | Účel a omezení |
| --- | --- |
| `npm run dev` | Next dev server. S lokální konfigurací může aplikace komunikovat se skutečnými službami. |
| `npm run build` | Image runtime guard → security config guard → Next build → kontrola přítomnosti auth proxy ve výsledku. Nevynechávej guardy přímým `next build`. |
| `npm run start` | Produkční server nad existujícím buildem. |
| `npm run lint` | ESLint s Next core-web-vitals + TypeScript pravidly; `no-explicit-any` je nyní vypnuté. |
| `npm test` | `vitest run`; běžné unit/komponentové/API testy a `tests/security`, vynechává `tests/firestore` a `.tmp`. |
| `npm run test:watch` | Vitest watch. |
| `npm run test:rules` | Firestore + Auth emulátory, projekt `demo-bohemika-rules`, `vitest.rules.config.ts`. Vyžaduje Firebase CLI a Java 21+. |
| `npm run cashflow:pilot` | Syntetický benchmark v samostatném demo projektu na lokálním Firestore emulátoru; nejde o produkční měření. |
| `npm run check:image-runtime` | Kontrola runtime Next/Sharp a nativních obrazových závislostí na dané platformě. |
| `npm run clean` | Smaže `.next`; ne data aplikace. Nepouštěj proti právě používanému buildu bez potřeby. |
| `npm run clean:next-cache` | Smaže pouze `.next/cache` a `.next/dev/cache`. |
| `npm run mailbox:encrypt-legacy` | Migrační skript; výchozí dry-run může číst skutečná data. `-- --apply` zapisuje. Není běžná kontrola projektu. |
| `npm run assets:optimize-icons` | Mění obrazové assety. |
| `npm run generate:homepage-gif` | Generuje demonstrační GIF. |
| `npm run generate:homepage-gif:real` | Generuje GIF ze screenshotů; nepoužívej screenshoty s osobními údaji. |

Samostatný `typecheck` script neexistuje. Pro kontrolu typů bez aktualizace incremental cache lze použít `npx tsc --noEmit --incremental false` s již nainstalovanými závislostmi. `tsconfig.json` má `strict: true`, ale vylučuje `scripts/**` a `functions/**`; úspěšný typecheck je nekontroluje. Zahrnuje generované Next typy, proto případný problém chybějících/zastaralých typů odliš od chyby aplikace.

### Testovací vrstvy

- Cílené Vitest testy: `npm test -- <cesta-k-testu>`; konfigurace je v `vitest.config.ts`.
- `tests/security/api-authentication.test.ts` prověřuje exportované HTTP handlery a odmítnutí neplatné autentizace před obchodními DB/síťovými operacemi. Má explicitní veřejné a setup výjimky. Neprokazuje všechny varianty autorizace jednotlivých resource.
- Emulátorové testy v `tests/firestore/` zahrnují rules i integrační serverové scénáře. Používají lokální Firestore `127.0.0.1:8180` a Auth `127.0.0.1:9299`; zachovej ochrany proti běhu na jiném hostu/projektu. Nastavení je v `firebase.rules-test.json`, `vitest.rules.config.ts` a `tests/helpers/`.
- Firebase Functions mají vlastní `npm --prefix functions test` (`node --test test/checks.cjs`). Další integrační test `functions/test/firestore.cjs` není součástí tohoto příkazu ani kořenového `npm test`. Dokumentovaný izolovaný příkaz je `firebase emulators:exec --only firestore --project demo-bohemika-rules --config firebase.rules-test.json "node --test functions/test/firestore.cjs"`; viz `functions/README.md`.
- Pro Java problém s českou locale README uvádí `JAVA_TOOL_OPTIONS='-Duser.language=en -Duser.country=US'`. Nesnižuj kvůli lokálnímu problému bezpečnostní pravidla testů.
- V repozitáři nebyla nalezena zavedená CI pipeline ani Playwright/Cypress E2E sada. Vitest UI testy nejsou náhrada ověření skutečného prohlížeče u změn session, CSP, workerů nebo uploadů.

Po změně spouštěj relevantní dostupné kontroly a zaznamenej, co skutečně proběhlo. Bezpečnostní změny ověř pro nepřihlášeného uživatele, chybějící oprávnění, uživatele A proti datům B, manipulované ID/vstupy, eskalaci oprávnění i úspěšný scénář. Podle změny přidej blokaci/revokaci, MFA a impersonation. Neopravuj test odstraněním oprávněné bezpečnostní podmínky.

Pro čistě dokumentační změnu ověř odkazy, příkazy, faktickou shodu a diff; automaticky nespouštěj cloudové operace nebo celý produkční build. Tento návrh sám není záznamem úspěšného spuštění testů/lintu/typechecku.

## 12. Provoz a skripty

- Web, Firebase Functions, Firestore rules/indexy, Storage rules a Cloud Scheduler mají samostatné konfigurace a nasazení. Webový deploy automaticky nepotvrzuje aktualizaci ostatních částí. Konfigurace webu uvádí region `fra1`, Functions `europe-central2`; skutečné cloudové umístění ze souborů nepotvrzuj.
- `functions/package.json` obsahuje `serve`, `shell`, `start`, `deploy`, `logs`, `test`. `start` spouští functions shell; není to webový Next server. `deploy` zapisuje do cloudu, `logs` může číst citlivé záznamy.
- `vercel.json` konfiguruje denní a týdenní webové joby; `web-scheduler.json` další plánované HTTP joby. `scripts/deploy-web-scheduler.mjs` má plán, `--check` a zapisující `--apply`. Firebase scheduled functions se spravují odděleně.
- Před spuštěním skriptu v `scripts/` přečti jeho vstupy, výchozí projekt a vedlejší efekty. Označení audit, check nebo dry-run nezaručuje práci bez osobních dat či síťových operací.
- `set-admin-claim.mjs`, `set-document-specialist.mjs`, `set-online-card-slug.mjs` a `enable-totp-mfa.mjs` nemají obecnou ochranu `--apply`; nejsou bezpečná zkušební spuštění.
- Postup pro izolované vydání Firestore pravidel je v README a `scripts/firestore-rules-release.mjs`: příprava, kontrola konkrétního kandidáta, deploy a ověření. Nemíchej ho s nesouvisející změnou webu nebo Storage.
- Build guard `scripts/check-security-config.mjs` není audit celé konfigurace. Některé požadavky vynucuje pouze při `VERCEL_ENV=production`; přítomnost dalších nastavení pouze zaznamenává. Úspěšný build nedokládá úplnost secrets, migrací nebo oprávnění v produkci.

## 13. Nejasnosti a meze ověření

- Aktuální produkční environment, IAM, nasazené rules/indexy, retence/zálohy, dostupnost integrací a dokončení migrací nebyly živě ověřeny. Nezaměňuj záznam o dřívějším nasazení za aktuální stav.
- Kořenový Node runtime není připnutý v manifestu; neexistuje nalezená verzovaná `.env.example` ani úplný centrální seznam konfigurace. Požadavky konkrétní funkce ověř v jejím kódu.
- Legacy identity, role aliasy, e-mailové klíče a výjimky přetrvávají. Jednotná matice práv pro všechna API není deklarována na jednom místě; rozhoduje konkrétní serverová kontrola a resource policy.
- Část dokumentace je historická a README obsahuje i původní create-next-app text. Zdrojový kód, manifesty, pravidla a testy mají při rozporu přednost pro popis současné implementace.
- Neexistence nálezu při tomto průzkumu není důkazem absence zranitelnosti. Dokument není úplný bezpečnostní audit ani potvrzení souladu s právními požadavky.

## 14. Před dokončením změny

- Zkontroluj vlastní diff a zachování cizích změn; žádné nesouvisející přegenerované soubory.
- Ověř relevantní testy, lint a typy; uveď selhání, neprovedené kontroly a jejich důvod.
- U auth, oprávnění, osobních údajů, uploadů, administrace, plateb a veřejného API proveď krátký security review: cizí data, eskalace, manipulované vstupy, nadbytečná pole, logy, cache a zneužitelnost.
- Zkontroluj, že změna nepřidává secrets ani osobní data do repozitáře či veřejného výstupu a neobchází revokaci, MFA, šifrování nebo pravidla vlastnictví.
- Stručně popiš výsledek, provedené ověření a konkrétní zbývající rizika. Za hotové neoznačuj změnu s nevyřešenou bezpečnostní nejistotou bez jejího vysvětlení.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
