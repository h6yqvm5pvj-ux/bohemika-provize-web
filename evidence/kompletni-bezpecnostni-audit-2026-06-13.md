# Bezpecnostni audit a potvrzeni zabezpeceni Bohemika Provize Web

Datum auditu: 13. 6. 2026
Projekt: `bohemika-provize-web` / Bohemika SmartApp
Predpokladana produkcni domena: `https://bohemka.app`
Typ dokumentu: staticky bezpecnostni audit repozitare + provozni doporuceni pro Vercel/Firebase
Ucel dokumentu: potvrzeni pro firmu, ze aplikace ma dobre zabezpeceny technicky zaklad, vcetne loginu, API autorizace, ulozist, firewallu a ochrany proti automatizovanym requestum.

## 1. Verdikt

Na zaklade kontroly aktualniho repozitare, konfigurace Next.js/Firebase/Vercel a spustenych overovacich prikazu lze aplikaci hodnotit jako dobre zabezpecenou pro interni produkcni provoz.

V auditu nebyla nalezena kriticka zranitelnost typu:

- anonymni pristup k internim datovym API,
- obchazeni prihlaseni u citlivych casti aplikace,
- verejne cteni Firebase Storage objektu pres Storage rules,
- primy verejny zapis do citlivych Firestore kolekci,
- zjevne ulozene tajne klice v repozitari,
- zranitelnost v zavislostech detekovana pres `npm audit --audit-level=moderate`.

Celkovy bezpecnostni verdikt: **8.4 / 10 - dobre az velmi dobre zabezpeceno**.

Slovne hodnoceni:

- Pro bezny interni web je bezpecnostni uroven nadstandardni.
- Login je postaveny na Firebase Authentication, TOTP 2FA, passkeys/WebAuthn, sdilenem login lockoutu a serverove kontrole tokenu.
- Citlive operace jsou ve vetsine pripadu vedeny pres serverove API s Firebase Admin SDK.
- Firebase Storage je pravidly defaultne zavreny.
- Aplikace ma rozsahle security headers, noindex nastaveni a middleware CSP.
- Vercel Firewall pravidlo pro scanner paths je vhodna edge ochrana proti automatizovanym scanum.
- Zbyvajici nalezy jsou primarne hardening a provozni kontrola, ne akutni blokery produkcniho provozu.

Dulezite omezeni verdiktu:

Tento dokument neni externi certifikovany penetracni test. Nebyl proveden aktivni DAST/pentest produkce, kontrola skutecnych hodnot produkcnich env promennych, revize realnych Vercel/Firebase logu ani forenzni kontrola provozu. Firewall pravidla ve Vercel dashboardu nejsou soucasti zdrojoveho kodu; jejich aktivni stav musi byt provozne potvrzen ve Vercelu.

## 2. Rychle hodnoceni podle oblasti

| Oblast | Hodnoceni | Stav |
| --- | ---: | --- |
| Login heslem + Firebase Auth | 8.5 / 10 | Silny zaklad, serverova kontrola tokenu, lockout |
| TOTP 2FA | 9.0 / 10 | Vynuceno pro poradenske/interni casti |
| Passkeys / WebAuthn | 9.0 / 10 | Phishing-resistant login, challenge TTL, origin/RP ID |
| API autorizace | 8.5 / 10 | Centralni guardy, revocation check, role |
| Admin prava | 8.0 / 10 | Role owner/admin/support, destruktivni akce omezene |
| Firestore rules | 7.2 / 10 | Default deny, ale `admin: true` ma jeste silne direct writes |
| Firebase Storage rules | 9.5 / 10 | Default deny, citlive soubory pres backend |
| Uploady a prilohy | 8.5 / 10 | PDF/obrazky validovane magic bytes, office photo jeste jen MIME |
| Vercel Firewall / bot scany | 8.0 / 10 | Scanner paths pravidlo dava smysl, doplnit edge rate limity |
| Security headers / CSP | 8.0 / 10 | HSTS, nosniff, frame deny, CSP pripraveno, strict enforce podle env |
| Public endpointy / spam | 7.8 / 10 | Rate limit + honeypot + anti-spam, doplnit WAF/challenge pri spamu |
| Dependency hygiene | 10 / 10 | `npm audit --audit-level=moderate`: 0 vulnerabilities |
| Audit log / provozni monitoring | 6.8 / 10 | Doporuceno doplnit formalni audit log admin akci |

## 3. Overovaci prikazy spustene pri auditu

Spusteno lokalne 13. 6. 2026 v repozitari `/Users/jakubrauscher/bohemika-provize-web`.

| Kontrola | Vysledek |
| --- | --- |
| `git status --short` pred upravou dokumentu | cisty working tree |
| `npm audit --audit-level=moderate` | `found 0 vulnerabilities` |
| `npx tsc --noEmit` | bez chyb |
| `npm run build` | uspesny produkcni build, Next.js 16.2.7 |
| `npm run lint` | bez chyb |

Poznamka: tato revize meni auditni soubor v `evidence/`. Aplikacni kod nebyl v ramci tohoto dokumentacniho kroku menen.

## 4. Rozsah auditu

Kontrolovane oblasti:

- login a MFA flow,
- passkeys/WebAuthn,
- serverove overovani Firebase ID tokenu,
- login lockout,
- rate limiting,
- API route guardy,
- admin role a subscription pristup,
- Firestore rules,
- Firebase Storage rules,
- uploady PDF a uzivatelskych priloh,
- public meeting request a anti-spam vrstva,
- security headers a CSP middleware,
- Vercel cron autorizace,
- Vercel Firewall evidence a doporucena pravidla,
- dependency audit a build/lint stav.

Mimo rozsah:

- aktivni penetracni test produkcni domeny,
- runtime kontrola Vercel Firewall logu,
- runtime kontrola Firebase Auth/Firestore/Storage konzole,
- kontrola skutecnych hodnot produkcnich secrets,
- social engineering, phishing test a fyzicka bezpecnost,
- formalni pravni posouzeni GDPR/DPIA.

## 5. Hlavni zdroje evidence v repozitari

| Oblast | Zdroj |
| --- | --- |
| Login UI, heslo, TOTP MFA, passkey login | `src/app/login/page.tsx` |
| Login attempt lockout | `src/app/api/auth/login-attempts/route.ts`, `src/lib/server/loginAttemptLockout.ts` |
| Passkeys / WebAuthn | `src/lib/server/passkeys.ts`, `src/app/api/auth/passkeys/*/route.ts` |
| API auth guardy | `src/lib/server/apiEntryGuard.ts` |
| Admin auth guardy | `src/lib/server/adminAuth.ts`, `src/lib/adminAccess.ts` |
| Subscription pristup | `src/lib/subscriptionAccess.ts` |
| Admin users/subscriptions/security | `src/app/api/admin/users/route.ts`, `src/app/api/admin/subscriptions/route.ts`, `src/app/api/admin/security/route.ts` |
| Firestore rules | `firestore.rules` |
| Storage rules | `storage.rules` |
| Security headers / CSP | `next.config.ts`, `middleware.ts`, `src/app/layout.tsx` |
| Neindexovatelnost | `next.config.ts`, `public/robots.txt`, `src/app/layout.tsx` |
| Smluvni PDF | `src/lib/server/contractPdfStorage.ts`, `src/app/api/contracts/attachment/route.ts` |
| Mailbox/intranet prilohy | `src/lib/server/safeUserAttachments.ts`, `src/lib/server/intranetWallAttachments.ts` |
| Public meeting request | `src/app/api/online-card/meeting-request/route.ts` |
| Office photo upload | `src/app/api/online-card/office-photo/route.ts` |
| Vercel cron | `vercel.json`, `src/app/api/cron/weekly-team-report/route.ts` |
| Predchozi Vercel Firewall evidence | `evidence/kompletni-bezpecnostni-audit-2026-06-12.md` |

## 6. Login zabezpeceni

### 6.1 Heslo a Firebase Authentication

Prihlasovani heslem je implementovane pres Firebase Authentication:

1. uzivatel zada e-mail a heslo,
2. frontend pred samotnym prihlasenim vola `/api/auth/login-attempts` s akci `check`,
3. prihlaseni probiha pres `signInWithEmailAndPassword`,
4. pri vyzadovane MFA Firebase vraci `auth/multi-factor-auth-required`,
5. aplikace pouzije Firebase MFA resolver a TOTP kod,
6. po prihlaseni se zavola login-attempt `success`,
7. aplikace nacte profil a overi aktivni/grace subscription,
8. bez platneho pristupu uzivatele odhlasi.

Silne stranky:

- Hesla nejsou resena vlastnim kodem aplikace, ale Firebase Auth.
- Serverova API neberou prihlaseni pouze z klienta; pracuji s Bearer Firebase ID tokenem.
- Tokeny jsou na serveru overovane pres Firebase Admin SDK vcetne revocation checku `verifyIdToken(token, true)`.
- Po prihlaseni se kontroluje existence profilu a subscription pristup.
- U neaktivniho/neuhrazeneho uctu aplikace uzivatele odhlasi.

### 6.2 TOTP 2FA

TOTP MFA je ve flow podporovana pres Firebase multi-factor authentication.

Silne stranky:

- Pokud Firebase vrati MFA challenge, UI vyzada jednorazovy TOTP kod.
- Advisor/interni API guardy pres `advisorSetupGuard` vyzaduji u poradcu TOTP faktor.
- TOTP se tedy nebere jen jako UI doporuceni, ale jako serverove kontrolovana podminka pristupu k poradenskym castem.
- Admin auth guardy pouzivaji stejnou advisor access kontrolu, takze admin akce vyzaduji splneny profil a 2FA.

### 6.3 Login lockout

Login lockout je implementovan v `src/lib/server/loginAttemptLockout.ts`.

Stav:

- limit: 3 neuspesne pokusy,
- okno blokace: 15 minut,
- buckety: `account:e-mail` a `ip:e-mail`,
- uloziste: Firestore kolekce `_loginAttemptLockouts`,
- identifikatory dokumentu: SHA-256 hash, ne surovy e-mail,
- zapis selhani: transakcni,
- uspesny login: maze prislusne buckety,
- produkce pri nedostupnem sdilenem ulozisti: fail-closed s `503` a `Retry-After`,
- lokalni vyvoj: in-memory fallback jen mimo produkci.

Hodnoceni:

Toto je spravne navrzena ochrana proti opakovanym pokusum o prihlaseni. Dulezite je, ze lockout neni jen v pameti jedne serverless instance, ale je sdileny pres Firestore.

Provozni doporuceni:

- Ve Firestore zapnout TTL policy na poli `expiresAt` pro `_loginAttemptLockouts`.
- Po deployi otestovat 3 spatne pokusy, blokaci, `Retry-After` a reset po uspesnem loginu.

### 6.4 Passkeys / WebAuthn

Passkeys jsou implementovane pres `@simplewebauthn/server` a Firebase custom token.

Silne stranky:

- Registrace i prihlaseni pouzivaji serverove ulozenou challenge.
- Challenge ma TTL 5 minut.
- Challenge se pri overeni transakcne smaze, nejde ji znovu pouzit.
- WebAuthn vyzaduje `userVerification: "required"`.
- Server kontroluje origin a RP ID podle env konfigurace.
- Registrace passkey vyzaduje platny Firebase token a recent auth.
- Prihlaseni passkey overi ulozeny credential, counter, aktivniho Firebase uzivatele a teprve potom vytvori Firebase custom token.
- Credentialy lze soft-delete pres `disabled: true`.

Hodnoceni:

Passkeys jsou silna phishing-resistant metoda. Z pohledu bezpecnosti jde o vyrazne lepsi variantu nez samotne heslo. Interni politika by mela jen jasne rict, zda passkey login nahrazuje TOTP, nebo zda maji vybrane role vzdy vyzadovat dalsi faktor i po passkey.

## 7. Serverova API autorizace

### 7.1 Centralni API guardy

Bezne interni API endpointy pouzivaji guardy:

- `requireAuthedRateLimited`,
- `requireAdvisorAuthedRateLimited`,
- `requireIpRateLimited`,
- `getAdminAuthContext`.

Tyto guardy resi:

- pritomnost Bearer tokenu,
- Firebase Admin overeni ID tokenu vcetne revocation checku,
- normalizaci e-mailu,
- login lockout stav,
- rate limiting,
- kontrolu advisor setupu,
- rozliseni advisor/tipster uctu,
- admin role a minimalni potrebnou uroven role.

Hodnoceni:

Centralizace guardu je dobra. Snizuje riziko, ze jednotlive API endpointy budou mit rozdilnou nebo zapomenutou autorizaci.

### 7.2 Admin role

Role model:

- `owner`,
- `admin`,
- `support`.

Role se vyhodnocuji pres custom claims `admin: true` a `adminRole`, s docasnym fallbackem podle e-mailu.

Silne stranky:

- Destruktivni akce jako mazani uctu jsou omezeny na `owner`.
- Sprava predplatneho je omezena na `owner`.
- Bezne admin seznamy a security prehled vyzaduji minimalne `admin`.
- Admin requesty prochazi pres serverove overeni tokenu, advisor setup kontrolu a login lockout kontrolu.

Zbytkove riziko:

- Fallback admin role podle e-mailu je prakticky break-glass mechanismus.
- Dlouhodobe je cistsi spolehat pouze na custom claims a fallback vypnout nebo schovat za env flag.

## 8. Firestore pravidla

Firestore rules maji dobry zaklad:

- fallback pravidlo je `allow read, write: if false`,
- citlive server-only kolekce padaji do default deny,
- uzivatelske profily maji vlastnicke/manazerske cteni,
- Storage-like citlive operace jsou ve vetsine pripadu pres Admin SDK,
- smluvni cteni kontroluje vlastnika, manager chain a override chain.

Silna stranka:

Default deny znamena, ze nova neznama kolekce neni automaticky verejna.

Hlavni nalez:

Custom claim `admin: true` ma ve Firestore rules porad silne prime zapisy v nekterych kolekcich:

- collection group `entries`,
- `users/{userEmail}/entries`,
- `calendarEvents`,
- `userStats`,
- top-level `contracts`.

Proc je to dulezite:

- Serverove API uz ma lepsi role model nez samotny Firestore `admin: true`.
- Pokud by se admin token dostal mimo kontrolu, primy Firestore klient by mohl obejit cast serverovych business guardu.
- Pro nejcistsi model maji citlive zapisy jit pres serverove API, ne primo pres klientsky Firestore SDK.

Doporuceni:

- Pro smlouvy/entries zavrit klientsky direct write a ponechat zapis pres Admin SDK.
- Pro admin direct write pouzit maximalne `owner`, pokud je skutecne potreba.
- Pro kazdou vyjimku napsat uzke pravidlo podle vlastnika a povolenych poli.
- Doplnit Firestore emulator testy pro hlavni toky.

Hodnoceni:

Firestore rules nejsou spatne; maji default deny a logiku vlastnictvi. Pro vyssi bezpecnostni uroven je ale potreba zmensit pravomoci obecneho `admin: true` v direct klientskych zapisech.

## 9. Firebase Storage

`storage.rules` jsou velmi restriktivni:

- `contract-pdfs/{allPaths=**}`: read/write false,
- vse ostatni: read/write false.

Hodnoceni:

To je velmi dobry stav. Storage objekty nejsou citelne primo klientem pres Firebase Storage rules. Pristup k citlivym souborum jde pres serverove API, kde se da kontrolovat prihlaseni, vlastnictvi, team access, rate limit a hlavicky odpovedi.

## 10. Uploady, PDF a prilohy

### 10.1 Smluvni PDF

Smluvni PDF jsou resena pres `contractPdfStorage.ts` a `/api/contracts/attachment`.

Ochrany:

- max velikost 12 MB,
- povolene jen PDF,
- kontrola pripony `.pdf`,
- kontrola obsahu souboru na `%PDF-`,
- SHA-256 hash ulozeny v metadatech,
- Storage cesta obsahuje hash vlastnika, ne surovy e-mail,
- content type serverove nastaven na `application/pdf`,
- download pres API s auth guardem a access checkem,
- odpoved ma `Cache-Control: private, no-store`,
- PDF se podava se sandbox CSP,
- Storage rules nedovoluji prime cteni.

Hodnoceni: velmi dobre.

### 10.2 Mailbox a intranet prilohy

Mailbox a intranet prilohy pouzivaji whitelist podle magic bytes:

- PDF,
- PNG,
- JPG/JPEG,
- GIF,
- WEBP,
- AVIF.

Ochrany:

- typ se neurcuje jen podle klientem poslaneho MIME,
- kontroluje se magic bytes,
- kontroluje se deklarovany typ a pripona,
- nezname/legacy typy se servirovaji jako download,
- pro PDF/nezname typy se nastavuje sandbox CSP,
- odpovedi maji `nosniff`, `same-origin`, `no-referrer`.

Hodnoceni: dobre az velmi dobre.

### 10.3 Office photo upload

Endpoint `/api/online-card/office-photo` ma:

- auth guard pro poradce,
- rate limit,
- limit 6 MB,
- povolene MIME typy `image/jpeg`, `image/png`, `image/webp`,
- serverovy upload do Firebase Storage.

Zbytkove riziko:

- kontrola typu se opira o `file.type`, ktery posila klient,
- chybi magic-byte kontrola jako u mailbox/intranet priloh,
- ulozene online-card photo URL by mely byt omezeny na vlastni Storage bucket/cestu.

Doporuceni:

- Pouzit stejnou magic-byte detekci jako u `safeUserAttachments`.
- Serverove urcit finalni `contentType`.
- Pro `officePhotos` povolit jen URL z vlastniho Firebase Storage bucketu a cesty `online-card/offices/{uid}/...`.

## 11. Verejne endpointy a anti-spam

Zamerne verejny endpoint:

- `/api/online-card/meeting-request`.

Implementovane ochrany:

- IP rate limit 10 requestu / 10 minut,
- honeypot pole,
- validace slug/jmeno/telefon/e-mail,
- omezeni odkazu ve jmene a zprave,
- per-card burst limit,
- per-card daily limit,
- limity pro stejnou kombinaci jmeno + e-mail + telefon,
- limity pro stejny e-mail,
- limity pro stejny telefon,
- limit pro duplicitni delsi obsah,
- pri prekroceni se nezapisuje zadost, mailbox ani push.

Hodnoceni:

Public meeting request je rozumne chraneny na aplikacni vrstve. Pokud by produkce zaznamenala spam nebo bot provoz, doporucuje se pridat edge vrstvu pres Vercel WAF rate limit/challenge nebo CAPTCHA/BotID/Turnstile.

## 12. Rate limiting

Rate limit implementace podporuje:

- Redis REST / Upstash / Vercel KV kompatibilni env,
- Firestore fallback,
- in-memory fallback mimo produkci,
- fail-closed chovani v produkci pri nedostupnem sdilenem store,
- rate limit hlavicky,
- explicitni parsing IP headeru.

Dulezite provozni misto:

V produkci se proxy IP hlavicky defaultne neveri, pokud neni nastavene `RATE_LIMIT_TRUSTED_IP_HEADERS` nebo `RATE_LIMIT_TRUST_PROXY_HEADERS`. To je bezpecnejsi nez slepe verit spoofnutym headerum, ale muze to zpusobit globalni `unknown` bucket pro public endpointy.

Doporuceni:

- Na Vercelu potvrdit, ktery client-IP signal je spolehlivy pro aplikacni vrstvu.
- Pro public endpointy preferovat Vercel WAF rate limiting na edge vrstve.
- Zapnout TTL policy pro `_rateLimits` na poli `expiresAt`.

## 13. Vercel Firewall

### 13.1 Stav z evidence

`vercel.json` v repozitari obsahuje cron konfiguraci, ne dashboard firewall pravidla:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-team-report",
      "schedule": "0 7 * * 1"
    }
  ]
}
```

Vercel Firewall pravidla jsou typicky provozni konfigurace ve Vercel dashboardu. Podle predchozi evidence a dodaneho screenshotu z 12. 6. 2026 bylo aktivni pravidlo:

- nazev: `Block scanner paths`,
- popis: `Block common automated scanner requests that are not used by the app.`,
- akce: `Deny`,
- typ: request path matchuje bezne scanner cesty.

Pravidlo blokuje requesty, ktere aplikace realne nepouziva, napriklad:

- PHP soubory typu `*.php`,
- WordPress endpointy typu `/wp-admin`, `/wp-json`, `/wp-login.php`, `/xmlrpc.php`,
- soubory/adresare typu `/.env`, `/.git`, `aws`, `ssh`,
- `/phpmyadmin`,
- podobne automatizovane scanner paths.

Hodnoceni:

Toto pravidlo je vhodne a ma zustat zapnute. Blokuje bezny internetovy sum, automatizovane scany a pokusy o exploit technologii, ktere aplikace nepouziva. Nenahrazuje ale aplikacni login, autorizaci, rate limiting ani validaci vstupu.

### 13.2 Doporucena sada Vercel pravidel

| Pravidlo | Podminka | Akce | Stav |
| --- | --- | --- | --- |
| `Block scanner paths` | Path obsahuje bezne scanner cesty: `.php`, `wp-admin`, `wp-login.php`, `xmlrpc.php`, `phpmyadmin`, `.env`, `.git`, `.aws`, `.ssh`, `id_rsa`, `vendor/phpunit`, `cgi-bin`, `actuator`, `server-status` | Deny | Ponechat zapnute |
| `Rate limit public meeting request` | Path je `/api/online-card/meeting-request` | Rate limit, po prekroceni 429 nebo Challenge | Doporuceno |
| `Rate limit auth helpers` | Path je `/api/auth/login-attempts`, `/api/auth/passkeys/authentication-options`, `/api/auth/passkeys/authentication` | Rate limit podle IP/source | Doporuceno |
| `Challenge suspicious public traffic` | Verejne endpointy + neobvykly user-agent / prazdny user-agent / rychle opakovani | Log nejdrive, potom Challenge | Volitelne |
| `Deny private file probes` | Path matchuje `.env`, `.git`, `.sql`, `.bak`, `.zip`, `.tar`, `id_rsa`, `config.php` | Deny | Doporuceno |

Postup nasazeni pravidel:

1. Nove pravidlo nejdrive zapnout v rezimu Log.
2. Zkontrolovat Vercel Firewall traffic/audit po dobu alespon 10 minut az 24 hodin podle provozu.
3. Pokud nejsou false positives, prepnout na Deny, Challenge nebo Rate Limit.
4. Pravidelne kontrolovat Firewall Overview a Audit Log.

### 13.3 Poznamka k aktualnim moznostem Vercelu

Oficialni dokumentace Vercel WAF uvadi, ze custom rules mohou provadet akce jako log, deny, challenge, bypass, redirect a rate limit; zmeny pravidel se aplikuji bez redeploye. Vercel WAF Rate Limiting umoznuje omezit pocet requestu ze stejneho zdroje v casovem okne a po prekroceni vratit 429, logovat, blokovat nebo vyzvat challenge.

Zdroje:

- https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## 14. Security headers, noindex a CSP

### 14.1 Security headers

Globalne nastavene hlavicky:

- `X-Robots-Tag: noindex, nofollow, noarchive`,
- `X-Content-Type-Options: nosniff`,
- `Referrer-Policy: strict-origin-when-cross-origin`,
- `X-DNS-Prefetch-Control: off`,
- `X-Permitted-Cross-Domain-Policies: none`,
- `Cross-Origin-Opener-Policy: same-origin`,
- `Cross-Origin-Resource-Policy: same-origin`,
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`,
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`,
- `X-Frame-Options: DENY` v middleware.

Hodnoceni: dobre.

### 14.2 Neindexovatelnost

Aplikace neni urcena k verejnemu dohledani:

- `next.config.ts` nastavuje `X-Robots-Tag`,
- `src/app/layout.tsx` nastavuje metadata `robots`,
- `public/robots.txt` obsahuje:

```txt
User-agent: *
Disallow: /
```

Dulezite:

`robots.txt` a `noindex` nejsou autentizace. Chovani je spravne pro omezeni dohledatelnosti, ale citliva data musi zustat chranena loginem, API guardy a rules.

### 14.3 CSP

Middleware vytvari:

- baseline CSP,
- strict nonce CSP,
- `Content-Security-Policy-Report-Only`,
- strict enforce rezim pri `CSP_STRICT_ENFORCE=1`.

Zbytkove riziko:

Pokud `CSP_STRICT_ENFORCE` neni v produkci zapnute, striktni nonce CSP bezi jen report-only a enforce CSP porad povoluje `unsafe-inline`.

Doporuceni:

1. Nastavit `CSP_REPORT_URI`.
2. Sledovat report-only poruseni.
3. Opravit realne blokace.
4. Nastavit `CSP_STRICT_ENFORCE=1`.

## 15. Cron a server-to-server endpointy

`/api/cron/weekly-team-report` je definovan ve `vercel.json`.

Ochrany:

- endpoint kontroluje `Authorization: Bearer <CRON_SECRET>`,
- porovnani je timing-safe,
- pokud `CRON_SECRET` v produkci existuje, request bez nej neprojde,
- produkcni fallback bez secretu neni povolen,
- cron nepouziva query secret.

Hodnoceni: dobre.

Provozni doporuceni:

- Ve Vercelu potvrdit `CRON_SECRET` pouze pro Production scope.
- Secret drzet dlouhy, nahodny a nerotovat pres commit.

## 16. Zbytkova rizika a doporuceni

### P1 - Firestore direct writes pro `admin: true`

Priorita: vysoka hardeningova

Stav:

Firestore rules porad povoluji nektere prime zapisy pro obecny `admin: true`.

Doporuceni:

- Zavrit direct klientsky write pro smlouvy/entries.
- Citlive zapisy vest pres serverove API.
- Kde direct write zustane, zprisnit na `owner` nebo uzka pole.

### P1/P2 - CSP strict enforce

Priorita: vysoka/stredni

Doporuceni:

- Po report-only fazi zapnout `CSP_STRICT_ENFORCE=1`.
- Sledovat CSP reporty.

### P2 - Office photo upload magic bytes

Priorita: stredni

Doporuceni:

- Doplnit magic-byte kontrolu JPEG/PNG/WEBP/AVIF.
- Ukladat serverem urceny content type.
- Omezit photo URL na vlastni Storage bucket.

### P2 - Legacy SMTP email verification endpoint

Priorita: stredni

Endpoint `/api/auth/email-verification-link` porad umi posilat verification link pres SMTP.

Doporuceni:

- Pokud se nepouziva, smazat/zamknout feature flagem.
- Pokud se pouziva, zamknout admin/owner pravidlem a audit logem.

### P2 - IP rate limiting na Vercelu

Priorita: stredni

Doporuceni:

- Potvrdit trusted IP header nebo pouzit Vercel WAF rate limiting.
- Zapnout edge rate limit pro public formulare a auth helpery.

### P2/P3 - Audit log admin akci

Priorita: stredni/nizsi

Doporuceni:

Logovat:

- smazani uctu,
- zmenu subscription,
- zmenu admin role,
- manualni email verification,
- mazani/upravy tymovych smluv,
- MFA/admin security zasahy.

Minimalni logovana pole:

- kdo,
- kdy,
- akce,
- cil,
- IP/source,
- user-agent,
- predchozi a nova hodnota u citlivych zmen.

### P3 - TTL a retence

Zapnout nebo potvrdit TTL/retenci:

- `_loginAttemptLockouts.expiresAt`,
- `_rateLimits.expiresAt`,
- `_passkeyChallenges.expiresAt`,
- `mailboxSharedPayloads`,
- `onlineCardMeetingRequests`,
- stare Storage objekty `online-card/offices/...`.

## 17. Produkcni checklist pro firmu

### Login a ucty

- [ ] Firebase Auth ma zapnute e-mail/heslo podle potreby.
- [ ] TOTP MFA je zapnute a vyzadovane pro poradce/adminy.
- [ ] Admin ucty maji TOTP nebo passkey.
- [ ] Firebase Authorized Domains obsahuji jen realne domeny.
- [ ] Anonymous auth je vypnute, pokud se nepouziva.
- [ ] Je definovany postup pro ztraceny telefon/passkey/MFA reset.

### Vercel

- [ ] Vercel Firewall pravidlo `Block scanner paths` je zapnute.
- [ ] Vercel Firewall logy jsou pravidelne kontrolovane.
- [ ] Public meeting request ma edge rate limit nebo challenge pravidlo.
- [ ] Auth helper endpointy maji edge rate limit.
- [ ] `CRON_SECRET` je nastaveny v Production scope.
- [ ] Produkcni env obsahuje spravne `NEXT_PUBLIC_APP_URL`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`.
- [ ] `RATE_LIMIT_TRUSTED_IP_HEADERS` je nastaveno jen po potvrzeni Vercel reality, nebo se IP limity resi ve WAF.

### Firebase

- [ ] Firestore rules jsou deploynute.
- [ ] Storage rules jsou deploynute a zustavaji default deny.
- [ ] TTL je zapnute pro docasne kolekce.
- [ ] Firebase Admin klic je ulozeny jen jako Vercel secret/env.
- [ ] Pri podezreni na unik je Firebase Admin klic rotovan.

### Aplikace

- [ ] `CSP_REPORT_URI` je nastaveny.
- [ ] Po report-only overeni je `CSP_STRICT_ENFORCE=1`.
- [ ] Nepouzivany SMTP endpoint je odstranen nebo zamcen.
- [ ] Office photo upload ma magic-byte kontrolu.
- [ ] Admin akce jsou zapisovane do audit logu.
- [ ] `npm audit`, `npm run lint`, `npx tsc --noEmit` a `npm run build` bezi v CI.

## 18. Zaverecne potvrzeni

Na zaklade provedeneho auditu lze potvrdit, ze web Bohemika Provize Web / Bohemika SmartApp ma dobre navrzeny a dobre implementovany bezpecnostni zaklad.

Nejsilnejsi casti zabezpeceni:

- Firebase Authentication s TOTP MFA,
- passkeys/WebAuthn,
- serverove overovani Firebase ID tokenu vcetne revocation checku,
- sdileny login lockout,
- centralizovane API guardy a role,
- uzavrene Firebase Storage rules,
- magic-byte validace vetsiny priloh,
- Vercel Firewall pravidlo proti scanner pathum,
- noindex + robots blokace,
- rozsahle security headers,
- cisty dependency audit,
- uspesny build, TypeScript a lint.

Zbyvajici doporuceni nejsou duvodem oznacit web jako nezabezpeceny. Jsou to kroky pro posun z dobre urovne na velmi vysokou uroven:

1. zprisnit Firestore direct write vyjimky pro `admin: true`,
2. zapnout strict CSP enforce po report-only overeni,
3. doplnit magic-byte kontrolu office photo uploadu,
4. zamknout nebo odstranit legacy SMTP verification endpoint,
5. formalizovat Vercel WAF rate limity pro public/auth endpointy,
6. doplnit audit log admin a destruktivnich akci.

Finalni verdikt:

**Aplikace je vhodna pro interni produkcni provoz a z pohledu kontrolovaneho kodu je dobre zabezpecena. Nebyla nalezena kriticka chyba, ktera by sama o sobe branila produkcnimu pouziti. Doporucene body jsou hardening a provozni governance, nikoliv akutni stop-stav.**
