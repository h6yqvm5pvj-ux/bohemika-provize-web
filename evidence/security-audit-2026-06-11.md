# Bezpecnostni audit aplikace

Datum: 2026-06-11
Aktualizace: 2026-06-12 - self-service uprava `commissionMode` a `positionTimeline` potvrzena jako zamyslene business chovani, ne bezpecnostni nalez. Stored XSS pres intranet wall prilohy opraveno whitelistem typu, magic-byte kontrolou a bezpecnym servirovanim legacy souboru. IP rate limit prestal slepe duverovat forwarded hlavickam a v produkci pouziva jen explicitne nakonfigurovane client-IP hlavicky. `@grpc/grpc-js` transitive dependency aktualizovana na nezranitelne patch verze.
Rozsah: staticky audit lokalniho repozitare, Firestore/Storage rules, Next.js API routes, auth/autorizace, uploady, verejne endpointy, CSP/security headers a `npm audit`.
Mimo rozsah: aktivni penetrační test proti produkci, kontrola skutecne produkcni konfigurace ve Vercelu/Firebase, revize skutecnych tajemstvi v env hodnotach. Z `.env.local` byly zkontrolovane jen nazvy promennych, ne hodnoty.

## Shrnutí

Aplikace ma dobry zaklad: Firebase ID tokeny se na vetsine API overuji pres Admin SDK vcetne revocation checku, mnoho citlivych advisor endpointu vyzaduje dokonceny profil a TOTP MFA, Storage rules jsou zavrene a smluvni PDF upload dela typovou i obsahovou validaci.

Nejvetsi puvodni riziko po potvrzeni business pravidel bylo stored XSS pres intranetove prilohy. K 2026-06-12 je tato cast opravena: nove uploady jsou omezeny na PDF a bezpecne rastrové obrazky overene podle obsahu souboru a legacy nezname typy se uz neposilaji inline jako aktivni obsah.

Poznamka ke kariere/provizim: self-service uprava `commissionMode` a `positionTimeline` pres `PATCH /api/user/profile` byla dodatecne potvrzena jako spravne a zamyslene chovani. Neni vedena jako bezpecnostni nalez.

## Nalezy

### Vysoke: stored XSS pres intranet wall prilohy

Stav: opraveno 2026-06-12.

Dotcene soubory:
- `src/app/api/intranet/wall/route.ts:626-652`
- `src/app/api/intranet/wall/route.ts:1075-1124`
- `src/app/api/intranet/wall/[postId]/route.ts:232-258`
- `src/app/api/intranet/wall/[postId]/route.ts:436-482`
- `src/app/api/intranet/wall/attachment/route.ts:208-215`
- `middleware.ts:48-67`
- Oprava: `src/lib/server/intranetWallAttachments.ts`, `src/app/api/intranet/wall/route.ts`, `src/app/api/intranet/wall/[postId]/route.ts`, `src/app/api/intranet/wall/attachment/route.ts`

Problem:
- Upload noveho/editovaneho intranet postu kontroluje pocet a velikost souboru, ale nema whitelist MIME typu ani magic-byte kontrolu.
- Ulozeny `contentType` se pozdeji vraci jako HTTP `Content-Type` a `Content-Disposition` je `inline`, pokud klient neprida `download=1`.
- Enforced CSP defaultne pouziva baseline s `script-src 'unsafe-inline'`.

Oprava:
- Upload noveho i editovaneho intranet postu pripravuje soubory pres sdileny helper, ktery povoli jen PDF, PNG, JPG/JPEG/JFIF, GIF, WEBP a AVIF podle magic bytes, pripony a deklarovaneho MIME.
- `text/html`, `image/svg+xml`, XML, JS a jine nezname typy se pri uploadu odmitnou.
- Download endpoint znovu overi skutecny obsah ulozene prilohy. Nezname nebo nebezpecne legacy soubory vraci jako `application/octet-stream` s `Content-Disposition: attachment`.
- Inline PDF dostava per-response sandbox CSP.

Dopad:
- Autentizovany poradce muze nahrat napr. HTML soubor a sdilet prilohu v intranetu.
- Po otevreni prilohy muze obsah bezet pod stejnym originem aplikace. To muze ohrozit data ulozena ve stejnem originu a volani internich API z prohlizece obeti.

Doporuceni:
- Pro intranet prilohy zavest whitelist: PDF + rastrové obrazky (`png`, `jpg`, `webp`, `gif`, pripadne `heic/heif`) a explicitne zakazat `text/html`, `image/svg+xml`, XML, JS.
- Nepouzivat slepe `file.type`; kontrolovat i priponu a magic bytes.
- Vsechny nebezpecne nebo nezname typy servirovat jako `Content-Type: application/octet-stream` a `Content-Disposition: attachment`.
- Pro inline PDF/obrazky pridat per-response CSP typu `sandbox; default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'`.
- Zvážit oddelenou domenu/bucket pro user-generated content.

### Vysoke: IP rate limit veri klientskym forwarded hlavickam

Stav: opraveno 2026-06-12.

Dotcene soubory:
- `src/lib/server/rateLimit.ts:353-366`
- `src/lib/server/apiEntryGuard.ts:270-288`
- `src/app/api/online-card/meeting-request/route.ts:241-248`
- `src/app/api/gold/route.ts:718-724`
- obdobne `life-comparison`, `life-comparison-source`, `comfort-prices`

Problem:
- `getRequestIp()` bere prvni hodnotu z `x-forwarded-for`, potom `cf-connecting-ip` a `x-real-ip`.
- Pokud edge/proxy tyto hlavicky neprepisuje nebo do `x-forwarded-for` pouze pripojuje, utocnik muze limit obchazet zmenou hlavicky.

Oprava:
- `getRequestIp()` uz nebere forwarded hlavicky bez podminky. V produkci je pouzije jen po explicitnim allowlistu `RATE_LIMIT_TRUSTED_IP_HEADERS` nebo vedomem zapnuti `RATE_LIMIT_TRUST_PROXY_HEADERS=1`.
- Pro nezname produkcni prostredi bez konfigurace se forwarded hlavicky ignoruji a pouzije se sdileny `unknown` klic, takze nejde obchazet limit libovolnym podvrzenym headerem.
- Vsechny IP hodnoty se validuji pres `net.isIP`; neplatne stringy, `unknown`, porty a RFC `Forwarded` format se parsují konzervativne.
- Pro Vercel/Cloudflare je potreba nastavit konkretni hlavicku az podle overene proxy konfigurace, napr. `RATE_LIMIT_TRUSTED_IP_HEADERS=x-forwarded-for` nebo `RATE_LIMIT_TRUSTED_IP_HEADERS=cf-connecting-ip`, pokud ji edge skutecne prepisuje.

Dopad:
- Public endpointy mohou jit spamovat nebo draze zatezovat upstreamy.
- Nejviditelnejsi je verejna zadost o schuzku, ktera zapisuje PII do Firestore a posila mailbox/push notifikace.

Doporuceni:
- V produkci brat IP jen z hlavicky garantovane platformou, pripadne parsovat forwarded chain podle explicitniho seznamu duveryhodnych proxy.
- U verejneho formulare pridat CAPTCHA/Turnstile, honeypot samotny nestaci.
- U public endpointu zvazit kombinovany limit: IP + normalized payload fingerprint + cilovy slug/owner.

### Vysoke: cron lze spustit bez secretu pres `x-vercel-cron`

Dotceny soubor:
- `src/app/api/cron/weekly-team-report/route.ts:147-166`

Problem:
- Pokud neni nastaven `WEEKLY_TEAM_REPORT_CRON_SECRET` ani `CRON_SECRET`, produkce povoli pozadavek s `x-vercel-cron: 1`.
- Kod zaroven podporuje secret v query parametru `?secret=...`, ktery muze unikat do logu, browser historie, proxy logu nebo monitoringu.

Dopad:
- Pokud produkcni env nema cron secret, neautorizovany klient muze spoustet tydenni report.
- Endpoint cte kolekce napric uzivateli a posila mailbox/push zpravy, takze dopad je jak DoS/spam, tak zbytecne zpracovani internich dat.

Doporuceni:
- V produkci vyzadovat `Authorization: Bearer <secret>` vzdy.
- Odstranit query secret.
- Pro porovnani secretu pouzit timing-safe compare.
- Pri chybejicim secretu v produkci fail-closed, ne fallback na header.

### Stredni: mailbox prilohy duveruji MIME, SVG neni explicitne zakazane

Dotcene soubory:
- `src/app/api/mailbox/compose/route.ts:57-63`
- `src/app/api/mailbox/attachment/route.ts:234-241`

Problem:
- Mailbox povoli `contentType.startsWith("image/")`, tedy i `image/svg+xml`, pokud ho browser/klient posle.
- Download endpoint vraci ulozeny `Content-Type` inline.

Dopad:
- SVG muze byt pri primem otevreni aktivni obsah pod stejnym originem. Riziko je mensi nez u intranet wall HTML, ale patri do stejne tridy UGC/XSS.

Doporuceni:
- Explicitne zakazat `image/svg+xml`.
- Pro obrazky kontrolovat magic bytes a nepovolovat typ jen podle klientem dodaneho MIME.
- Pro vsechny prilohy pridat bezpecny fallback `attachment + application/octet-stream`.

### Stredni: CSP je strict jen report-only

Dotcene soubory:
- `middleware.ts:48-67`
- `middleware.ts:72-96`
- `middleware.ts:131-135`

Problem:
- Enforced CSP defaultne obsahuje `script-src 'unsafe-inline'`.
- Strict nonce CSP se posila jen jako `Content-Security-Policy-Report-Only`, pokud `CSP_STRICT_ENFORCE !== "1"`.

Dopad:
- Stored/reflected XSS ma nizsi bariéru. To zhorsuje dopad nalezu s prilohami.

Doporuceni:
- Po odstraneni inline skriptu prepnout produkci na `CSP_STRICT_ENFORCE=1`.
- Pridat `script-src-attr 'none'` i do baseline, nebo baseline odstranit.
- Zuzit `img-src https:` tam, kde to jde, protoze HTTPS image exfiltrace je caste XSS obchazeni `connect-src`.

### Stredni: admin role je hardcoded seznam e-mailu

Dotcene soubory:
- `src/lib/adminAccess.ts:1-14`
- `src/app/api/admin/users/route.ts:95-102`
- obdobne `admin/security`, `admin/subscriptions`, `user/create`, cast `user-requests`

Problem:
- Admin pristup je navazan na hardcoded e-mail v kodu.
- Endpointy sice predtim volaji advisor setup/MFA kontrolu, ale sprava admin role neni centralne auditovatelna v Auth custom claims/Firestore private roli.

Dopad:
- Zmena adminu vyzaduje deploy.
- Horsi audit a rotace pristupu.
- Vyssi riziko pri rename/migraci admin uctu.

Doporuceni:
- Presunout admin roli do Firebase custom claimu nebo `usersPrivate/{email}.roles.adminPanel`.
- Ponechat hardcoded break-glass jen mimo bezny runtime nebo s explicitnim logovanim.
- Logovat vsechny admin akce vcetne actor uid/email, target, diff, IP a user-agent.

### Stredni: login lockout je pouze in-memory

Dotcene soubory:
- `src/lib/server/loginAttemptLockout.ts:14-39`
- `src/app/api/auth/login-attempts/route.ts:85-170`

Problem:
- Stav chybnych prihlaseni je v `globalThis` Map.
- V serverless/multi-instance runtime se neshari mezi instancemi a mizi pri cold startu.

Dopad:
- Ochrana proti brute-force neni spolehliva sama o sobe.
- Firebase Auth ma vlastni ochranu, ale aplikacni limit muze byt obchazen pres instance/restart.

Doporuceni:
- Pouzit stejny sdileny store jako `consumeRateLimit` (Redis/Firestore).
- Zachovat account-level i IP-level bucket.
- Fail-closed pri nedostupnosti shared store pro login flow.

### Stredni: autentizovany mail endpoint je pouzitelny jako interni SMTP relay

Dotceny soubor:
- `src/app/api/send-email/route.ts:95-160`

Problem:
- Libovolny advisor muze poslat email na libovolne `to`, s libovolnym subject/text a PDF prilohou, z firemniho SMTP.
- Rate limit je 5/min na uzivatele.

Dopad:
- Pri kompromitaci bezneho advisor uctu lze rozesilat phishing/spam z firemni infrastruktury.
- Reputacni dopad na domenu/SMTP.

Doporuceni:
- Zuzit endpoint na konkretni sablony/scenare nebo pridat server-side allowlist prijemcu podle workflow.
- Doplnit audit log odeslanych mailu.
- Kontrolovat PDF magic bytes, nejen base64 velikost.
- Zvážit denni kvoty a anomaly alerting.

### Stredni/nizke: endpoint pro MFA oznaci e-mail jako verified bez overovaciho odkazu

Dotceny soubor:
- `src/app/api/auth/confirm-email-for-mfa/route.ts:75-98`

Problem:
- Pri recent auth endpoint nastavi `emailVerified: true`, pokud uzivatel jeste neni verified.
- To overuje znalost hesla, ne vlastnictvi mailboxu.

Dopad:
- Pokud se utocnik dostane k heslu neovereneho uctu, muze si ucet oznacit jako verified a pokracovat do MFA flow.

Doporuceni:
- Preferovat standardni Firebase email verification link.
- Pokud je to nutny bootstrap pro interni ucty, omezit endpoint na admin/managed flow a auditovat zmenu.

### Vysoke: zranitelna transitive dependency `@grpc/grpc-js`

Stav: opraveno 2026-06-12.

Overeni:
- `npm audit --json`
- `npm ls @grpc/grpc-js`

Problem:
- `npm audit` hlasi 1 high severity vulnerability.
- Strom:
  - Puvodne: `firebase-admin@13.10.0 -> @google-cloud/firestore@7.11.6 -> google-gax@4.6.1 -> @grpc/grpc-js@1.14.3`
  - Puvodne: `firebase@12.6.0 -> @firebase/firestore@4.9.2 -> @grpc/grpc-js@1.9.15`
- Advisory: `GHSA-5375-pq7m-f5r2`, `GHSA-99f4-grh7-6pcq`.

Oprava:
- `package-lock.json` aktualizovan pres `npm update @grpc/grpc-js`.
- Aktualni strom:
  - `firebase-admin@13.10.0 -> @google-cloud/firestore@7.11.6 -> google-gax@4.6.1 -> @grpc/grpc-js@1.14.4`
  - `firebase@12.6.0 -> @firebase/firestore@4.9.2 -> @grpc/grpc-js@1.9.16`
- `npm audit --json` po update hlasi 0 vulnerabilities.

Dopad:
- Malformed gRPC request/message muze zpusobit crash klienta/serveru podle advisory. Pro tuto aplikaci je riziko hlavne dostupnost backendu a Firebase/Firestore komunikace.

Doporuceni:
- Po deployi proverit smoke test API, ktere sahaji na Firestore/Auth/Storage.

## Pozitivni zjisteni

- Storage rules jsou zavrene pro vse (`allow read, write: if false`).
- Smluvni PDF upload validuje velikost, MIME, priponu i `%PDF-` signaturu a pri downloadu nastavuje sandbox CSP.
- Vetsina internich API pouziva Firebase Admin `verifyIdToken(token, true)`.
- Advisor-only API typicky vyzaduji existujici profil, telefon, `positionTimeline` a TOTP MFA.
- Firestore rules maji explicitni ochranu pro citliva verejna/private user pole a contracts/entries jsou zapisovatelne jen pres backend/admin.
- `.env*` jsou v `.gitignore`; lokalne existuje `.env.local`, ale audit cetl jen nazvy promennych.

## Verifikace

Spusteno:
- `npm audit --json` -> 1 high (`@grpc/grpc-js`)
- `npm ls @grpc/grpc-js` -> zranitelne verze `1.9.15` a `1.14.3`
- `npm update @grpc/grpc-js` -> aktualizovalo lockfile na `1.9.16` a `1.14.4`
- `npm audit --json` po update -> 0 vulnerabilities
- `npm run lint` -> neuspesne, 8 existujicich erroru v `.cjs` skriptech kvuli `@typescript-eslint/no-require-imports`, plus 8 warningu. Nejde o nove zmeny auditu.
- `npm run build` po oprave intranet wall priloh -> uspesne, vcetne TypeScript kontroly.
- `npm run build` po oprave IP rate limitu -> uspesne, vcetne TypeScript kontroly.
- `npm run build` po update `@grpc/grpc-js` -> uspesne, vcetne TypeScript kontroly.

Nespusteno:
- Live penetrační test produkce.
- Firebase emulator test rules.
- End-to-end test s realnymi uzivatelskymi rolemi.

## Prioritni plan oprav

1. Doresit aktivni obsah v mailbox prilohach a zmenit mailbox download endpoint na safe MIME/disposition.
2. Vynutit cron secret v produkci a odstranit query secret.
3. Pridat CAPTCHA/Turnstile a payload fingerprint limit pro public meeting request.
4. Prepnout strict CSP do enforce rezimu po odstraneni inline zavislosti.
5. Presunout admin roli do custom claimu/private role a doplnit audit log.
