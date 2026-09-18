**Bezpečnostní audit — 17. 9. 2026**

**Výsledek: nelze slíbit neprolomitelnost ani označit všechny problémy za vyřešené.** Kontrola potvrdila osm dosud funkčních tokenových odkazů na soukromé přílohy pošty. Bezpečnostní aktualizace závislostí jsou připravené a ověřené lokálně; v tomto auditu se nenasazovaly. Produkční data, účty, pravidla ani soubory nebyly změněny. Obsah smluv a příloh se nestahoval.

Výchozí commit: `5ca711d1c809c953f05d72bd00784c23b7090102`. [Souhrn ověření a otisky souborů](./verification.json).

**1. Prioritní nález: osm příloh pošty dostupných držiteli odkazu bez přihlášení — neopraveno v produkci**

V produkčním úložišti je 16 objektů pod `mailbox/`; osm má stále metadata `firebaseStorageDownloadTokens`. U všech osmi nezávislý požadavek `HEAD` bez autentizace vrátil HTTP 200. Odpovědi uváděly šest JPEG a dva PNG soubory. Tělo souborů se nestahovalo, jejich obsah a citlivost nebyly zkoumány. [Důkaz pouze ze stavů a hlaviček](./mailbox-token-summary.json).

Kdokoli, kdo získá konkrétní úplný odkaz, může soubor otevřít mimo přihlášení do aplikace. Neznamená to, že lze odkazy snadno uhodnout, že jsou veřejně indexované nebo že je někdo zneužil. Zakazující Storage pravidla tento samostatný způsob přístupu nezrušila; skutečné chování bylo ověřeno výše. Jde o pokračování nálezu z auditu 5. 9., nikoli o osm nově prokázaných úniků.

Náprava má být cílená: ověřit vazbu těchto objektů na přílohy a nasazené autentizované API, zazálohovat potřebná metadata do chráněného umístění, zneplatnit jen jejich download tokeny a zkontrolovat odmítnutí původních odkazů i zachovaný přístup oprávněných účastníků. Kvůli samotnému odebrání veřejného přístupu není nutné smazat obsah příloh. Šifrování starší pošty dokončit samostatnou ověřenou migrací včetně obnovitelné zálohy šifrovacího klíče. Existující [migrační skript](../../scripts/migrate-mailbox-encryption.mjs) nebyl spuštěn: jeho zápisový režim mění zprávy i uložené objekty.

Čtyři tokenové odkazy pod `online-card/offices/` slouží veřejným fotografiím kanceláří; nebyly zaměněny za soukromé přílohy ani zahrnuty do návrhu zneplatnění.

**2. Známé zranitelnosti knihoven — opraveno lokálně, čeká na nasazení**

Aktuální databáze npm před aktualizací označila 10 balíčků: čtyři s vysokou, pět se střední a jeden s nízkou závažností. Po kompatibilních aktualizacích je výsledek **0 nálezů**, včetně vývojových závislostí. Počet balíčků není počtem nezávislých zranitelností ani důkazem dosažitelného útoku. [Původní výsledek](./npm-audit-before.json), [výsledek po opravě](./npm-audit-after.json).

| Přímá nebo významná závislost | Před | Po |
| --- | --- | --- |
| `nodemailer` | 9.0.3 | 9.1.1 |
| `@simplewebauthn/server` | 13.3.1 | 13.3.3 |
| `fflate` | 0.8.2 | 0.8.3 |
| `vitest` a související balíčky | 4.1.10 | 4.1.11 |
| `js-yaml` | 4.3.0 | 4.3.2 |
| `browserslist` | 4.28.6 | 4.29.0 |
| `brace-expansion` | 1.1.16 / 2.1.2 | 1.1.21 / 2.1.7 |
| `@humanfs/node` | 0.16.7 | 0.16.8 |

Aktualizovaly se také návazné závislosti; přesný rozsah zachycuje lockfile. Minimální verze přímých balíčků byly zvýšeny v `package.json`. Instalace proběhla s vypnutými instalačními skripty. Nedělalo se násilné zvýšení hlavních verzí přes `--force`.

Vysoká závažnost se týkala Nodemaileru, Browserslistu, JS-YAML a brace-expansion; poslední tři jsou zde vývojové závislosti. Nodemailer nemá v revidovaných aplikačních zdrojích nalezený aktivní import pro doručování, současné autentizační e-maily používají Resend. Exploit žádné knihovny nebyl spouštěn. U SimpleWebAuthn se oznámení týká důvěry v attestační certifikáty; aplikace žádá `attestationType: "none"`, takže nelze nález popsat jako prokázané obejití jejího přihlášení. [Oznámení Nodemaileru](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2), [oznámení SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn/security/advisories/GHSA-6hxq-p678-4hr2).

Samostatná kontrola nativního obrazového runtime potvrdila Next.js 16.3.4, sharp 0.35.4 a libheif 1.23.2, také ve větvi závislostí Next.js. Tyto verze pokrývají dřívější srpnovou opravu obrazového dekodéru. Jde o ověření místního macOS runtime; Linux artefakt po nasazení vyžaduje svůj buildový záznam. [Oficiální srpnové bezpečnostní vydání Next.js](https://nextjs.org/blog/august-2026-security-release).

**3. MFA a přímý přístup do databáze — vyžaduje sjednocení politiky**

Z omezených bezpečnostních metadat 34 aktivních účtů vyplývá: 10 nemá ověřený e-mail a 11 nemá zapsaný TOTP faktor. Šest účtů odpovídá poradenským profilům bez TOTP; mohou zahrnovat dosud nedokončené registrace. Oba aktivní účty s administrátorskými claims mají ověřenou adresu i TOTP. U všech 32 profilových dokumentů existuje odpovídající Auth účet a uložené UID souhlasí; osiřelý profil ani nesoulad UID nebyl nalezen. [Agregované ověření identit](./identity-summary.json). Samostatně nebyly vyhodnoceny všechny role získávané jen z e-mailových výjimek.

Serverový `advisorSetupGuard` kontroluje existenci TOTP při vstupu do chráněných funkcí. Firestore pravidla však přímé čtení vlastních smluv a některých dalších dokumentů rozhodují podle identity/role bez kontroly ověřeného e-mailu nebo MFA. Pravidla se shodují s nasazenou verzí. **Aplikační podmínku dokončeného nastavení proto nelze považovat za ochranu přímého klientského přístupu do Firestore.** To není prokázané obejití druhého faktoru při přihlášení účtu, který ho již má aktivovaný.

Doporučené pokračování: vyhodnotit šest nedokončených poradenských účtů a jejich přístup, potom sjednotit oprávnění k obchodním datům i pro přímé databázové čtení. Při návrhu zachovat bezpečné dokončení registrace a přihlášení přes passkeys; jejich Firebase custom tokeny nemají totožné MFA atributy jako heslo s TOTP. Plošné zpřísnění nasazených pravidel bez těchto testů nebylo provedeno.

**Ověřené ochrany a rozsah**

| Oblast | Výsledek a meze |
| --- | --- |
| Inventura API | 116 rout; nová sada skutečně volá 158 metod ve 108 routách s chybějícím a falešným tokenem, celkem 316 případů. Všechny odmítly požadavek před čtením aplikačních dat. Zahrnuje administraci a cron autentizaci. Veřejné formuláře, veřejné přihlášení, idempotentní logout a vypnutá synchronizace mají výslovné výjimky. |
| Ověřování tokenů | Revidovaná serverová volání `verifyIdToken` používají kontrolu revokace. Nové testy používají náhradu Firebase ověřovače; nejsou testem kryptografie služby Firebase ani produkčních endpointů. |
| Autorizace | Revidovány sdílené guardy, role, zastupování uživatele, hranice přístupu ke smlouvám, profilu a přílohám. Existující testy pokrývají cizí účty, zakázané role, přidání i odebrání chráněných polí. Nová plošná sada nenahrazuje úplnou matici všech oprávnění přihlášených uživatelů. |
| Relace a hesla | Kontrola podepsané cookie, záznamu aktivní relace, revokace, vazby na účet a čerstvého ověření citlivých akcí. Testy změny hesla proběhly i se skutečným lokálním Auth emulátorem. |
| Firestore | Aktivní zdroj přesně odpovídá místnímu souboru; v emulátoru prošlo všech 214 testů pravidel. |
| Storage pravidla | Produkční a místní soubory mají odlišný otisk, ale oba zakazují veškeré přímé klientské čtení i zápis. Rozdíl tvoří komentáře a nadbytečná explicitní zakazující větev. Nejde o otevřené pravidlo. |
| Úložiště | Zkontrolována omezená metadata všech 1 511 aktuálních objektů. Žádné veřejné ACL ani veřejné IAM přidělení bucketu. Všech 1 484 PDF pod `contract-pdfs/` bez download tokenu. Tokenové výjimky jsou výše. Uniform bucket-level access není zapnuto; aktuální ACL jsou přesto neveřejná. |
| Šifrování pošty | Revidováno AES-256-GCM s kontextovým ověřením, náhodnými klíči a IV; testy ověřují změnu ciphertextu, nesprávný kontext i rotaci. Úplnost migrace všech starých zpráv ani obnovitelnost produkčního klíče tento audit nepotvrdil. |
| Webové vstupy | Kontrola uploadů, typů souborů, autorizovaného vydávání příloh, HTML výstupů, návratových URL, původů WebAuthn, veřejných formulářů a omezení četnosti. Není to fuzzing všech parserů ani zátěžový útok. |
| Rate limiting | Produkční kód má sdílený Redis/Firestore mechanismus a při nedostupnosti bez výslovné výjimky požadavky nepovolí. Konfigurace důvěryhodných IP hlaviček a výjimek v nasazeném Vercelu nebyla přečtena; samotný lokální `.env` ji nedokládá. |
| Hlavičky a CSP | Sedm kontrol izolovaného produkčního sestavení prošlo: login, tři chráněné stránky, blokované dokumenty, účetní akční odkaz a cizí image bucket. Výchozí CSP stále dovoluje inline skripty; nonce politika je jen report-only, pokud není zapnuto `CSP_STRICT_ENFORCE`. Je to zbývající prostor pro posílení ochrany před XSS, nikoli nalezený XSS exploit. |
| Tajné hodnoty v Gitu | Vzorový sken 1 544 aktuálních textových souborů bez nálezu; dále prošel všech 12 788 dosažitelných Git objektů, z nich 5 683 textových blobů. 311 binárních nebo velkých blobů bylo vynecháno. Sken vybraných formátů klíčů nenahrazuje analýzu všech možných tajemství. `.env.local` je ignorován Gitem a jeho místní oprávnění byla omezena na vlastníka (`0600`). |
| Obnova dat | Produkční Firestore má zapnuté PITR a ochranu před smazáním. Bucket má soft delete 30 dní. Čtení plánů záloh vrátilo 403: jejich existenci ani obnovitelnost nelze potvrdit nebo vyvrátit. Obnova dat a šifrovacích klíčů nebyla nacvičena. |

[Souhrn produkční konfigurace](./live-summary.json), [sken historie](./git-secrets-summary.json), [místní HTTP ověření](./local-http-summary.json).

**Provedené změny a validace**

- `package.json` a lockfile: kompatibilní bezpečnostní aktualizace.
- `tests/security/api-authentication.test.ts`: 316 kontrol odmítnutí neautorizovaných požadavků, bez připojení k produkci.
- `firebase.rules-test.json` a `test:rules`: přidán Auth emulátor, který dříve chyběl navzdory existujícím integračním testům změny hesla; doplněn návod v README.
- Lokální `.env.local`: oprávnění pouze pro vlastníka; hodnoty zůstaly nezměněné.

| Kontrola | Konečný výsledek |
| --- | --- |
| Aplikační testy | 3 203 / 3 203, 275 souborů |
| Firestore + Auth emulátory | 253 / 253, 7 souborů; z toho 214 testů pravidel |
| TypeScript | Prošel |
| ESLint | Bez chyb, čtyři dřívější varování navigace v nezměněných souborech |
| `npm audit` | 0 nálezů |
| Obrazový runtime | Prošel |
| Standardní produkční build | Prošel v izolované kopii s testovací konfigurací, včetně kontroly autentizačního proxy |
| Lokální HTTP | 7 / 7 |

Emulátory běžely jen na localhostu v projektu `demo-bohemika-rules`, produkční konfigurace se do nich nenačítala. Počáteční neúspěšné pokusy byly způsobeny sandboxovým omezením portů, chybějícím Auth emulátorem a chybou českého locale v Java emulátoru; závěrečný úplný běh výše prošel. Doplňkový build přes webpack narazil na existující globální selektor v `projectionPrint.module.css`; standardní projektový build přes Turbopack následně prošel bez změn aplikačního CSS.

**Co tento výsledek nepotvrzuje a co zbývá**

Čtyři běžné nepřihlášené kontroly `bohemka.app` skončily HTTP 429 na ochraně před aplikací. Proto nelze touto cestou potvrdit verze knihoven, hlavičky ani autorizaci skutečně nasazené aplikace. Ověření Firebase konfigurace a osmi příloh proběhlo odděleně a bylo úspěšné. Nebyly čteny přístupové logy, vyšetřován dřívější útok, prováděn externí penetrační či DDoS test, kontrolovány všechny Vercel proměnné a projektové IAM ani auditovány samostatně nasazené Cloud Functions, jejichž zdroje v tomto projektu nejsou.

Pořadí navazujících kroků: cíleně zrušit osm starých tokenových odkazů se zachováním oprávněného přístupu; nasadit a na běžícím Linux artefaktu ověřit připravené aktualizace; dokončit kontrolu MFA a přímých databázových oprávnění; ověřit zálohy a obnovu klíčů; bezpečně zavést vynucovanou nonce CSP a pravidelné kontroly závislostí. Bezpečnostní zpráva neobsahuje download tokeny, adresy uživatelů, obsah zpráv ani názvy jejich souborů. Žádná produkční změna ani odesílání zpráv neproběhly.
