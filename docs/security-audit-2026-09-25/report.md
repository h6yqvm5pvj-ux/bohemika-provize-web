# Bezpečnostní kontrola — 25. 9. 2026

**Výsledek: našly se věci k nápravě. Dvě nové opravy jsou otestované lokálně; produkční aplikace ani databázová pravidla se při této kontrole neměnily. Bez dokončení nasazení a zbývajících kontrol nelze označit produkci za plně ověřenou.**

Kontrola zahrnula zdrojový kód autentizace a autorizace, přístup k přílohám, šifrování pošty, ukládání dat v prohlížeči, veřejné obrázky vizitek, lokální testy a čerstvé čtení bezpečnostních metadat Firebase. Obsah klientských dokumentů se nestahoval, skutečné účty se neměnily. Rozpracované změny kalkulačky, smluv a vzhledu vizitek zůstaly zachované.

## Nálezy a opravy

### 1. Vysoká priorita: používaná verze Next.js je v rozsahu kritického bezpečnostního oznámení

Projekt a lockfile původně používaly **Next.js 16.3.4**. Výrobce 22. 9. zveřejnil kritickou zranitelnost **CVE-2026-94545 / GHSA-vcvr-r3jv-pc5j**, opravenou v **16.3.6**. Týká se Node.js `ImageResponse` při předání útočníkem ovládaného obsahu, atributů nebo stylů SVG a může umožnit spuštění kódu na serveru. [Oznámení výrobce](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [bezpečnostní vydání](https://nextjs.org/blog/nextjs-security-update-september-22-2026).

Aplikace používá Node.js `ImageResponse` ve [veřejném obrázku vizitky](../../src/app/vizitka/[slug]/share-image/route.tsx). Šablona používá HTML prvky a normalizovaná profilová pole; tato kontrola **neprokázala splnění konkrétní podmínky SVG injekce ani zneužitelnost této šablony**. Potvrzené je použití balíčku ze zranitelného rozsahu a stejného obrazového subsystému. Preventivní aktualizace je proto vhodná; údaj o kritické závažnosti se vztahuje k oznámené zranitelnosti balíčku, nikoli k prokázanému útoku na aplikaci.

Opraveno lokálně:

- `next`, `@next/bundle-analyzer` a `eslint-config-next` jsou přesně na **16.3.6**, včetně odpovídajícího lockfile.
- [Kontrola obrazového runtime](../../scripts/check-image-runtime.mjs) nově odmítá sestavení s Next.js starším než 16.3.6. Zachovává kontroly sharp a libheif.
- Celá aplikační sada po aktualizaci i izolované produkční sestavení prošly.

Verzi aktuálně nasazené aplikace se nepodařilo čerstvě zjistit: přístup k metadatům Vercelu vrátil 403. **Lokální aktualizace sama neopravuje produkci.**

### 2. Vysoká priorita: produkční Firestore pravidla nejsou sladěná s připravenou opravou revokace

Aktivní pravidla byla dne 25. 9. načtena přímo z Firebase Rules API. Jejich SHA-256 je `649f727f221b5cad19a3420168658b4020a0b82139fee314e91943314cc27cf2`; zdroj se liší od místního [firestore.rules](../../firestore.rules).

Produkční `isSignedIn()` nadále ověřuje pouze neexistenci `accountBlocks/{uid}`. Chybí místní `validRevocation()` a `hasUnrevokedAuthentication()`, tedy porovnání času autentizace a generace odvolání. Místní backend již zapisuje revokační metadata do stejné kolekce. Oprava byla popsána už v [auditu ze 17. 9.](../security-audit-2026-09-17/revocation-fix/report.md), ale dnešní čtení potvrzuje, že odpovídající pravidla stále nejsou aktivní.

Dopad závisí na právě nasazeném backendu, který nebylo možné identifikovat:

- Se starým backendem bez zápisu metadat samotné odvolání refresh tokenů nezaručuje okamžité zastavení přímého přístupu ke Firestore. Tento případ byl doložen v předchozím auditu; dnes se neprováděla revokace skutečného účtu.
- S novým backendem stará pravidla naopak odmítnou jakékoli přihlášení účtu, u kterého vznikl revokační záznam, včetně nového přihlášení. Není správné toto zaměňovat s prokázaným únikem dat.

**Je nutné společně ověřit a nasadit aktuální aplikaci a připravená pravidla.** Nemazat revokační záznamy jako náhradu opravy.

Dnes znovu ověřeno na lokálních Auth a Firestore emulátorech se skutečně vydanými syntetickými tokeny:

| Scénář s opraveným backendem a pravidly | Výsledek |
| --- | --- |
| Čtení před odvoláním | HTTP 200 |
| Původní token po odvolání | HTTP 403; odmítne ho také Admin SDK |
| Výměna starého custom tokenu po odvolání | HTTP 403 |
| Nové přihlášení po odvolání | HTTP 200 |
| Nové přihlášení po trvalé blokaci účtu | HTTP 403 |

### 3. Střední priorita: limit stahované fotografie se vyhodnocoval příliš pozdě

[onlineCardSharePortrait](../../src/lib/server/onlineCardShareImage.ts) ověřoval limit 2 000 000 bajtů pomocí `Content-Length` a znovu až po `arrayBuffer()`. Chybějící nebo nepravdivá délka proto dovolovala nejprve stáhnout a uložit celý nadměrný soubor do paměti. Veřejné vykreslování vizitky tak mohlo zbytečně zatížit server; vyžaduje to odpovídající fotografii v uloženém profilu. Přístup je omezen na Firebase Storage URL, nejde o doložené obecné SSRF ani únik dokumentů.

Oprava čte odpověď postupně a při překročení limitu ihned ruší přenos. Ruší také odpovědi odmítnuté před čtením. Zůstaly zachované časový limit, zákaz přesměrování, dekódování přes sharp a limit rozměrů.

Tři nové [regresní testy](../../src/lib/server/onlineCardShareImage.test.ts) před opravou selhaly a po opravě prošly. Ověřují chybějící délku, podvrženou délku a okamžité zrušení nadměrné odpovědi. Společně s vykreslením skutečných PNG prošlo devět cílených testů.

## Co bylo ověřeno v produkčním Firebase

| Oblast | Výsledek k 25. 9. 2026 |
| --- | --- |
| Úložiště | Zkontrolována metadata všech **1 594 objektů**; žádná veřejná objektová ACL ani veřejná IAM přidělení bucketu. |
| Citlivé soubory | **1 564 smluvních PDF a 17 objektů pošty bez download tokenů**. Šest tokenových odkazů patří čtyřem fotografiím kanceláří a dvěma avatarům. |
| Storage pravidla | Přímé klientské čtení i zápis zakázány. Rozdíl proti lokálnímu souboru tvoří komentáře a redundantní zakazující větev. |
| Databáze | Zapnuté PITR i ochrana před smazáním; umístění `eur3`. |
| Zálohy | Denní retence 14 dní, týdenní 84 dní; **18 záloh READY**, nejnovější z dnešního dne. Skutečná obnova se neprováděla. |
| Obnova úložiště | Soft delete 30 dní. Uniform bucket-level access je vypnuté a public access prevention má stav `inherited`; bez veřejných přístupů v aktuálním IAM/ACL snímku. |
| Identity | 34 účtů je povolených; 10 bez ověřeného e-mailu, 11 bez TOTP, z toho 6 poradců. Oba administrátoři zjištění podle claims mají ověřený e-mail a TOTP. |
| Profily | 32 profilových dokumentů; žádný nalezený nesoulad UID, chybějící UID ani osiřelý profilový e-mail. |
| Firebase Auth | Ochrana před zjišťováním existence e-mailů zapnutá, TOTP/MFA zapnuté. Stav zákazů samoobslužné registrace/mazání a politiky hesel nebyl v použité odpovědi vrácen; nepovažuje se za ověřený. |

Povolený účet bez dokončeného TOTP **sám o sobě neznamená přístup k citlivým datům**: aplikační vrstva i načtená databázová pravidla vyžadují MFA. Nedokončené účty je vhodné projít s vlastníkem a dokončit nebo deaktivovat podle skutečného záměru. Při auditu se žádný účet plošně neblokoval.

## Testy a další ověření

| Kontrola | Výsledek |
| --- | --- |
| Kompletní aplikační sada po aktualizaci knihoven | **4 884 prošlo**, 334 souborů |
| Plošné odmítání nepřípustného přihlášení | **1 272 případů**, 159 API metod × 8 scénářů; zahrnuto v aplikační sadě |
| Přístup ke konkrétním soukromým souborům | 7 testů; zahrnuto v aplikační sadě |
| Fotografie a vykreslování po finální úpravě | 9 prošlo, včetně 3 nových regresních testů |
| Auth + Firestore emulátory | **303 prošlo**, 10 souborů; 1 existující výkonnostní benchmark přeskočen |
| Samostatná diagnostika revokace | Prošla; přístup starého tokenu po revokaci odmítnut |
| TypeScript | Prošel i po finální změně |
| ESLint | 0 chyb, 4 dřívější varování navigace; změněné soubory bez varování |
| Produkční build | Prošel s Next.js 16.3.6, Turbopack; samostatná kopie se syntetickou konfigurací, autentizační proxy zaregistrovaná |
| HTTP místního sestavení | 8 kontrol prošlo: nonce/CSP, no-store, nosniff, přesměrování a odmítnutí cizího původu/nepodporovaného typu obsahu |
| Obrazový runtime | Next.js 16.3.6, sharp 0.35.4, libheif 1.23.2, libvips 8.18.6; macOS arm64 |
| Sken tajných hodnot | 1 818 aktuálních textových souborů, bez shody s vybranými vzory privátních klíčů/tokenů; 276 souborů vynecháno. Historie Gitu a obsah binárních příloh nebyly skenované. |
| Lokální konfigurace | `.env.local` ignorovaný Gitem, oprávnění 0600 |
| Aktuální úplný `npm audit` | **Neproveden**: automatická kontrola oprávnění zamítla odeslání metadat závislostí do registru npm. Nelze uvést „0 zranitelností“. |
| Produkční HTTP a verze nasazení | **Neověřeno**: Vercel metadata API 403, veřejné spojení z nástroje selhalo a samostatný HEAD `/login` vrátil 429 s bezpečnostní výzvou Vercelu. To neověřuje aplikační autentizaci ani CSP. |

[Strojový souhrn a otisky opravených souborů](./verification.json). Celá aplikační sada proběhla po aktualizaci závislostí; po následné malé úpravě čtení fotografie proběhly cílené testy, kontrola typů, lint a finální build. Nejde o tvrzení, že všechny uvedené kontroly tvořily jediný běh.

## Dokončení ochrany

1. Obnovit oprávněný přístup k metadatům nasazení Vercelu a určit běžící verzi. Připravit samostatné nasazení aktuální aplikace, ověřit je, přepnout produkci a publikovat připravená Firestore pravidla. Porovnat aktivní pravidla se zdrojem a ověřit celé přihlášení, odvolání a nové přihlášení. Tento audit nic z toho v produkci neprováděl.
2. Po souhlasu s odesláním názvů a verzí knihoven dokončit `npm audit`. Instalace opraveného veřejného Next.js proběhla s vypnutým auditem a instalačními skripty; zamítnuté odeslání seznamu závislostí se neobcházelo.
3. **30. 9. 2026 znovu zkontrolovat bezpečnostní vydání Next.js.** Výrobce ohlásil další opravy včetně kritické; k datu této kontroly ještě nebyly zveřejněné úplné podrobnosti ani vydané plánované verze. [Oznámení výrobce](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026).
4. Samostatně ověřit přímo dostupné Cloud Functions, cloudové administrátory a jejich MFA, projektová IAM oprávnění, správu tajných klíčů, logování a upozornění na podezřelé aktivity. Zdejší zdrojový kód neobsahuje implementace samostatných Cloud Functions; bezpečné Next.js API samo neprokazuje ochranu jejich přímých adres.
5. Nacvičit obnovu záloh do odděleného prostředí a posoudit zpřísnění bucketové politiky proti budoucímu nechtěnému zveřejnění.

Kontrola není úplný externí penetrační test, DDoS test ani vyšetřování případného incidentu. Neprokázala únik dat a současně nemůže potvrdit, že nikdy nenastal. Prošlé testy a stav záloh nejsou zárukou absence všech dalších chyb.
