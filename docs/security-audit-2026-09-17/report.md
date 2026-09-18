**Bezpečnostní kontrola a opravy — 17. 9. 2026**

**Aktuální doplnění:** [následný audit](./recheck/report.md) potvrdil mezeru při revokaci přímého přístupu do Firestore. [Oprava a provozní postup](./revocation-fix/report.md) jsou připravené lokálně; nasazení zablokovala automatická kontrola oprávnění a čeká na souhlas uživatele. Produkční stav níže zachycuje dřívější nápravu.

**Opravy aplikace byly nasazeny na bohemka.app a nová Firestore pravidla jsou aktivní.** Nálezy z [původního auditu](./initial-audit.md) byly doplněny o níže uvedené opravy. Nelze zaručit neprolomitelnost; rozsah a meze ověření jsou uvedeny na konci. Původní zpráva zachycuje stav před opravami a není aktuálním stavem produkce.

**Provedeno v produkčních datech**

- Zablokováno 11 účtů bez TOTP, zneplatněny jejich obnovovací tokeny a vytvořeny trvalé serverové blokace. Žádný účet nebyl smazán. Z 34 účtů zůstává 23 aktivních; všechny mají TOTP a ověřený e-mail. [Výsledek blokací](./remediation-accounts-result.json), [následná kontrola](./remediation-verification.json).
- Odebráno osm download tokenů soukromých příloh. Všech osm původních odkazů následně vrátilo HTTP 403. Při této operaci se obsah ani generace souborů nezměnily. Čtyři záměrně veřejné fotografie kanceláří zůstaly zachované. [Ověření zneplatnění](./remediation-tokens-result.json).
- Dokončeno šifrování 11 starších soukromých zpráv, uložených v 15 dokumentech, a jedné přílohy. Před zápisy vznikla šifrovaná záloha dokumentů s oprávněním 0600; původní nezašifrovaná příloha byla odstraněna až po zpětném načtení nové kopie, porovnání dešifrovaných bajtů a úspěšném přepnutí databázových odkazů. Bucket má soft delete na 30 dní. Zápisy dokumentů i mazání původního objektu byly podmíněny nezměněnou verzí.
- Následné porovnání všech 15 dokumentů se zálohou potvrdilo shodu obsahu a počtu příloh. Žádná další soukromá konverzace nečeká na migraci ani úklid. Jedenáct systémových oznámení tipařských tipů je z migrace konverzací záměrně vyloučeno. Nepoužívané soubory nebyly plošně mazány. [Porovnání se zálohou](./migration-backup-verification.json).
- Ověřena obnovitelnost všech 77 šifrovaných dokumentů a tří jedinečných šifrovaných příloh pomocí stávajícího klíče. Dešifrovaný obsah zůstal jen v paměti, nebyl uložen ani vypsán. Nešlo o úplnou obnovu databáze do náhradního prostředí. [Ověření klíče](./key-recovery-summary.json).
- Potvrzeny denní zálohy s retencí 14 dní, týdenní s retencí 84 dní a 17 záloh ve stavu READY, včetně dnešní. Firestore má PITR a ochranu před smazáním. [Metadata záloh](./backup-summary.json).

**Změny aplikace a pravidel**

Server při ověření každého tokenu kontroluje revokaci, aktuální stav účtu, ověřený e-mail, existenci TOTP a trvalou blokaci. Token musí doložit přihlášení s TOTP, nebo obsahovat serverem podepsaný doklad vydaný po ověření passkey. Stejné podmínky chrání přímý klientský přístup přes Firestore pravidla, včetně administrátorů. Aplikační cookie sama zablokovaný účet neobnoví. Účty bez TOTP uvidí pokyn kontaktovat administrátora.

Reset TOTP v administraci účet zároveň blokuje. Obnova používá oddělenou stránku s přihlášením jen v paměti a explicitní zásah administrátora; samotné nastavení faktoru trvalou blokaci neodstraní. Postup je v [návodu pro správce](./account-recovery.md).

Starší přihlášení přes passkey může vyžadovat nové přihlášení, protože jeho dosavadní token neobsahuje nový důkaz. To není blokace účtu. Nahlášený účet byl ověřen jako aktivní s TOTP a nebyl mezi blokovanými účty; jeho profil, faktory ani relace nebyly měněny. Chyba načtení profilu už neotevře průvodce novým účtem a nevynuluje existující formulář. Rozhraní odlišuje potřebu nového přihlášení, blokaci a dočasnou nedostupnost.

Výchozí CSP nyní skutečně vynucuje náhodný nonce pro každý HTML požadavek. Next.js dostává nonce už v hlavičce interního požadavku; veřejné HTML se nepoužívá se statickým nonce. Skripty 3D prohlížeče byly přesunuty do externích souborů, aby nepotřebovaly povolení inline skriptů. Zachované jsou potřebné výjimky pro OCR a vložené kalkulačky.

Aktualizace závislostí snížila výsledek npm audit z 10 nálezů (4 vysoké, 5 středních, 1 nízký) na nulu. Přesný seznam je v původní zprávě a lockfile. Produkční omezení četnosti požadavků používá platformní hlavičku `x-vercel-forwarded-for` a nesmí přejít na paměť jednoho procesu. Build odmítne nebezpečnou konfiguraci a ověřuje přítomnost platného klíče pošty bez vypsání klíče.

**Ověření**

| Kontrola | Výsledek |
| --- | --- |
| Aplikační testy | 3 389 prošlo, 278 souborů |
| Autentizace API | 474 případů pro 158 metod ve 108 routách; chybějící token, falešný token a token bez TOTP odmítnuty před čtením obchodních dat |
| Firestore a Auth emulátory | 262 testů prošlo, z toho 223 testů pravidel |
| TypeScript | Prošel |
| ESLint | Bez chyb, čtyři dřívější varování navigace |
| Lokální produkční build | Prošel v izolované kopii s testovací konfigurací |
| Skutečný Chrome | Šest stránek bez porušení CSP při načtení; podvržený inline skript odmítnut na všech šesti |
| Migrační regrese | Záloha, skutečný Admin SDK Timestamp, chybějící zdroj a souběžná změna dokumentu ověřeny bez produkčních dat |

[Výsledky prohlížeče](./browser-smoke.json). Testy a emulátory používají syntetická data. Linux sestavení na Vercelu potvrdilo bezpečné verze obrazového runtime, vypnutou paměťovou výjimku rate limitu a shodu otisku produkčního šifrovacího klíče s ověřeným obnovovacím klíčem. [Produkční build](./production-build-checks.json). Po výslovném souhlasu uživatele bylo ověřeno a na hlavní doménu přepnuto sestavení `dpl_98bA4SL9WYGyAy93moimsdXBqd3W`. Všech 11 HTTP kontrol prošlo na samostatném deploymentu i na bohemka.app. Kontroly využily existující automatizační přístup přes ochranu deploymentu; uživatelské přihlášení se tím nenahrazovalo. [Produkční ověření](./deployment-production-verification.json). Následně byla aktivována a zpětně přečtena Firestore pravidla se shodným SHA-256 oproti testovanému souboru. [Potvrzení pravidel](./rules-deployment.json).

**Meze a provozní postup**

Kontrola není zárukou proti každému útoku. Nebyl proveden DDoS test, úplný externí penetrační test, vyšetření historického zneužití ani úplný audit samostatně nasazených Cloud Functions. Zálohy byly ověřeny podle metadat; úplnou obnovu databáze je třeba nacvičit v odděleném prostředí. Neproběhlo přihlášení za uživatele ani používání jeho druhého faktoru. Skutečný průchod osobním účtem musí potvrdit jeho držitel.

Aplikace byla přepnuta před aktivací Firestore pravidel, aby nové přihlášení přes passkey už vydávalo potřebný podepsaný důkaz. Předchozí ruleset a deployment jsou zaznamenány v chráněném plánu; při potížích se nesmí bez rozmyslu vracet pravidla, která znovu otevřou přístup účtům bez TOTP. Produkční tajné hodnoty, zálohy, osobní data a pracovní auditní artefakty jsou vyloučeny z Git i uploadu na Vercel. Změny zdrojových souborů zůstávají v pracovním stromu; automatický deployment starého Git commitu by je mohl přepsat.
