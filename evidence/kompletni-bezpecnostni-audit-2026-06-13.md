# Aktualizovany bezpecnostni audit Bohemika Provize Web

Datum auditu: 13. 6. 2026  
Repozitar: `bohemika-provize-web`  
Auditovany stav: commit `b65361d Harden security flows and admin roles` plus aktualni lokalni stav bez necommitnutych zmen.  
Rozsah: staticky audit zdrojoveho kodu, Next.js/Vercel konfigurace, Firebase Auth, Firestore rules, Storage rules, API route handleru, uploadu, login/MFA/passkey flow, rate limitingu, cron endpointu, mailbox/export toku a verejnych formularu.  
Mimo rozsah: aktivni penetracni test produkce, kontrola realnych hodnot Vercel/Firebase env promennych mimo kod, DAST scan, kontrola Vercel Firewall logu a Firebase konzole.

## Executive summary

Aplikace je po poslednich upravach v citelne lepsim bezpecnostnim stavu. Nejdulezitejsi driv resene body jsou dotazene:

- sdilene exporty uz neukladaji klientem posilane HTML, ale strukturovana data,
- mailbox prilohy maji whitelist podle magic bytes,
- Storage rules jsou defaultne zavrene,
- cron pro tydenni report je chraneny `CRON_SECRET` Bearer tokenem,
- admin role jsou centralizovane na `owner` / `admin` / `support`,
- `owner` muze spravovat predplatne a mazat ucty, bezny `admin` ne,
- prihlaseni vyuziva Firebase Auth, TOTP 2FA a passkeys/WebAuthn,
- poradenske API guardy realne vynucuji dokonceny profil a TOTP 2FA,
- web je neindexovatelny pres `X-Robots-Tag` a `robots.txt`,
- Vercel Firewall pravidlo pro scanner paths dava smysl a ma zustat aktivni.

Aktualne jsem nenasel jednu kritickou diru typu "kdokoliv z internetu smaze data". Nejdulezitejsi zbyvajici hardening je ale porad konkretni:

1. Zprisnit Firestore rules, aby custom claim `admin: true` nemel primy zapis/smazani do smluvnich a statistickych kolekci mimo serverove API.
2. Dotahnout upload fotek kancelare na magic-byte kontrolu a omezit ulozene URL fotek.
3. Odstranit nebo zamknout stary SMTP endpoint pro email verification, pokud se realne nepouziva.
4. Prepnout CSP do strict enforce rezimu po kratkem report-only overeni.
5. Doplnit silnejsi anti-spam ochranu verejnych endpointu a potvrdit IP rate limiting na Vercelu.

## Overeni pri auditu

Spustene kontroly:

- `git status --short` - cisty working tree.
- `npm audit --audit-level=moderate` - `found 0 vulnerabilities`.
- `npx tsc --noEmit` - bez chyb.
- `npm run build` - uspesny produkcni build.
- `npm run lint` - selhal pouze na dvou pomocnych `.cjs` GIF skriptech kvuli pravidlu zakazujicimu `require()`. Zbytek byly warningy, ne bezpecnostni chyby.

Lint detail:

- `scripts/generate-homepage-demo-gif.cjs`
- `scripts/generate-homepage-gif-from-screenshots.cjs`

Tyto chyby nejsou runtime bezpecnostni problem webu, ale je vhodne upravit ESLint konfiguraci nebo skripty vyjmout/prevest na ESM, aby CI nematlo tym.

## Co je aktualne dobre

### Login, MFA a passkeys

Silne stranky:

- Standardni login bezi pres Firebase Authentication.
- Firebase ID tokeny se na serveru overuji pres Admin SDK vcetne revocation checku.
- Po prihlaseni se kontroluje profil a aktivni/grace subscription.
- Poradenske API guardy pres `advisorSetupGuard` vyzaduji existujici profil, telefon, karierni historii a TOTP 2FA.
- TOTP 2FA je tedy serverove vynucena pro poradenske casti, ne jen zobrazena v UI.
- Passkeys pouzivaji `@simplewebauthn/server`, challenge se uklada serverove, ma TTL 5 minut a pri overeni se transakcne spotrebuje.
- WebAuthn origin/RP ID se v produkci musi matchovat proti env nastaveni.
- Aplikacni login lockout je po hardeningu ulozeny sdilene ve Firestore kolekci `_loginAttemptLockouts`, ne jen v pameti jedne Vercel instance.

Poznamka:

- Passkey login je samostatny passwordless login, ktery vraci Firebase custom token. Je to silny phishing-resistant login. Pokud by interni politika chtela "vzdy TOTP i po passkey", muselo by se to explicitne doplnit. Z bezpecnostniho hlediska muze byt passkey bran jako silny faktor, ale je dobre to mit zdokumentovane.

### Neindexovatelnost webu

Silne stranky:

- `next.config.ts` nastavuje `X-Robots-Tag: noindex, nofollow, noarchive`.
- `robots.txt` blokuje crawlery.
- To znamena, ze web neni urceny k verejnemu dohledani.

Dulezite:

- `noindex` neni autentizace. Verejne routes typu `/login` a `/vizitka/[slug]` jsou stale dostupne komukoliv s URL. Citliva data proto spravne musi zustat za auth/API guardy.

### Security headers a Vercel

Silne stranky:

- Globalne jsou nastavene bezpecnostni hlavicky: `nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.
- Middleware nastavuje `X-Frame-Options: DENY`.
- Vercel Firewall ma pravidlo `Block scanner paths`, ktere blokuje typicke scanner cesty typu WordPress/PHP/.env/.git/phpMyAdmin.

### Firestore a Storage

Silne stranky:

- Storage rules maji default deny pro vsechny cesty.
- Vetsina citlivych Firestore zapisu jde pres serverove API s Admin SDK.
- Serverove API si samo hlida autorizaci, rate limit a business pravidla.
- Direct client SDK se v kodu pro citlive Firestore zapisy prakticky nepouziva, coz je dobry smer.

### Exporty a mailbox prilohy

Silne stranky:

- `export-produkce/share` uklada `previewStorage: "structured"` a `snapshot`, ne klientsky poslane HTML.
- Shared preview se sklada serverove z dat.
- Mailbox/intranet prilohy maji whitelist PDF/PNG/JPG/GIF/WEBP/AVIF podle magic bytes.
- Nezname typy se servirovaji jako download s restriktivnim CSP.

### Cron

Silne stranky:

- `/api/cron/weekly-team-report` kontroluje `CRON_SECRET` v `Authorization: Bearer ...`.
- Porovnani je timing-safe.
- Pokud `CRON_SECRET` v produkci chybi, request nema projit.

## Nalezy a doporuceni

### P1 - Firestore `admin: true` ma porad moc primych zapisu

Priorita: vysoka  
Soubor: `firestore.rules`

Nalez:

- `isAdmin()` je definovane jako libovolny Firebase token s `admin == true`.
- Rules stale povoluji primy `create/update/delete` pro:
  - collectionGroup `entries`,
  - `users/{userEmail}/entries`,
  - `calendarEvents`,
  - `userStats`,
  - top-level `contracts`.
- To znamena, ze bezny `admin` custom claim ma mimo serverove admin API porad velmi silne prime Firestore pravomoci.

Proc to resit:

- Serverove API uz ma dobry role model, ale Firestore rules jsou dalsi vstupni brana.
- Pokud by se admin token dostal do spatnych rukou, utocnik muze obejit serverove guardy a zapisovat primo Firestore klientem.
- Je to v rozporu s cilem, ze destruktivni nebo citlive operace maji jit pres centralni serverovou autorizaci.

Doporucena uprava:

- Pro kolekce, ktere zapisuje server pres Admin SDK, nastavit klientsky direct write na `false`.
- Kde je opravdu potreba direct write z klienta, povolit jen pres uzke pravidlo podle vlastnika a validace poli.
- Pro admin direct write pouzit maximalne `isOwnerAdmin()`, ne obecne `isAdmin()`.

Prakticky navrh:

- `/{path=**}/entries/{entryId}`: `allow create, update, delete: if false;`
- `/users/{userEmail}/entries/{entryId}`: `allow create, update, delete: if false;`
- `/contracts/{contractId}`: pokud je legacy kolekce nepouzivana, `allow create, update, delete: if false;`
- `/userStats`: ponechat vlastnikovi jen pres validovana API, nebo zprisnit podle realneho klienta.
- `/calendarEvents`: nejdrive overit, jestli existuje klientsky kalendar. Pokud ano, napsat uzke rules jen pro vlastni eventy.

Nutna verifikace:

- Spustit Firestore rules testy/emulator proti hlavnim tokum: vytvoreni smlouvy pres API, editace smlouvy, smazani, statistiky, kalendar.

### P1 - CSP je stale ve strict rezimu jen report-only

Priorita: vysoka/stredni  
Soubor: `middleware.ts`

Nalez:

- Produkcni enforce CSP pouziva baseline s `script-src 'self' 'unsafe-inline'`.
- Strict nonce CSP existuje, ale pokud `CSP_STRICT_ENFORCE !== "1"`, posila se pouze jako `Content-Security-Policy-Report-Only`.

Proc to resit:

- Po odstraneni klientem posilaneho HTML ze sdilenych exportu je vhodny cas posunout CSP do enforce.
- `unsafe-inline` snizuje hodnotu CSP proti XSS.

Doporucena uprava:

- Nastavit v produkci `CSP_REPORT_URI` a kratce sledovat report-only poruseni.
- Opravit pripadne realne CSP reporty.
- Potom nastavit `CSP_STRICT_ENFORCE=1`.
- Dlouhodobe snizit zavislost na inline style/script vzorech, kde to Next dovoluje.

### P2 - Upload fotky kancelare kontroluje jen MIME typ, ne magic bytes

Priorita: stredni  
Soubor: `src/app/api/online-card/office-photo/route.ts`

Nalez:

- Endpoint povoluje `image/jpeg`, `image/png`, `image/webp` podle `file.type`.
- Skutecny obsah souboru se nekontroluje podle magic bytes.
- Soubor se pak ulozi do Firebase Storage s deklarovanym `contentType`.

Proc to resit:

- `file.type` posila klient a jde podvrhnout.
- U priloh jsme uz zavedli lepsi standard. Stejny standard patri i sem.

Doporucena uprava:

- Pouzit stejnou filozofii jako `safeUserAttachments`.
- Pro fotky kancelare povolit podle magic bytes minimalne JPEG/PNG/WEBP, pripadne AVIF.
- Pokud typ nesedi, upload odmitnout.
- Ukladat serverem urceny `contentType`, ne klientem poslany.

### P2 - Online card fotky lze ulozit jako libovolne `http(s)` URL

Priorita: stredni/nizsi  
Soubor: `src/app/api/user/profile/route.ts`, `src/app/nastaveni/page.tsx`

Nalez:

- Profilova data online vizitky akceptuji `officePhotos` jako libovolne `http:` nebo `https:` URL.
- To umoznuje vlozit externi obrazky mimo vlastni Firebase Storage.

Proc to resit:

- Verejna vizitka muze nacitat externi tracking obrazky.
- Interni nastaveni/preview muze nacitat zdroje treti strany.
- U tokenizovanych Firebase Storage URL je navic vhodne resit revokaci pri smazani fotky.

Doporucena uprava:

- Pro `officePhotos` povolit jen URL z vlastniho Firebase Storage bucketu a cesty `online-card/offices/{uid}/...`.
- Pri odebrani fotky z profilu smazat odpovidajici Storage objekt nebo aspon revokovat download token.
- Pokud se maji povolit externi obrazky, proxyovat je serverem a omezit allowlist domen.

### P2 - Stary SMTP endpoint pro email verification porad existuje

Priorita: stredni  
Soubor: `src/app/api/auth/email-verification-link/route.ts`

Nalez:

- Endpoint stale importuje `nodemailer` a umi poslat Firebase email verification link pres SMTP.
- Frontend podle auditu pouziva pro MFA bootstrap `/api/auth/confirm-email-for-mfa`, ne tento SMTP endpoint.
- Drive byl odstraneny mrtvy SMTP endpoint `/api/send-email`, ale tento zustal.

Proc to resit:

- Nepouzivany email endpoint je zbytecna attack surface.
- Pokud jsou v produkci SMTP env promenne, endpoint jde volat prihlasenym, neoverenym uzivatelem, byt s rate limitem.

Doporucena uprava:

- Pokud endpoint neni potreba: smazat route, odebrat `nodemailer` dependency a SMTP env promenne.
- Pokud potreba je: zamknout ho za admin/owner guard nebo feature flag a audit log.

### Vyreseno po auditu - Login lockout je sdileny pres Firestore

Priorita: hotovo, provozne overit  
Soubor: `src/lib/server/loginAttemptLockout.ts`

Aktualni stav:

- Aplikacni pocitadlo chybnych pokusu se uklada do Firestore kolekce `_loginAttemptLockouts`.
- Dokumenty jsou pojmenovane SHA-256 hashem klice, ne surovym e-mailem.
- Pouzivaji se dva buckety: `account:e-mail` a `ip:e-mail`.
- Chybny pokus se zapisuje transakcne pro oba buckety.
- Uspesne prihlaseni oba buckety smaze.
- V produkci pri nedostupnem sdilenem ulozisti endpoint fail-closed vrati `503` a `Retry-After`.
- V lokalnim vyvoji zustava nouzovy in-memory fallback, aby slo pracovat i bez Firebase Admin konfigurace.

Co jeste provozne overit:

- Ve Firestore zapnout TTL policy na poli `expiresAt` pro kolekci `_loginAttemptLockouts`.
- Po deployi otestovat 3 spatne pokusy, blokaci, `Retry-After` a smazani blokace po uspesnem loginu.

### P2 - Public meeting request potrebuje lepsi anti-spam vrstvu

Priorita: stredni  
Soubor: `src/app/api/online-card/meeting-request/route.ts`

Stav po uprave:

- Endpoint je zamerne verejny.
- Ma IP rate limit 10 pozadavku / 10 minut a honeypot.
- Doplneny jsou sdilene serverove limity podle:
  - konkretni verejne vizitky / ownera,
  - stejne kombinace jmeno + e-mail + telefon,
  - stejneho e-mailu,
  - stejneho telefonu,
  - duplicitniho delsiho obsahu zpravy.
- Po prekroceni anti-spam limitu se nezapisuje zadost, nevytvari se mailbox zprava a neposila se push notifikace.
- Form neakceptuje zjevne spamove jmeno s URL a zpravy s vice odkazy.
- Ulozena zadost si zapisuje verzi anti-spam vrstvy a informaci, zda se IP podarilo rozlisit.

Proc to resit:

- Verejny endpoint muze byt zneuzit ke spamu poradcum.
- Pokud neni spravne nastavene IP rozliseni pro rate limit, muze se limit chovat globalne nebo nepresne.

Dalsi volitelne zpevneni:

- Zapnout Firestore TTL policy na poli `expiresAt` pro kolekci `_rateLimits`.
- Pokud by se spam i presto objevil, doplnit Cloudflare Turnstile, hCaptcha nebo Vercel Bot/Challenge pravidlo jen pro tento formular.

### P2 - Rate limit IP hlavicky je potreba provozne potvrdit

Priorita: stredni  
Soubor: `src/lib/server/rateLimit.ts`

Nalez:

- V produkci se proxy IP hlavicky defaultne neveri, pokud neni nastavene `RATE_LIMIT_TRUSTED_IP_HEADERS` nebo `RATE_LIMIT_TRUST_PROXY_HEADERS`.
- Pokud neni nic nastavene, `getRequestIp()` vraci `unknown`.

Proc to resit:

- To je bezpecnejsi nez slepe verit spoofnutym headerum, ale u public endpointu to muze znamenat jeden sdileny globalni limit pro vsechny navstevniky.
- V praxi to muze zpusobit falesne blokovani nebo snazsi DoS pres vycerpani sdileneho bucketu.

Doporucena uprava:

- Na Vercelu overit, ktera IP hlavicka je spolehlive nastavena a nespoofovatelna na aplikacni vrstve.
- Idealne resit public rate limiting na Vercel Firewall/Edge vrstve.
- Pokud se pouzije aplikacni header, nastavit explicitne `RATE_LIMIT_TRUSTED_IP_HEADERS` jen na potvrzene hlavicky.

### P2 - Manager muze mazat/upravovat tymove smlouvy pres API

Priorita: rozhodnuti produktu/bezpecnosti  
Soubor: `src/app/api/contracts/_lib/contractsApi.ts`

Nalez:

- `handleContractsPatch` a `handleContractsDelete` skladaji `allowedOwners` z prihlaseneho emailu a `teamEmails`.
- Manager tedy muze upravovat a mazat smlouvy lidi ve svem tymu, pokud jsou v `teamEmails`.

Proc to resit:

- Muze to byt zamyslena managerska funkce.
- Pokud ale ma manager jen videt/reportovat, ne mazat, je to moc silne opravneni.

Doporucena uprava:

- Potvrdit business pravidlo.
- Pokud mazani tymovych smluv nema byt managerske pravo, omezit `DELETE` jen na vlastnika smlouvy nebo owner/admin serverovou akci s audit logem.
- Minimalne pridat audit log k mazani/upravam tymovych smluv.

### P3 - Docasny fallback admin seznam ponechat jen prechodne

Priorita: nizsi/stredni  
Soubor: `src/lib/adminAccess.ts`

Nalez:

- Vedle custom claims existuje fallback podle emailu:
  - `jakub.rauscher@bohemika.eu` -> `owner`,
  - `vojtech.mahr@bohemika.eu` -> `admin`.

Proc to resit:

- Fallback je prakticky jako break-glass, ale dlouhodobe rozvolnuje model "pravda je v custom claims".

Doporucena uprava:

- Ponechat pouze docasne.
- Jakmile jsou claims stabilne nastavene a overene, fallback bud odstranit, nebo schovat za env flag `ADMIN_FALLBACK_ENABLED=1`.
- Pridat audit log, pokud fallback role byla pouzita.

### P3 - TTL a uklid docasnych/server-only kolekci

Priorita: nizsi/stredni  
Kolekce:

- `_passkeyChallenges`
- `_rateLimits`
- `mailboxSharedPayloads`
- `onlineCardMeetingRequests`
- stare Storage objekty `online-card/offices/...`

Nalez:

- Kod nastavuje expiracni data u rate limitu/passkey challenge, ale audit nepotvrdil aktivni Firestore TTL policy v konzoli.
- Sdilene payloady a tokenizovane fotky by mely mit uklidovou politiku.

Doporucena uprava:

- Ve Firebase/Firestore zapnout TTL pro pole typu `expiresAt`, kde existuje.
- Pro `mailboxSharedPayloads` pridat `expiresAt` nebo retention politiku.
- Pro online-card storage fotky pridat uklid orphan souboru, ktere uz nejsou v profilu.

### P3 - Interni server-only kolekce nejsou explicitne popsane v rules

Priorita: nizsi  
Soubor: `firestore.rules`

Nalez:

- Kolekce jako `passkeyCredentials`, `_passkeyChallenges`, `_rateLimits`, `contractRefs`, `contractNumberClaims`, `teamOverviewTotals`, `teamOverviewMonthly`, `mailboxSharedPayloads` spadaji do fallback deny.
- To je bezpecne, protoze Admin SDK rules obchazi.

Doporuceni:

- Pro citelnost rules doplnit explicitni bloky:
  - `allow read, write: if false;`
- Usnadni to budouci audit a snizi riziko, ze nekdo pozdeji omylem prida obecne pravidlo.

### P3 - CSP/reporting a logovani admin akci

Priorita: nizsi/stredni  

Doporuceni:

- Po zapnuti strict CSP ukladejte CSP reporty do logovatelneho endpointu nebo externi sluzby.
- Admin akce zapisovat do audit kolekce:
  - kdo,
  - kdy,
  - cil,
  - akce,
  - predchozi/nova hodnota pro subscription/admin role,
  - IP/user-agent.
- Zvlaste logovat:
  - mazani uctu,
  - zmenu predplatneho,
  - zmenu adminRole,
  - manualni email verification,
  - mazani nebo hromadne upravy smluv.

## Doporuceny postup uprav

### 1. Firestore rules hardening

Nejdulezitejsi dalsi krok.

Upravit rules tak, aby citlive zapisy sli pouze pres serverove API:

- entries/contracts direct write z klienta zavrit,
- admin direct write povolit maximalne ownerovi a jen tam, kde je to skutecne potreba,
- pridat emulator testy pro hlavni toky.

### 2. Office photo upload a URL hardening

Upravit:

- magic-byte detekce JPEG/PNG/WEBP/AVIF,
- serverem urceny content type,
- omezit ulozene photo URL na vlastni Firebase Storage,
- cleanup pri odebrani fotek.

### 3. Odstranit/zamknout SMTP email verification endpoint

Pokud se nepouziva:

- smazat `/api/auth/email-verification-link`,
- odebrat `nodemailer`,
- odebrat nepouzite SMTP env promenne z Vercelu.

Pokud se pouziva:

- zamknout pres admin/owner guard,
- doplnit audit log,
- ponechat nizky rate limit.

### 4. CSP strict enforce

Postup:

- nastavit `CSP_REPORT_URI`,
- sledovat report-only poruseni,
- opravit realne problemy,
- nastavit `CSP_STRICT_ENFORCE=1`.

### 5. IP rate limiting a public anti-spam

Upravit:

- potvrdit trusted IP header na Vercelu,
- public endpointy doplnit o Vercel Firewall/Bot/Challenge nebo CAPTCHA.

### 6. Audit log

Doplnit audit log pro admin a destruktivni akce.

Minimalni auditovane akce:

- delete user,
- subscription update,
- admin role update,
- mark email verified,
- delete/update team contract,
- end collaboration approval.

## Produkcni env checklist

Overit ve Vercelu:

- `CRON_SECRET` - nastaveno, dlouhy random text, Production scope.
- `NEXT_PUBLIC_APP_URL=https://bohemka.app`
- `WEBAUTHN_ORIGIN=https://bohemka.app`
- `WEBAUTHN_RP_ID=bohemka.app`
- `WEBAUTHN_ALLOWED_ORIGINS` - jen pokud existuji dalsi povolene produkcni originy.
- `RATE_LIMIT_ALLOW_MEMORY_FALLBACK=0` nebo nenastavovat v produkci.
- `RATE_LIMIT_TRUSTED_IP_HEADERS` - nastavit jen po potvrzeni spravne Vercel hlavicky.
- `CSP_REPORT_URI` - pred enforce fazi.
- `CSP_STRICT_ENFORCE=1` - az po overeni report-only.
- SMTP env (`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_HOST`, `SMTP_PORT`) - odstranit, pokud se SMTP verification endpoint smaze.
- Firebase Admin env - rotace klice pri podezreni, nepouzivat stejny klic mimo Vercel.

## Stav podle oblasti

| Oblast | Stav | Co doladit |
| --- | --- | --- |
| Login heslem | Dobry zaklad + sdileny lockout | Zapnout Firestore TTL pro `_loginAttemptLockouts` |
| TOTP 2FA | Dobre | Udrzet povinne pro poradce/adminy |
| Passkeys | Dobre | Zdokumentovat, zda nahrazuji TOTP login |
| Admin role | Vyrazne zlepsene | Odstranit fallback a zprisnit Firestore direct writes |
| Firestore rules | Dobre jako default deny, ale s vyjimkami | Omezit `isAdmin()` direct zapis |
| Storage rules | Velmi dobre | Cleanup tokenizovanych objektu |
| Exporty | Opraveno | Retence `mailboxSharedPayloads` |
| Mailbox prilohy | Dobre | Prubezne testovat legacy typy |
| Office photo upload | Funkcni, ale slabsi validace | Magic bytes + URL allowlist |
| Public meeting request | Zakladni ochrana | CAPTCHA/Turnstile + per-owner limit |
| CSP | Pripraveno | Prepnout strict enforce |
| Dependencies | Ciste | Pravidelny `npm audit` |
| Build | Prosel | Lint skripty uklidit |

## Zaver

Bezpecnostni stav aplikace je po poslednich upravach dobry pro interni produkcni aplikaci, ale neni hotovy na "top" uroven. Nejvetsi realny upgrade ted neni dalsi firewall pravidlo, ale zmenseni pravomoci primo ve Firestore rules a odstraneni zbylych starych/volnejsich cest.

Poradi prace:

1. Firestore rules hardening.
2. Office photo magic bytes a URL allowlist.
3. Odstranit nebo zamknout SMTP verification endpoint.
4. CSP strict enforce.
5. IP rate limiting + public anti-spam.
6. Audit log admin/destruktivnich akci.

Po techto bodech bude bezpecnostni model mnohem cistsi: citlive operace budou prochazet serverovym API, role budou centralizovane, uploady budou konzistentne validovane a verejne endpointy budou lepe chranene proti spamu i automatizaci.
