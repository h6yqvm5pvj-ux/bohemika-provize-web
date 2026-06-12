# Kompletni audit zabezpeceni webu Bohemika Provize Web

Datum auditu: 12. 6. 2026  
Rozsah: staticky audit lokalniho repozitare, konfigurace Next.js/Vercel, Firebase Auth, Firestore rules, Storage rules, API route handleru, uploadu, login flow, MFA/passkeys, rate limitingu, security headers a existujici Vercel Firewall ochrany.  
Mimo rozsah: aktivni penetracni test proti produkci, kontrola skutecnych hodnot produkcnich env promennych, revize Vercel/Firebase konzole mimo screenshot a plny DAST scan.

## 1. Executive summary

Aplikace ma oproti beznemu internimu webu nadstandardni bezpecnostni zaklad:

- prihlasovani stoji na Firebase Authentication,
- serverove API overuje Firebase ID tokeny pres Admin SDK vcetne revocation checku,
- poradenske casti vyzaduji dokonceny profil a TOTP 2FA,
- je dostupne prihlaseni pres passkey/WebAuthn,
- Firestore rules maji default deny a smluvni zapis jde pres backend,
- Firebase Storage rules jsou zavrene,
- smluvni PDF a intranetove prilohy maji oddelene backendove kontroly,
- web je nastaveny jako neindexovatelny pro vyhledavace,
- na Vercelu je aktivni firewall pravidlo proti beznym scanner pathum,
- `npm audit --audit-level=low` k datu auditu nasel 0 zranitelnosti.

Nejdulezitejsi puvodni riziko nebyl login, ale zpracovani klientem posilaneho HTML u sdilenych exportu. Tento tok byl po auditu upraven: share endpoint uz neprijima ani neuklada `previewHtml`, uklada jen strukturovany snapshot a shared-preview API sklada serverovy escaped nahled. Po auditu byly dotazeny take mailbox prilohy: upload i download pouziva whitelist podle magic bytes a nezname/legacy typy se servírují jako download. Cron autorizace tydenniho reportu byla upravena na Vercel `CRON_SECRET` Bearer token, bez query secretu a bez produkcniho fallbacku. Zbyvajici prakticka rizika jsou hlavne CSP, ktere je po odstraneni HTML toku vhodne prepnout do strict enforce rezimu, a provozni overeni produkcnich env hodnot.

Poznamka k business pravidlum: self-service nastaveni kariery/provizni pozice uzivatelem je podle zadani zamyslene chovani. V tomto auditu neni vedeno jako bezpecnostni nalez.

## 2. Verejna dohledatelnost a indexace

Web neni urceny pro verejne dohledani ve vyhledavacich.

Overene kontroly:

- `next.config.ts` nastavuje pro vsechny routes `X-Robots-Tag: noindex, nofollow, noarchive`.
- `public/robots.txt` obsahuje:
  - `User-agent: *`
  - `Disallow: /`
- Bezpecnostni hlavicky jsou nastavene globalne pres Next headers a middleware.

Dulezite upresneni: `noindex` a `robots.txt` nejsou autentizace. Slusne crawlery je respektuji, ale kdokoliv s primou URL stale muze verejne dostupnou route navstivit. Ochrana citlivych dat proto spravne stoji hlavne na Firebase Auth, serverove autorizaci a Firestore/Storage pravidlech.

## 3. Vercel Firewall

Podle dodaneho screenshotu je ve Vercelu aktivni Firewall a pravidlo:

- nazev: `Block scanner paths`,
- popis: `Block common automated scanner requests that are not used by the app.`,
- akce: `Deny`,
- podminka: request path matchuje bezne scanner cesty.

Pravidlo podle screenshotu blokuje typicke automatizovane pozadavky, ktere aplikace nepouziva, napriklad:

- PHP soubory typu `*.php`,
- WordPress endpointy typu `/wp-admin` a `/wp-json`,
- soubory/adresare typu `/.env`, `/.git`, `aws`, `ssh`,
- `/phpmyadmin`.

Hodnoceni:

- Je to dobra edge ochrana proti sumu z internetu a automatizovanym scannerum.
- Snizuje log noise a cast beznych pokusu o exploit neexistujicich technologii.
- Nenahrazuje aplikacni autorizaci, rate limiting, validaci vstupu ani ochranu proti zneuziti legitimnich endpointu.

Doporuceni pro Vercel Firewall:

- Ponechat aktualni scanner rule zapnutou.
- Doplnit oddelena pravidla/rate limity pro verejne endpointy:
  - `/api/online-card/meeting-request`,
  - `/api/auth/passkeys/authentication-options`,
  - `/api/auth/passkeys/authentication`,
  - `/api/auth/login-attempts`.
- Pokud Vercel plan umoznuje bot/challenge pravidla, nasadit challenge pro public formulare pri zvysenem spamu.
- Pravidelne kontrolovat Firewall Audit Log a Traffic prehled.

## 4. Architektura a citliva data

Technologicky stack:

- Next.js 16 App Router,
- React 19,
- Vercel hosting,
- Firebase Authentication,
- Firebase Admin SDK na serveru,
- Firestore jako databaze,
- Firebase Storage pro binarni prilohy,
- Firebase Cloud Messaging pro push notifikace,
- nodemailer/SMTP pro e-maily,
- OpenAI API pro AI funkcionalitu,
- WebAuthn/passkeys pres `@simplewebauthn`.

Citlive datove oblasti:

- uzivatelske ucty a Firebase ID tokeny,
- emaily, telefonni cisla, jmena, profily poradcu,
- kariery/pozice a provizni parametry,
- smlouvy, klienti, cisla smluv, provize,
- PDF smluv a interni dokumenty,
- mailbox zpravy, prilohy a tipy,
- push tokeny,
- admin funkce a subscription stav,
- produkcni exporty a sdilene nahledy,
- verejne zadosti z online vizitek.

## 5. Prihlasovani a pristup

### 5.1 Standardni login heslem

Login flow je implementovany v `src/app/login/page.tsx`.

Prubeh:

1. Uzivatel zada e-mail a heslo.
2. Frontend nejdrive vola `/api/auth/login-attempts` s akci `check`.
3. Prihlaseni probiha pres `signInWithEmailAndPassword` z Firebase Auth.
4. Pokud Firebase vrati `auth/multi-factor-auth-required`, aplikace spusti TOTP MFA resolver.
5. Uzivatel zada jednorazovy kod z autentikacni aplikace.
6. Po prihlaseni `onAuthStateChanged` overi stav prihlaseni, odesle akci `success` do login-attempt endpointu, nacte profil a overi subscription.
7. Bez aktivniho/grace subscription se uzivatel odhlasi a nedostane se do aplikace.

Silne stranky:

- Firebase Auth resi hlavni heslove overeni.
- Serverove API pouziva `verifyIdToken(token, true)`, tedy kontroluje i revokovane tokeny.
- Pri chybnich heslech se eviduji pokusy.
- Po uspesnem loginu se pokusy pro dany ucet/IP resetuji.
- Prihlaseny uzivatel bez emailu v tokenu je odmitnut.
- Ucty bez aktivniho predplatneho jsou blokovane.

Slabsi misto:

- Aplikacni lockout po chybnich heslech je ulozeny v `globalThis` Map (`src/lib/server/loginAttemptLockout.ts`). V serverless prostredi neni sdileny mezi instancemi a muze zmizet po cold startu. Firebase Auth ma vlastni ochrany, ale aplikacni lockout sam o sobe neni plne spolehlivy.

Doporuceni:

- Presunout login lockout do sdileneho store, idealne stejne jako rate limit: Redis/Upstash nebo Firestore transakce.
- Zachovat kombinaci account-level a IP+account bucketu.
- U prihlaseni fail-closed, pokud bezpecnostni store neni dostupny.

### 5.2 TOTP 2FA

TOTP MFA je v aplikaci zavedene jako povinna soucast dokoncenych poradenskych uctu.

Overene kontroly:

- `advisorSetupGuard` vyzaduje u poradce:
  - existujici profil,
  - telefon,
  - karierni historii,
  - TOTP faktor ve Firebase Auth.
- API guardy typu `requireAdvisorAuthedRateLimited`/`getAdvisorAccessError` blokujou poradce bez dokonceneho nastaveni.
- Login UI pracuje s Firebase MFA resolverem a vyzaduje jednorazovy kod.
- Nastaveni 2FA pracuje s Firebase TOTP faktorem (`TotpMultiFactorGenerator`).
- Admin sekce umi zobrazit stav MFA uzivatelu (`/api/admin/security`).

Hodnoceni:

- 2FA je pro poradensky provoz realne vynucovana, ne pouze zobrazena v UI.
- Doporuceny stav je trvat na TOTP pro vsechny poradce a adminy.

### 5.3 Passkeys / WebAuthn

Passkey implementace je v `src/lib/server/passkeys.ts` a klientsky v `src/app/lib/passkeys.ts`.

Silne stranky:

- Pouziva se `@simplewebauthn/server` a `@simplewebauthn/browser`.
- WebAuthn challenge se uklada serverove do Firestore.
- Challenge ma TTL 5 minut.
- Challenge se pri overeni spotrebuje transakcne a smaze.
- Registrace passkey vyzaduje platny Firebase bearer token.
- Registrace/mazani passkey vyzaduje recent auth do 10 minut.
- Pri registraci je `userVerification: required`.
- Pri prihlaseni je `userVerification: required`.
- Kontroluje se origin a RP ID.
- V produkci musi byt nastaveny povoleny WebAuthn origin.
- Ukladany je public key, counter, uid, email, transporty a stav disabled.
- Mazani passkey kontroluje, ze credential patri aktualnimu uzivateli.

Dulezite designove upresneni:

- Passkey login vraci Firebase custom token a prihlasuje uzivatele pres `signInWithCustomToken`.
- To znamena, ze passkey je samostatny passwordless prihlasovaci mechanismus s lokalni user verification (napr. Face ID/Touch ID/PIN), ne dalsi krok ve Firebase TOTP MFA resolveru.
- Bezpecnostne je passkey silny a phishing-resistant, ale pokud by interni politika vyzadovala TOTP pri kazdem prihlaseni, je potreba to explicitne doresit.

Doporuceni:

- V produkci zkontrolovat `WEBAUTHN_ORIGIN`, `WEBAUTHN_ALLOWED_ORIGINS`, `WEBAUTHN_RP_ID` a `NEXT_PUBLIC_APP_URL`.
- V admin prehledu zobrazovat i pocet/passkey stav, nejen MFA faktor.
- Rozhodnout a zdokumentovat, zda passkey nahrazuje TOTP pri loginu, nebo se ma kombinovat s TOTP.

### 5.4 Email verification a MFA bootstrap

Existuje endpoint pro odeslani Firebase verification linku pres SMTP a endpoint `/api/auth/confirm-email-for-mfa`.

Riziko:

- `/api/auth/confirm-email-for-mfa` umi pri recent auth oznacit email jako verified bez kliknuti na overovaci odkaz.
- To overuje znalost aktualni prihlasovaci session/hesla, ale ne primo vlastnictvi mailboxu.

Doporuceni:

- Preferovat standardni Firebase email verification link.
- Pokud je bootstrap nutny pro interni ucty, ponechat ho jen jako vedomy interní proces a auditovat.

## 6. Autorizace a role

### 6.1 API guardy

Silne stranky:

- Vetsina citlivych endpointu vyzaduje bearer token.
- Server kontroluje token pres Firebase Admin SDK.
- Pouziva se revocation check.
- Advisor endpointy kontroluji dokoncenou konfiguraci uctu.
- Tipster ucty jsou v citlivych advisor funkcich omezene.
- Subscription stav se kontroluje pri vstupu do smluvniho systemu.

Typicke guardy:

- `requireAuthedRateLimited`,
- `requireAdvisorAuthedRateLimited`,
- `requireContractsEntryGuard`,
- `getAdvisorAccessError`.

### 6.2 Admin pristup

Aktualni stav:

- Admin pristup byl po auditu centralizovan do role modelu `owner` / `admin` / `support`.
- Serverove admin API pouziva jednotny guard `getAdminAuthContext`.
- Role se ctou z Firebase custom claims `admin: true` a `adminRole`.
- Docasny fallback zustava v kodu pro prechod:
  - `jakub.rauscher@bohemika.eu` = `owner`,
  - `vojtech.mahr@bohemika.eu` = `admin`.
- `owner` muze spravovat predplatne a mazat ucty.
- `admin` muze pouzivat admin panel, vytvaret/upravovat uzivatele, resit zadosti a cist bezpecnostni prehled, ale nemuze mazat ucty ani spravovat predplatne.
- Firestore rules rozlisuji `adminRole == "owner"` pro primy zapis do uzivatelskych/privatnich profilu.

Hodnoceni:

- Model je vyrazne lepsi nez samotny hardcoded seznam e-mailu.
- Fallback je vhodny jen jako docasny prechodovy/break-glass mechanizmus.

Doporuceni:

- Nastavit Firebase custom claims pro Jakuba (`owner`) a Vojtecha (`admin`) pomoci `scripts/set-admin-claim.mjs`.
- Po overeni prihlaseni obou uctu odstranit fallback e-mail roli z kodu.
- Logovat admin akce s actor email/uid, target, diff, IP, user-agent a timestamp.

### 6.3 Firestore rules

Silne stranky:

- Firestore fallback ma `allow read, write: if false`.
- Kolekce `contracts` a `users/{email}/entries` jsou pro zapis z klienta zavrene, zapis jde pres Admin SDK.
- Cteni smluv je podminene vlastnikem, manager chainem/overrides nebo admin claimem.
- `usersPrivate` omezuje citliva data.
- U verejnych user profilu jsou rozlisene citlive identity/admin/subscription fieldy.

Poznamka:

- Firestore rules pracuji i s `admin` custom claimem. Aplikacni admin panel ale soucasne pouziva hardcoded email seznam. Je vhodne sjednotit model roli.

### 6.4 Storage rules

Storage rules jsou velmi prisne:

- `contract-pdfs/{allPaths=**}`: `allow read, write: if false`,
- vse ostatni: `allow read, write: if false`.

Hodnoceni:

- Prime klientské cteni/zapis do Firebase Storage je zavrene.
- Pristup k souborum jde pres backend API s vlastni autorizaci.

## 7. Rate limiting

Silne stranky:

- Sdileny rate limit umi Redis REST, Firestore transakce a az potom memory fallback.
- V produkci je memory fallback defaultne vypnuty.
- Pri nedostupnem sdilenem store umi rate limiter fail-closed.
- IP extraction uz nepouziva forwarded hlavicky bez explicitni duvery.

Rizika a doporuceni:

- Produkce musi mit spravne nastaveny sdileny store (`RATE_LIMIT_REDIS_REST_URL/TOKEN`, `UPSTASH_*`, `KV_*`) nebo funkcni Firestore Admin.
- Produkce musi mit vedome nastaveny duveryhodny client-IP header podle Vercel reality (`RATE_LIMIT_TRUSTED_IP_HEADERS`), jinak se pro IP endpointy pouzije sdileny `unknown` klic.
- Login lockout je zatim oddeleny a in-memory; doporuceno presunout do sdileneho store.

## 8. Security headers a CSP

Silne stranky:

- HSTS: `max-age=31536000; includeSubDomains; preload`.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Cross-Origin-Opener-Policy: same-origin`.
- `Cross-Origin-Resource-Policy: same-origin`.
- `Permissions-Policy` vypina kameru, mikrofon, geolokaci a browsing topics.
- Middleware blokuje pristup na `/dokumenty/` 404 odpovedi.

Riziko:

- Enforced CSP baseline obsahuje `script-src 'unsafe-inline'`.
- Strict nonce CSP se posila jen jako `Content-Security-Policy-Report-Only`, pokud `CSP_STRICT_ENFORCE !== "1"`.

Dopad:

- Pri stored/reflected XSS je exploitace jednodussi.
- Toto zvysuje zavaznost HTML/iframe rizik.

Doporuceni:

- Po odstraneni/sandboxovani HTML preview a dalsich inline use-case prepnout produkci na `CSP_STRICT_ENFORCE=1`.
- Pridat `CSP_REPORT_URI` a sledovat reporty.
- Do baseline pridat alespon `script-src-attr 'none'`.
- Omezit `img-src https:` tam, kde to nebrani funkcim.

## 9. Uploady a soubory

### 9.1 Smluvni PDF

Smluvni PDF je resene dobre.

Overene kontroly:

- Upload je chranen `requireContractsEntryGuard`.
- Upload muze delat vlastnik smlouvy, pripadne specialne povoleny actor v tymu.
- Kontroluje se:
  - velikost max 12 MB,
  - content type PDF/x-pdf,
  - pripona `.pdf`,
  - PDF signatura v obsahu,
  - SHA-256 ulozeneho souboru.
- Soubor se uklada pres Admin SDK do Storage.
- Storage path obsahuje hash vlastnika, ne primo email.
- Download API znovu kontroluje pristup ke smlouve.
- Odpoved ma `Content-Type: application/pdf`, `nosniff`, `no-store` a sandbox CSP.

Hodnoceni: silna oblast.

### 9.2 Intranet wall prilohy

Intranet wall prilohy maji bezpecny whitelist.

Overene kontroly:

- Povolené jsou PDF a rastrové obrazky PNG, JPG/JPEG/JFIF, GIF, WEBP a AVIF.
- Kontroluje se magic bytes, pripona a deklarovany MIME.
- Nebezpecne/nezname legacy soubory se servírují jako download s `application/octet-stream`.
- Inline PDF ma sandbox CSP.

Hodnoceni: puvodni riziko stored XSS pres intranet prilohy je podle aktualniho kodu opraveno.

### 9.3 Mailbox prilohy

Stav: opraveno 12. 6. 2026 v kodu.

Puvodni problem:

- `src/app/api/mailbox/compose/route.ts` povoluje `contentType.startsWith("image/")` nebo pripony obrazku/PDF.
- To muze zahrnout `image/svg+xml`.
- Nekontroluji se magic bytes.
- `src/app/api/mailbox/attachment/route.ts` vraci ulozeny `Content-Type` a `Content-Disposition: inline`, pokud neni `download=1`.

Dopad:

- Pri nahrani SVG nebo jineho aktivniho obsahu muze vzniknout stored XSS pri otevreni prilohy.
- Riziko je omezene na prihlasene uzivatele, ale mailbox je interní komunikační kanal, tedy dopad muze byt vyznamny.

Provedena oprava:

- Upload pošty používá sdílený whitelist helper pro PDF, PNG, JPG/JPEG/JFIF, GIF, WEBP a AVIF podle magic bytes.
- Deklarovaný MIME typ a přípona musí odpovídat zjištěnému bezpečnému typu; `image/svg+xml`, HTML, XML, JS a neznámé typy se odmítnou.
- Do Storage se ukládá normalizovaný bezpečný `contentType`, ne klientem dodaný libovolný MIME.
- Download endpoint znovu kontroluje skutečný obsah uložené přílohy.
- Neznámé/legacy soubory se vrací jako `application/octet-stream` a vždy jako `attachment`.
- Inline PDF dostává sandbox CSP.
- Klientský náhled pošty vykresluje inline jen rastrové typy `png/jpeg/gif/webp/avif`.

## 10. Sdilene HTML nahledy a XSS

### Nalez: stored XSS pres sdileny export produkce

Zavaznost: vysoka.  
Stav: opraveno 12. 6. 2026 v kodu.

Dotcene soubory:

- `src/app/api/export-produkce/share/route.ts`,
- `src/app/api/mailbox/shared-preview/route.ts`,
- `src/app/posta/page.tsx`.

Puvodni popis:

- Endpoint pro sdileni exportu prijimal `previewHtml` z klienta.
- HTML se ukladalo do `mailboxSharedPayloads` nebo do chunk subkolekce.
- Prijemce si HTML nacital pres `/api/mailbox/shared-preview`.
- Pošta ho vykreslovala jako `iframe srcDoc={mailboxPreviewHtml}` bez `sandbox`.
- Endpoint byl chraneny prihlasenim, ale libovolny poradce mohl poslat sdileny export jinemu existujicimu uzivateli.

Provedena oprava:

- Frontend uz na `/api/export-produkce/share` neposila `previewHtml`.
- Share endpoint uklada jen strukturovany `snapshot`, sender/recipient metadata a `previewStorage: "structured"`.
- `/api/mailbox/shared-preview` uz nevraci raw legacy `html` ani `htmlChunk`; bez strukturovaneho snapshotu vraci chybu.
- Serverovy nahled se sklada z whitelisted/escaped hodnot pres stavajici mailbox preview builder.
- Iframe v poste ma `sandbox="allow-popups"` a `referrerPolicy="no-referrer"`, bez povoleni scriptu a bez `allow-same-origin`.

Dopad:

- Utocnik s prihlasenym poradenskym uctem muze pripravit skodlive HTML a poslat ho jako sdileny export.
- Pri otevreni zpravy obeti se skodlivy obsah muze spustit v kontextu aplikace.
- Pri soucasnem enforced CSP s `unsafe-inline` je bariéra nizsi.
- Dopad muze zahrnovat volani internich API z prohlizece obeti, cteni dat dostupnych obeti a akce jmenem obeti.

Doporuceni:

- Nejlepsi varianta: neukladat HTML z klienta. Ukladat jen strukturovana data/snapshot a HTML renderovat serverove z overene sablony.
- Pokud musi zustat HTML:
  - sanitizovat serverove robustnim HTML sanitizerem,
  - povolit jen bezpecne tagy/styly,
  - odstranit script/event handler atributy/URL typu `javascript:`,
  - vykreslovat iframe se `sandbox=""` bez `allow-scripts` a bez `allow-same-origin`,
  - pridat `referrerPolicy="no-referrer"`,
  - zvazit samostatnou izolovanou domenu pro preview.
- V poste pridat `sandbox` i pro ostatni `srcDoc` preview.
- Po oprave prepnout strict CSP do enforce modu.

## 11. Verejne endpointy

### Online vizitka - zadost o schuzku

Endpoint: `/api/online-card/meeting-request`.

Silne stranky:

- Public endpoint ma IP rate limit.
- Slug, jmeno, telefon, email, zprava a temata jsou omezene a normalizovane.
- Existuje honeypot pole `company`.
- Vlastnik vizitky se dohledava jen mezi onlineCard enabled profily.
- Zapisuje se do Firestore a mailboxu, push notifikace je omezena poctem tokenu.

Doporuceni:

- Pri realnem spamu doplnit CAPTCHA/Turnstile.
- Pridat fingerprint limit kombinujici IP + slug + email/telefon hash.
- Oddelit public rate limit od interniho rate limitu a sledovat ho ve Vercel Firewallu.

### Public datove endpointy

Nektere endpointy jsou IP-rate-limited a vraci obecna data, napr. life comparison. To je prijatelne, pokud data nejsou citliva. U verejnych endpointu je zasadni:

- zadne osobni/klientske udaje,
- prisne limity,
- cache/no-store podle povahy dat,
- ochrana upstream API pred zatezi.

## 12. E-mail a SMTP

### Interni send-email endpoint

Stav: odstraneno 12. 6. 2026.

Puvodni endpoint `/api/send-email` umoznoval prihlasenemu poradci odeslat PDF pres firemni SMTP. Podle aktualniho UI se uz nepouzival, proto byl z kodu odstranen. Tim odpada riziko, ze by kompromitovany poradensky ucet mohl endpoint zneuzit jako interni SMTP relay.

Poznamka: v kodu zustava samostatny endpoint `/api/auth/email-verification-link`, ktery umi poslat Firebase verification link pres SMTP, ale aktualni frontend ho podle kontroly nevola. Aktivni UI pro 2FA pouziva `/api/auth/confirm-email-for-mfa`, ne SMTP.
- Zavest denni kvoty a alerty.

## 13. Cron a automatizace

### Nalez: cron fallback bez secretu

Stav: opraveno 12. 6. 2026.

Zavaznost: vysoka, pokud v produkci chybi cron secret.

Dotceny soubor:

- `src/app/api/cron/weekly-team-report/route.ts`.

Puvodni problem:

- Pokud nebyl nastaven `WEEKLY_TEAM_REPORT_CRON_SECRET` ani `CRON_SECRET`, produkce akceptovala `x-vercel-cron: 1`.
- Endpoint zaroven podporuje secret v query parametru `?secret=...`.

Aktualni stav:

- Cron routa vyzaduje `Authorization: Bearer <CRON_SECRET>`, coz odpovida tomu, co Vercel Cron automaticky posila.
- Bez `CRON_SECRET` produkce selze fail-closed.
- Query secret a fallback na `x-vercel-cron` byly odstraneny.
- Porovnani secretu pouziva timing-safe compare.

Dopad:

- Pokud lze header podvrhnout nebo pokud neni produkcni secret nastaven, lze spoustet tydenni report zvenku.
- Endpoint cte data napric tymy a posila mailbox/push zpravy.

Doporuceni:

- Ve Vercelu musi byt nastaveny `CRON_SECRET` v produkcnim environmentu.
- Pro tydenni report nepouzivat samostatny `WEEKLY_TEAM_REPORT_CRON_SECRET`, pokud neni zaroven reseno posilani custom headeru; Vercel Cron automaticky posila prave `CRON_SECRET`.

## 14. AI a externi integrace

Pouzite integrace:

- OpenAI API (`OPENAI_API_KEY`),
- CUZK/RSV/ARES/vehicle market endpointy,
- Yahoo/Stooq/gold price zdroje,
- SMTP,
- Firebase Admin,
- FCM.

Doporuceni:

- V produkci rotovat API klice a tajemstvi podle internich pravidel.
- Nikdy neposilat API klice do klienta bez `NEXT_PUBLIC_` a jen pokud jsou skutecne verejne.
- U AI endpointu logovat objem pouziti a rate limitovat podle uzivatele.
- U AI endpointu neukladat zbytecne citlive vstupy do logu.

## 15. Dependency a build hygiene

Overeni:

- `npm audit --audit-level=low`: 0 zranitelnosti.

Lint:

- `npm run lint` aktualne konci chybou kvuli `.cjs` skriptum v `scripts/`, kde ESLint zakazuje `require()` importy.
- Aplikacni cast vykazuje jen varovani, napr. pouziti `<img>` nebo hook dependency warningy.

Hodnoceni:

- Dependency bezpecnostni stav je k datu auditu dobry.
- Lint chyby nejsou samy o sobe webova zranitelnost, ale je vhodne je uklidit, aby CI dokazalo vynucovat kvalitu.

Doporuceni:

- Upravit ESLint konfiguraci pro `.cjs` skripty, nebo skripty prepsat na ESM.
- Nastavit CI tak, aby `npm audit` a lint bezely pravidelne.

## 16. Prioritizovane nalezy

### Vysoke

1. Produkcni cron konfigurace  
   Overit, ze ve Vercelu je nastaveny `CRON_SECRET`, a po deployi zkontrolovat prvni beh `weekly-team-report` v logu.

### Stredni

2. CSP strict je jen report-only a baseline povoluje `unsafe-inline`  
   Po odstraneni HTML rizik prepnout strict CSP do enforce.

3. Login lockout je in-memory  
   Presunout do sdileneho store.

4. Admin role ma docasny fallback seznam emailu  
   Nastavit custom claims, overit pristup a potom fallback odstranit. Doplnit audit log admin akci.

5. Email verification pro MFA lze potvrdit pres recent auth bez mailbox linku  
   Preferovat standardni email verification link nebo auditovat jako interní bootstrap.

### Nizsi / provozni

7. Public meeting request nema CAPTCHA/Turnstile  
   Doporuceno doplnit pri spamu.

8. Sdilene export payloady by mely mit retenci/TTL  
    Pridat expiraci pro `mailboxSharedPayloads` a chunk subkolekce.

9. Lint neprochazi kvuli skriptum  
    Uklidit pro spolehlive CI.

## 17. Co je uz dobre zabezpecene

- Web neni indexovatelny beznymi vyhledavaci.
- Vercel Firewall blokuje bezne scanner cesty.
- Firebase ID tokeny jsou serverove overovane s revocation checkem.
- Advisor casti vyzaduji TOTP 2FA a dokoncenou konfiguraci.
- Passkeys pouzivaji WebAuthn s required user verification.
- Firestore ma default deny.
- Storage ma default deny.
- Smluvni PDF nejde cist primo ze Storage.
- Smluvni API kontroluje vlastnika/team access.
- Intranet prilohy maji whitelist a magic-byte kontrolu.
- Mailbox prilohy maji whitelist a magic-byte kontrolu.
- Security headers jsou rozsahle a zahrnuji HSTS, nosniff, frame deny a Permissions Policy.
- Dependency audit je cisty.

## 18. Doporučený akční plán

### Okamzite / 24 hodin

- Nastavit/overit produkcni `CRON_SECRET`.

### Do 7 dnu

- Presunout login lockout do sdileneho store.
- Prepnout strict CSP do enforce po odstraneni inline/script rizik.
- Nastavit custom claims pro `owner`/`admin` a po overeni odstranit fallback e-mail role.
- Doplnit audit log admin akci a odesilani e-mailu.
- Zkontrolovat produkcni env:
  - `RATE_LIMIT_*`,
  - `WEBAUTHN_*`,
  - `CSP_STRICT_ENFORCE`,
  - `CSP_REPORT_URI`,
  - `CRON_SECRET`,
  - SMTP,
  - Firebase Admin.

### Do 30 dnu

- Pridat TTL/retenci pro:
  - `_passkeyChallenges`,
  - `_rateLimits`,
  - `mailboxSharedPayloads`,
  - public meeting requests podle potreby.
- Doplnit CAPTCHA/Turnstile na public form pri spamu.
- Nastavit pravidelny security review API route handleru.
- Pripravit kratky interní postup pro ztraceny telefon/passkey/MFA reset.
- Spustit aktivni DAST/pentest proti staging prostredi.

## 19. Produkcni checklist

- [ ] Vercel Firewall `Block scanner paths` zapnuty.
- [ ] Vercel Firewall logy pravidelne kontrolovane.
- [ ] `X-Robots-Tag: noindex, nofollow, noarchive` aktivni v produkci.
- [ ] `robots.txt` obsahuje `Disallow: /`.
- [ ] Firebase Auth ma zapnute TOTP MFA.
- [ ] Firebase Authorized domains obsahuje jen realne domeny.
- [ ] Firebase anonymous auth je vypnute, pokud se nepouziva.
- [ ] Admin ucty maji 2FA/passkey.
- [ ] Produkce ma sdileny rate limit store.
- [ ] Produkce ma explicitne nastavene trusted IP headery podle Vercelu.
- [ ] Produkce ma `CRON_SECRET`.
- [ ] Produkce ma nastavene WebAuthn origins/RP ID.
- [ ] Produkce ma `CSP_REPORT_URI`.
- [ ] Po opravach je `CSP_STRICT_ENFORCE=1`.
- [ ] Storage rules jsou deploynute a zustavaji default deny.
- [ ] Firestore rules jsou deploynute a zustavaji default deny.
- [ ] Secrets nejsou commitnute do repozitare.
- [ ] API klice a SMTP hesla jsou rotovane a ulozene jen ve Vercel env.
- [ ] `npm audit` bezi v CI.
- [ ] Lint bezi v CI a neblokují ho pomocne `.cjs` skripty.

## 20. Zaver

Bezpecnostni uroven aplikace je dobra, zejmena v oblastech prihlasovani, Firebase token verification, uzavreneho Storage, Firestore default deny pravidel, smluvnich PDF a noindex nastaveni. Web neni navrzeny jako verejne dohledatelny a Vercel Firewall aktivne odfiltruje bezne scanner pozadavky.

Nejvetsi puvodni slabina bylo zpracovani HTML v mailbox/export preview a volnejsi validace mailbox priloh. Obe oblasti byly po auditu opraveny, stejne jako cron autorizace tydenniho reportu a zaklad centralizovanych admin roli. Dalsi priorita je prepnout strict CSP do enforce modu a dodelat provozni prvky: sdileny login lockout, nastaveni custom claims bez fallbacku, audit logy a kontrolu produkcnich env hodnot.
