# Ověření e-mailu a obnova hesla přes Resend

Aplikace používá Firebase Authentication pro vytváření a potvrzování jednorázových odkazů. Zprávy doručuje Resend. Tato změna nahrazuje původní nefungující přímé doručování Googlu; vlastní SMTP ani klasická schránka nejsou potřeba.

## Nastavení ve Vercelu

V projektu aplikace → Settings → Environment Variables nastav pro cílové prostředí:

| Název | Hodnota |
| --- | --- |
| `RESEND_API_KEY` | Tajný klíč z vlastního účtu Resend. Pro Production/Preview označit jako Sensitive. |
| `AUTH_EMAIL_FROM` | `BohemkaApp <noreply@bohemka.app>` |

Klíč patří pouze na server. Nepřidávat prefix `NEXT_PUBLIC_`, nevkládat do zdrojového kódu, chatu, screenshotů ani logů. Pro produkci lze v Resendu vytvořit klíč s oprávněním Sending access omezeným na ověřenou doménu. Hodnoty na Vercelu se projeví až v novém nasazení obsahujícím tuto úpravu. Pro místní vývoj lze použít ignorovaný `.env.local`; automatické testy používají náhrady a žádný skutečný klíč nepotřebují.

V Resendu → Domains musí být `bohemka.app` ve stavu Verified a povolené Sending. Příjem zpráv není pro tuto funkci potřeba. Doména je podle uživatele u Vercelu; 13. 9. 2026 byl veřejně potvrzen SPF, DKIM i odesílací MX. Uživatel následně potvrdil stav Domain verified i vložení obou proměnných do Vercelu. Obě byly uložené jako týmové Shared proměnné pro Production, původně bez přiřazeného projektu. Přiřazení k `bohemika-provize-web` bylo doplněno a ověřeno přes API metadat. Jejich hodnoty nebyly dešifrovány, vypisovány ani ukládány lokálně. U týmových proměnných je potřeba zkontrolovat právě propojení s projektem; `.env.local` není pro produkční nasazení potřeba.

Zůstávají potřebné stávající Firebase Admin credentials a nastavení klientského Firebase. `FIREBASE_AUTH_EMAIL_API_KEY` se už pro odesílání nepoužívá. Text a vzhled zprávy jsou v `src/lib/server/authEmailTemplate.ts`. Nové odkazy aplikace používají vlastní stránku `/ucet/akce`; kód stále vytváří a ověřuje Firebase. Server přenese pouze typ akce a jednorázový kód do fragmentu odkazu na pevnou doménu `https://bohemka.app`, s jazykem `cs`. Nepřebírá přesměrování z požadavku. Globální Firebase Templates se nemění; starší e-maily nadále používají původní stránku Firebase.

## Chování a ochrany

- Zapomenuté heslo na loginu volá `POST /api/auth/password-reset`. Odpověď potvrzuje přijetí žádosti a je stejná pro existující, neexistující, deaktivovaný i účet bez přihlášení heslem. Vyhledání účtu a doručení probíhají až po odpovědi přes Next `after`, podporované na Vercelu. Tím se existence účtu neprozradí ani délkou čekání na Firebase/Resend. Chybějící globální konfigurace se odmítne ještě před potvrzením.
- Žádosti mají sdílený limit 10/IP/15 minut a 3/adresa/15 minut. Po vyčerpání limitu adresy zůstává odpověď neutrální; další zpráva se neodešle. Limitovací klíče se v existující infrastruktuře hashují. V produkci se při nedostupném sdíleném úložišti odeslání odmítne. Nasazení na Vercelu nastavuje `RATE_LIMIT_TRUSTED_IP_HEADERS=x-vercel-forwarded-for`, tedy hlavičku spravovanou Vercel proxy. Tuto proměnnou zachovat i při dalších nasazeních; bez nastavení důvěryhodných hlaviček se v produkci používá společný IP koš `unknown`.
- Ověření adresy v průvodci, Nastavení a obnově 2FA používá `POST /api/auth/email-verification-link`. Tento endpoint přijme platný nezrušený token z přihlášení heslem starého nejvýše 10 minut i před ověřením e-mailu a TOTP. Zkontroluje aktuální účet, shodu e-mailu, sdílené revokace, lockout a limit. Připouští pouze chybějící blokaci nebo blokaci `missing-totp`; ruční blokaci ani probíhající změnu zabezpečení obejít nelze. Příjemce je vždy z ověřené identity, nikoli z těla požadavku. Endpoint poskytne pouze odeslání odkazu, žádná obchodní data ani aplikační cookie. Ověření e-mailu se z Firebase znovu načte před vytvořením TOTP tajemství i před zapnutím faktoru.
- Administrátorské odeslání obnovy hesla používá stejný serverový transport; zůstává omezené na administrátory a hlásí chybu doručení.
- `/api/auth/confirm-email-for-mfa` už příznak ověření nemění. Neověřený účet odmítne HTTP 403.
- Administrátorské „Poslat ověřovací e-mail“ doručí odkaz přes Resend a nemění příznak ověření. Starý endpoint `/api/auth/mark-email-verified` vrací oprávněnému administrátorovi HTTP 410; vlastnictví adresy musí potvrdit uživatel odkazem ve schránce.
- Odkazy, tokeny, klíče ani celé odpovědi Resendu se nevracejí prohlížeči a nelogují. E-mail obsahuje pouze text akce a Firebase odkaz, bez údajů klientů nebo smluv. Příjemce a jednorázový odkaz přirozeně zpracují Firebase a Resend jako poskytovatelé této funkce.
- Externí odeslání má timeout, zakázané přesměrování a žádné automatické opakování po síťové chybě. HTTP úspěch poskytovatele sám o sobě nezaručuje doručení do schránky.

## Ověření a nasazení

Prošlo 2 099 testů v 207 souborech, TypeScript, cílený ESLint a produkční sestavení Next přes webpack v oddělené kopii bez skutečných přístupových údajů. Sestavení ověřuje místní kód; nejedná se o připravený produkční upload. [Záznam a otisky implementace](security-audit-2026-09-13/resend-integration.json).

Místní testy pokrývají obě akce, ochranu údajů, omezení žádostí, neexistující účty, chyby poskytovatele a zastavení 2FA do ověření Firebase. Používají pouze smyšlené účty; produkční endpoint přijal jeden autorizovaný reset hesla a uživatel výslovně potvrdil doručení zprávy. Pro běžnou obnovu hesla po přijetí žádosti sleduj případné bezpečně zkrácené chyby `[AuthEmail] password-reset delivery` ve Vercelu a výsledek doručení v Resend → Emails.

Dne 13. 9. 2026 v 12:39 CEST byla na `bohemka.app` nasazena verze `dpl_BnVBDfhDSDL3a74cLu1zg1h5xPut` ve Frankfurtu. Prošla kontrola všech 1 239 nahraných souborů a osm bezpečných kontrol před i po přepnutí. Metadata sestavené verze potvrdila zahrnutí obou názvů e-mailových proměnných. [Nasazení](security-audit-2026-09-13/resend-promotion.json), [kontrola zdrojů](security-audit-2026-09-13/resend-source-audit.json). V hlavním workspace jsou také další rozpracované změny, které do vydání e-mailů nepatří. Produkční ověření má použít výslovně určenou testovací adresu, nikoli plošné rozeslání.

Dokumentace: [Firebase action links](https://firebase.google.com/docs/auth/admin/email-action-links), [Resend API](https://resend.com/docs/api-reference/emails/send-email), [Resend a Vercel DNS](https://resend.com/docs/knowledge-base/vercel), [Next after](https://nextjs.org/docs/app/api-reference/functions/after), [Vercel Sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Historie původního doručování z Firebase

Následující záznam popisuje diagnostiku před přechodem na Resend. `scripts/check-auth-email-config.mjs` nadále kontroluje pouze původní konfiguraci Firebase, nikoli funkčnost Resendu.

Kontrola 13. 9. 2026 potvrdila shodu klientského a serverového projektu, zapnuté přihlašování e-mailem, doručování `DEFAULT` od Googlu, výchozí obsluhu odkazu, povolenou klientskou Auth doménu a zapnutou ochranu proti zjišťování existence účtů. Serverový klíč úspěšně přečetl veřejnou Auth konfiguraci (HTTP 200). Nastavení SMTP ve Firebase ani vlastní odesílací doména nejsou aktivní. Šlo výhradně o čtení konfigurace, bez úprav produkce a bez uživatelských dat.

## Ověření doručení

Automatické testy používají smyšlená data a náhrady Firebase; neověřují doručení skutečnou poštou. Přijetí žádosti poskytovatelem ještě nedokazuje doručení do schránky.

Po výslovném souhlasu uživatele proběhl 13. 9. 2026 v 10:24 CEST jeden test obnovy hesla na jím určenou adresu. Opravená serverová funkce provedla jedinou žádost a Firebase ji přijal HTTP 200. Uživatel následně oznámil, že zpráva není ani ve webmailu, ani ve Spamu; doručení tedy není potvrzené. Žádná další zpráva nebyla automaticky vyžádána.

Navazující kontrola přečetla pouze zadaný testovací účet: existuje, je aktivní a má přihlašování heslem. Odesílací API klíč patří ke stejnému projektu jako Firebase Admin, ověřeno porovnáním kanonických číselných ID. Veřejný MX domény příjemce směřuje na FORPSI. Firebase activity logging je vypnuté; čtení omezených metadat logu původního požadavku skončilo HTTP 403 kvůli oprávněním služby. Žádná oprávnění ani nastavení logování se neměnila.

Uživatel následně upřesnil, že stejný problém trvá dlouhodobě a nastával také u dřívějších pokusů na Seznam.cz. Tyto historické pokusy nebyly nezávisle opakovány; tento údaj přesouvá další šetření od samotného FORPSI k doručování z Firebase napříč příjemci. Nelze z něj samostatně prokázat závadu Googlu.

Doplňková kontrola nenašla základní chybu v odesílacích adresách ani Reply-to obou šablon. Vlastní odesílací doména není aktivní ani rozpracovaná, multi-tenancy je vypnuté a konfigurace nehlásí vynucení reCAPTCHA pro přihlášení e-mailem (stav unspecified). Konfigurace se neměnila a další zpráva se neposílala.

Přesná příčina zůstává neznámá. Při zachování uživatelem zvoleného přímého doručování Googlu je dalším krokem dohledání odeslání, potlačení nebo SMTP odmítnutí podporou Firebase. [Připravený soukromý požadavek pro podporu](security-audit-2026-09-13/firebase-email-support-request.md) obsahuje čas, metodu, výsledek a ověřené nastavení, bez tokenů, klíčů a příjemcovy adresy. Požadavek nebyl odeslán. Hesla ani odkazy s kódy se nemají kopírovat do chatu nebo protokolů.

Dosavadní příznaky `emailVerified` se hromadně nemění: z pouhého příznaku nelze odlišit dřívější skutečné ověření od odstraněného obcházení. Výslovně administrátorské ruční ověření zůstává samostatnou privilegovanou operací.

## E-mailové šablony

Obě české šablony obsahují záhlaví BohemkaApp, jedno hlavní tlačítko, pokyn k návratu, informaci o jednorázovém odkazu, upozornění na možnost ignorovat nevyžádanou zprávu a náhradní textový odkaz. Předměty jsou „Ověření e-mailu pro BohemkaApp“ a „Obnovení hesla do BohemkaApp“. Vzhled používá tabulky a inline styly bez vzdálených obrázků či fontů; zároveň se posílá prostá textová verze. Nejde o uvítací zprávu ani o další automatický e-mail navíc.

Náhledy: [ověření adresy](security-audit-2026-09-13/email-previews/overeni-emailu.html), [obnova hesla](security-audit-2026-09-13/email-previews/obnova-hesla.html). Všechny náhledové odkazy jsou nefunkční ukázky. Reprodukce: `node scripts/preview-auth-emails.mjs`. Zobrazení ověřovací šablony bylo zkontrolováno v Chromu; nebyla provedena matice skutečných poštovních klientů.

Samostatné vydání vychází z produkčního Frankfurt nasazení `dpl_BJsEiRgSqD2HBFhbeeZw2FLW7xMe` a mění 14 implementačních souborů pro e-maily a 8 testových souborů. Upload navíc obsahuje zkontrolované generované typové deklarace `next-env.d.ts`. Prošlo 1 767 testů v 188 souborech, typy, cílený ESLint i produkční webpack sestavení. Dva prvotní neúspěchy nesouvisejících referenčních testů cashflow vyřešilo připojení správné neměnné předchozí testovací reference, bez změny aplikace. [Záznam vydání](security-audit-2026-09-13/resend-release.json). Ostatní dříve opravené bezpečnostní nálezy zůstávají mimo toto e-mailové vydání.

## Produkční test Resendu

V 12:39 CEST dostal první automatizovaný požadavek HTTP 429; odeslání nepotvrdil. Následný domluvený test přes autorizovaný Vercel přístup byl v 12:41 CEST přijat endpointem obnovy hesla s HTTP 200. Odešla jedna přijatá žádost na uživatelem určenou adresu; na jiné adresy se netestovalo a akční odkaz se neotevíral. Neutrální HTTP 200 potvrzuje přijetí aplikací, nikoli přijetí Resendem ani doručení do schránky. [Záznam žádosti](security-audit-2026-09-13/resend-test-request.json).

Uživatel následně výslovně potvrdil přijetí zprávy „Obnovení hesla do BohemkaApp“. Doručení resetu přes Resend je tedy potvrzené uživatelem. Samostatný skutečný ověřovací e-mail ani dokončení změny hesla nebyly při testu provedeny; obě šablony a ověřovací cesta jsou pokryté místními testy.
