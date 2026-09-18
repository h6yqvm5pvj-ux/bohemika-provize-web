**Novější stav:** [Oprava revokace](../revocation-fix/report.md) je připravená lokálně. Tato zpráva zachycuje nález před opravou; produkční nasazení nové opravy čeká na souhlas.

**Doplňující bezpečnostní kontrola — 17. 9. 2026, 14:08 CEST**

**Výsledek: většina ověřovaných ochran funguje, ale zůstává prokázané riziko při zneplatňování přihlášení. Nelze prohlásit aplikaci za neprolomitelnou ani všechny nálezy za vyřešené.** Tato kontrola navazuje na [předchozí audit a nápravu](../report.md), znovu ověřuje současnou produkci a přidává dva nálezy. Během této kontroly se nenasazovala aplikace ani pravidla a neměnily se produkční účty nebo obchodní data. Nová oprava evidence IP zůstává pouze v pracovním projektu.

**1. Vysoká priorita: odvolání tokenů se okamžitě nepromítá do přímého přístupu k Firestore — otevřeno.**

API ověřuje Firebase tokeny s `checkRevoked: true`. Firestore pravidla kontrolují ověřený e-mail, důkaz MFA a existenci `accountBlocks/{uid}`, ale neporovnávají čas přihlášení s časem poslední revokace. Akce `revokeSessions` v administraci a `revokeOthers` v nastavení relací volají `revokeRefreshTokens`; běžná revokace přitom nezapisuje trvalou blokaci do Firestore. Změna hesla rovněž sama nedoplňuje revokační metadata pro pravidla.

Na lokálních Auth a Firestore emulátorech se podařilo ověřit následující průchod. Vytvořil se pouze syntetický účet s tokenem odpovídajícím přihlášení přes passkey a jediný syntetický dokument. Identický token se použil před revokací i po ní:

| Kontrola | Výsledek |
| --- | --- |
| Čtení vlastního dokumentu před revokací | HTTP 200 |
| `verifyIdToken(token, true)` po skutečné revokaci v Auth emulátoru | Token odmítnut jako odvolaný |
| Přímý REST požadavek do Firestore s odvolaným tokenem | **HTTP 200** |
| Stejný požadavek po vytvoření trvalé blokace účtu | HTTP 403 |

[Strojový důkaz](./revocation-proof.json), [opakovatelná diagnostika](../../../scripts/audit-token-revocation.mjs). Diagnostika odmítne běh mimo přesné lokální adresy emulátorů a používá napevno projekt `demo-bohemika-rules`. Návratový kód 1 zde úmyslně znamená potvrzenou mezeru, nikoli selhání běžné testovací sady. Syntetický účet a dokumenty po sobě uklízí. Aktivní produkční Firestore pravidla byla současně načtena a mají totožný SHA-256 jako pravidla použitá v diagnostice; odvolávání skutečných účtů ani tento průchod s produkčním tokenem se neprováděly.

Spuštění z kořene projektu s dostupným Java runtime a Firebase CLI:

```sh
firebase emulators:exec --only firestore,auth --project demo-bohemika-rules --config firebase.rules-test.json "node scripts/audit-token-revocation.mjs"
```

Dopad vyžaduje již získaný platný token. Nejde o přístup bez přihlášení nebo důkaz, že k úniku došlo. Držitel tokenu si může dočasně zachovat jeho původní databázová oprávnění i po akci správce „odhlásit“. U administrátorského tokenu je dopad širší než u běžného uživatele. Firebase uvádí hodinovou platnost ID tokenů a pro kontrolu revokace v pravidlech vyžaduje uložit odpovídající metadata; zbývající okno tedy může dosahovat zbytku této platnosti. [Oficiální dokumentace Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions).

Náprava: ukládat poslední revokaci podle UID do výhradně serverem spravované kolekce a zahrnout porovnání `auth_time` do společné databázové autorizace. Je nutné propojit všechny cesty: administrátorské odhlášení, odhlášení ostatních zařízení, změnu/reset hesla, změny rolí a postupy údržby. Otestovat také nové přihlášení, passkeys, souběžné revokace, přesnost času na sekundy a nedostupnost úložiště. Pouhá úprava API nebo pravidla odkazujícího na dosud nezapisovaná metadata tuto mezeru neuzavře. Změna celého tohoto toku nebyla součástí provedené lokální opravy.

Při incidentu používat administrátorskou trvalou blokaci účtu včetně `accountBlocks`, která již chrání API i přímá databázová pravidla. Samotnou revokaci relací nepovažovat za okamžité zastavení všech databázových požadavků. Blokace se při auditu v produkci nespouštěly.

**2. Střední priorita: podvržení IP v historii zařízení — opraveno lokálně, nenasazeno.**

`appSessionRegistry.ts` původně upřednostňoval `cf-connecting-ip`, `true-client-ip`, `x-real-ip` a `x-forwarded-for` před výsledkem společného ověřování IP. Klient tak mohl změnit zobrazenou maskovanou adresu a její uložený otisk, i když rate limiter správně důvěřoval jen platformní hlavičce. To zhoršovalo spolehlivost evidence při dohledávání podezřelého přihlášení; nejde o nově prokázané obejití samotného rate limitu.

Oprava používá pro evidenci výhradně `getRequestIp()` a jeho nakonfigurovanou důvěru v proxy. Chybějící důvěryhodná adresa zůstane neznámá. Testy zkoušejí všechny čtyři podvržené hlavičky, absenci důvěryhodné adresy, IPv6 a aktualizaci existující relace. Před opravou selhalo šest ze sedmi případů; po opravě prošlo všech sedm a celá sada práce s relacemi. Historicky uložená metadata se hromadně nepřepisovala.

[Opravená evidence relací](../../../src/lib/server/appSessionRegistry.ts), [regresní testy](../../../src/lib/server/appSessionRegistry.security.test.ts).

**Čerstvě ověřená produkce**

| Oblast | Výsledek a meze |
| --- | --- |
| Web | Ověřeno stále aktivní nasazení `dpl_98bA4SL9WYGyAy93moimsdXBqd3W`; 17 HTTP kontrol prošlo. Na šesti veřejných stránkách CSP nepovoluje `unsafe-inline` ani `unsafe-eval` pro skripty; dynamické stránky mají nonce shodný s HTML. Chráněné stránky přesměrují na login. |
| API | Nepřihlášené požadavky na profil, administraci, smlouvy, dokumenty, přílohy a soukromou analytiku vracejí 401. Vytvoření relace odmítá i skutečně neplatnou hlavičku `Authorization: Bearer …`. Testy používají existující oprávněný automatizační přístup přes ochranu deploymentu, bez uživatelského přihlášení. |
| Účty | 34 účtů celkem, 23 aktivních. Všech 23 má ověřený e-mail i TOTP. Oba aktivní administrátoři zjištění podle claims také. V 32 profilových dokumentech není nesoulad UID ani osiřelý profil. Samostatná úplná revize e-mailových výjimek rolí nebyla provedena. |
| Pravidla | Aktivní Firestore zdroj se shoduje s testovaným souborem. Lokální i produkční Storage pravidla zakazují přímé klientské čtení a zápis; odlišné otisky vysvětlují komentáře a nadbytečná lokální zakazující větev. |
| Úložiště | Metadata všech 1 513 objektů, žádné veřejné objektové ACL ani veřejné IAM přidělení bucketu. Všech 1 484 smluvních PDF a 16 objektů pošty bez download tokenů. Šest tokenových odkazů patří veřejným fotografiím: čtyři kanceláře a dva avatary. Obsah souborů se nestahoval. |
| Obnova | PITR a ochrana databáze před smazáním jsou zapnuté, soft delete bucketu má 30 dní. Denní zálohy mají retenci 14 dní, týdenní 84 dní; všech 17 evidovaných záloh je READY. Metadata byla načtena oprávněním Firebase CLI, servisní účet na jejich část vracel 403. Neproběhla skutečná obnova databáze. |
| Provozní konfigurace Vercelu | Podrobné opakované čtení konfigurace skončilo HTTP 404 na použitém API; z tohoto pokusu nelze potvrdit aktuální hodnoty proměnných. Stav HTTP ochran byl ověřen samostatně. Předchozí produkční buildový záznam zůstává historickým dokladem, nikoli novým čtením konfigurace. |

Podklady: [HTTP](./deployment-production-verification.json), [účty](./identity-summary.json), [pravidla a úložiště](./live-summary.json), [zálohy](./backup-summary.json).

**Kód, závislosti a testy**

Kontrola zahrnula společné autentizační a autorizační vrstvy, role a zastupování, relace, passkeys, změnu hesla, zápisy profilů, veřejné formuláře, výstupy HTML, ochranné hlavičky, uploady a vydávání souborů. Inventura pokrývá 116 API rout. Plošná sada volá 158 metod ve 108 routách s osmi druhy nepřípustného přihlášení; veřejné a vyřazené operace mají výslovné výjimky. Oddělené nové testy ověřují oprávnění již přihlášeného uživatele k cizí příloze pošty, skupinové konverzaci, sdílenému náhledu a screenshotu. Kontrolní povolený případ ověřuje vydání vlastního PDF s `no-store`, `nosniff` a sandboxem.

| Kontrola | Nový výsledek |
| --- | --- |
| Aplikační testy | **4 193 prošlo**, 280 souborů |
| Z toho plošné odmítnutí přihlášení v API | 1 264 případů: chybějící/falešný token, chybějící TOTP, chybějící důkaz MFA, blokovaný/deaktivovaný/neověřený účet, custom token bez důkazu |
| Nové testy oprávnění ke konkrétním souborům | 7 prošlo; ověření přihlášení je zde nahrazeno syntetickým běžným uživatelem |
| Auth a Firestore emulátory | 262 prošlo, včetně 223 testů pravidel |
| TypeScript | Prošel |
| ESLint | 0 chyb, 4 dřívější varování navigace v nezměněných částech aplikace |
| `npm audit`, včetně vývojových závislostí | 0 známých nálezů v aktuální databázi npm |
| Obrazový runtime | Next.js 16.3.4, sharp 0.35.4, libheif 1.23.2, libvips 8.18.6; ověřeny obě větve sharp na místním macOS |
| Tajné hodnoty | Sken 1 580 aktuálních textových souborů vybranými vzory bez nálezu; 219 binárních/velkých souborů vynecháno. `.env.local` má oprávnění 0600 a je ignorován Gitem. Historie Gitu se znovu neskenovala. |
| Diagnostika revokace | Potvrdila otevřený nález č. 1; samostatná kontrola mimo běžnou zelenou testovací sadu |

[Ověření a otisky](./verification.json), [npm audit](./npm-audit.json), [sken tajných hodnot](./secrets-summary.json), [testy autentizace API](../../../tests/security/api-authentication.test.ts), [testy přístupu k souborům](../../../tests/security/private-resource-access.test.ts). Obrazové verze zahrnují opravy popsané v [oficiálním srpnovém bezpečnostním vydání Next.js](https://nextjs.org/blog/august-2026-security-release); toto ověření místního runtime nenahrazuje ověření budoucího Linux sestavení.

Nový produkční build ani nové přihlášení skutečného uživatele se v této doplňující kontrole neprováděly. Malá změna serverové evidence IP byla ověřena regresními testy, úplnou aplikační sadou, kontrolou typů a lintem.

**Meze a pořadí další práce**

Nejprve dokončit nápravu revokace v API i databázových pravidlech a ověřit ji uvedenou diagnostikou. Lokální opravu IP nasadit standardním ověřeným postupem. Dále prověřit samostatné Cloud Functions, cloudové administrátorské účty a IAM, nacvičit obnovu do odděleného prostředí a zajistit průběžné aktualizace a monitoring. Zdrojové kódy samostatných Cloud Functions nejsou v tomto projektu a nebyly zde auditovány; ochrana Next.js proxy automaticky neprokazuje ochranu jejich přímých URL.

Neprováděl se DDoS test, úplný externí penetrační test, fuzzing všech parserů, vyšetřování historie napadení ani přihlášení za konkrétního člověka. Výsledek neznamená důkaz, že útok nikdy neproběhl. Kontrola je časový snímek dostupného rozsahu; jednotlivé prošlé testy nejsou zárukou absence všech dalších chyb.
