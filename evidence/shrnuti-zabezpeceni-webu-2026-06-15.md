# Shrnutí zabezpečení webové aplikace Bohemika SmartApp

Datum zpracování: 15. 6. 2026  
Projekt: `bohemika-provize-web` / Bohemika SmartApp  
Typ dokumentu: manažerské shrnutí + technický audit zabezpečení  
Účel: doložit, jak je řešena bezpečnost přihlášení, přístupů, dat, souborů, API a ochrany proti automatizovaným útokům.

## 1. Executive summary

Bohemika SmartApp má pro interní firemní aplikaci velmi dobrý bezpečnostní základ. Aplikace nepoužívá jednoduchý vlastní login, ale staví na Firebase Authentication, serverovém ověřování tokenů, vynucené 2FA pro poradenské účty, passkeys/WebAuthn, aplikačním lockoutu po chybných pokusech a rate limitingu na API.

Citlivá data nejsou zpřístupněna veřejně přes přímé databázové nebo storage cesty. Firestore pravidla mají výchozí zákaz přístupu a povolují čtení/zápis podle vlastnictví, role, manažerského vztahu nebo serverového backendu. Firebase Storage je z pohledu klientského přístupu uzavřený a citlivé soubory se obsluhují přes backendová API s kontrolou oprávnění.

Na aplikační hraně je zavedena ochrana přes Vercel Firewall/WAF, včetně pravidla pro blokaci běžných automatizovaných scanner pathů. Tato vrstva pomáhá odfiltrovat běžný internetový šum, WordPress/PHP scany, pokusy o přístup k `.env`, `.git`, `phpmyadmin` a dalším cestám, které aplikace nepoužívá. Firewall ale není náhrada za login a autorizaci; funguje jako další ochranná vrstva před aplikací.

Celkové hodnocení: **8,6 / 10 - velmi dobrá úroveň zabezpečení pro interní produkční web**.

Slovní hodnocení:

- Aplikace má vícevrstvou ochranu: edge firewall, login, 2FA/passkeys, API guardy, rate limiting, pravidla databáze, uzavřený storage a bezpečnostní hlavičky.
- Nebyla zjištěna kritická slabina typu veřejné čtení interních dat, veřejný přístup k PDF smlouvám nebo anonymní přístup k citlivým API.
- Zbytková rizika jsou hlavně provozní: pravidelná kontrola Vercel Firewall logů, formální audit log admin akcí, nastavení TTL úklidu bezpečnostních kolekcí a potvrzení produkčních environment proměnných.
- Dokument není certifikovaný penetrační test. Jde o audit zdrojového kódu, konfigurace a dostupných provozních informací.

## 2. Hodnocení podle oblastí

| Oblast | Hodnocení | Stav |
| --- | ---: | --- |
| Login a Firebase Authentication | 8,5 / 10 | Silný základ, serverové ověřování tokenů, lockout |
| TOTP 2FA | 9,0 / 10 | Vynucené pro poradenské/interní účty |
| Passkeys / WebAuthn | 9,0 / 10 | Phishing-resistant přihlášení, challenge TTL, kontrola origin/RP ID |
| API autorizace | 8,5 / 10 | Bearer tokeny, revocation check, role, rate limiting |
| Admin oprávnění | 8,0 / 10 | Role owner/admin/support, serverové guardy |
| Firestore pravidla | 7,8 / 10 | Default deny, vlastnictví a manažerský přístup, vybrané admin výjimky |
| Firebase Storage | 9,5 / 10 | Přímý klientský přístup uzavřený |
| Uploady a přílohy | 8,5 / 10 | Magic bytes validace pro PDF a obrázky, omezení typů |
| Vercel Firewall / ochrana proti scanům | 8,0 / 10 | Vhodná edge ochrana, doporučeno doplnit edge rate limity |
| Security headers / CSP | 8,0 / 10 | HSTS, noindex, frame deny, nosniff, CSP s možností strict režimu |
| Dependency hygiene | 10 / 10 | `npm audit --audit-level=moderate`: 0 zranitelností |
| Provozní monitoring a audit log | 7,0 / 10 | Doporučeno formalizovat audit log admin akcí a pravidelné kontroly |

## 3. Rozsah auditu

Kontrolované oblasti:

- přihlašování heslem přes Firebase Authentication,
- TOTP 2FA,
- passkeys/WebAuthn,
- login lockout po chybných pokusech,
- serverové ověřování Firebase ID tokenů,
- API autorizace a role,
- rate limiting,
- Firestore security rules,
- Firebase Storage rules,
- upload a servírování PDF a příloh,
- security headers a Content Security Policy,
- Vercel Firewall/WAF a ochrana proti scannerům,
- cron autorizace,
- závislosti, TypeScript, lint a produkční build.

Mimo rozsah:

- aktivní penetrační test produkční domény,
- forenzní analýza reálného provozu,
- přímá kontrola Vercel dashboardu a Firewall Audit Logu v době zpracování,
- kontrola skutečných produkčních hodnot environment proměnných,
- právní posouzení GDPR/DPIA.

## 4. Co je chráněno

Aplikace pracuje s citlivými interními a obchodními daty:

- uživatelské účty, e-maily, role a profilové údaje,
- poradenské a manažerské struktury,
- klienti, smlouvy, čísla smluv, produkční a provizní data,
- PDF smluv a interní dokumenty,
- zprávy, přílohy, intranet a tipy,
- push tokeny a uživatelská nastavení,
- admin akce a subscription stav.

Z pohledu bezpečnosti je klíčové, že tato data nejsou chráněna pouze skrytím URL nebo `robots.txt`, ale hlavně autentizací, autorizací, serverovými kontrolami a databázovými pravidly.

## 5. Přihlášení a ochrana účtů

### 5.1 Firebase Authentication

Přihlašování heslem je řešeno přes Firebase Authentication. Aplikace tedy neskladuje hesla ve vlastní databázi a nepoužívá vlastní kryptografii pro heslové přihlášení.

Silné stránky:

- serverová API vyžadují Bearer Firebase ID token,
- tokeny se ověřují přes Firebase Admin SDK,
- používá se revocation check `verifyIdToken(token, true)`,
- účet bez e-mailu v tokenu nebo bez interního profilu je odmítnut,
- přístup je navázaný na interní profil, typ účtu a subscription stav.

### 5.2 TOTP 2FA

TOTP 2FA je v aplikaci reálně vynucené pro poradenské účty. Nejde pouze o doporučení v UI.

Implementační stav:

- login UI pracuje s Firebase MFA resolverem,
- poradenský setup guard kontroluje existenci TOTP faktoru,
- poradce bez 2FA není puštěn do interních poradenských částí,
- admin guard používá stejnou kontrolu poradenského přístupu.

Hodnocení:

2FA výrazně snižuje riziko zneužití hesla. I pokud by došlo k úniku hesla, útočník bez jednorázového kódu nebo passkey zařízení nemá běžný přístup do interní části.

### 5.3 Passkeys / WebAuthn

Passkeys jsou implementované přes WebAuthn a knihovnu `@simplewebauthn`. Jde o moderní phishing-resistant přihlášení.

Silné stránky:

- registrace a přihlášení používají serverově uloženou challenge,
- challenge má TTL 5 minut,
- challenge se při ověření transakčně spotřebuje a smaže,
- kontroluje se origin a RP ID,
- v produkci musí být nastavený povolený WebAuthn origin,
- vyžaduje se `userVerification: required`,
- registrace a mazání passkey vyžaduje recent auth,
- credential patří konkrétnímu uživateli a lze ho deaktivovat.

Hodnocení:

Passkeys jsou z bezpečnostního pohledu silnější než samotné heslo, protože jsou odolné vůči běžnému phishingu a nevystavují sdílené tajemství jako heslo. Doporučení je passkeys aktivně podporovat minimálně u adminů a manažerských účtů.

### 5.4 Login lockout

Po opakovaných chybných pokusech se používá aplikační lockout.

Stav:

- limit: 3 neúspěšné pokusy,
- blokace: 15 minut,
- oddělené buckety pro účet a IP+účet,
- uložené ve Firestore kolekci `_loginAttemptLockouts`,
- ID dokumentů jsou hashované,
- při výpadku sdíleného store v produkci je chování fail-closed.

Hodnocení:

Toto je správný návrh pro serverless prostředí. Lockout není pouze lokální in-memory mapa jedné instance, ale sdílený stav přes Firestore.

## 6. API a role

Citlivá API používají serverové guardy:

- `requireAuthedRateLimited`,
- `requireAdvisorAuthedRateLimited`,
- `getAdminAuthContext`,
- specializované guardy pro smlouvy, admin a týmové endpointy.

Tyto guardy řeší:

- přítomnost Bearer tokenu,
- ověření Firebase ID tokenu,
- revocation check,
- normalizaci e-mailu,
- login lockout,
- rate limiting,
- kontrolu profilu a TOTP 2FA,
- rozlišení poradce/tipař,
- admin role a minimální potřebné oprávnění.

Silná stránka je, že přístup k datům není založený pouze na klientském UI. Kritické rozhodování probíhá na serveru.

## 7. Rate limiting a ochrana proti zneužití API

Aplikace má centrální rate limiting.

Stav:

- podporuje Redis/Upstash REST store,
- při absenci Redis umí použít Firestore `_rateLimits`,
- vývojově může spadnout na in-memory fallback,
- v produkci bez sdíleného store failuje closed,
- odpovědi obsahují rate-limit hlavičky a `Retry-After`.

Hodnocení:

Rate limiting snižuje riziko hrubého zneužití API, automatizovaného spamování a nekontrolovaného čerpání externích služeb. Doporučení je doplnit k aplikačnímu rate limitingu také Vercel WAF rate limit na nejcitlivější veřejné a auth endpointy.

## 8. Firestore a databázová bezpečnost

Firestore rules mají bezpečný základ:

- fallback je `allow read, write: if false`,
- smlouvy a entries jsou čitelné jen vlastníkem, relevantním manažerem nebo adminem,
- zápis smluv je v zásadě veden přes backend/Admin SDK,
- privátní uživatelská data jsou oddělená v `usersPrivate`,
- owner může u privátních dat měnit jen úzkou množinu polí pro push tokeny,
- citlivé subscription/admin flagy jsou omezené.

Zbytkové riziko:

Firestore rules stále používají některé admin výjimky přes custom claim. To je běžné, ale pro vyšší bezpečnostní úroveň je vhodné dlouhodobě držet kritické zápisy primárně přes backendové API s audit logem.

Hodnocení:

Pravidla nejsou pouze formální. Reálně omezují přístup podle vlastnictví, role a manažerské struktury. Doporučené další zlepšení je zmenšovat přímé klientské zápisy u adminů a rozšířit audit log.

## 9. Firebase Storage a soubory

Firebase Storage rules jsou velmi restriktivní:

```txt
allow read, write: if false
```

To znamená, že klient nemá přímý veřejný přístup ke storage objektům. Citlivé PDF a přílohy se řeší přes backend.

Smluvní PDF:

- maximální velikost 12 MB,
- kontrola, že soubor vypadá jako PDF podle obsahu,
- bezpečné názvy souborů,
- hash SHA-256,
- private no-store cache,
- obsah se servíruje přes API s oprávněním.

Uživatelské přílohy:

- povolené typy: PDF, PNG, JPG, GIF, WEBP, AVIF,
- kontrola podle magic bytes,
- kontrola deklarovaného MIME typu a přípony,
- neznámé nebo legacy typy se servírují jako download,
- pro PDF a neznámý obsah se používá sandbox CSP.

Hodnocení:

Storage vrstva je velmi dobře uzavřená. Riziko veřejného stažení interních PDF přes přímou Firebase Storage URL je nízké, pokud jsou produkční rules skutečně nasazené.

## 10. Security headers, CSP a indexace

Globální bezpečnostní hlavičky:

- `X-Robots-Tag: noindex, nofollow, noarchive`,
- `X-Content-Type-Options: nosniff`,
- `Referrer-Policy: strict-origin-when-cross-origin`,
- `X-Frame-Options: DENY`,
- `Strict-Transport-Security` s `includeSubDomains; preload`,
- `Permissions-Policy`,
- `Cross-Origin-Opener-Policy`,
- `Cross-Origin-Resource-Policy`.

CSP:

- baseline CSP je aktivní,
- strict nonce CSP je připravený,
- strict enforce lze zapnout přes `CSP_STRICT_ENFORCE=1`,
- reportování lze napojit přes `CSP_REPORT_URI`.

Indexace:

- `robots.txt` blokuje crawlery,
- Next.js přidává `X-Robots-Tag`,
- aplikace není navržená jako veřejně dohledatelný web.

Poznámka:

`robots.txt` a `noindex` nejsou bezpečnostní kontrola. Jsou vhodné pro omezení dohledatelnosti, ale skutečná ochrana stojí na loginu, API autorizaci, rules a storage uzávěře.

## 11. Vercel Firewall a ochrana proti scanům/botům

Vercel Firewall/WAF je důležitá hraniční vrstva před aplikací. Podle provozní evidence je aktivní pravidlo typu `Block scanner paths`, které blokuje běžné automatizované požadavky, které aplikace nepoužívá.

Typické blokované pokusy:

- PHP a WordPress cesty (`*.php`, `/wp-admin`, `/wp-login.php`, `/xmlrpc.php`),
- administrační nástroje (`/phpmyadmin`),
- konfigurační a tajné soubory (`/.env`, `/.git`, `.aws`, `.ssh`, `id_rsa`),
- běžné scanner/exploit pathy.

Hodnocení:

Toto pravidlo je vhodné a mělo by zůstat zapnuté. Snižuje šum v logách, snižuje počet requestů, které dopadnou na aplikaci, a odfiltruje část automatizovaných pokusů o exploit technologií, které aplikace vůbec nepoužívá.

Důležité upřesnění:

Firewall nenahrazuje aplikační autorizaci, login, rate limiting ani validaci vstupů. Je to dodatečná edge ochrana.

Doporučená Vercel WAF pravidla:

| Pravidlo | Doporučená akce | Priorita |
| --- | --- | --- |
| Block scanner paths | Deny | Vysoká |
| Rate limit auth helpery (`/api/auth/login-attempts`, passkey endpoints) | 429 / Deny / Challenge podle provozu | Vysoká |
| Rate limit public formuláře (`/api/online-card/meeting-request`) | 429 nebo Challenge při spamu | Střední |
| Logovací pravidlo pro podezřelé user-agenty a země | Log nejdříve, poté Deny/Challenge | Střední |
| Persistent actions pro opakované deny/challenge | Dočasná blokace IP | Podle plánu Vercel |

Oficiální dokumentace Vercel uvádí, že custom WAF rules mohou pracovat s akcemi jako log, deny, challenge, bypass, redirect a rate limit. WAF Rate Limiting umožňuje omezit počet requestů ze stejného zdroje v časovém okně a po překročení použít 429, log, deny nebo challenge.

Externí reference:

- https://vercel.com/docs/vercel-firewall
- https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## 12. Cron a interní automatizace

Týdenní týmový report běží přes Vercel Cron.

Stav:

- cron je definovaný v `vercel.json`,
- endpoint `/api/cron/weekly-team-report` ověřuje `CRON_SECRET`,
- kontrola používá Bearer token,
- porovnání tajného klíče je timing-safe,
- produkční fallback bez secretu není povolený.

Hodnocení:

Cron endpoint není volně spustitelný anonymním requestem bez znalosti tajného tokenu. To je správný stav.

## 13. Závislosti a build

Ověřovací příkazy spuštěné dne 15. 6. 2026:

| Kontrola | Výsledek |
| --- | --- |
| `npm run lint` | bez chyb |
| `./node_modules/.bin/tsc --noEmit` | bez chyb |
| `npm audit --audit-level=moderate` | `found 0 vulnerabilities` |
| `npm run build` | úspěšný produkční build, Next.js 16.2.7 |

Hodnocení:

K datu auditu nejsou v závislostech detekované zranitelnosti úrovně moderate a vyšší. Produkční build prošel.

## 14. Zjištěná rizika a doporučení

### Priorita 1 - provozně ověřit

1. Potvrdit ve Vercel dashboardu aktivní stav pravidla `Block scanner paths`.
2. Zkontrolovat Vercel Firewall Audit Log a Traffic přehled.
3. Ověřit produkční environment proměnné pro WebAuthn:
   - `WEBAUTHN_ORIGIN`,
   - `WEBAUTHN_ALLOWED_ORIGINS`,
   - `WEBAUTHN_RP_ID`,
   - `NEXT_PUBLIC_APP_URL`.
4. Ověřit produkční rate-limit store a proxy IP nastavení:
   - Redis/Upstash nebo Firestore fallback,
   - `RATE_LIMIT_TRUST_PROXY_HEADERS` / trusted headers podle Vercel prostředí.
5. Ověřit, že Firestore rules a Storage rules jsou skutečně nasazené v produkci.

### Priorita 2 - hardening

1. Doplnit Vercel WAF rate limiting pro veřejné a auth endpointy.
2. Po vyhodnocení report-only režimu zapnout `CSP_STRICT_ENFORCE=1`.
3. Zapnout/ověřit TTL policy pro:
   - `_loginAttemptLockouts.expiresAt`,
   - `_rateLimits.expiresAt`,
   - `_passkeyChallenges.expiresAt`.
4. Rozšířit audit log admin akcí:
   - změna role,
   - změna subscription,
   - reset MFA/passkey,
   - mazání uživatele,
   - ukončení spolupráce,
   - změny citlivých provizních polí.
5. Formálně popsat interní proces pro ztracený telefon/passkey a reset 2FA.

### Priorita 3 - dlouhodobé zlepšení

1. Omezovat přímé klientské admin zápisy a preferovat backendové API s audit logem.
2. Pravidelně provádět externí penetrační test produkce.
3. Zavést periodickou rotaci produkčních secrets.
4. Připravit krátký incident response postup.
5. Pravidelně kontrolovat `npm audit`, Vercel security logs a Firebase access patterns.

## 15. Důkazy v repozitáři

| Oblast | Soubor |
| --- | --- |
| Login UI, heslo, MFA, passkey login | `src/app/login/page.tsx` |
| Login lockout | `src/lib/server/loginAttemptLockout.ts`, `src/app/api/auth/login-attempts/route.ts` |
| Rate limiting | `src/lib/server/rateLimit.ts` |
| Passkeys/WebAuthn | `src/lib/server/passkeys.ts`, `src/app/api/auth/passkeys/*/route.ts` |
| Advisor setup a TOTP 2FA guard | `src/lib/server/advisorSetupGuard.ts` |
| API auth guardy | `src/lib/server/apiEntryGuard.ts` |
| Admin auth guard | `src/lib/server/adminAuth.ts` |
| Firestore pravidla | `firestore.rules` |
| Storage pravidla | `storage.rules` |
| Smluvní PDF | `src/lib/server/contractPdfStorage.ts` |
| Bezpečné přílohy | `src/lib/server/safeUserAttachments.ts` |
| Security headers | `next.config.ts`, `middleware.ts` |
| Cron autorizace | `vercel.json`, `src/app/api/cron/weekly-team-report/route.ts` |

## 16. Závěr pro firmu

Bohemika SmartApp je navržena jako interní aplikace s vícevrstvým zabezpečením. Kombinuje moderní autentizaci, povinnou 2FA, passkeys, serverovou autorizaci, rate limiting, restriktivní databázová a storage pravidla, bezpečnostní hlavičky a Vercel Firewall/WAF.

Z hlediska ochrany dat lze současný stav hodnotit jako **velmi dobrý pro interní produkční provoz**. Doporučené další kroky nejsou akutní blokery, ale provozní hardening: pravidelná kontrola firewall logů, WAF rate limity pro veřejné endpointy, formalizovaný audit log administrátorských zásahů a pravidelné externí testování.

Tento dokument potvrzuje technickou připravenost a dobrý bezpečnostní základ aplikace, ale nenahrazuje certifikovaný penetrační test ani právní/GDPR posouzení.
